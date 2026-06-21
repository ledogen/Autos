// test/lib/terrain-headless.mjs — headless analytic terrain height (no Worker, no scene, no DOM).
//
// TerrainSystem (src/terrain.js) spins up a Blob Web Worker in its constructor, so it cannot be
// imported and run under node. This module replicates ONLY the main-thread analytic-sampling path
// (analyticHeight / analyticNormal / rawHeightWorld) that the physics contacts ride — enough for the
// Phase 5 input-timeline replay (test/lib/physics-replay.mjs) to feel the same ground the game does.
//
// SYNC DISCIPLINE (same spirit as terrain-worker.js — see project_terrain_worker_constraints):
//   - seedFor / mulberry32 are imported from src/seed.js (single source — no copy here).
//   - The vendored simplex (grad2/F2/G2/buildPermutationTable/createNoise2D) and the height layers
//     (coarseHeight/fineHeight/regionalModulator/height) below are copied VERBATIM from src/terrain.js
//     (terrain.js:103-227 / :582-620). They are pure deterministic float math; if src/terrain.js
//     changes them, this drifts. The live drift detector is the physics-replay terrain self-check,
//     which diffs analyticHeight here against the capture's recorded `rd_gh` column frame-by-frame —
//     a mismatch there means this file fell out of sync.
//
// The road CARVE is NOT replicated: analyticHeight defers to the REAL RoadSystem._sampleCarveWorld
// (road.js:1925) of the road instance passed in, exactly as src/terrain.js:592-596 does. So the carve
// blend is the genuine game code, not a copy.

import { seedFor, mulberry32 } from '../../src/seed.js'

// ── Vendored simplex-noise@4.0.3 subset (2D) — VERBATIM from src/terrain.js:103-184 ───────────────
const SQRT3 = Math.sqrt(3.0)
const F2 = 0.5 * (SQRT3 - 1.0)
const G2 = (3.0 - SQRT3) / 6.0
const fastFloor = (x) => Math.floor(x) | 0
const grad2 = new Float64Array([
    1, 1, -1, 1,  1, -1, -1, -1,
    1, 0, -1,  0,  1,  0, -1,  0,
    0, 1,  0, -1,  0,  1,  0, -1
])

function buildPermutationTable(random) {
    const tableSize = 512
    const p = new Uint8Array(tableSize)
    for (let i = 0; i < tableSize / 2; i++) p[i] = i
    for (let i = 0; i < tableSize / 2 - 1; i++) {
        const r = i + ~~(random() * (256 - i))
        const aux = p[i]; p[i] = p[r]; p[r] = aux
    }
    for (let i = 256; i < tableSize; i++) p[i] = p[i - 256]
    return p
}

function createNoise2D(random) {
    if (random === undefined) random = Math.random
    const perm = buildPermutationTable(random)
    const permGrad2x = new Float64Array(perm).map((v) => grad2[(v % 12) * 2])
    const permGrad2y = new Float64Array(perm).map((v) => grad2[(v % 12) * 2 + 1])
    return function noise2D(x, y) {
        let n0 = 0, n1 = 0, n2 = 0
        const s = (x + y) * F2
        const i = fastFloor(x + s)
        const j = fastFloor(y + s)
        const t = (i + j) * G2
        const X0 = i - t, Y0 = j - t
        const x0 = x - X0, y0 = y - Y0
        let i1, j1
        if (x0 > y0) { i1 = 1; j1 = 0 } else { i1 = 0; j1 = 1 }
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2
        const x2 = x0 - 1.0 + 2.0 * G2, y2 = y0 - 1.0 + 2.0 * G2
        const ii = i & 255, jj = j & 255
        let t0 = 0.5 - x0 * x0 - y0 * y0
        if (t0 >= 0) { const gi0 = ii + perm[jj]; t0 *= t0; n0 = t0 * t0 * (permGrad2x[gi0] * x0 + permGrad2y[gi0] * y0) }
        let t1 = 0.5 - x1 * x1 - y1 * y1
        if (t1 >= 0) { const gi1 = ii + i1 + perm[jj + j1]; t1 *= t1; n1 = t1 * t1 * (permGrad2x[gi1] * x1 + permGrad2y[gi1] * y1) }
        let t2 = 0.5 - x2 * x2 - y2 * y2
        if (t2 >= 0) { const gi2 = ii + 1 + perm[jj + 1]; t2 *= t2; n2 = t2 * t2 * (permGrad2x[gi2] * x2 + permGrad2y[gi2] * y2) }
        return 70.0 * (n0 + n1 + n2)
    }
}

// ── Height layers — VERBATIM from src/terrain.js:191-227 ──────────────────────────────────────────
function coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp *= gain
    }
    return h
}

function fineHeight(wx, wz, noiseFine, params) {
    const { fineAmplitude, fineFreq } = params
    return (
        noiseFine(wx * fineFreq, wz * fineFreq) * fineAmplitude +
        noiseFine(wx * fineFreq * 2.1, wz * fineFreq * 2.1) * fineAmplitude * 0.5
    )
}

function regionalModulator(wx, wz, noiseRegional, params) {
    const { regionalStrength, regionalScale } = params
    const raw = noiseRegional(wx * (1 / regionalScale), wz * (1 / regionalScale))
    const t = (raw + 1) * 0.5
    return (1.0 - regionalStrength) + regionalStrength * t
}

function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
    const coarse = coarseHeight(wx, wz, noiseCoarse, params)
    const reg = regionalModulator(wx, wz, noiseRegional, params)
    const fine = fineHeight(wx, wz, noiseFine, params) * reg
    return coarse + fine
}

// ── Public factory ────────────────────────────────────────────────────────────────────────────────
/**
 * Build a headless analytic terrain sampler matching src/terrain.js's main-thread path.
 * @param {number}     seed   — uint32 worldSeed (capture.world.seed)
 * @param {object}     params — RANGER_PARAMS subset (terrain scalars + terrainAmplitude)
 * @param {RoadSystem} road   — a streamed RoadSystem; analyticHeight uses its real _sampleCarveWorld
 * @returns {{ analyticHeight, analyticNormal, rawHeightWorld }}
 */
export function makeTerrainHeadless(seed, params, road) {
    // Same seedFor derivation + layer assignment as terrain.js:495-497.
    const noiseCoarse   = createNoise2D(mulberry32(seedFor(seed, 'coarse')))
    const noiseFine     = createNoise2D(mulberry32(seedFor(seed, 'fine')))
    const noiseRegional = createNoise2D(mulberry32(seedFor(seed, 'regional')))
    const amp = params.terrainAmplitude ?? 1.0

    // rawHeightWorld — carve-free terrain height (terrain.js:579).
    const rawHeightWorld = (wx, wz) => height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) * amp

    // analyticHeight — raw, then the road carve blend EXACTLY as terrain.js:587-596.
    const analyticHeight = (wx, wz) => {
        const raw = rawHeightWorld(wx, wz)
        if (road) {
            const c = road._sampleCarveWorld(wx, wz, raw)
            if (c && c.blendW > 1e-6) return raw + c.blendW * (c.gradeY - raw)
        }
        return raw
    }

    // analyticNormal — central difference over analyticHeight, EPS=0.5 (terrain.js:609-620).
    const analyticNormal = (wx, wz) => {
        const EPS = 0.5
        const hL = analyticHeight(wx - EPS, wz)
        const hR = analyticHeight(wx + EPS, wz)
        const hD = analyticHeight(wx, wz - EPS)
        const hU = analyticHeight(wx, wz + EPS)
        const nx = -(hR - hL) / (2 * EPS)
        const ny = 1
        const nz = -(hU - hD) / (2 * EPS)
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        return { x: nx / len, y: ny / len, z: nz / len }
    }

    return { analyticHeight, analyticNormal, rawHeightWorld }
}
