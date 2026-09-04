// src/road-worker.js — QUAL-08 route Worker POOL, FEAT-68 module-worker form.
//
// A dedicated pool of route workers, separate from the terrain heightfield worker (the BUG-26
// cure: terrain 'generate' can never be starved by a flood of route jobs in a shared FIFO). Each
// worker is a real ES MODULE (src/road-route-worker.js) importing the same routeEdgeV2 the
// synchronous fallback calls — the FEAT-68 no-mirror fence. The 1300-line ROAD_WORKER_SOURCE
// verbatim-mirror string (and its route-worker-sync byte-equality gate) died with the v1 router.
//
// TWO+ CONSUMERS, ONE CONTRACT (all are RoadSystem instances):
//   - the play network (main.js) — client 'play'
//   - the Map2D read-only network (map2d.js) — client 'map'
//   - the story mission planner (main.js) — client 'mission'
// The 'client' tag rides the envelope both ways so onmessage forwards each reply to the right
// instance's ingestRoutedConnections (which rejects stale epochs PER INSTANCE).

/**
 * Pool of route workers with PULL-model dispatch (PERF-15: jobs queue centrally; each worker
 * holds ≤ INFLIGHT_DEPTH single-job messages and is refilled on reply — round-robin pre-split
 * made the slowest worker the critical path while the rest idled) and a registry of route
 * CLIENTS (RoadSystem instances keyed by id). Each client dispatches through
 * postRouteJobs(id, jobs, epoch); replies are routed back to that client's
 * ingestRoutedConnections (which tolerates any reply order: results are keyed, stale epochs
 * rejected per instance).
 */
export class RoadRouteWorker {
    constructor(size) {
        const n = size ?? RoadRouteWorker.defaultPoolSize()
        this._clients = new Map()   // clientId -> RoadSystem
        this._queue    = []         // [{ client, job, epoch }]
        this._inflight = new Array(n).fill(0)
        this._workers = []
        for (let i = 0; i < n; i++) {
            const w = new Worker(new URL('./road-route-worker.js', import.meta.url), { type: 'module' })
            w.onmessage = (e) => {
                if (!e.data || !e.data.routed) return
                this._inflight[i] = Math.max(0, this._inflight[i] - 1)
                this._pump()
                const client = this._clients.get(e.data.client)
                client?.ingestRoutedConnections(e.data.results, e.data.epoch)
            }
            this._workers.push(w)
        }
    }

    /** 2–4 workers: leave headroom for the terrain worker + main thread. The cap stays 4: raising
     *  it to 8 on the M4 (4P+6E) was MEASURED SLOWER for the cold spawn warm even with pull
     *  dispatch territory — E-core stragglers + fanless thermal spike beat the extra throughput. */
    static defaultPoolSize() {
        const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
        return Math.max(2, Math.min(4, hc - 2))
    }

    /** Register (or replace) a route client. The dispatcher closure passes this id in postRouteJobs. */
    registerClient(id, roadSystem) { this._clients.set(id, roadSystem) }

    /**
     * (Re-)initialize the workers' seeded height-field closures. Sends a PLAIN coarse-params
     * subset — never the whole RANGER_PARAMS (functions/typed arrays throw DataCloneError; see
     * project_terrain_worker_constraints). Routing only reads the coarse fields.
     */
    init(worldSeed, params) {
        const msg = {
            type: 'init',
            worldSeed,
            params: {
                coarseAmplitude: params.coarseAmplitude,
                coarseFreq:      params.coarseFreq,
                coarseOctaves:   params.coarseOctaves,
                ridgeSharpness:  params.ridgeSharpness,
            },
        }
        for (const w of this._workers) w.postMessage(msg)
    }

    /** Queue route jobs for a client; the pull pump feeds idle workers one job at a time.
     *  jobs = RoadSystem._v2EdgeSpec objects. Reply routing/dedup is the client's job (epoch +
     *  _pendingRoutes). */
    postRouteJobs(client, jobs, epoch) {
        for (const job of jobs) this._queue.push({ client, job, epoch })
        this._pump()
    }

    // Feed every worker up to INFLIGHT_DEPTH single-job messages. Depth 2 hides the reply→refill
    // message latency without re-creating the round-robin straggler problem (≤1 queued job can be
    // stuck behind a slow search, vs. a whole bucket before).
    _pump() {
        const DEPTH = 2
        const n = this._workers.length
        while (this._queue.length) {
            let wi = -1, best = DEPTH
            for (let i = 0; i < n; i++) if (this._inflight[i] < best) { best = this._inflight[i]; wi = i }
            if (wi === -1) return   // every worker is full — replies will re-pump
            const { client, job, epoch } = this._queue.shift()
            this._inflight[wi]++
            this._workers[wi].postMessage({ type: 'route', client, jobs: [job], epoch })
        }
    }

    dispose() {
        for (const w of this._workers) w.terminate()
        this._workers.length = 0
        this._clients.clear()
    }
}
