// test/water-invariance.mjs — determinism + window-invariance gate for src/water.js (FEAT-22/17/18).
//
// The non-negotiable for water features: every basin/saddle/pond/stream is a PURE function of a
// BOUNDED, macro-cell-keyed neighborhood over analytic terrain height — so a feature must resolve
// IDENTICALLY regardless of the query window (stream center / draw distance) or streaming history.
// This gate proves that headlessly, over the same rawHeightWorld sampler the game's physics rides.
//
// Checks (seed 6):
//   1. NON-VACUOUS   — the world actually contains ponds AND streams in the test area.
//   2. DETERMINISM   — a fresh WaterSystem gives byte-identical features to another fresh one.
//   3. WINDOW-INVAR  — features overlapping a fixed sub-region are identical whether fetched by a
//                      tight bbox around it or a huge bbox (margins + per-cell ownership must cover).
//   4. STREAM-CENTER — sweeping overlapping query windows across a path, the union of features in a
//                      probe region never changes (the freecam↔drive-in discipline, for water).
//   5. POINT-QUERY   — pondAt / isRoadNoGo agree whether the instance was warmed small-first or
//                      large-first (cache-order independence).
//
// NOT registered in run-all.mjs yet — water is unwired. Run: node test/water-invariance.mjs

import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { WaterSystem, WATER_GRID } from '../src/water.js'

const SEED = 6
const mk = () => {
    const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
    return new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
}

// Probe sub-region (features overlapping THIS must be window-invariant).
const R = { x0: -1500, z0: -1500, x1: 1500, z1: 1500 }
// A much larger enclosing query window.
const BIG = { x0: -6000, z0: -6000, x1: 6000, z1: 6000 }

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// ── Stable serialization: sort features, quantize floats, join → one string ──────────────
const pondSig = (p) =>
    `P|${p.floorX.toFixed(3)},${p.floorZ.toFixed(3)}|y${p.floorY.toFixed(3)}|w${p.waterLevel.toFixed(3)}|r${p.radius.toFixed(3)}`
const streamSig = (s) =>
    `S|${s.key}|len${s.length.toFixed(3)}|drop${s.drop.toFixed(3)}|n${s.points.length}|` +
    s.points.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.y.toFixed(2)}`).join(';')
const critSig = (c) => `${c.x.toFixed(3)},${c.z.toFixed(3)},${c.y.toFixed(3)}`

const sortJoin = (arr) => arr.slice().sort().join('\n')

// Features overlapping R, fetched via a given query bbox Q (then filtered to those actually in R).
const inR = (px, pz, pad = 0) => px >= R.x0 - pad && px <= R.x1 + pad && pz >= R.z0 - pad && pz <= R.z1 + pad
const pondsOverlappingR = (ws, Q) =>
    ws.pondsInBBox(Q.x0, Q.z0, Q.x1, Q.z1).filter(p => inR(p.floorX, p.floorZ, p.radius + p.skirt))
const streamsOverlappingR = (ws, Q) =>
    ws.streamsInBBox(Q.x0, Q.z0, Q.x1, Q.z1).filter(s => s.points.some(p => inR(p.x, p.z, s.width + s.bankWidth)))

// ── 1. NON-VACUOUS ──────────────────────────────────────────────────────────────────────
const w0 = mk()
const ponds0   = pondsOverlappingR(w0, R)
const streams0 = streamsOverlappingR(w0, R)
const saddles0 = w0.saddlesInBBox(R.x0, R.z0, R.x1, R.z1)
const basins0  = w0.basinsInBBox(R.x0, R.z0, R.x1, R.z1)
log(ponds0.length > 0 && streams0.length > 0, 'NON-VACUOUS',
    `region has ${basins0.length} basins, ${saddles0.length} saddles → ${ponds0.length} ponds, ${streams0.length} streams`)

// ── 2. DETERMINISM ────────────────────────────────────────────────────────────────────────
{
    const wA = mk(), wB = mk()
    const pA = sortJoin(pondsOverlappingR(wA, R).map(pondSig))
    const pB = sortJoin(pondsOverlappingR(wB, R).map(pondSig))
    const sA = sortJoin(streamsOverlappingR(wA, R).map(streamSig))
    const sB = sortJoin(streamsOverlappingR(wB, R).map(streamSig))
    const ok = pA === pB && sA === sB
    log(ok, 'DETERMINISM', `two fresh instances: ponds ${pA === pB ? 'match' : 'DIFFER'}, streams ${sA === sB ? 'match' : 'DIFFER'}`)
}

// ── 3. WINDOW-INVARIANCE (tight bbox vs huge bbox) ───────────────────────────────────────
{
    const wSmall = mk(), wBig = mk()
    const pSmall = sortJoin(pondsOverlappingR(wSmall, R).map(pondSig))
    const pBig   = sortJoin(pondsOverlappingR(wBig, BIG).map(pondSig))
    const sSmall = sortJoin(streamsOverlappingR(wSmall, R).map(streamSig))
    const sBig   = sortJoin(streamsOverlappingR(wBig, BIG).map(streamSig))
    const cSmall = sortJoin(wSmall.saddlesInBBox(R.x0, R.z0, R.x1, R.z1).map(critSig))
    const cBig   = sortJoin(wBig.saddlesInBBox(R.x0, R.z0, R.x1, R.z1).map(critSig))
    const okP = pSmall === pBig, okS = sSmall === sBig, okC = cSmall === cBig
    log(okP && okS && okC, 'WINDOW-INVARIANCE',
        `overlapping R via tight vs huge query — ponds:${okP} streams:${okS} saddles:${okC}`)
}

// ── 4. STREAM-CENTER SWEEP (union stable across moving overlapping windows) ───────────────
{
    const ws = mk()
    // Reference: features overlapping R from one big query.
    const refP = sortJoin(pondsOverlappingR(ws, R).map(pondSig))
    const refS = sortJoin(streamsOverlappingR(ws, R).map(streamSig))
    // Sweep smaller windows across R and union what each reports (filtered to R).
    const win = 900, halfstep = 700
    const uP = new Set(), uS = new Set()
    for (let cz = R.z0; cz <= R.z1; cz += halfstep) {
        for (let cx = R.x0; cx <= R.x1; cx += halfstep) {
            const Q = { x0: cx - win, z0: cz - win, x1: cx + win, z1: cz + win }
            for (const p of pondsOverlappingR(ws, Q)) uP.add(pondSig(p))
            for (const s of streamsOverlappingR(ws, Q)) uS.add(streamSig(s))
        }
    }
    const okP = sortJoin([...uP]) === refP
    const okS = sortJoin([...uS]) === refS
    log(okP && okS, 'STREAM-CENTER-SWEEP',
        `union over swept windows == single-query set — ponds:${okP} streams:${okS}`)
}

// ── 5. POINT-QUERY cache-order independence ──────────────────────────────────────────────
{
    // Grid of probe points; compare pondAt/isRoadNoGo on a fresh instance vs one already warmed
    // by a huge query (different cache-build order must not change the answer).
    const fresh = mk()
    const warmed = mk(); warmed.pondsInBBox(BIG.x0, BIG.z0, BIG.x1, BIG.z1)  // warm large-first
    let mism = 0, tested = 0
    for (let z = R.z0; z <= R.z1; z += 97) {
        for (let x = R.x0; x <= R.x1; x += 97) {
            tested++
            const a = fresh.pondAt(x, z), b = warmed.pondAt(x, z)
            const ka = a ? a.key : '-', kb = b ? b.key : '-'
            if (ka !== kb) mism++
            if (fresh.isRoadNoGo(x, z) !== warmed.isRoadNoGo(x, z)) mism++
        }
    }
    log(mism === 0, 'POINT-QUERY-ORDER-INDEP', `${tested} probe points, ${mism} mismatch(es) fresh vs warmed`)
}

// ── 6. FLOW-TRACE terminates at a basin (ponds-for-free property) ────────────────────────
{
    const ws = mk()
    const streams = streamsOverlappingR(ws, R)
    const step = WATER_GRID / 2   // the greedy-descent tail's operating scale
    let notMin = 0, notDescending = 0, endInPond = 0, meetsWater = 0
    for (const st of streams) {
        const end = st.points[st.points.length - 1]
        if (st.drop <= 0) notDescending++
        // Every trace SETTLES at a basin floor: the endpoint is a local minimum at the
        // descent scale (no 8-neighbour at `step` is lower). True by construction.
        for (let a = 0; a < 8; a++) {
            const ang = a / 8 * Math.PI * 2
            if (ws._height(end.x + Math.cos(ang) * step, end.z + Math.sin(ang) * step) < end.y - 1e-6) { notMin++; break }
        }
        // Coupling (ponds-for-free): a stream whose mouth lands in a pond footprint
        // must actually enter its water (endpoint below the pond plane).
        const pond = ws.pondAt(end.x, end.z)
        if (pond) { endInPond++; if (ws._height(end.x, end.z) < pond.waterLevel) meetsWater++ }
    }
    const ok = notMin === 0 && notDescending === 0 && endInPond > 0 && meetsWater === endInPond
    log(ok, 'FLOW-SETTLES-AT-BASIN',
        `${streams.length} streams: ${notMin} not-settled, ${notDescending} not-descending; ${endInPond} end in a pond, ${meetsWater} of those enter its water`)
}

// ── 7. SUBMERGED hook flips at the pond plane ─────────────────────────────────────────────
{
    const ws = mk()
    const pond = pondsOverlappingR(ws, R)[0]
    const below = ws.submergedAt(pond.floorX, pond.floorY + 0.2, pond.floorZ)   // CG just above bed, under plane
    const above = ws.submergedAt(pond.floorX, pond.waterLevel + 5, pond.floorZ) // CG well above plane
    const dry   = ws.submergedAt(pond.floorX + 1e5, 0, pond.floorZ)             // far from any pond
    const ok = below.submerged && below.depth > 0 && !above.submerged && !dry.submerged
    log(ok, 'SUBMERGED-HOOK', `under-plane submerged=${below.submerged}(d=${below.depth.toFixed(2)}) above=${above.submerged} dry=${dry.submerged}`)
}

// ── 8. BRIDGE crossings deterministic + window-invariant ─────────────────────────────────
{
    // Synthetic road grid (E–W + N–S lines every 400 m across R) — a stand-in for routed
    // centerlines. Crossings must be identical across instances and query windows.
    const roads = []
    for (let z = R.z0; z <= R.z1; z += 400) { const l = []; for (let x = R.x0; x <= R.x1; x += 40) l.push({ x, z }); roads.push(l) }
    for (let x = R.x0; x <= R.x1; x += 400) { const l = []; for (let z = R.z0; z <= R.z1; z += 40) l.push({ x, z }); roads.push(l) }
    const crossSig = (c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}|${c.stream.key}|bed${c.bedY.toFixed(3)}`
    const wA = mk(), wB = mk()
    const cA = sortJoin(wA.streamRoadCrossings(roads, R).map(crossSig))
    const cB = sortJoin(wB.streamRoadCrossings(roads, R).map(crossSig))
    // window-invariance: same crossings whether streams fetched via R or via BIG.
    const cBig = sortJoin(wB.streamRoadCrossings(roads, BIG).filter(c => c.x >= R.x0 && c.x <= R.x1 && c.z >= R.z0 && c.z <= R.z1).map(crossSig))
    const n = wA.streamRoadCrossings(roads, R).length
    const ok = cA === cB && cA === cBig && n > 0
    log(ok, 'BRIDGE-CROSSINGS', `${n} crossings — determinism:${cA === cB} window-invariance:${cA === cBig}`)
}

// ── 9. STREAM CHANNEL CARVE cross-section (FEAT-18 carve descriptor) ──────────────────────
{
    const ws = mk()
    const st = streamsOverlappingR(ws, R).find(s => s.points.length > 4)
    // Sample perpendicular to a mid-segment: center (bed), bank, outside.
    const i = st.points.length >> 1
    const a = st.points[i - 1], b = st.points[i]
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl
    const nx = -tz, nz = tx
    const cx = b.x, cz = b.z
    const streams = [st]
    const at = (off) => ws.streamCarveSample(cx + nx * off, cz + nz * off, streams)
    const center = at(0), lip = at(st.width + 0.01), mid = at(st.width + st.bankWidth / 2), outside = at(st.width + st.bankWidth + 5)
    const bedBelow = center.bedY < ws._height(cx, cz)   // bed cut below surrounding terrain
    const okShape = center.blendW === 1 && outside.blendW === 0 &&
                    mid.blendW > 0 && mid.blendW < 1 && lip.blendW <= 1 && bedBelow
    // Determinism across instances.
    const ws2 = mk()
    const d2 = ws2.streamCarveSample(cx, cz, [ws2.streamsInBBox(cx, cz, cx, cz).find(s => s.key === st.key)])
    const det = Math.abs(d2.bedY - center.bedY) < 1e-9 && d2.blendW === center.blendW
    log(okShape && det, 'STREAM-CARVE-SECTION',
        `blendW center=${center.blendW} bankmid=${mid.blendW.toFixed(2)} outside=${outside.blendW} bedBelowTerrain=${bedBelow} deterministic=${det}`)
}

console.log('\n' + '='.repeat(64))
console.log(`WATER-INVARIANCE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
