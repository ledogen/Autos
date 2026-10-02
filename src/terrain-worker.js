/**
 * src/terrain-worker.js — the terrain chunk Worker (module entry).
 *
 * Spawned by TerrainSystem as a small pool: `new Worker(new URL('./terrain-worker.js',
 * import.meta.url), { type: 'module' })`, which Vite bundles as its own chunk (the road workers
 * are built the same way). It IMPORTS the height function the main thread uses — there is no copy.
 *
 * Protocol:
 *   in  { type: 'init', worldSeed, params }       — (re)seed the three noise layers
 *   in  { type: 'generate', cx, cz, key, epoch }  — build one 65×65 heightmap
 *   out { key, cx, cz, heights, epoch }           — heights.buffer transferred (zero-copy)
 *
 * Heights are RAW (pre-amplitude, pre-carve): the road carve never enters the Worker. The main
 * thread's _flushPendingQueue builds the carve table and applies the blend after receiving these.
 * Routing does not live here either (BUG-26: route jobs must never starve terrain generation).
 */

import { height, makeTerrainNoise } from './terrain-height.js'

const GRID_SAMPLES = 65
const CHUNK_SIZE   = 64
const CELL_SIZE    = CHUNK_SIZE / (GRID_SAMPLES - 1)

let noise = null    // { noiseCoarse, noiseFine, noiseRegional } — set by 'init'
let params = null   // the structured-cloneable terrain-layer fields — set by 'init'

self.onmessage = function (e) {
    if (e.data.type === 'init') {
        params = e.data.params
        noise = makeTerrainNoise(e.data.worldSeed)
        return
    }
    if (e.data.type !== 'generate') return
    if (!noise) {
        console.warn('[terrain-worker] generate received before init — skipping key', e.data.key)
        return
    }

    const { cx, cz, key, epoch } = e.data
    const N = GRID_SAMPLES
    const heights = new Float32Array(N * N)
    const originX = cx * CHUNK_SIZE
    const originZ = cz * CHUNK_SIZE
    for (let zi = 0; zi < N; zi++) {
        for (let xi = 0; xi < N; xi++) {
            heights[zi * N + xi] = height(originX + xi * CELL_SIZE, originZ + zi * CELL_SIZE,
                noise.noiseCoarse, noise.noiseFine, noise.noiseRegional, params)
        }
    }
    // PERF-33: epoch echoed so replies from before a stream jump / regen are dropped.
    self.postMessage({ key, cx, cz, heights, epoch }, [heights.buffer])
}
