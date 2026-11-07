// test/lib/terrain-headless.mjs — headless analytic terrain height (no Worker, no scene, no DOM).
//
// TerrainSystem (src/terrain.js) spawns Workers and builds meshes in its constructor, so the gates
// do not construct it. This module provides ONLY the main-thread analytic-sampling path
// (analyticHeight / analyticNormal / rawHeightWorld) that the physics contacts ride.
//
// NO COPIES: it calls the REAL TerrainSystem.prototype methods on a fake `this` carrying the noise
// closures (src/terrain-height.js, the module the game and its terrain Worker import), the params
// and the road instance passed in. The FEAT-18 stream carve is off unless a `waterCarve` hook is passed
// (main.js setWaterCarve's shape — test/lib/world-rig.mjs builds one; test/stream-carve.mjs its own fake).

import { makeTerrainNoise } from '../../src/terrain-height.js'
import { TerrainSystem } from '../../src/terrain.js'

// The three main-thread noise closures, exactly as TerrainSystem builds them. Exposed so a headless
// gate can call the REAL TerrainSystem.prototype._buildCarveTable via a fake `this` (no Worker) and
// feed it noise that byte-matches the running game.
export const makeNoise = makeTerrainNoise

// ── Public factory ────────────────────────────────────────────────────────────────────────────────
/**
 * Build a headless analytic terrain sampler — src/terrain.js's own main-thread methods.
 * @param {number}     seed   — uint32 worldSeed (capture.world.seed)
 * @param {object}     params — RANGER_PARAMS subset (terrain scalars)
 * @param {RoadSystem} road   — a streamed RoadSystem (or null: no carve)
 * @returns {{ analyticHeight, analyticNormal, rawHeightWorld }} bound, safe to pass as callbacks
 */
export function makeTerrainHeadless(seed, params, road, waterCarve = null) {
    const { noiseCoarse, noiseFine, noiseRegional } = makeTerrainNoise(seed)
    const T = TerrainSystem.prototype
    const self = { _noiseCoarse: noiseCoarse, _noiseFine: noiseFine, _noiseRegional: noiseRegional,
        _params: params, _roadSystem: road ?? null, _waterCarve: waterCarve, analyticHeight: T.analyticHeight }
    return {
        analyticHeight: T.analyticHeight.bind(self),
        analyticNormal: T.analyticNormal.bind(self),
        rawHeightWorld: T.rawHeightWorld.bind(self),
        self,   // the fake `this`, for a rig that calls the chunk-mesh methods (_buildCarveTable, _composeCarvedY…)
    }
}
