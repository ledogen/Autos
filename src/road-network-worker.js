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
//     → {type:'network', epoch, seed, error} when the build threw — EVERY request gets a reply,
//       because the client runs one build at a time and waits on it.
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
import { RoadRouteWorker } from './road-worker.js'

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
            // `_`-prefixed keys are per-frame PHYSICS SCRATCH that main.js hangs on RANGER_PARAMS
            // (_tireFz, _suspForceAccum, _driveTorque, …: plain number arrays, so the type filter
            // keeps them). No road code reads them, and they change every physics step, which made
            // the worker's psig reuse key differ on EVERY build: the warm RoadSystem, and every
            // route it had cached, was thrown away each time (measured 2026-09-22: the 2800 m story
            // region routed from scratch right after the spawn build had routed its core).
            if (k.charCodeAt(0) === 95) continue
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

/** Construct the worker's private RoadSystem for a request (split out of buildNetworkSnapshot
 *  so the PERF-31 pre-warm can hold the instance before calling update()). */
export function makeNetworkInstance(req) {
    const rs = new RoadSystem(req.seed, req.params)
    if (req.pondDiscs && req.pondDiscs.length) {
        const { noGo, discsInBBox } = buildNoGoFns(req.pondDiscs)
        rs.setWaterNoGo(noGo, discsInBBox)
    }
    return rs
}

/**
 * One full network build → export, as a pure function of the request — THE build path, shared by
 * the worker message loop and the parity gate (which calls it from node, no Worker involved).
 * `rs` is an optional warm RoadSystem to reuse (same seed + params identity).
 */
export function buildNetworkSnapshot(req, rs = null) {
    if (!rs) rs = makeNetworkInstance(req)
    rs.setRadius(req.radius)
    rs.forgetStreamCenter()   // PERF-33: build exactly the requested band — never the previous one kept by the 96 m gate
    rs.update(new THREE.Vector3(req.center.x, 0, req.center.z))
    return { rs, data: rs.exportNetwork() }
}

// Message loop — worker scope only, so importing this module from node (the parity gate) or the
// main thread is side-effect-free. One RoadSystem PER CLIENT ('play' / 'mission' / 'map' — the
// RoadNetworkClient registry): epochs are per main-side instance, so sharing one build instance
// across clients would thrash it on every alternation; per-client instances mirror the main
// thread's own one-instance-per-consumer layout and keep each one's warm caches coherent.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    const instances = new Map()   // client id → { rs, epoch, seed }
    // PERF-31 W2.2: a NESTED route-worker pool (support-checked — Safari 16.4+ exposes Worker in
    // worker scope). Before update(), the private instance pre-warms its whole route demand —
    // the registered band AND the plan layer's demand (warmPlanDemand → _warmPlanJobs: settle
    // 1-ring, census partners, pass-2 pins) — through the pool, so the build's routing is a pure
    // cache walk fanned across cores instead of a serial crawl on this thread. The pre-warm is
    // invisible in the output by the no-mirror fence (pool workers run the same routeEdgeV2, and
    // test/network-worker-parity.mjs pins a pre-warmed build == a cold sync build).
    // One pool for all clients; builds are serialized through `chain` (they were serial before —
    // one message at a time — but the pre-warm awaits, so the loop must queue explicitly).
    const canNest = typeof Worker === 'function'
    let pool = null, poolSig = null
    let chain = Promise.resolve()
    async function prewarm(d, rs, cid, psig) {
        const sig = `${d.seed}:${d.epoch}:${psig}`
        if (!pool) pool = new RoadRouteWorker()
        if (poolSig !== sig) { pool.init(d.seed, d.params); poolSig = sig }
        pool.registerClient(cid, rs)
        rs.warmPlanDemand = true
        rs.warmFailed = false
        rs.setRouteDispatcher((jobs, epoch) => pool.postRouteJobs(cid, jobs, epoch))
        rs.setRadius(d.radius)
        rs.beginPrewarmedBuild()   // rev bump + CR-02 bounds move to warm start; the build skips both and reuses the warm's plan memos (see road.js)
        const center = new THREE.Vector3(d.center.x, 0, d.center.z)
        const t0 = performance.now()
        while (!rs.warmFailed && !rs.warmBandComplete(center)) {
            // Deadline, not a hang: if the pool dies or stalls, the build below routes whatever
            // is missing synchronously — the pre-warm is an optimization, never a dependency.
            if (performance.now() - t0 > 60000) break
            await new Promise((r) => setTimeout(r, 8))
        }
    }
    async function handleBuild(d) {
        const cid = d.client ?? 'default'
        let inst = instances.get(cid)
        // The warm instance's PRICES were bound at construction — buildNetworkSnapshot(req, rs)
        // only re-applies radius and center, never req.params — so the reuse key must cover the
        // params too. Epoch alone does NOT: it is per main-side instance, and a client that
        // REBUILDS its RoadSystem on a param change (map2d._buildRoad) resets _routeEpoch to the
        // same value every time, so epoch+seed compared equal and the map kept re-adopting a
        // network priced with the old roadV2 list while play — one long-lived instance whose
        // epoch strictly increases — updated correctly. Stringify is once per BUILD (seconds),
        // so its cost is not measurable here.
        const psig = JSON.stringify(d.params)
        if (inst && (inst.epoch !== d.epoch || inst.seed !== d.seed || inst.psig !== psig)) inst = null
        let rs = inst ? inst.rs : null
        if (canNest) {
            try {
                if (!rs) rs = makeNetworkInstance(d)
                await prewarm(d, rs, cid, psig)
            } catch (err) { console.warn('[network-worker] pre-warm failed, building cold', err) }
        }
        const built = buildNetworkSnapshot(d, rs)
        instances.set(cid, { rs: built.rs, epoch: d.epoch, seed: d.seed, psig })
        // Transfer every run's typed-array buffers — exportNetwork hands out copies, so detaching
        // them here never touches the live entries the next warm build reuses.
        const transfer = []
        for (const r of built.data.runs) transfer.push(r.pts.buffer, r.polyCum.buffer, r.clArc.buffer)
        self.postMessage({ type: 'network', client: cid, epoch: d.epoch, seed: d.seed, data: built.data }, transfer)
    }
    self.onmessage = (e) => {
        const d = e.data
        if (d.type !== 'build') return
        // A failed build still REPLIES. The client holds one build in flight and queues the rest
        // behind it, so a silent failure parked every later build and every buildNow() promise
        // forever — a loading screen that never lifts.
        chain = chain.then(() => handleBuild(d)).catch((err) => {
            console.error('[network-worker] build failed', err)
            self.postMessage({ type: 'network', client: d.client ?? 'default', epoch: d.epoch, seed: d.seed, error: String(err?.message ?? err) })
        })
    }
}
