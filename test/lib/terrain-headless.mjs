// test/lib/terrain-headless.mjs — headless analytic terrain height (no Worker, no scene, no DOM).
//
// TerrainSystem (src/terrain.js) spawns Workers and builds meshes in its constructor, so the gates
// do not construct it. This module provides ONLY the main-thread analytic-sampling path
// (analyticHeight / analyticNormal / rawHeightWorld) that the physics contacts ride.
//
// NO COPIES: the noise and the height layers are imported from src/terrain-height.js — the same
// module the game's main thread and its terrain Worker import — so this cannot drift from the game.
//
// The road CARVE is not replicated either: analyticHeight defers to the REAL
// RoadSystem._sampleCarveWorld of the road instance passed in, exactly as src/terrain.js does.

import { height, makeTerrainNoise } from '../../src/terrain-height.js'

// The three main-thread noise closures, exactly as TerrainSystem builds them. Exposed so a headless
// gate can call the REAL TerrainSystem.prototype._buildCarveTable via a fake `this` (no Worker) and
// feed it noise that byte-matches the running game.
export const makeNoise = makeTerrainNoise

// ── Public factory ────────────────────────────────────────────────────────────────────────────────
/**
 * Build a headless analytic terrain sampler matching src/terrain.js's main-thread path.
 * @param {number}     seed   — uint32 worldSeed (capture.world.seed)
 * @param {object}     params — RANGER_PARAMS subset (terrain scalars + terrainAmplitude)
 * @param {RoadSystem} road   — a streamed RoadSystem; analyticHeight uses its real _sampleCarveWorld
 * @returns {{ analyticHeight, analyticNormal, rawHeightWorld }}
 */
export function makeTerrainHeadless(seed, params, road) {
    const { noiseCoarse, noiseFine, noiseRegional } = makeTerrainNoise(seed)
    const amp = params.terrainAmplitude ?? 1.0

    // rawHeightWorld — carve-free terrain height (terrain.js:579).
    const rawHeightWorld = (wx, wz) => height(wx, wz, noiseCoarse, noiseFine, noiseRegional, params) * amp

    // analyticHeight — raw, then the road carve blend EXACTLY as terrain.js (incl. FEAT-40:
    // queryY threads into _sampleCarveWorld, which gives bored runs only their below-apex probes).
    // _nrHint accepted for signature parity with the real terrain (unused — no memo here).
    const analyticHeight = (wx, wz, _nrHint, queryY) => {
        const raw = rawHeightWorld(wx, wz)
        if (road) {
            const c = road._sampleCarveWorld(wx, wz, raw, undefined, queryY)
            if (c && c.blendW > 1e-6) return raw + c.blendW * (c.gradeY - raw)
        }
        return raw
    }

    // analyticNormal — central difference over analyticHeight, EPS=0.5 (terrain.js:609-620).
    const analyticNormal = (wx, wz, _nrHint, queryY) => {
        const EPS = 0.5
        const hL = analyticHeight(wx - EPS, wz, undefined, queryY)
        const hR = analyticHeight(wx + EPS, wz, undefined, queryY)
        const hD = analyticHeight(wx, wz - EPS, undefined, queryY)
        const hU = analyticHeight(wx, wz + EPS, undefined, queryY)
        const nx = -(hR - hL) / (2 * EPS)
        const ny = 1
        const nz = -(hU - hD) / (2 * EPS)
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        return { x: nx / len, y: ny / len, z: nz / len }
    }

    return { analyticHeight, analyticNormal, rawHeightWorld }
}
