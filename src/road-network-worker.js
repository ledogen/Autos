// src/road-network-worker.js — PERF-30: the network Worker entry (a real ES MODULE).
//
// The whole road-network build — corridor routing, the BUG-56 plan layer (conflict pairs, merge
// ladder, profile solves, R4 settle), assembly — runs HERE, off the main thread, inside a private
// RoadSystem. Same import-the-real-code pattern as road-route-worker.js (the no-mirror fence):
// the worker constructs the same class the synchronous fallback uses, so worker/sync parity is by
// construction; test/network-worker-parity.mjs pins the two seams that could still drift — the
// params snapshot filter and the pond-disc reconstruction below.
//
// Protocol (one message type; the epoch is the route-worker convention — sliders/water bump it,
// replies against a stale epoch are discarded wholesale by the main side):
//   {type:'build', epoch, seed, params, center:{x,z}, radius, pondDiscs}
//     → {type:'network', epoch, seed, data: RoadSystem.exportNetwork() result}
//     params MUST be a snapshotRoadParams() copy (structured-clonable by construction — NEVER the
//     live RANGER_PARAMS: engineTorqueCurve etc. clone fine but functions would throw, and the
//     worker must not see main-thread mutations mid-build anyway).
//     pondDiscs is a flat Float64Array [cx, cz, r, ...] covering the build window + margins
//     (FEAT-17 pond+skirt discs as pure DATA, never closures — see buildNoGoFns).
//
// The RoadSystem PERSISTS across builds of the same (seed, epoch): a moved center re-streams with
// every warm proto cache (sites, routes, graph memo) intact — that reuse is the worker's whole
// perf story. A new epoch or seed rebuilds it from scratch.

import * as THREE from 'three'
import { RoadSystem } from './road.js'

/**
 * The params snapshot the worker builds from: keep primitives and plain containers of them
 * (roadV2 and water are nested scalar objects; the router reads both), drop everything else
 * (functions, typed arrays, THREE objects — DataCloneError fodder and main-thread state).
 * The parity gate proves this filter loses nothing the build reads: a sync build on the FULL
 * live params must equal the worker-path build on the snapshot, byte for byte.
 */
export function snapshotRoadParams(v) {
    const t = typeof v
    if (t === 'number' || t === 'string' || t === 'boolean') return v
    if (Array.isArray(v)) {
        const out = []
        for (const e of v) { const s = snapshotRoadParams(e); if (s !== undefined) out.push(s) }
        return out
    }
    if (v && t === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        const out = {}
        for (const k of Object.keys(v)) {
            const s = snapshotRoadParams(v[k])
            if (s !== undefined) out[k] = s
        }
        return out
    }
    return undefined
}

/**
 * How far beyond the stream radius the pond-disc collection must reach so the worker's disc list
 * contains every pond ANY build query can touch. The build queries water at three ranges past the
 * band: the Urquhart graph pads the band by roadGraphMargin site-cells; Poisson acceptance reads
 * neighbour sites another ceil(roadSiteMinDist/S)+1 cells out; corridor route specs pad each
 * edge's bbox by their own search margin. A pad that covers the farthest of those (plus cell-
 * floor rounding slack) makes membership exact — a NEVER-queried extra disc is harmless, a
 * missing one resurrects a drowned site (measured: the first parity run missed a pond 4.3 km out
 * and grew an extra graph node). Ponds are a handful of floats each, so overshoot is free.
 */
export function pondDiscPad(params) {
    const S = params?.roadSiteSpacing ?? 256
    const M = Math.max(1, Math.round(params?.roadGraphMargin ?? 3))
    const W = Math.max(1, Math.ceil((params?.roadSiteMinDist ?? 90) / S) + 1)
    return 2 * 256                 // band macro-col margin (ROAD_BAND_MARGIN + rounding)
         + (M + W + 2) * S        // graph margin + Poisson window + cell-floor slack, in site cells
         + 1024                   // corridor-search bbox margin slack
}

/**
 * Rebuild the two setWaterNoGo closures from the disc list — the exact semantics of the live
 * pair main.js wires (WaterSystem.isRoadNoGo = point within radius+skirt of any pond;
 * pondDiscsFn = discs intersecting the bbox). Disc ORDER differs from pondsInBBox's cell-scan
 * order, which is fine: the corridor search hard-blocks cells against the SET, and the no-go is
 * an any-test — both order-independent. Membership is the parity surface, and the caller pads
 * its collection extent so no queryable disc is missing.
 */
export function buildNoGoFns(discs) {
    const noGo = (x, z) => {
        for (let i = 0; i < discs.length; i += 3) {
            if (Math.hypot(x - discs[i], z - discs[i + 1]) <= discs[i + 2]) return true
        }
        return false
    }
    const discsInBBox = (minX, minZ, maxX, maxZ) => {
        const out = []
        for (let i = 0; i < discs.length; i += 3) {
            const cx = discs[i], cz = discs[i + 1], r = discs[i + 2]
            if (cx + r < minX || cx - r > maxX || cz + r < minZ || cz - r > maxZ) continue
            out.push(cx, cz, r)
        }
        return out
    }
    return { noGo, discsInBBox }
}

/**
 * One full network build → export, as a pure function of the request — THE build path, shared by
 * the worker message loop and the parity gate (which calls it from node, no Worker involved).
 * `rs` is an optional warm RoadSystem to reuse (same seed + params identity).
 */
export function buildNetworkSnapshot(req, rs = null) {
    if (!rs) {
        rs = new RoadSystem(req.seed, req.params)
        if (req.pondDiscs && req.pondDiscs.length) {
            const { noGo, discsInBBox } = buildNoGoFns(req.pondDiscs)
            rs.setWaterNoGo(noGo, discsInBBox)
        }
    }
    rs.setRadius(req.radius)
    rs.update(new THREE.Vector3(req.center.x, 0, req.center.z))
    return { rs, data: rs.exportNetwork() }
}

// Message loop — worker scope only, so importing this module from node (the parity gate) or the
// main thread is side-effect-free.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    let rs = null, rsEpoch = null, rsSeed = null
    self.onmessage = (e) => {
        const d = e.data
        if (d.type !== 'build') return
        // Epoch/seed change = params or water changed → the warm instance's caches are poisoned;
        // rebuild from scratch. Same epoch + seed = a moved center → reuse everything warm.
        if (rs && (rsEpoch !== d.epoch || rsSeed !== d.seed)) rs = null
        const built = buildNetworkSnapshot(d, rs)
        rs = built.rs; rsEpoch = d.epoch; rsSeed = d.seed
        // Transfer every run's typed-array buffers — exportNetwork hands out copies, so detaching
        // them here never touches the live entries the next warm build reuses.
        const transfer = []
        for (const r of built.data.runs) transfer.push(r.pts.buffer, r.polyCum.buffer, r.clArc.buffer)
        self.postMessage({ type: 'network', epoch: d.epoch, seed: d.seed, data: built.data }, transfer)
    }
}
