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
import { snapshotRoadParams, buildNetworkSnapshot, pondDiscPad } from '../src/road-network-worker.js'

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
        for (const f of ['cellA', 'cellB', 'arcOrigin', 'v2Dirs', 'tunnelSpans', 'cededSpans',
                         'offCurveSpans', 'departureSpans', 'rerouted', 'condemned']) {
            if (!jsonEq(ra[f], rb[f])) { bad.push(`${ra.key}: ${f}`); break }
        }
    }
    if (!jsonEq((A.delFrozen ?? []).slice().sort(), (B.delFrozen ?? []).slice().sort())) bad.push('delFrozen set')
    if (!jsonEq((A.condemnedKeys ?? []).slice().sort(), (B.condemnedKeys ?? []).slice().sort())) bad.push('condemnedKeys')
    // Tallies are per-INSTANCE diagnostics that accumulate across restreams (sync play behaves the
    // same), so they only compare when both sides built exactly one window.
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

console.log(`\n${fail === 0 ? 'ALL NETWORK-WORKER-PARITY CHECKS PASSED' : `${fail} CHECK(S) FAILED`} (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
