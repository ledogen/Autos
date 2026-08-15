/**
 * test/map-cover.mjs — the map's forest is the world's forest (SCATTER SYNC gate).
 *
 * src/map-cover.js prints green where trees stand by REPLAYING prop-scatter's tree pass: same
 * mulberry32 stream, same draw order, same reject chain — but with the expensive terrain samplers
 * swapped for coarse-field equivalents. That replay is only worth anything if it stays in step with
 * the scatter it mirrors, and the failure mode is silent: a drifted rng stream still produces a
 * plausible-looking sheet, it just describes a forest that is not there.
 *
 * So this gate does not check that the raster "looks reasonable". It feeds BOTH the real
 * scatterTreePositions and chunkCover the SAME samplers and demands the binned tree counts match
 * cell for cell. Under identical samplers the replay is exact, so any tolerance here would be
 * hiding a desync.
 *
 * Add a draw to prop-scatter's cluster loop without mirroring it in map-cover and this fails.
 */

import { chunkCover, COVER_CELL, CELLS_PER_CHUNK, slopeFromGradient } from '../src/map-cover.js'
import { scatterTreePositions } from '../src/props/prop-scatter.js'
import { FLORA_PARAMS } from '../data/flora.js'

const CH = FLORA_PARAMS.chunkSize
let failures = 0
const check = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failures++ } }

// ── Synthetic fields with real structure. Both matter: a slope field that never crosses
//    slopeRejectMax and a reject that never fires would leave the reject branches untested, and it
//    is exactly those branches that shift the rng stream when they are wrong.
const slopeOf  = (x, z) => 0.4 + 0.5 * Math.sin(x * 0.01) * Math.cos(z * 0.013)
const rejectOf = (x, z) => Math.sin(x * 0.02 + z * 0.017) > 0.85

const scatterSamplers = {
    heightAt:    () => 0,
    normalAt:    (x, z) => ({ x: 0, y: 1 - slopeOf(x, z), z: 0 }),
    roadBlocked: () => false,
    roadClear:   () => true,
    waterAt:     (x, z) => ({ inWater: rejectOf(x, z) }),
    streamAt:    () => null,
}
const coverSamplers = { slopeAt: slopeOf, rejectAt: rejectOf }

console.log('map-cover: replay tracks prop-scatter')

let chunks = 0, trees = 0, mismatched = 0, rejected = 0
for (let cz = -6; cz < 6; cz++) {
    for (let cx = -6; cx < 6; cx++) {
        const real = scatterTreePositions(cx, cz, 20260815, scatterSamplers)
        const grid = chunkCover(cx, cz, 20260815, coverSamplers)

        const ref = new Float32Array(CELLS_PER_CHUNK * CELLS_PER_CHUNK)
        for (const t of real) {
            const li = Math.floor((t.x - cx * CH) / COVER_CELL)
            const lj = Math.floor((t.z - cz * CH) / COVER_CELL)
            if (li < 0 || lj < 0 || li >= CELLS_PER_CHUNK || lj >= CELLS_PER_CHUNK) continue
            ref[lj * CELLS_PER_CHUNK + li] += 1
        }
        for (let k = 0; k < ref.length; k++) if (ref[k] !== grid[k]) mismatched++
        chunks++; trees += real.length
    }
}
// Guard the guard: if the samplers stopped rejecting anything, the comparison above would still
// pass while proving far less than it claims to.
for (let i = 0; i < 4000; i++) if (rejectOf(i * 7.3, i * 11.9)) rejected++
check(rejected > 100, `reject sampler barely fires (${rejected}/4000) — the gate is not exercising the reject branches`)
check(trees > 500, `too few trees to be meaningful (${trees})`)
check(mismatched === 0, `${mismatched} cells disagree with the real scatter — the rng replay has desynced`)
console.log(`  ${chunks} chunks, ${trees} trees, ${mismatched} mismatched cells`)

// ── Determinism: same inputs, same raster. The map memoizes cover per chunk for the life of a
//    seed, so a chunk that resolved differently on a second visit would print a forest that
//    changes shape as you pan back to it.
const a = chunkCover(3, -7, 4242, coverSamplers)
const b = chunkCover(3, -7, 4242, coverSamplers)
check(a.every((v, i) => v === b[i]), 'chunkCover is not deterministic for a fixed seed + chunk')

// ── Slope units. The scatter's thresholds (slopeMeadowMax .16 / slopeSteepMin .34 /
//    slopeRejectMax .75) are stated in `1 - normal.y`, and map-cover feeds them a gradient. If
//    that conversion is ever "simplified" to |gradient| the thresholds silently change meaning:
//    a 45° face would read 1.0 instead of 0.293 and the whole sheet would go white.
check(slopeFromGradient(0, 0) === 0, 'flat ground must read slope 0')
check(Math.abs(slopeFromGradient(1, 0) - (1 - 1 / Math.SQRT2)) < 1e-12,
      'slopeFromGradient must equal 1 - normal.y, not |gradient|')
check(slopeFromGradient(50, 0) < 1, 'slope must stay bounded below 1 on a near-vertical face')

if (failures) { console.error(`map-cover: ${failures} failure(s)`); process.exit(1) }
console.log('map-cover: OK')
