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
//
// Run: node test/stream-bed-drape.mjs   (exit 0 = pass)

import * as THREE from 'three'
import { TerrainSystem } from '../src/terrain.js'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { buildStreamBedMesh, computeStreamSpans } from '../src/water-render.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const SEED = 6
const CENTER = { x: 139, z: 341 }
const R = 1600

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// ── World wired exactly like main.js (same pattern as stream-carve.mjs) ─────────────────────────
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (x0, z0, x1, z1) => { const d = []; for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt); return d }
)
road.setRadius(R)
road.update(new THREE.Vector3(CENTER.x, 0, CENTER.z))

const n = makeNoise(SEED)
const T = {
    _noiseCoarse: n.noiseCoarse, _noiseFine: n.noiseFine, _noiseRegional: n.noiseRegional,
    _params: RANGER_PARAMS,
    _roadSystem: road,
    _waterCarve: { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) },
}
const groundAt = (x, z) => TerrainSystem.prototype.analyticHeight.call(T, x, z)
const roadBlendAt = (x, z) => road._sampleCarveWorld(x, z, rawHeightWorld(x, z))?.blendW ?? 0

const bbox = { minX: CENTER.x - 512, minZ: CENTER.z - 512, maxX: CENTER.x + 512, maxZ: CENTER.z + 512 }
const streams = water.streamsInBBox(bbox.minX, bbox.minZ, bbox.maxX, bbox.maxZ)

// ── Build every bed in the window and score the rows ────────────────────────────────────────────
const COLS = 5
let built = 0, rows = 0, dryRows = 0, wetRows = 0
for (const st of streams) {
    const mesh = buildStreamBedMesh(st, null, bbox, groundAt, roadBlendAt)
    if (!mesh) continue
    built++
    const pos = mesh.geometry.attributes.position.array
    const surfaceLift = st.waterDepth - st.depth
    // Recover the row → centerline-point mapping through the SAME span machinery the builder
    // uses, so each row can be scored against its honest water level p.y + surfaceLift (the y
    // the water ribbon puts there).
    const spans = computeStreamSpans(st, surfaceLift, bbox, groundAt, roadBlendAt)
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
    const st = streams.find(s => buildStreamBedMesh(s, null, bbox, groundAt, roadBlendAt))
    const a = buildStreamBedMesh(st, null, bbox, groundAt, roadBlendAt).geometry.attributes.position.array
    const b = buildStreamBedMesh(st, null, bbox, groundAt, roadBlendAt).geometry.attributes.position.array
    let same = a.length === b.length
    for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false
    log(same, 'DETERMINISM', 'same stream + window → byte-identical bed geometry')
}

console.log(`\nSTREAM-BED-DRAPE GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail === 0 ? 0 : 1}`)
process.exit(fail === 0 ? 0 : 1)
