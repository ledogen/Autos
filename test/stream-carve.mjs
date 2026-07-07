// test/stream-carve.mjs — FEAT-18 acceptance gate: stream channels carve terrain; roads bridge them.
//
// Exercises the REAL TerrainSystem.prototype.analyticHeight (fake-`this`, same pattern as
// carve-mesh-smoothness.mjs) with the water carve injected the way main.js wires it, over the REAL
// pond-aware RoadSystem — so the composition under test is byte-identical to the running game:
//     hStream = raw + sw·(bedY − raw)                       stream cuts RAW terrain
//     hMesh   = hStream + bw·(1−sw)·(gradeY − hStream)      road wins, EXCEPT in a channel
//     hPhys   = max(hMesh, raw + bw·(gradeY − raw))         bridge deck floors the physics surface
//
// Checks (seed 6):
//   1. CHANNEL-CUT   — far from roads, the bed sits ≥ streamDepth below raw terrain (deeper is
//                      legal where the FEAT-24 monotone profile incises a meadow hummock) and
//                      descends downstream; outside width+bank the terrain is untouched.
//   2. BANK-C0       — the cross-section is continuous (no step > the sample-spacing slope bound):
//                      no invisible cliff at the channel lip (the BUG-15 class of defect).
//   3. BRIDGE-DECK   — at every real road×stream crossing, the physics surface holds ROAD GRADE
//                      (the wheels ride the ribbon-deck), never the bed.
//   4. CHANNEL-UNDER — walking the stream out both sides of the same crossing, the channel resumes
//                      (terrain cut below raw) once clear of the road footprint — the notch is
//                      continuous, not dammed.
//   5. DETERMINISM   — two independent instances agree at every probe point.
//
// Run: node test/stream-carve.mjs

import * as THREE from 'three'
import { TerrainSystem } from '../src/terrain.js'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const SEED = 6
const CENTER = { x: 139, z: 341 }
const R = 1600

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// ── World: water + pond-aware road network, wired exactly like main.js ──────────────────────────
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (x0, z0, x1, z1) => { const d = []; for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt); return d }
)
road.setRadius(R)
road.update(new THREE.Vector3(CENTER.x, 0, CENTER.z))

// Fake-`this` TerrainSystem exposing the REAL analyticHeight with/without the water carve.
const mkTerrain = (withWater, withRoad = true) => {
    const n = makeNoise(SEED)
    return {
        _noiseCoarse: n.noiseCoarse, _noiseFine: n.noiseFine, _noiseRegional: n.noiseRegional,
        _params: RANGER_PARAMS,
        _roadSystem: withRoad ? road : null,
        _waterCarve: withWater ? { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) } : null,
    }
}
const T = mkTerrain(true)
const H = (x, z) => TerrainSystem.prototype.analyticHeight.call(T, x, z)

const { streamWidth, streamDepth, streamBankWidth } = RANGER_PARAMS.water
const streams = water.streamsInBBox(CENTER.x - R, CENTER.z - R, CENTER.x + R, CENTER.z + R)

// Perpendicular at a stream point (from the local tangent).
const perpAt = (st, i) => {
    const a = st.points[Math.max(0, i - 1)], b = st.points[Math.min(st.points.length - 1, i + 1)]
    let tx = b.x - a.x, tz = b.z - a.z
    const l = Math.hypot(tx, tz) || 1
    return { nx: -tz / l, nz: tx / l }
}
const roadBW = (x, z) => road._sampleCarveWorld(x, z, rawHeightWorld(x, z))?.blendW ?? 0

// ── 1 + 2. CHANNEL-CUT and BANK-C0 on road-free stream stretches ────────────────────────────────
{
    let cutOK = 0, cutBad = 0, outsideBad = 0, descBad = 0, c0Worst = 0, probes = 0
    for (const st of streams) {
        let prevBedH = Infinity
        for (let i = 2; i < st.points.length - 2; i += 6) {
            const p = st.points[i]
            if (roadBW(p.x, p.z) > 1e-6) { prevBedH = Infinity; continue }   // road-free stretches only
            probes++
            const raw = rawHeightWorld(p.x, p.z)
            const h = H(p.x, p.z)
            // Bed ≥ streamDepth below raw (−1 m lattice/profile slack). FEAT-24: the bed is the
            // MONOTONE running-min of the traced profile, so where the trace crested a meadow
            // hummock the channel legitimately INCISES deeper than streamDepth — depth is
            // one-sided-bounded, with a generous sanity cap against runaway composition bugs.
            const depthHere = raw - h
            if (depthHere > streamDepth - 1.0 && depthHere < streamDepth + 6.0) cutOK++; else cutBad++
            if (h > prevBedH + 0.75) descBad++   // descending (float/lattice slack)
            prevBedH = h
            // Outside EVERY channel (sampler says sw=0, no road): untouched terrain — the carve
            // never leaks beyond its own cross-section. (A fixed perpendicular offset can land in a
            // NEIGHBOURING stream's legitimate channel, so ask the sampler, not geometry-of-one.)
            const { nx, nz } = perpAt(st, i)
            const off = streamWidth + streamBankWidth + 2
            const ox = p.x + nx * off, oz = p.z + nz * off
            if (roadBW(ox, oz) < 1e-6 &&
                water.streamCarveSample(ox, oz, undefined, rawHeightWorld(ox, oz)).blendW < 1e-6 &&
                Math.abs(H(ox, oz) - rawHeightWorld(ox, oz)) > 1e-6) outsideBad++
            // C0 across the section: 0.5 m sampling from centerline to beyond the bank.
            let prev = null
            for (let d = 0; d <= off; d += 0.5) {
                const hh = H(p.x + nx * d, p.z + nz * d)
                if (prev !== null) c0Worst = Math.max(c0Worst, Math.abs(hh - prev))
                prev = hh
            }
        }
    }
    log(probes > 100 && cutBad === 0, 'CHANNEL-CUT',
        `${probes} road-free probes: bed depth in (−1, +6) of ${streamDepth} m: ${cutOK}/${cutOK + cutBad}, ${descBad} non-descending`)
    log(outsideBad === 0, 'CHANNEL-BOUNDED', `terrain beyond width+bank untouched (${outsideBad} violations)`)
    // Steepest legitimate step at 0.5 m spacing: bank ramp slope (depth/bankWidth) + terrain slope.
    const c0Bound = 0.5 * (streamDepth / streamBankWidth) + 1.25
    log(c0Worst < c0Bound, 'BANK-C0', `worst adjacent-sample step ${c0Worst.toFixed(3)} m < ${c0Bound.toFixed(2)} m bound (no lip cliff)`)
}

// ── 3 + 4. BRIDGE-DECK + CHANNEL-UNDER at real road×stream crossings ────────────────────────────
{
    const polylines = []
    for (const [, e] of road._network) polylines.push(e.points)
    const crossings = water.streamRoadCrossings(polylines,
        { x0: CENTER.x - R, z0: CENTER.z - R, x1: CENTER.x + R, z1: CENTER.z + R })
    let deckBad = 0, underBad = 0, checked = 0
    for (const c of crossings) {
        const raw = rawHeightWorld(c.x, c.z)
        const rc = road._sampleCarveWorld(c.x, c.z, raw)
        if (!rc || rc.blendW < 0.99) continue   // want the road CORE at the crossing point
        checked++
        const h = H(c.x, c.z)
        // Physics holds ROAD GRADE at the core (blend pulls to gradeY in fill AND cut) — the wheel
        // never drops into the channel notch the mesh shows.
        if (Math.abs(h - rc.gradeY) > 0.1 * Math.abs(rc.gradeY - c.bedY) + 0.15) deckBad++
        // Channel resumes on both sides: walk the stream from its point nearest the crossing
        // outwards until off the road footprint, then expect a cut below raw. (c.segIndex is the
        // ROAD segment index — locate the stream-side index by nearest point.)
        const pts = c.stream.points
        let near = 0, nd = Infinity
        for (let i = 0; i < pts.length; i++) {
            const d = (pts[i].x - c.x) ** 2 + (pts[i].z - c.z) ** 2
            if (d < nd) { nd = d; near = i }
        }
        let sides = 0
        for (const dir of [-1, 1]) {
            let resolved = false
            for (let i = near + dir; i > 0 && i < pts.length - 1; i += dir) {
                const p = pts[i]
                if (roadBW(p.x, p.z) > 1e-6) continue         // still on the road footprint — keep walking
                if (rawHeightWorld(p.x, p.z) - H(p.x, p.z) > streamDepth * 0.5) sides++
                resolved = true
                break
            }
            // Walk exhausted = the stream STARTS/ENDS under this road (crossing at a source or a
            // basin mouth) — there is no channel on that side to dam; count the side as satisfied.
            if (!resolved) sides++
        }
        if (sides < 2) underBad++
    }
    log(checked > 0 && deckBad === 0, 'BRIDGE-DECK',
        `${checked} road-core crossings: physics surface holds road grade at every one (${deckBad} dropped toward the bed)`)
    log(checked > 0 && underBad === 0, 'CHANNEL-UNDER',
        `channel cut resumes on BOTH sides of all ${checked} crossings (${underBad} dammed)`)
}

// ── 5. DETERMINISM ───────────────────────────────────────────────────────────────────────────────
{
    const water2 = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
    const T2 = mkTerrain(true)
    T2._waterCarve = { sampleAt: (x, z, s) => water2.streamCarveSample(x, z, s) }
    const H2 = (x, z) => TerrainSystem.prototype.analyticHeight.call(T2, x, z)
    let mismatch = 0, n = 0
    for (let gz = -1200; gz <= 1200; gz += 120) for (let gx = -1200; gx <= 1200; gx += 120) {
        n++
        if (Math.abs(H(CENTER.x + gx, CENTER.z + gz) - H2(CENTER.x + gx, CENTER.z + gz)) > 1e-9) mismatch++
    }
    log(mismatch === 0, 'DETERMINISM', `${n} probe points, ${mismatch} mismatches across independent instances`)
}

console.log(`\nSTREAM-CARVE GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
