// test/stream-bed-drape.mjs — FEAT-25 (rework) gate: the cobble bed ribbon is USER-VISIBLE.
//
// The first FEAT-25 cut built the bed as a flat strip at bedY + 6 cm with a 1 m margin. It was
// invisible in-game (FEAT-25 reopen 2026-07-08): everything inside the channel sat under the
// 0.72-opacity water, and the flat margins were buried inside the rising bank ramps — no dry
// cobble anywhere. The rework drapes a 5-column ribbon over the COMPOSED terrain
// (groundAt + 6 cm, columns on the carve cross-section kinks) with a bankWidth/2 margin.
//
// This gate builds real bed meshes (real WaterSystem + real analyticHeight composition, wired
// like main.js) and asserts the two properties that make the cobbles readable:
//   1. DRY-SHOULDER — on most rows, the OUTER columns rise above the water surface: cobble
//      shoulders show above the waterline. (The flat first cut scores 0 % here.)
//   2. WET-BED      — the CENTER column stays at/below the water surface on most rows (the bed
//      is still a bed; the drape didn't lift the middle out of the channel).
//   3. DETERMINISM  — building the same stream twice is byte-identical (pure fn of the record).
//   4. OFF-THE-DECK (BUG-159) — no bed or water triangle sits ABOVE a road core (blendW > 0.5): every
//      corner and the centroid of each drawn triangle is tested against the composed surface there.
//      Pre-fix the owner's capture (seed 2879661543, a stream running under its causeway) hung bed
//      triangles up to 1.19 m over the pavement. Checked on the capture and on random seeds.
//
// Run: node test/stream-bed-drape.mjs   (exit 0 = pass)

import * as THREE from 'three'
import { TerrainSystem } from '../src/terrain.js'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { buildStreamBedMesh, buildStreamMesh, computeStreamSpans, streamSpans } from '../src/water-render.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const SEED = 6
const CENTER = { x: 139, z: 341 }
const R = 1600

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// ── World wired exactly like main.js (same pattern as stream-carve.mjs) ─────────────────────────
function buildWorld(seed, center, radius) {
    const { rawHeightWorld } = makeTerrainHeadless(seed, RANGER_PARAMS, null)
    const water = new WaterSystem(seed, RANGER_PARAMS, rawHeightWorld)
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.setWaterNoGo(
        (x, z) => water.isRoadNoGo(x, z),
        (x0, z0, x1, z1) => { const d = []; for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt); return d }
    )
    if (radius) road.setRadius(radius)
    road.update(new THREE.Vector3(center.x, 0, center.z))
    const n = makeNoise(seed)
    const T = {
        _noiseCoarse: n.noiseCoarse, _noiseFine: n.noiseFine, _noiseRegional: n.noiseRegional,
        _params: RANGER_PARAMS,
        _roadSystem: road,
        _waterCarve: { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) },
    }
    // main.js's surfaceAt: the real analyticHeight, its road-carve blend read back through `out`.
    const surfaceAt = (x, z) => { const s = { h: 0, blendW: 0 }; s.h = TerrainSystem.prototype.analyticHeight.call(T, x, z, undefined, undefined, s); return s }
    return { water, surfaceAt }
}
const { water, surfaceAt } = buildWorld(SEED, CENTER, R)

const bbox = { minX: CENTER.x - 512, minZ: CENTER.z - 512, maxX: CENTER.x + 512, maxZ: CENTER.z + 512 }
const streams = water.streamsInBBox(bbox.minX, bbox.minZ, bbox.maxX, bbox.maxZ)

// ── Build every bed in the window and score the rows ────────────────────────────────────────────
const COLS = 5
let built = 0, rows = 0, dryRows = 0, wetRows = 0
for (const st of streams) {
    const mesh = buildStreamBedMesh(st, null, bbox, surfaceAt)
    if (!mesh) continue
    built++
    const pos = mesh.geometry.attributes.position.array
    const surfaceLift = st.waterDepth - st.depth
    // Recover the row → centerline-point mapping through the SAME span machinery the builder
    // uses, so each row can be scored against its honest water level p.y + surfaceLift (the y
    // the water ribbon puts there).
    const { spans } = computeStreamSpans(st, surfaceLift, bbox, surfaceAt)
    const rowPts = []
    for (const [i0, i1] of spans) for (let i = i0; i <= i1; i++) rowPts.push(st.points[i])
    const nRows = pos.length / (COLS * 3)
    if (nRows !== rowPts.length) { log(false, 'ROW-MAP', `mesh rows ${nRows} != span points ${rowPts.length}`); continue }
    for (let r = 0; r < nRows; r++) {
        const y = (c) => pos[(r * COLS + c) * 3 + 1]
        const waterY = rowPts[r].y + surfaceLift
        rows++
        // A shoulder READS dry when an outer column clears the row's water level.
        if (Math.max(y(0), y(4)) > waterY + 0.05) dryRows++
        // The drape must keep the middle of the ribbon IN the water: the center column stays at
        // or below the water surface (cross-slope banks and meander bends may tilt the rest).
        if (y(2) <= waterY + 0.01) wetRows++
    }
}

log(built >= 3, 'BED-MESHES', `${built} bed ribbons built from ${streams.length} streams in the window`)
log(rows > 100, 'COVERAGE', `${rows} cross-section rows scored`)
const dryPct = rows ? (100 * dryRows / rows) : 0
log(dryPct >= 60, 'DRY-SHOULDER', `${dryPct.toFixed(1)}% of rows show cobble shoulder above the waterline (need ≥60%; flat first-cut = 0%)`)
const wetPct = rows ? (100 * wetRows / rows) : 0
log(wetPct >= 85, 'WET-BED', `${wetPct.toFixed(1)}% of rows keep the ribbon center at/under the water surface (need ≥85%)`)

// ── Determinism ─────────────────────────────────────────────────────────────────────────────────
{
    const st = streams.find(s => buildStreamBedMesh(s, null, bbox, surfaceAt))
    const a = buildStreamBedMesh(st, null, bbox, surfaceAt).geometry.attributes.position.array
    const b = buildStreamBedMesh(st, null, bbox, surfaceAt).geometry.attributes.position.array
    let same = a.length === b.length
    for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false
    log(same, 'DETERMINISM', 'same stream + window → byte-identical bed geometry')
}

// ── BUG-159: nothing of the stream is drawn above a road deck ───────────────────────────────────
// Every drawn triangle of the bed AND the water ribbon: its three corners and its centroid, where
// they sit on a road core (blendW > 0.5), must not rise above the composed deck there (+2 cm).
function overDeck(w, bb, sAt) {
    let tris = 0, bad = 0, worst = 0, crossings = 0
    for (const st of w.streamsInBBox(bb.minX, bb.minZ, bb.maxX, bb.maxZ)) {
        const sp = streamSpans(st, bb, sAt)
        let touchesRoad = false
        for (const m of [buildStreamBedMesh(st, null, bb, sAt, sp), buildStreamMesh(st, null, bb, sAt, sp)]) {
            if (!m) continue
            const pos = m.geometry.attributes.position.array, idx = m.geometry.index.array
            for (let t = 0; t < idx.length; t += 3) {
                tris++
                const P = [0, 1, 2].map(k => idx[t + k] * 3)
                const probes = P.map(o => [pos[o], pos[o + 1], pos[o + 2]])
                probes.push([0, 1, 2].map(a => (pos[P[0] + a] + pos[P[1] + a] + pos[P[2] + a]) / 3))
                let d = 0
                for (const [x, y, z] of probes) {
                    const sf = sAt(x, z)
                    if (sf.blendW > 0.5) { touchesRoad = true; d = Math.max(d, y - sf.h) }
                }
                if (d > 0.02) { bad++; worst = Math.max(worst, d) }
            }
        }
        if (touchesRoad) crossings++
    }
    return { tris, bad, worst, crossings }
}
{
    // The owner's capture (BUG-159), then three random seeds around their origin.
    const cases = [
        { seed: 2879661543, c: { x: 2269.2, z: 950.0 }, tag: 'capture' },
        { seed: 6, c: CENTER, tag: 'seed 6 gate window', world: { water, surfaceAt }, half: 512 },
        { seed: 914207, c: { x: 0, z: 0 }, tag: 'random' },
        { seed: 3141592653, c: { x: 0, z: 0 }, tag: 'random' },
        { seed: 77031, c: { x: 0, z: 0 }, tag: 'random' },
    ]
    let allCrossings = 0
    for (const k of cases) {
        const half = k.half ?? 200
        const w = k.world ?? buildWorld(k.seed, k.c)
        // A random seed: centre the window on the first stream point under a road core near the origin.
        if (k.tag === 'random') {
            const cross = w.water.streamsInBBox(-500, -500, 500, 500).flatMap(st => st.points)
                .find(p => Math.abs(p.x) < 500 && Math.abs(p.z) < 500 && w.surfaceAt(p.x, p.z).blendW > 0.5)
            if (cross) k.c = { x: cross.x, z: cross.z }
            k.tag += cross ? ` crossing @ (${cross.x.toFixed(0)}, ${cross.z.toFixed(0)})` : ' (no crossing within 500 m)'
        }
        const bb = { minX: k.c.x - half, minZ: k.c.z - half, maxX: k.c.x + half, maxZ: k.c.z + half }
        const r = overDeck(w.water, bb, w.surfaceAt)
        allCrossings += r.crossings
        log(r.bad === 0, `OFF-THE-DECK ${k.seed}`, `${k.tag}: ${r.bad} of ${r.tris} stream triangles above a road deck (worst +${r.worst.toFixed(2)} m), ${r.crossings} streams touching a road core`)
    }
    log(allCrossings >= 4, 'OFF-THE-DECK COVERAGE', `${allCrossings} streams touch a road core across the cases (need ≥4 so the check bites)`)
}

console.log(`\nSTREAM-BED-DRAPE GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail === 0 ? 0 : 1}`)
process.exit(fail === 0 ? 0 : 1)
