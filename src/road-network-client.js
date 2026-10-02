// src/road-network-client.js — PERF-30: main-thread client for the network Worker.
//
// Owns the Worker (src/road-network-worker.js — a module worker running the ENTIRE road-network
// build inside a private RoadSystem per client) and serves EVERY main-thread RoadSystem that
// needs off-thread builds, keyed by client id — the RoadRouteWorker registry pattern:
//   'play'    — the live play network (main.js): per-frame dispatcher + the cold-flow buildNow()s
//   'map'     — the Map2D overlay's read-only instance (map2d.js cold open / restream)
// ('mission' was a third client — the Quick-Job planner's own warm. Missions plan on the 'play'
//  network as of 2026-09-07, so that instance and its warm are gone.)
// One build runs at a time (a whole-window job; a second concurrent build would only steal the
// CPU the first is using); further requests queue. A queued 'move' for the same client coalesces
// onto the newest center instead of stacking.
//
// Discipline (all measured into shape by test/network-worker-parity.mjs):
//   - Params go through snapshotRoadParams() — never the live RANGER_PARAMS.
//   - Pond no-go goes as disc DATA covering the window + pondDiscPad() margins, never closures.
//   - Replies are guarded per client: the route epoch (a slider/water change since dispatch makes
//     the reply stale — discard wholesale, the route-worker convention), the seed, and the
//     RoadSystem INSTANCE the build was requested for. The instance check is not redundant: a
//     client that rebuilds its RoadSystem on a param change (the map) restarts its epoch at the
//     same number, so epoch + seed alone let the new instance adopt the old instance's build.
//   - Every request gets a reply, including a failed build ({error}) and a crashed worker
//     (onerror): waiters resolve false and the queue moves on.
//   - The swap is atomic between frames: onmessage runs as its own macrotask, never mid-frame.

import { snapshotRoadParams, pondDiscPad } from './road-network-worker.js'
import { perfAdd } from './perf.js'   // PERF-34: dispatch-cost buckets

export class RoadNetworkClient {
    /**
     * @param {object} deps
     * @param {() => number} deps.getSeed        — live world seed
     * @param {() => object} deps.getParams      — live RANGER_PARAMS (snapshotted per request)
     * @param {(minX, minZ, maxX, maxZ) => number[]} deps.getPondDiscs — flat [cx,cz,r,…] for a bbox
     *        (null-safe: return [] before water exists)
     */
    constructor({ getSeed, getParams, getPondDiscs, warmRegion = null }) {
        this._getSeed = getSeed
        this._getParams = getParams
        this._getPondDiscs = getPondDiscs
        // PERF-34: optional (minX, minZ, maxX, maxZ, deadlineMs) => boolean — the water system's
        // budget-pumped detection pre-warm. getPondDiscs over a fresh 760 m window forced the lazy
        // cell scans + rim casts synchronously INSIDE road.update (road.dispatch.pondDiscs 20–22 ms,
        // one frame per band at 200 mph). The dispatch now primes those caches in ≤2 ms slices
        // between frames and posts the build once the region reports warm; the old network keeps
        // serving meanwhile (stale-until-replaced), so the few frames of delay cost nothing.
        this._warmRegion = warmRegion
        this._warmTimer = 0
        this._clients = new Map()   // id → { road, onAdopted }
        this._queue = []            // pending build entries (see request())
        this._active = null         // the entry the worker is building right now
        this._worker = new Worker(new URL('./road-network-worker.js', import.meta.url), { type: 'module' })
        this._worker.onmessage = (e) => this._onReply(e.data)
        // An error the worker's own catch cannot see (a module that fails to load, a throw outside
        // the build chain) would otherwise leave _active set forever.
        this._worker.onerror = (e) => {
            console.error('[network-client] worker error', e?.message ?? e)
            this._onReply({ type: 'network', error: 'worker error' })
        }
    }

    /**
     * Register (or re-register after a seed rebuild swaps the instance) a RoadSystem under `id`.
     * wireDispatcher (default true) hooks setNetworkDispatcher so the instance's own streaming
     * defers real rebuilds here; pass false for instances driven explicitly via buildNow()
     * (the planner and the map — their update() calls must keep their synchronous fallback).
     * Omitted opts keep what a previous register() for this id set (the seed-regen re-register).
     */
    register(id, roadSystem, opts = null) {
        const prev = this._clients.get(id)
        const rec = {
            road: roadSystem,
            onAdopted: opts && 'onAdopted' in opts ? opts.onAdopted : prev?.onAdopted ?? null,
        }
        this._clients.set(id, rec)
        const wire = opts && 'wireDispatcher' in opts ? opts.wireDispatcher : prev ? prev.wired : true
        rec.wired = wire
        if (wire) roadSystem.setNetworkDispatcher((req) => this.request(id, req))
        // A replaced instance's queued builds are for the old world — resolve them stale and drop
        // them (an in-flight one dies at the instance guard on reply).
        this._queue = this._queue.filter((q) => {
            if (q.id !== id) return true
            for (const w of q.waiters) w(false)
            return false
        })
    }

    /**
     * Queue a build for client `id`. Returns the entry the request landed on:
     *   - an IDENTICAL queued/active entry (same id, epoch, window) is reused untouched;
     *   - a QUEUED 'move' for the same id+epoch is coalesced onto the newest center (per-frame
     *     dispatch while driving must not stack a request per frame);
     *   - otherwise a new entry is queued.
     */
    request(id, { x, z, radius, reason }) {
        const rec = this._clients.get(id)
        if (!rec) return null
        const epoch = rec.road.routeEpoch()
        reason = reason || 'move'
        const same = (q) => q.id === id && q.road === rec.road && q.epoch === epoch && q.x === x && q.z === z && q.radius === radius
        if (this._active && same(this._active)) return this._active
        for (const q of this._queue) if (same(q)) return q
        if (reason === 'move') {
            const q = this._queue.find((q2) => q2.id === id && q2.epoch === epoch && q2.reason === 'move')
            if (q) { q.x = x; q.z = z; q.radius = radius; return q }
        }
        const entry = { id, road: rec.road, epoch, reason, x, z, radius, waiters: [] }
        this._queue.push(entry)
        this._pump()
        return entry
    }

    /**
     * Awaitable build for the explicit flows (spawn resolve, story region entry, planner warm,
     * map open) that run behind a loading screen or badge: resolves true after the network for
     * exactly (x, z, radius) is ADOPTED into client `id`, false if the request went stale first
     * (epoch/seed changed — the caller re-decides). Queue-safe: the waiter binds to its own
     * entry, so builds for other clients ahead of it in the queue don't fool it.
     */
    buildNow(id, x, z, radius) {
        const entry = this.request(id, { x, z, radius, reason: 'move' })
        if (!entry) return Promise.resolve(false)
        return new Promise((resolve) => entry.waiters.push(resolve))
    }

    _pump() {
        if (this._active || this._queue.length === 0) return
        const entry = this._queue.shift()
        const rec = this._clients.get(entry.id)
        if (!rec) { for (const w of entry.waiters) w(false); this._pump(); return }
        // PERF-33: a 'move' coalesced while an earlier build was in flight often asks for the very
        // window that build just installed. Building it again is a pure no-op (the network is a
        // function of the band) that still costs a full main-thread adopt — the driving hitch.
        if (entry.reason === 'move' && entry.epoch === rec.road.routeEpoch()
            && rec.road.holdsWindow(entry.x, entry.z, entry.radius)) {
            for (const w of entry.waiters) w(true)
            this._pump()
            return
        }
        const pad = pondDiscPad(this._getParams())
        const x0 = entry.x - entry.radius - pad, z0 = entry.z - entry.radius - pad
        const x1 = entry.x + entry.radius + pad, z1 = entry.z + entry.radius + pad
        if (this._warmRegion) {
            // Sliced ONLY for the per-frame driving dispatch. An entry with waiters is a buildNow()
            // flow (spawn, story region entry, map open) running behind a loading screen or badge —
            // nothing on screen to hitch, and the worker idles until we post. Slicing those at 2 ms per
            // setTimeout turn starved the warm behind cold-load long tasks: boot ready 3 → 6.5 s,
            // story entry +6 s (bisected to 60b145f, 2026-10-01). They warm in one go.
            const budget = entry.waiters.length ? Infinity : 2
            const _tw = performance.now()
            const warm = this._warmRegion(x0, z0, x1, z1, budget)
            perfAdd('road.dispatch.warm', performance.now() - _tw)
            if (!warm) {                              // PERF-34: not primed yet — head of the queue, retry between frames
                this._queue.unshift(entry)
                if (!this._warmTimer) this._warmTimer = setTimeout(() => { this._warmTimer = 0; this._pump() }, 0)
                return
            }
        }
        this._active = entry
        const _t0 = performance.now()
        const discs = this._getPondDiscs(x0, z0, x1, z1) || []
        perfAdd('road.dispatch.pondDiscs', performance.now() - _t0)
        const _t1 = performance.now()
        const params = snapshotRoadParams(this._getParams())
        perfAdd('road.dispatch.params', performance.now() - _t1)
        this._worker.postMessage({
            type: 'build',
            client: entry.id,
            epoch: entry.epoch,
            seed: this._getSeed(),
            params,
            center: { x: entry.x, z: entry.z },
            radius: entry.radius,
            pondDiscs: Float64Array.from(discs),
        })
    }

    _onReply(msg) {
        if (!msg || msg.type !== 'network') return
        const entry = this._active
        this._active = null
        const rec = entry ? this._clients.get(entry.id) : null
        const fresh = !!rec && !msg.error && rec.road === entry.road
            && msg.seed === this._getSeed() && msg.epoch === rec.road.routeEpoch()
        if (fresh) {
            rec.road.adoptNetwork(msg.data, { regen: entry.reason === 'params' })
            rec.onAdopted?.(entry.reason)
        }
        // Resolve waiters either way — a stale or failed reply means the awaited build will never
        // be adopted and the caller must re-decide with current state, not hang.
        if (entry) for (const w of entry.waiters) w(fresh)
        this._pump()
    }

    dispose() {
        this._worker.terminate()
        this._clients.clear()
        for (const q of this._queue) for (const w of q.waiters) w(false)
        this._queue.length = 0
    }
}
