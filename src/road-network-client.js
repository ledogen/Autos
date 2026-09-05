// src/road-network-client.js — PERF-30: main-thread client for the network Worker.
//
// Owns the Worker (src/road-network-worker.js — a module worker running the ENTIRE road-network
// build inside a private RoadSystem per client) and serves EVERY main-thread RoadSystem that
// needs off-thread builds, keyed by client id — the RoadRouteWorker registry pattern:
//   'play'    — the live play network (main.js): per-frame dispatcher + the cold-flow buildNow()s
//   'mission' — the Quick-Job planner warm (main.js): its final synchronous update() carried the
//               whole BUG-56 plan layer (~4 s frozen frame a few seconds after boot — measured
//               2026-09-04, the owner's "freeze after the first frames")
//   'map'     — the Map2D overlay's read-only instance (map2d.js cold open / restream)
// One build runs at a time (a whole-window job; a second concurrent build would only steal the
// CPU the first is using); further requests queue. A queued 'move' for the same client coalesces
// onto the newest center instead of stacking.
//
// Discipline (all measured into shape by test/network-worker-parity.mjs):
//   - Params go through snapshotRoadParams() — never the live RANGER_PARAMS.
//   - Pond no-go goes as disc DATA covering the window + pondDiscPad() margins, never closures.
//   - Replies are guarded per client: the route epoch (a slider/water change since dispatch makes
//     the reply stale — discard wholesale, the route-worker convention) and the seed (a seed
//     change swaps the RoadSystem instance out from under the client).
//   - The swap is atomic between frames: onmessage runs as its own macrotask, never mid-frame.

import { snapshotRoadParams, pondDiscPad } from './road-network-worker.js'

export class RoadNetworkClient {
    /**
     * @param {object} deps
     * @param {() => number} deps.getSeed        — live world seed
     * @param {() => object} deps.getParams      — live RANGER_PARAMS (snapshotted per request)
     * @param {(minX, minZ, maxX, maxZ) => number[]} deps.getPondDiscs — flat [cx,cz,r,…] for a bbox
     *        (null-safe: return [] before water exists)
     */
    constructor({ getSeed, getParams, getPondDiscs }) {
        this._getSeed = getSeed
        this._getParams = getParams
        this._getPondDiscs = getPondDiscs
        this._clients = new Map()   // id → { road, onAdopted }
        this._queue = []            // pending build entries (see request())
        this._active = null         // the entry the worker is building right now
        this._worker = new Worker(new URL('./road-network-worker.js', import.meta.url), { type: 'module' })
        this._worker.onmessage = (e) => this._onReply(e.data)
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
        // A replaced instance's queued builds are for the old world — drop them (an in-flight one
        // dies at the seed/epoch guard on reply).
        this._queue = this._queue.filter((q) => q.id !== id)
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
        const same = (q) => q.id === id && q.epoch === epoch && q.x === x && q.z === z && q.radius === radius
        if (this._active && same(this._active)) return this._active
        for (const q of this._queue) if (same(q)) return q
        if (reason === 'move') {
            const q = this._queue.find((q2) => q2.id === id && q2.epoch === epoch && q2.reason === 'move')
            if (q) { q.x = x; q.z = z; q.radius = radius; return q }
        }
        const entry = { id, epoch, reason, x, z, radius, waiters: [] }
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
        this._active = entry
        const pad = pondDiscPad(this._getParams())
        const discs = this._getPondDiscs(entry.x - entry.radius - pad, entry.z - entry.radius - pad,
                                         entry.x + entry.radius + pad, entry.z + entry.radius + pad) || []
        this._worker.postMessage({
            type: 'build',
            client: entry.id,
            epoch: entry.epoch,
            seed: this._getSeed(),
            params: snapshotRoadParams(this._getParams()),
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
        const fresh = !!rec && msg.seed === this._getSeed() && msg.epoch === rec.road.routeEpoch()
        if (fresh) {
            rec.road.adoptNetwork(msg.data, { regen: entry.reason === 'params' })
            rec.onAdopted?.(entry.reason)
        }
        // Resolve waiters either way — a stale reply means the awaited build is obsolete and the
        // caller must re-decide with current state, not hang.
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
