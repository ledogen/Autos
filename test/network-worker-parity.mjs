// test/network-worker-parity.mjs — PERF-30 gate: the network Worker == the synchronous build.
//
// The worker imports the same RoadSystem the sync path uses, so the build itself cannot drift.
// What CAN drift are the protocol's three seams, and this gate pins each one:
//   1. SNAPSHOT   — snapshotRoadParams() must lose nothing the build reads: a build on the
//                   filtered, structured-cloned params == a build on the live RANGER_PARAMS.
//   2. WATER      — buildNoGoFns() over a padded disc list must reproduce the live WaterSystem
//                   closures' answers for every bbox the build queries (FEAT-17 exclusion).
//   3. ADOPT      — RoadSystem.adoptNetwork(exportNetwork()) must answer surface queries
//                   byte-identically to the instance that built the network: same runs, same
//                   resolved deck (debugSampleAt: hit/runKey/arcS/gradeY/camber), same junction
//                   degrees (pads/leaf tapers), same slices.
// Plus the protocol invariants: the export round-trips structuredClone (what postMessage does),
// and a MOVED center reusing the warm worker instance still matches a cold sync build (the
// worker's whole perf story is that reuse).
//
// Run: node test/network-worker-parity.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { snapshotRoadParams, buildNetworkSnapshot, makeNetworkInstance, pondDiscPad } from '../src/road-network-worker.js'
import { buildRouteFields } from '../src/road-route-worker.js'
import { routeEdgeV2 } from '../src/corridor-router.js'
import { applyWorldPreset } from '../src/world-presets.js'

const SEED = 6
const R = 1600
const CENTERS = [
    { x: 139, z: 341 },    // pond-dense window near spawn (the FEAT-17 exclusion is live here)
    { x: 651, z: 341 },    // moved center — exercises the worker's warm-instance reuse path
]
const DISC_PAD = pondDiscPad(RANGER_PARAMS)   // covers band margin + graph margin + Poisson window + route-spec bboxes

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)

const liveNoGo = (x, z) => water.isRoadNoGo(x, z)
const liveDiscs = (minX, minZ, maxX, maxZ) => {
    const discs = []
    for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
    return discs
}
const discSnapshot = (c) => {
    const flat = liveDiscs(c.x - R - DISC_PAD, c.z - R - DISC_PAD, c.x + R + DISC_PAD, c.z + R + DISC_PAD)
    return Float64Array.from(flat)
}

const syncBuild = (center) => {
    const rs = new RoadSystem(SEED, RANGER_PARAMS)
    rs.setWaterNoGo(liveNoGo, liveDiscs)
    rs.setRadius(R)
    rs.update(new THREE.Vector3(center.x, 0, center.z))
    return rs
}

// ── deep compare helpers ─────────────────────────────────────────────────────
const f64eq = (a, b) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}
const jsonEq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function compareExports(name, A, B, { skipTallies = false } = {}) {
    const ka = A.runs.map((r) => r.key), kb = B.runs.map((r) => r.key)
    if (!jsonEq(ka.slice().sort(), kb.slice().sort())) {
        const onlyA = ka.filter((k) => !kb.includes(k)), onlyB = kb.filter((k) => !ka.includes(k))
        log(false, name, `run sets differ — only sync: [${onlyA}] only worker: [${onlyB}]`)
        return
    }
    const byKey = new Map(B.runs.map((r) => [r.key, r]))
    const bad = []
    for (const ra of A.runs) {
        const rb = byKey.get(ra.key)
        if (!f64eq(ra.pts, rb.pts)) { bad.push(`${ra.key}: pts`); continue }
        if (!f64eq(ra.polyCum, rb.polyCum)) { bad.push(`${ra.key}: polyCum`); continue }
        if (!f64eq(ra.clArc, rb.clArc)) { bad.push(`${ra.key}: clArc`); continue }
        if (!jsonEq(ra.prims, rb.prims)) { bad.push(`${ra.key}: prims`); continue }
        // QUAL-30: cededSpans and departureSpans left the entry shape with the wye machinery.
        for (const f of ['cellA', 'cellB', 'arcOrigin', 'v2Dirs', 'tunnelSpans',
                         'offCurveSpans', 'rerouted', 'condemned']) {
            if (!jsonEq(ra[f], rb[f])) { bad.push(`${ra.key}: ${f}`); break }
        }
    }
    if (!jsonEq((A.delFrozen ?? []).slice().sort(), (B.delFrozen ?? []).slice().sort())) bad.push('delFrozen set')
    // (Condemned marks compare per run above; the exported condemnedKeys duplicate was deleted.)
    // Tallies are per-BUILD diagnostics: a side that streamed several windows reports only its
    // last build, so they only compare when both sides built exactly one window.
    if (!skipTallies && !jsonEq(A.tallies, B.tallies)) bad.push(`tallies ${JSON.stringify(A.tallies)} vs ${JSON.stringify(B.tallies)}`)
    if (!jsonEq(A.graph?.edges ?? null, B.graph?.edges ?? null)) bad.push('graph edges')
    if (!jsonEq(A.graph?.dropped ?? null, B.graph?.dropped ?? null)) bad.push('graph dropped pairs')
    if (!jsonEq(A.band, B.band)) bad.push('band box')
    log(bad.length === 0, name,
        bad.length === 0 ? `${A.runs.length} runs byte-identical (+graph ${A.graph?.edges?.length ?? 0} edges, ${A.delFrozen?.length ?? 0} frozen deletes)`
                         : `${bad.length} mismatches: ${bad.slice(0, 6).join(' · ')}`)
}

// Probe grid: walk each run's dense points at a stride, nudge laterally, and compare the full
// resolved answer (deck Y, camber, run identity, local radius) between two instances.
function compareResolved(name, rsA, rsB) {
    let n = 0, mismatch = null
    for (const [key, e] of rsA._network) {
        for (let i = 0; i < e.points.length; i += 25) {
            const p = e.points[i]
            for (const off of [0, 2.5]) {
                const a = rsA.debugSampleAt(p.x + off, p.z + off)
                const b = rsB.debugSampleAt(p.x + off, p.z + off)
                n++
                if (JSON.stringify(a) !== JSON.stringify(b)) { mismatch = { key, i, off, a, b }; break }
            }
            if (mismatch) break
        }
        if (mismatch) break
    }
    log(!mismatch, name, mismatch
        ? `first divergence at run ${mismatch.key} pt ${mismatch.i} off ${mismatch.off}:\n        sync   ${JSON.stringify(mismatch.a)}\n        worker ${JSON.stringify(mismatch.b)}`
        : `${n} resolved samples identical (deck Y, camber, run identity, minR)`)
}

function compareDegrees(name, rsA, rsB) {
    const ids = new Set()
    for (const [, e] of rsA._network) { if (e.cellA) ids.add(JSON.stringify(e.cellA)); if (e.cellB) ids.add(JSON.stringify(e.cellB)) }
    let bad = null, n = 0
    for (const s of ids) {
        const id = JSON.parse(s)
        n++
        if (rsA._graphDegreeOf(id) !== rsB._graphDegreeOf(id)) { bad = `${s}: ${rsA._graphDegreeOf(id)} vs ${rsB._graphDegreeOf(id)}`; break }
    }
    log(!bad, name, bad ? `degree mismatch at ${bad}` : `${n} node degrees identical (pads/leaf tapers classify alike)`)
}

// ── 1+2: sync full-params build == worker-path build (snapshot + disc data), per window ──────
const snap = structuredClone(snapshotRoadParams(RANGER_PARAMS))   // the exact clone postMessage would make
let workerRs = null   // persists across windows — the worker's warm-instance reuse
const exportsByWindow = []
for (const [wi, c] of CENTERS.entries()) {
    const ref = syncBuild(c)
    const refData = ref.exportNetwork()
    const req = { seed: SEED, params: snap, center: { x: c.x, z: c.z }, radius: R, pondDiscs: discSnapshot(c) }
    const built = buildNetworkSnapshot(req, workerRs)
    workerRs = built.rs
    const wkData = structuredClone(built.data)   // the round-trip postMessage performs
    compareExports(`window ${wi} (${c.x},${c.z}): worker export == sync export`, refData, wkData, { skipTallies: wi > 0 })
    exportsByWindow.push({ center: c, ref, wkData })
}

// ── 3: adoptNetwork(worker data) answers like the builder ────────────────────────────────────
{
    const { center, ref, wkData } = exportsByWindow[exportsByWindow.length - 1]
    const adopter = new RoadSystem(SEED, RANGER_PARAMS)
    adopter.setWaterNoGo(liveNoGo, liveDiscs)
    adopter.setRadius(R)
    adopter.adoptNetwork(wkData)
    log(adopter._network.size === ref._network.size, 'adopt: run count',
        `${adopter._network.size} adopted vs ${ref._network.size} built`)
    compareResolved('adopt: resolved surface == builder', ref, adopter)
    compareDegrees('adopt: built degrees == builder', ref, adopter)
    // The adopted band sig must short-circuit the next sync stream — that is the play contract
    // (stale-until-replaced: update() on the adopted window must NOT rebuild on the main thread).
    const rev = adopter._networkRev
    adopter.update(new THREE.Vector3(center.x, 0, center.z))
    log(adopter._networkRev === rev, 'adopt: update() short-circuits on the adopted window',
        adopter._networkRev === rev ? 'no rebuild — band sig adopted correctly' : 'REBUILT — the adopted sig did not match')
    // Slices exist (the ribbon's food) and match the builder's tile set.
    const ta = [...ref._tiles.keys()].sort(), tb = [...adopter._tiles.keys()].sort()
    log(JSON.stringify(ta) === JSON.stringify(tb), 'adopt: slice tile set == builder', `${tb.length} tiles`)
}

// ── 4: the play protocol — deferral and the deferred invalidate ──────────────────────────────
{
    const { wkData } = exportsByWindow[0]
    const rs = new RoadSystem(SEED, RANGER_PARAMS)
    rs.setWaterNoGo(liveNoGo, liveDiscs)
    rs.setRadius(R)
    rs.adoptNetwork(structuredClone(wkData))
    const reqs = []
    rs.setNetworkDispatcher((req) => reqs.push(req))

    // A far-moved per-frame update must DEFER: dispatch one 'move' request and keep serving the
    // old network untouched (stale-until-replaced).
    const rev0 = rs._networkRev, size0 = rs._network.size
    rs.update(new THREE.Vector3(CENTERS[0].x + 5000, 0, CENTERS[0].z))
    const deferred = rs._networkRev === rev0 && rs._network.size === size0
                  && reqs.length === 1 && reqs[0].reason === 'move'
    log(deferred, 'dispatcher: far update defers to the worker, old network kept',
        deferred ? `1 'move' request, network untouched (${size0} runs, rev ${rev0})`
                 : `rev ${rev0}→${rs._networkRev}, size ${size0}→${rs._network.size}, reqs ${JSON.stringify(reqs)}`)

    // invalidateCache with a warm network must defer the destructive half: network/generation
    // kept, epoch bumped (in-flight replies go stale), one 'params' request dispatched. The
    // adopt with regen:true then performs the deferred generation bump.
    reqs.length = 0
    const gen0 = rs._generation, epoch0 = rs.routeEpoch()
    rs.invalidateCache()
    const inv = rs._network.size === size0 && rs._generation === gen0 && rs.routeEpoch() === epoch0 + 1
             && reqs.length === 1 && reqs[0].reason === 'params'
    log(inv, 'dispatcher: invalidateCache defers — network+generation kept, epoch bumped',
        inv ? `1 'params' request, epoch ${epoch0}→${rs.routeEpoch()}`
            : `size ${rs._network.size}, gen ${gen0}→${rs._generation}, epoch ${epoch0}→${rs.routeEpoch()}, reqs ${JSON.stringify(reqs)}`)
    rs.adoptNetwork(structuredClone(wkData), { regen: true })
    log(rs._generation === gen0 + 1, 'dispatcher: regen adopt performs the deferred generation bump',
        `generation ${gen0}→${rs._generation} (ribbon + carve rebuild signal fires at the swap, not before)`)
}

// The nested route pool's reply, as road-route-worker.js builds it — fed straight back into the
// instance (the no-mirror fence: the same routeEdgeV2, on the worker's own field derivation).
const routeDispatcher = (rs, fields) => (jobs, epoch) => rs.ingestRoutedConnections(jobs.map((job) => {
    const res = routeEdgeV2(job, fields.hTrunc, fields.hCoarse)
    return { key: job.key, prims: res.cl.primitives, v2Dirs: !!job.dirs, dirsSpec: job.dirs ?? null }
}), epoch)

// ── 5: PERF-31 W2 — the in-worker pre-warm is invisible in the output ────────────────────────
// A build on an instance that first pre-warmed its whole route demand (warmPlanDemand: the
// registered band + the plan layer's settle/census/pass-2 keys) through a dispatcher must be
// byte-identical to the cold sync build: every cache entry the warm ingests comes from the same
// routeEdgeV2 the sync fallback calls (the no-mirror fence), so the build must only ever WALK
// the cache, never depend on who filled it. Tallies are skipped by design — the warm ingests a
// handful of keys the build never demands, and per-instance diagnostics may count them.
{
    const c = CENTERS[0]
    const req = { seed: SEED, params: snap, center: { x: c.x, z: c.z }, radius: R, pondDiscs: discSnapshot(c) }
    const rs = makeNetworkInstance(req)
    rs.warmPlanDemand = true
    rs.setRouteDispatcher(routeDispatcher(rs, buildRouteFields(SEED, RANGER_PARAMS)))
    rs.setRadius(R)
    rs.beginPrewarmedBuild()   // the worker's carry: rev+bounds at warm start, build reuses the warm's plan memos
    const cv = new THREE.Vector3(c.x, 0, c.z)
    let pumps = 0
    while (!rs.warmBandComplete(cv) && ++pumps < 200) {}
    const prewarmed = buildNetworkSnapshot(req, rs)
    log(pumps < 200, 'pre-warm: warm pump converges', `${pumps + 1} pumps to complete`)
    compareExports('pre-warm (W2 plan waves + carry) == sync build', exportsByWindow[0].ref.exportNetwork(),
                   structuredClone(prewarmed.data), { skipTallies: true })
    // Moved center on the SAME pre-warmed instance — the carry must not leak window 0's frozen
    // delete set or plan memos into window 1 (beginPrewarmedBuild advances the rev per pair).
    const c1 = CENTERS[1]
    const req1 = { seed: SEED, params: snap, center: { x: c1.x, z: c1.z }, radius: R, pondDiscs: discSnapshot(c1) }
    rs.beginPrewarmedBuild()
    const cv1 = new THREE.Vector3(c1.x, 0, c1.z)
    let pumps1 = 0
    while (!rs.warmBandComplete(cv1) && ++pumps1 < 200) {}
    const prewarmed1 = buildNetworkSnapshot(req1, rs)
    compareExports('pre-warm carry, moved center == sync build', exportsByWindow[1].ref.exportNetwork(),
                   structuredClone(prewarmed1.data), { skipTallies: true })
}

// ── 6: R-01 — the BUG-56 C re-route rung on a worker-warmed edge routes with the edge's pins ────
// The re-route reads cl._v2DirsSpec, which the route reply must carry: without it a pre-warmed
// edge re-routed with no heading pins, no R5 sibling cost and no FEAT-77 clearance. Seed 6's
// windows above re-route no edge, so they are blind to it; seed 7 @(0,0) re-routes (measured
// 2026-10-15). The window must actually re-route, or this check proves nothing.
{
    const S7 = 7, c = { x: 0, z: 0 }
    const w7 = new WaterSystem(S7, RANGER_PARAMS, makeTerrainHeadless(S7, RANGER_PARAMS, null).rawHeightWorld)
    const discs7 = (minX, minZ, maxX, maxZ) => {
        const o = []
        for (const p of w7.pondsNear(minX, minZ, maxX, maxZ)) o.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return o
    }
    const ref = new RoadSystem(S7, RANGER_PARAMS)
    ref.setWaterNoGo((x, z) => w7.isRoadNoGo(x, z), discs7)
    ref.setRadius(R)
    ref.update(new THREE.Vector3(c.x, 0, c.z))
    const req = { seed: S7, params: snap, center: c, radius: R,
                  pondDiscs: Float64Array.from(discs7(c.x - R - DISC_PAD, c.z - R - DISC_PAD, c.x + R + DISC_PAD, c.z + R + DISC_PAD)) }
    const rs = makeNetworkInstance(req)
    rs.warmPlanDemand = true
    rs.setRouteDispatcher(routeDispatcher(rs, buildRouteFields(S7, RANGER_PARAMS)))
    rs.setRadius(R)
    rs.beginPrewarmedBuild()
    const cv = new THREE.Vector3(c.x, 0, c.z)
    let pumps = 0
    while (!rs.warmBandComplete(cv) && ++pumps < 200) {}
    const built = buildNetworkSnapshot(req, rs)
    const reroutes = ref._v2Reroutes || 0
    log(reroutes > 0, 'seed 7 window re-routes (the check below is not vacuous)', `${reroutes} BUG-56 C re-route(s) in the sync build`)
    compareExports('seed 7 pre-warm == sync build (re-routed edges keep their pins)', ref.exportNetwork(),
                   structuredClone(built.data), { skipTallies: true })
}

// ── 7: FEAT-41 — a Casual world reaches the worker ───────────────────────────────────────────
// The preset writes coarseAmplitude (terrain) and roadV2.wGrade (router prices) into the live params;
// the worker sees them only through the snapshot. A worker-path build under Casual must equal the
// sync build under Casual, AND differ from Classic's — else the preset never reached the build.
{
    applyWorldPreset('casual')
    const c = CENTERS[0]
    const wC = new WaterSystem(SEED, RANGER_PARAMS, makeTerrainHeadless(SEED, RANGER_PARAMS, null).rawHeightWorld)
    const discsC = (minX, minZ, maxX, maxZ) => {
        const o = []
        for (const p of wC.pondsNear(minX, minZ, maxX, maxZ)) o.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return o
    }
    const ref = new RoadSystem(SEED, RANGER_PARAMS)
    ref.setWaterNoGo((x, z) => wC.isRoadNoGo(x, z), discsC)
    ref.setRadius(R)
    ref.update(new THREE.Vector3(c.x, 0, c.z))
    const req = { seed: SEED, params: structuredClone(snapshotRoadParams(RANGER_PARAMS)), center: c, radius: R,
                  pondDiscs: Float64Array.from(discsC(c.x - R - DISC_PAD, c.z - R - DISC_PAD, c.x + R + DISC_PAD, c.z + R + DISC_PAD)) }
    const casual = ref.exportNetwork()
    compareExports('casual: worker export == sync export', casual, structuredClone(buildNetworkSnapshot(req, null).data))
    const classic = exportsByWindow[0].ref.exportNetwork()
    const differs = !jsonEq(casual.runs.map(r => Array.from(r.pts)), classic.runs.map(r => Array.from(r.pts)))
    log(differs, 'casual: the network differs from classic (the preset reached the build)',
        `${casual.runs.length} casual runs vs ${classic.runs.length} classic`)
    applyWorldPreset('classic')
}

console.log(`\n${fail === 0 ? 'ALL NETWORK-WORKER-PARITY CHECKS PASSED' : `${fail} CHECK(S) FAILED`} (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
