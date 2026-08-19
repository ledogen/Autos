// src/road-route-worker.js — FEAT-68: the v2 route Worker entry (a real ES MODULE).
//
// This file replaces the ROAD_WORKER_SOURCE verbatim-mirror string (QUAL-08 → FEAT-68): the worker
// IMPORTS the same routeEdgeV2 the synchronous fallback calls, so worker/sync parity is by
// construction — no ROUTE SYNC region, no byte-equality gate, no escaping. Vite bundles it via
// `new Worker(new URL('./road-route-worker.js', import.meta.url), { type: 'module' })` in
// src/road-worker.js. The only derivation that could still drift is the height-field rebuild
// below; test/road-worker-parity.mjs pins it against RoadSystem's own closures.
//
// Protocol (envelope unchanged from QUAL-08, payload is the v2 spec):
//   {type:'init', worldSeed, params:{coarseAmplitude, coarseFreq, coarseOctaves, ridgeSharpness}}
//     → rebuild the seeded coarse noise + both height closures. NEVER the whole RANGER_PARAMS
//       (functions/typed arrays throw DataCloneError — project_terrain_worker_constraints).
//   {type:'route', client, jobs, epoch}
//     → {routed:true, client, epoch, results:[{key, prims, v2Dirs, pinFallback}]}
//     jobs are RoadSystem._v2EdgeSpec objects: {key, ax, az, yA, bx, bz, yB, margin,
//     blockedDiscs, dirs}. prims:null = raced ahead of 'init' (client re-warms the key later).

import { seedFor, mulberry32 } from './seed.js'
import { createNoise2D } from 'simplex-noise'
import { truncatedHeightField, routeEdgeV2, V2_TRUNC_K } from './corridor-router.js'

/**
 * Rebuild the two route height fields from the init subset — EXACTLY the derivation RoadSystem
 * uses (noiseCoarse = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse'))); hTrunc = the
 * V2_TRUNC_K-octave corridor field; hCoarse = the full-octave coarse field, float-identical to
 * road.js's _coarseHeight loop). Exported so the parity gate can pin this derivation from node.
 */
export function buildRouteFields(worldSeed, params) {
    const noiseCoarse = createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))
    return {
        hTrunc: truncatedHeightField(noiseCoarse, params, V2_TRUNC_K),
        hCoarse: truncatedHeightField(noiseCoarse, params, params.coarseOctaves),
    }
}

// Message loop — worker scope only, so importing this module from node (the parity gate) or the
// main thread is side-effect-free.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    let fields = null
    self.onmessage = (e) => {
        const d = e.data
        if (d.type === 'init') { fields = buildRouteFields(d.worldSeed, d.params); return }
        if (d.type !== 'route') return
        const results = []
        for (const job of d.jobs) {
            if (!fields) { results.push({ key: job.key, prims: null }); continue }
            const res = routeEdgeV2(job, fields.hTrunc, fields.hCoarse)
            results.push({
                key: job.key,
                prims: res.cl.primitives,
                v2Dirs: !!job.dirs,
                pinFallback: !!(res.pinRequested && res.feasible && !res.usedPin),
            })
        }
        self.postMessage({ routed: true, client: d.client, epoch: d.epoch, results })
    }
}
