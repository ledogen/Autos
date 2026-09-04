// src/road-network-client.js — PERF-30: main-thread client for the network Worker.
//
// Owns the Worker (src/road-network-worker.js — a module worker running the ENTIRE road-network
// build inside its own RoadSystem), routes build requests from the play RoadSystem's network
// dispatcher, and swaps finished networks in via adoptNetwork(). One client, one worker, one
// in-flight build: the network build is a whole-window job (unlike the per-edge route pool in
// road-worker.js), so a second concurrent build could only waste the CPU the first is using.
//
// Discipline (all measured into shape by test/network-worker-parity.mjs):
//   - Params go through snapshotRoadParams() — never the live RANGER_PARAMS.
//   - Pond no-go goes as disc DATA covering the window + pondDiscPad() margins, never closures.
//   - Replies are guarded twice: the route epoch (a slider/water change since dispatch makes the
//     reply stale — discard wholesale, the route-worker convention) and the seed (a seed change
//     swaps the whole RoadSystem instance out from under the client).
//   - The swap is atomic between frames: onmessage runs as its own macrotask, never mid-frame.

import { snapshotRoadParams, pondDiscPad } from './road-network-worker.js'

export class RoadNetworkClient {
    /**
     * @param {object} deps
     * @param {() => number} deps.getSeed        — live world seed
     * @param {() => object} deps.getParams      — live RANGER_PARAMS (snapshotted per request)
     * @param {(minX, minZ, maxX, maxZ) => number[]} deps.getPondDiscs — flat [cx,cz,r,…] for a bbox
     *        (null-safe: return [] before water exists)
     * @param {(reason: string) => void} [deps.onAdopted] — fired after every successful swap
     */
    constructor({ getSeed, getParams, getPondDiscs, onAdopted = null }) {
        this._getSeed = getSeed
        this._getParams = getParams
        this._getPondDiscs = getPondDiscs
        this._onAdopted = onAdopted
        this._road = null
        this._inflight = null            // { epoch, reason } — one build at a time
        this._waiters = []               // resolve fns for buildNow() promises
        this._worker = new Worker(new URL('./road-network-worker.js', import.meta.url), { type: 'module' })
        this._worker.onmessage = (e) => this._onReply(e.data)
    }

    /**
     * Attach (or re-attach after a seed rebuild swaps the instance) the play RoadSystem. Wires the
     * network dispatcher so _streamNetwork/invalidateCache hand real rebuilds to the worker.
     */
    attach(roadSystem) {
        this._road = roadSystem
        this._inflight = null
        roadSystem.setNetworkDispatcher((req) => this.request(req))
    }

    /**
     * Post a build request. Dedupe: while a build is in flight at the current epoch, further
     * requests are dropped — the per-frame dispatcher re-issues with a fresher center once the
     * reply lands if the window is still stale. A request at a NEW epoch (param/water change since
     * dispatch) always supersedes: the in-flight reply is already doomed to the epoch guard.
     */
    request({ x, z, radius, reason }) {
        const rs = this._road
        if (!rs) return
        const epoch = rs.routeEpoch()
        if (this._inflight && this._inflight.epoch === epoch) return
        this._inflight = { epoch, reason: reason || 'move' }
        const pad = pondDiscPad(this._getParams())
        const discs = this._getPondDiscs(x - radius - pad, z - radius - pad, x + radius + pad, z + radius + pad) || []
        this._worker.postMessage({
            type: 'build',
            epoch,
            seed: this._getSeed(),
            params: snapshotRoadParams(this._getParams()),
            center: { x, z },
            radius,
            pondDiscs: Float64Array.from(discs),
        })
    }

    /**
     * Awaitable build for the cold flows (spawn resolve, story region entry, teleport) that run
     * behind the loading screen: resolves true after the network for (x, z, radius) is ADOPTED,
     * false if the request went stale first (epoch/seed changed — the caller re-decides). The
     * loading screen keeps animating while the worker builds; that is the owner's whole ask.
     * Any in-flight build is drained first — its reply adopts some OTHER window, and this
     * promise must bind to a build of THIS window, not whatever happened to be running.
     */
    async buildNow(x, z, radius) {
        while (this._inflight) await new Promise((res) => this._waiters.push(res))
        this.request({ x, z, radius, reason: 'move' })
        if (!this._inflight) return false
        return await new Promise((res) => this._waiters.push(res))
    }

    _onReply(msg) {
        if (!msg || msg.type !== 'network') return
        const inflight = this._inflight
        this._inflight = null
        const rs = this._road
        const fresh = rs && msg.seed === this._getSeed() && msg.epoch === rs.routeEpoch()
        if (fresh) {
            const reason = inflight ? inflight.reason : 'move'
            rs.adoptNetwork(msg.data, { regen: reason === 'params' })
            this._onAdopted?.(reason)
        }
        // Resolve waiters either way — a stale reply means the awaited build is obsolete and the
        // caller must re-decide with current state, not hang.
        const ws = this._waiters
        this._waiters = []
        for (const w of ws) w(fresh)
    }

    dispose() {
        this._worker.terminate()
        this._road = null
        this._waiters.length = 0
    }
}
