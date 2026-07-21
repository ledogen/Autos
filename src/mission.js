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

import { computePar, sampleRoute, gradeRun, formatTime, PAR_REF } from './par.js'
import { roadQuality } from './road-quality.js'

// Planning radius for the dedicated planner RoadSystem. The planner must stream the network for
// real — cull included — so it can only ever propose roads that exist. That costs a one-off load,
// which story mode can afford; it is then REUSED across regenerates and only re-streamed when the
// seed changes or the player leaves PLAN_RESTREAM_MOVE behind.
const MISSION_PLAN_RADIUS = 2200    // m
const PLAN_RESTREAM_MOVE = 700      // m — drift before the planner re-streams
// Leg bounds are measured on STRAIGHT-LINE graph distance (the planner's cheap metric); the
// routed road is empirically ~1.5× that, so these bracket a ~1.4-3 km drive that fits the radius.
const LEG_MIN = 1500                // m
const LEG_MAX = 4000                // m
const MAX_EDGES = 9                 // routing cap: each edge is tens of ms on a cache miss
const ARRIVE_RADIUS = 28            // m — you're there
const COUNTDOWN = 3.0               // s — the start countdown (a START count, not a par clock)
const EDGE_T_MARGIN = 0.12          // keep endpoints off the junction pads at both ends
const TRACE_HZ = 10                 // driven-trace sample rate
const TRACE_DIV = Math.round(60 / TRACE_HZ)
const TOPO_DS = 2.0                 // m — topology export spacing (matches par's own sampling)

/**
 * Heading that makes the truck FACE the direction (tx, tz).
 *
 * THE CONVENTION, because getting it backwards is silent and expensive: `_seatOnGroundPlane` in
 * main.js puts the front axle at body-local -Z and yaws the body by `heading` with
 * `wx = lx·cos h + lz·sin h`, `wz = -lx·sin h + lz·cos h`. Front-minus-rear therefore points along
 * **(-sin h, -cos h)** — so to face (tx, tz) you need `h = atan2(-tx, -tz)`, not `atan2(tx, tz)`.
 *
 * Missions shipped with the naive version and spawned the player facing backwards EVERY time. It
 * hid well: the map showed the route correctly, the truck sat on the road, and the only symptom
 * was a U-turn that also quietly inflated every calibration time it was measured against.
 */
export function headingToFace(tx, tz) { return Math.atan2(-tx, -tz) }

/** Inverse of headingToFace: the unit direction a truck seated at `heading` will point. */
export function facingFromHeading(h) { return { x: -Math.sin(h), z: -Math.cos(h) } }

export class MissionSystem {
    /**
     * @param {object} o
     * @param {() => import('./road.js').RoadSystem} o.getRoad — getter for the PLAY road system
     *        (a getter, not the instance: main.js swaps RoadSystem instances on seed regen)
     * @param {() => {x:number,z:number}} o.getCar
     * @param {(x:number,z:number,heading:number)=>void} o.teleport
     * @param {(open:boolean)=>void} o.setMapOpen
     * @param {()=>number} [o.getSeed] — world seed; road-surface quality is seeded from it
     * @param {()=>void} [o.onChange] — called whenever the UI-visible state changes
     */
    constructor({ getRoad, makePlanner, getCar, getSeed, teleport, setMapOpen, onChange }) {
        this._getRoad = getRoad
        this._makePlanner = makePlanner || null
        this._plan = null            // { road, seed, center } — the streamed planning network
        this._getCar = getCar
        this._getSeed = getSeed || (() => 0)
        this._teleport = teleport
        this._setMapOpen = setMapOpen
        this._onChange = onChange || (() => {})

        this.state = 'idle'      // 'idle' | 'generating' | 'offer' | 'countdown' | 'running' | 'done'
        this.mission = null      // { start, end, par, distance, poly }
        this.elapsed = 0
        this.countdown = 0
        this.result = null       // { elapsed, par, letter, ratio, margin }
        this.error = null
        this._trace = []         // driven trace rows (see update); reset on accept
        this._traceTick = 0
    }

    // ── lifecycle ───────────────────────────────────────────────────────────────────────────
    /**
     * The planning network: a dedicated read-only RoadSystem streamed around the player, exactly
     * the way map2d gets trustworthy data. It is the ONLY way the planner sees the same roads the
     * player does — the play RoadSystem only holds a ~320 m window, and widening THAT would
     * re-shape the road under the truck (the cull is window-sensitive; see BUG-25).
     *
     * Streamed once and reused: regenerating a mission is then instant, and only a seed change or
     * walking PLAN_RESTREAM_MOVE away pays the load again.
     */
    _planner() {
        if (!this._makePlanner) return this._getRoad()      // headless/tests: use what we're given
        const car = this._getCar()
        const seed = this._getSeed()
        const stale = !this._plan || this._plan.seed !== seed
            || Math.hypot(this._plan.center.x - car.x, this._plan.center.z - car.z) > PLAN_RESTREAM_MOVE
        if (stale) {
            // main.js owns the streaming call: RoadSystem.update wants a THREE.Vector3 (it calls
            // distanceTo on it), and keeping THREE out of this module keeps it cheap to import.
            const road = this._makePlanner(seed, car.x, car.z, MISSION_PLAN_RADIUS)
            if (!road) return null
            this._plan = { road, seed, center: { x: car.x, z: car.z } }
        }
        return this._plan.road
    }

    /** Drop the planning network (seed change / explicit reset) so the next roll re-streams. */
    invalidatePlan() { this._plan = null }

    /** Enter story mode: roll a mission and offer it on the map. */
    enter() {
        this.state = 'generating'
        this.result = null
        this.error = null
        this._onChange()
        // Yield one frame so the "planning" panel paints before the (blocking) stream + routing.
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
        this._trace = []
        this._traceTick = 0
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

    /**
     * FEAT-30 calibration: everything needed to work out WHY a run scored the way it did, as a
     * downloadable blob. The point is to close the loop on subjective reports ("felt slow, got S")
     * — which need the route's shape, not just the score, to explain.
     *
     * Reports the profile par ACTUALLY priced (via par.js's own sampleRoute) rather than
     * re-deriving it here, so the export can't drift from the thing it is describing.
     */
    exportRun(note = '') {
        if (!this.mission) return null
        const segs = this.mission.segments
        const par = computePar(segs)
        const seed = this._getSeed()

        // ── TOPOLOGY: the road itself, sampled along the driven route ──────────────────────
        // Columnar (a `columns` header + numeric rows) rather than an array of objects: same
        // information, a fraction of the bytes, and it drops straight into a dataframe.
        //
        // Sampled at TOPO_DS along each segment's traversed arc range, in TRAVEL order, so index
        // order is the order you drove it. Everything here is the ROAD, not the drive:
        //   s_m          cumulative 3D distance along the route
        //   x, z, elev_m world position and routed design elevation
        //   heading_rad  atan2 of the travel-direction tangent
        //   curv_1pm     SIGNED curvature (left/right matters; +ve = left, router convention)
        //   grade        dElev/ds, signed (+ve = climbing)
        //   quality      0..1 per-500 m road-surface tier; drives pothole severity (road-quality.js)
        //   par_ms       what par thinks you should be doing here
        // Camber is deliberately NOT a column: it is a deterministic slew-limited function of
        // curv_1pm (road.js `rawCamber = camberStrength · kappa`, clamped), so storing it would
        // just be a second copy of the curvature column.
        const cols = ['s_m', 'x', 'z', 'elev_m', 'heading_rad', 'curv_1pm', 'grade', 'quality', 'par_ms']
        const rows = []
        let sAcc = 0, prevX = null, prevZ = null, prevY = null
        for (const sg of segs) {
            const dir = sg.s1 >= sg.s0 ? 1 : -1
            const span = Math.abs(sg.s1 - sg.s0)
            const nS = Math.max(1, Math.ceil(span / TOPO_DS))
            for (let i = 0; i <= nS; i++) {
                if (i === 0 && rows.length) continue          // shared join sample
                const sc = sg.s0 + dir * span * (i / nS)      // arc position on THIS centerline
                const p = sg.centerline.pointAt(sc)
                const t = sg.centerline.tangentAt(sc)
                const y = sg.gradeAt(sc)
                if (prevX !== null) sAcc += Math.hypot(p.x - prevX, p.z - prevZ, y - prevY)
                prevX = p.x; prevZ = p.z; prevY = y
                // Local grade from a centred difference on the design elevation.
                const ds = span / nS
                const yF = sg.gradeAt(Math.max(0, Math.min(sg.centerline.length, sc + dir * ds * 0.5)))
                const yB = sg.gradeAt(Math.max(0, Math.min(sg.centerline.length, sc - dir * ds * 0.5)))
                rows.push([
                    +sAcc.toFixed(2), +p.x.toFixed(2), +p.z.toFixed(2), +y.toFixed(2),
                    +Math.atan2(t.x * dir, t.z * dir).toFixed(4),
                    +(sg.centerline.curvatureAt(sc) * dir).toFixed(6),
                    +((yF - yB) / ds).toFixed(4),
                    +roadQuality(sc, sg.runKey ?? '', seed).toFixed(3),
                    0,   // par_ms filled below
                ])
            }
        }
        // Par's speed target, resampled onto the topology rows by arc position.
        for (let i = 0, j = 0; i < rows.length; i++) {
            while (j < par.dist.length - 1 && par.dist[j] < rows[i][0]) j++
            rows[i][8] = +par.speeds[j].toFixed(2)
        }

        const total = sAcc || 1
        let climb = 0, descent = 0
        for (let i = 1; i < rows.length; i++) {
            const dy = rows[i][3] - rows[i - 1][3]
            if (dy > 0) climb += dy; else descent += -dy
        }

        return {
            format: 'rangersim-run-export/2',
            note,
            result: this.result
                ? { elapsed_s: +this.result.elapsed.toFixed(2), par_s: +this.result.par.toFixed(2),
                    ratio: +this.result.ratio.toFixed(3), letter: this.result.letter,
                    margin_s: +this.result.margin.toFixed(2) }
                : { elapsed_s: +this.elapsed.toFixed(2), par_s: +this.mission.par.toFixed(2), incomplete: true },
            par_ref: { ...PAR_REF },
            route: {
                distance_m: +total.toFixed(1),
                edges: this.mission.edges,
                start: { x: +this.mission.start.x.toFixed(1), z: +this.mission.start.z.toFixed(1),
                         heading_rad: +this.mission.start.heading.toFixed(4) },
                end: { x: +this.mission.end.x.toFixed(1), z: +this.mission.end.z.toFixed(1) },
                climb_m: +climb.toFixed(1), descent_m: +descent.toFixed(1),
                par_avg_kmh: +(total / par.time * 3.6).toFixed(1),
            },
            topology: { spacing_m: TOPO_DS, columns: cols, rows },
            trace: {
                hz: TRACE_HZ,
                columns: ['t_s', 'x', 'y', 'z', 'speed_ms', 'heading_rad', 'throttle', 'brake', 'steer_rad'],
                rows: this._trace,
            },
        }
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

        // Driven trace — where you actually were and what you were doing, at TRACE_HZ. This is the
        // richest single signal for fitting anything later: it says WHERE time went, not just how
        // much. Downsampled off the 60 Hz physics step; a 3-minute run is ~1800 rows, small next to
        // the topology array.
        if ((this._traceTick++ % TRACE_DIV) === 0) {
            const c = this._getCar()
            this._trace.push([
                +this.elapsed.toFixed(2), +c.x.toFixed(2), +(c.y ?? 0).toFixed(2), +c.z.toFixed(2),
                +c.speed.toFixed(2), +(c.heading ?? 0).toFixed(3),
                +(c.throttle ?? 0).toFixed(2), +(c.brake ?? 0).toFixed(2), +(c.steer ?? 0).toFixed(3),
            ])
        }
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
        const road = this._planner()
        if (!road) return null
        // The POST-CULL registered network — the roads that actually exist. Planning off the raw
        // Urquhart set (what this did originally) invents routes across empty hillsides.
        const g = road.networkGraph()
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
            segments.push({ centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1, runKey: ed.key })

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
            start: { x: sp.x, z: sp.z, heading: headingToFace(st.x * dir, st.z * dir) },
            end: { x: ep.x, z: ep.z },
            par: time,
            distance,
            poly,
            edges: segments.length,
            // The priced route, retained so par can be recomputed under a different PAR_REF
            // without re-routing (FEAT-30 calibration). Not read by gameplay.
            segments,
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
