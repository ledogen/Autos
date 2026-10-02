/**
 * src/terrain-height.js — THE terrain height function, and the seeded noise it reads.
 *
 * One definition, imported by everything that needs raw terrain height:
 *   - src/terrain.js          (main thread: analyticHeight, the carve table, chunk colours)
 *   - src/terrain-worker.js   (the chunk heightmap Worker)
 *   - src/road.js             (coarseHeight only — road grade math is amplitude-independent)
 *   - test/lib/terrain-headless.mjs (the headless gates' terrain)
 *
 * It used to exist as four hand-synced copies (a "SYNC RULE"), because the terrain Worker was a
 * Blob built from a source string and could not import. The Worker is a real ES module now, so
 * Worker == main thread == headless by construction — the same no-mirror fence the road workers use.
 *
 * Pure: no THREE, no DOM, no module state. Heights are RAW (pre-terrainAmplitude); the amplitude is
 * applied by the caller, on the main thread.
 */

import { createNoise2D } from 'simplex-noise'
import { seedFor, mulberry32 } from './seed.js'

/**
 * The three seeded noise layers of a world. Same seed → the same three closures, everywhere.
 * @param {number} worldSeed unsigned 32-bit seed (parseWorldSeed)
 * @returns {{ noiseCoarse: Function, noiseFine: Function, noiseRegional: Function }}
 */
export function makeTerrainNoise(worldSeed) {
    return {
        noiseCoarse:   createNoise2D(mulberry32(seedFor(worldSeed, 'coarse'))),
        noiseFine:     createNoise2D(mulberry32(seedFor(worldSeed, 'fine'))),
        noiseRegional: createNoise2D(mulberry32(seedFor(worldSeed, 'regional'))),
    }
}

// Three-layer height: coarse ridged-multifractal + fine FBM × regional modulator.

export function coarseHeight(wx, wz, noiseCoarse, params) {
    const { coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness } = params
    let h = 0
    let freq = coarseFreq
    let amp  = coarseAmplitude
    const gain = 0.5
    const lacunarity = 2.0
    for (let o = 0; o < coarseOctaves; o++) {
        const n = noiseCoarse(wx * freq, wz * freq)
        const ridged = 1.0 - Math.abs(n)
        const shaped = Math.pow(ridged, ridgeSharpness)
        h += shaped * amp
        freq *= lacunarity
        amp  *= gain
    }
    return h
}

export function fineHeight(wx, wz, noiseFine, params) {
    const { fineAmplitude, fineFreq } = params
    return (
        noiseFine(wx * fineFreq, wz * fineFreq) * fineAmplitude +
        noiseFine(wx * fineFreq * 2.1, wz * fineFreq * 2.1) * fineAmplitude * 0.5
    )
}

export function regionalModulator(wx, wz, noiseRegional, params) {
    const { regionalStrength, regionalScale } = params
    const raw = noiseRegional(wx * (1 / regionalScale), wz * (1 / regionalScale))
    const t = (raw + 1) * 0.5
    return (1.0 - regionalStrength) + regionalStrength * t
}

/** Raw terrain height (metres, pre-amplitude) at world (wx, wz). */
export function height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) {
    const coarse = coarseHeight(wx, wz, noiseCoarse, params)
    const reg    = regionalModulator(wx, wz, noiseRegional, params)
    const fine   = fineHeight(wx, wz, noiseFine, params) * reg
    return coarse + fine
}
