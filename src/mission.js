/**
 * src/mission.js — story-mode BETA mission generator + run state machine.
 *
 * This is the testing harness for the par economy (DESIGN.md "The economy: par, payout, wear"),
 * not final story-mode gameplay. It rolls a random A→B delivery on the road network, shows it on
 * the 2D map with an ACCEPT button, counts down, and grades the drive against the FEAT-29 par
 * oracle on arrival.
 *
 * Design rules this obeys (see .planning/story-mode/DESIGN.md — read it before editing):
 *   - "Where missions and POIs live" [RATIFIED 2026-07-20] — mission endpoints are ARBITRARY
 *     points on road edges (an edge + arc position), never snapped to graph nodes. A store is no
 *     likelier to sit at an intersection than halfway down a road. Endpoints here are mid-edge by
 *     construction; when FEAT-21 lands, they become real POIs instead of random points.
 *   - SM-INV-2 — par comes from src/par.js, which reads road geometry only. Nothing here may feed
 *     it a vehicle quantity.
 *   - SM-INV-3 — no par countdown on the HUD while driving. The player sees elapsed time and
 *     distance-to-go; par is revealed only in the result card, after arrival.
 *   - REGENERATE is a testing affordance and is labelled as such. Real story mode has no do-overs.
 *
 * Cost discipline (FEAT-29 acceptance): routing + par run ONCE at generate time, off the frame
 * loop. update() is a couple of distance checks per frame.
 */

import { computePar, gradeRun, formatTime } from './par.js'

const MISSION_GRAPH_RADIUS = 4500   // m — node-graph band to plan within (anchors only, cheap)
// Leg bounds are measured on STRAIGHT-LINE graph distance (the planner's cheap metric); the
// routed road is empirically ~1.5× that, so these bracket a ~2-5 km drive.
const LEG_MIN = 1200                // m
const LEG_MAX = 3200                // m
const MAX_EDGES = 9                 // routing cap: each edge is tens of ms on a cache miss
const ARRIVE_RADIUS = 28            // m — you're there
const COUNTDOWN = 3.0               // s — the start countdown (a START count, not a par clock)
const EDGE_T_MARGIN = 0.12          // keep endpoints off the junction pads at both ends

export class MissionSystem {
    /**
     * @param {object} o
     * @param {() => import('./road.js').RoadSystem} o.getRoad — getter for the PLAY road system
     *        (a getter, not the instance: main.js swaps RoadSystem instances on seed regen)
     * @param {() => {x:number,z:number}} o.getCar
     * @param {(x:number,z:number,heading:number)=>void} o.teleport
     * @param {(open:boolean)=>void} o.setMapOpen
     * @param {()=>void} [o.onChange] — called whenever the UI-visible state changes
     */
    constructor({ getRoad, getCar, teleport, setMapOpen, onChange }) {
        this._getRoad = getRoad
        this._getCar = getCar
        this._teleport = teleport
        this._setMapOpen = setMapOpen
        this._onChange = onChange || (() => {})

        this.state = 'idle'      // 'idle' | 'generating' | 'offer' | 'countdown' | 'running' | 'done'
        this.mission = null      // { start, end, par, distance, poly }
        this.elapsed = 0
        this.countdown = 0
        this.result = null       // { elapsed, par, letter, ratio, margin }
        this.error = null
    }

    // ── lifecycle ───────────────────────────────────────────────────────────────────────────
    /** Enter story mode: roll a mission and offer it on the map. */
    enter() {
        this.state = 'generating'
        this.result = null
        this.error = null
        this._onChange()
        // Yield one frame so the "generating" panel paints before the (blocking) routing pass.
        setTimeout(() => this._generate(), 0)
    }

    /** Re-roll start + end. TESTING ONLY — real story mode has no do-overs. */
    regenerate() {
        if (this.state !== 'offer') return
        this.state = 'generating'
        this._onChange()
        setTimeout(() => this._generate(), 0)
    }

    /** Take the job: teleport to the start point and start the countdown. */
    accept() {
        if (this.state !== 'offer' || !this.mission) return
        const s = this.mission.start
        this._teleport(s.x, s.z, s.heading)
        this._setMapOpen(false)
        this.state = 'countdown'
        this.countdown = COUNTDOWN
        this.elapsed = 0
        this._onChange()
    }

    /** Leave story mode entirely. */
    exit() {
        this.state = 'idle'
        this.mission = null
        this.result = null
        this._setMapOpen(false)
        this._onChange()
    }

    /** Dismiss the result card and roll the next one. */
    next() { this.enter() }

    isActive() { return this.state !== 'idle' }

    /** Markers for the 2D map (null when there's nothing to draw). */
    markers() {
        if (!this.mission) return null
        return { start: this.mission.start, end: this.mission.end, poly: this.mission.poly }
    }

    /** Metres remaining, as the crow flies. */
    distanceToGo() {
        if (!this.mission) return 0
        const c = this._getCar(), e = this.mission.end
        return Math.hypot(c.x - e.x, c.z - e.z)
    }

    // ── per-frame ───────────────────────────────────────────────────────────────────────────
    /** Cheap: a countdown tick and one distance check. Safe to call every frame. */
    update(dt) {
        // No _onChange() on the countdown/elapsed ticks — those are redrawn by main.js's throttled
        // ~10 Hz HUD block. Firing it per physics step would be 60 DOM writes a second.
        if (this.state === 'countdown') {
            this.countdown -= dt
            if (this.countdown <= 0) { this.state = 'running'; this.elapsed = 0 }
            return
        }
        if (this.state !== 'running') return
        this.elapsed += dt
        if (this.distanceToGo() <= ARRIVE_RADIUS) {
            const par = this.mission.par
            this.result = { elapsed: this.elapsed, par, ...gradeRun(this.elapsed, par) }
            this.state = 'done'
            this._onChange()
        }
    }

    /** True while the player must sit still (the start countdown holds the truck). */
    isHeld() { return this.state === 'countdown' }

    // ── generation ──────────────────────────────────────────────────────────────────────────
    _generate() {
        try {
            this.mission = this._roll()
            this.state = this.mission ? 'offer' : 'idle'
            if (!this.mission) this.error = 'no route found near here — try again'
            if (this.mission) this._setMapOpen(true)
        } catch (e) {
            console.warn('[mission] generation failed', e)
            this.error = String(e && e.message || e)
            this.state = 'idle'
        }
        this._onChange()
    }

    /**
     * Roll one mission. Plan on the node graph with straight-line edge lengths (cheap — anchors
     * only, no routing), then route ONLY the chosen path and price it with the par oracle.
     *
     * Par is the time on THIS route, the geometrically shortest one. That is honest for a beta
     * harness — it's the line a player naturally takes — but note it is not min-par over all
     * routes; a cleverer line through the network could beat par for reasons that aren't driving.
     */
    _roll() {
        const car = this._getCar()
        const road = this._getRoad()
        const g = road.missionGraph(car.x, car.z, MISSION_GRAPH_RADIUS)
        if (!g.edges.length) return null

        // Adjacency with positions, keyed by node key.
        const posOf = new Map(), idOf = new Map(), adj = new Map()
        const touch = (id) => {
            const k = g.key(id)
            if (!posOf.has(k)) { posOf.set(k, g.pos(id)); idOf.set(k, id); adj.set(k, []) }
            return k
        }
        for (const [a, b] of g.edges) {
            const ka = touch(a), kb = touch(b)
            const pa = posOf.get(ka), pb = posOf.get(kb)
            const w = Math.hypot(pa.x - pb.x, pa.z - pb.z)
            adj.get(ka).push({ to: kb, w }); adj.get(kb).push({ to: ka, w })
        }

        // Start node: the graph node nearest the car (the player is teleported to the start
        // anyway, so "near" only keeps the mission in already-warm country).
        let startK = null, bestD = Infinity
        for (const [k, p] of posOf) {
            const d = Math.hypot(p.x - car.x, p.z - car.z)
            if (d < bestD) { bestD = d; startK = k }
        }
        if (!startK) return null

        // Dijkstra from the start node; harvest every node in the target leg range.
        const dist = new Map([[startK, 0]]), prev = new Map()
        const queue = [{ k: startK, d: 0 }]
        while (queue.length) {
            queue.sort((a, b) => a.d - b.d)
            const { k, d } = queue.shift()
            if (d > (dist.get(k) ?? Infinity)) continue
            if (d > LEG_MAX) continue
            for (const e of adj.get(k) || []) {
                const nd = d + e.w
                if (nd < (dist.get(e.to) ?? Infinity)) {
                    dist.set(e.to, nd); prev.set(e.to, k); queue.push({ k: e.to, d: nd })
                }
            }
        }
        const candidates = [...dist.entries()]
            .filter(([k, d]) => d >= LEG_MIN && d <= LEG_MAX && k !== startK)
            .filter(([k]) => _pathLength(prev, k, startK) <= MAX_EDGES)
        if (!candidates.length) return null
        const endK = candidates[(Math.random() * candidates.length) | 0][0]

        // Node path start → end.
        const nodePath = []
        for (let k = endK; k != null; k = prev.get(k)) { nodePath.unshift(k); if (k === startK) break }
        if (nodePath.length < 2) return null

        // Route the path's edges and build par segments. DESIGN.md: the first and last edge are
        // PARTIAL — the endpoints sit mid-edge, so they contribute an arc RANGE, not a whole edge.
        const segments = [], poly = []
        for (let i = 0; i < nodePath.length - 1; i++) {
            const a = idOf.get(nodePath[i]), b = idOf.get(nodePath[i + 1])
            const ed = road.edgeParData(a, b)
            if (!ed) return null
            // Which way does this centerline run? Compare its s=0 point to node A's position.
            const p0 = ed.centerline.pointAt(0)
            const pa = posOf.get(nodePath[i])
            const forward = Math.hypot(p0.x - pa.x, p0.z - pa.z) < Math.hypot(p0.x - posOf.get(nodePath[i + 1]).x, p0.z - posOf.get(nodePath[i + 1]).z)
            const L = ed.centerline.length
            let s0 = forward ? 0 : L, s1 = forward ? L : 0

            // Mid-edge endpoints on the first and last edge.
            if (i === 0) {
                const t = EDGE_T_MARGIN + Math.random() * (0.55 - EDGE_T_MARGIN)
                s0 = forward ? L * t : L * (1 - t)
            }
            if (i === nodePath.length - 2) {
                const t = EDGE_T_MARGIN + Math.random() * (0.55 - EDGE_T_MARGIN)
                s1 = forward ? L * (1 - t) : L * t
            }
            segments.push({ centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1 })

            // Map polyline for this traversed range.
            const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 25))
            for (let j = 0; j <= n; j++) {
                const s = s0 + (s1 - s0) * (j / n)
                const p = ed.centerline.pointAt(s)
                poly.push({ x: p.x, z: p.z })
            }
        }

        const { time, distance } = computePar(segments)
        if (!(time > 0)) return null

        const first = segments[0], last = segments[segments.length - 1]
        const sp = first.centerline.pointAt(first.s0)
        const st = first.centerline.tangentAt(first.s0)
        const dir = first.s1 >= first.s0 ? 1 : -1
        const ep = last.centerline.pointAt(last.s1)

        return {
            start: { x: sp.x, z: sp.z, heading: Math.atan2(st.x * dir, st.z * dir) },
            end: { x: ep.x, z: ep.z },
            par: time,
            distance,
            poly,
            edges: segments.length,
        }
    }
}

// Hop count from `k` back to `root` through the Dijkstra parent chain (bounded scan).
function _pathLength(prev, k, root) {
    let n = 0
    while (k != null && k !== root && n < 64) { k = prev.get(k); n++ }
    return k === root ? n : Infinity
}

export { formatTime }
