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
 *   - REGENERATE/RETRY are testing affordances and are labelled as such. Real story mode has no
 *     do-overs: FEAT-53 gates both OFF for paid (POI-anchored) jobs — see PAID_JOB_DO_OVERS.
 *     Quick Job keeps them; it is the calibration rig and pays nothing.
 *   - SM-INV-4 (FEAT-53) — a POI job settles through the economy on arrival: terms (day tier +
 *     rank thresholds) are FROZEN at accept, payout/points fold into the result card. The
 *     economy arrives through the deps adapter (getTerms/onSettle); this module never imports
 *     economy.js, so headless gates can roll missions with no economy attached.
 *
 * Cost discipline (FEAT-29 acceptance): routing + par run ONCE at generate time, off the frame
 * loop. update() is a couple of distance checks per frame.
 */

import { computePar, sampleRoute, gradeRun, formatTime, PAR_REF, PAR_SLACK } from './par.js'
import { roadQuality } from './road-quality.js'

// Planning radius for the dedicated planner RoadSystem. The planner must stream the network for
// real — cull included — so it can only ever propose roads that exist. That costs a one-off load,
// which story mode can afford; it is then REUSED across regenerates and only re-streamed when the
// seed changes or the player leaves PLAN_RESTREAM_MOVE behind.
// Sized by the AREA it covers, not the radius: the streamed band carries a wide margin, so
// radius 2200 actually built a 6.3 × 6.2 km network — far more than missions need, and every
// extra edge is routing time and bundle bytes. Measured coverage vs radius (default-seed spawn):
//   1200 → 4.0 × 3.6 km (38 edges) · 1400 → ~4.3 × 4.0 km · 1800 → 5.6 × 4.8 km · 2200 → 6.3 × 6.2 km
export const MISSION_PLAN_RADIUS = 1400   // m — ≈ 4 × 4 km of network
export const PLAN_RESTREAM_MOVE = 700     // m — drift before the planner re-streams
// Leg bounds are measured on STRAIGHT-LINE graph distance (the planner's cheap metric); the
// routed road is empirically ~1.5× that, so these bracket a ~1.4-3 km drive that fits the radius.
const LEG_MIN = 1500                // m
const LEG_MAX = 4000                // m
const MAX_EDGES = 9                 // routing cap: each edge is tens of ms on a cache miss
const ARRIVE_RADIUS = 28            // m — you're there
const COUNTDOWN = 3.0               // s — the start countdown (a START count, not a par clock)
// FEAT-46 start zone (owner, 2026-08-02): a POI job does NOT count down. You are parked on the pad,
// possibly facing the wrong way, and a 3-2-1 handbrake launch punished you for that — the workaround
// was to decline, turn around, and re-open the SAME offer, which is ceremony pretending to be a
// choice. Instead the marker owns a radius: accept, sort yourself out inside it for as long as you
// like, and the clock starts the instant you cross the threshold. Accepting SWAPS the marker's
// orange interaction ring for a green one at this radius (main.js's _updateMissionRings), so there
// is only ever one circle in front of you and its colour is the state: orange means "stop here",
// green means "cross here and you're running".
// Quick Job keeps the countdown: it TELEPORTS you to a start pin already facing the right way, so
// the handbrake launch is exactly right there and nothing about it needs fixing.
// Exported (FEAT-61): the paper route stages out of Larry's place through the same threshold, for
// the same reason — you are parked on a pad, possibly facing the wrong way, and the round should
// not be timing you while you sort that out.
export const START_ZONE_R = 25      // m — POI start threshold, measured from the marker
// FEAT-53: real story mode has no do-overs (DESIGN.md — "a marker you can re-roll is a slot
// machine", and a retried paid job is a direct payout exploit: drive badly, retry, get paid for
// the good lap). Held as a const flag in the DEBUG_LOCKOUT house style (story.js): flip to true
// to re-open regenerate/retry on POI jobs for a calibration session. Quick Job (fromPoi === null)
// is untouched either way — it pays nothing, so its do-overs are harmless and useful.
const PAID_JOB_DO_OVERS = false
const EDGE_T_MARGIN = 0.12          // keep endpoints off the junction pads at both ends
// FEAT-43: when story mode supplies a region, the whole mission must fit INSIDE its wall.
// The planner network reaches well past its nominal radius — the streamed band carries a wide
// margin, and measured on seed 6, MISSION_PLAN_RADIUS 1400 centred ON the region centre still
// yields nodes out to 2783 m, 4 of 43 beyond the 2500 m wall. _roll picks BOTH endpoints freely
// from that set, so ~1 roll in 10 landed outside, and worse once the planner re-centred on a car
// that had driven away. Two guards: node candidates are filtered to the region, and the finished
// polyline is re-checked — a centerline between two in-region nodes can still bow past the wall.
// Exported (FEAT-61): the paper route's customers must be sited inside the SAME wall, or they are
// people no route can reach. One constant, so the two can never disagree about where the edge is.
export const REGION_MARGIN = 100    // m — keep missions this far clear of the wall itself
const REGION_ROLL_TRIES = 8         // re-rolls before admitting the region has no qualifying leg
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

/**
 * The planning graph, keyed by node key: positions, the original ids, and straight-line adjacency.
 *
 * EDGES are filtered, not just endpoints (FEAT-43 guard 1): an edge with one node outside the
 * region wall is a road that LEAVES the region, and admitting it as a hop would route the player
 * through the boundary even when both pins sit inside.
 *
 * Exported because FEAT-61's PaperRouteSystem plans a 15-stop tour over the same graph. It is a
 * sibling of this system, not a mode inside it, so this is the seam they share — one adjacency
 * builder rather than two that drift.
 *
 * @param {{edges:Array,key:Function,pos:Function}} g — road.networkGraph()
 * @param {(p:{x:number,z:number})=>boolean} inRegion — the region post-filter (`() => true` if none)
 */
export function buildGraphAdj(g, inRegion = () => true) {
    const posOf = new Map(), idOf = new Map(), adj = new Map()
    const touch = (id) => {
        const k = g.key(id)
        if (!posOf.has(k)) { posOf.set(k, g.pos(id)); idOf.set(k, id); adj.set(k, []) }
        return k
    }
    for (const [a, b] of g.edges) {
        if (!inRegion(g.pos(a)) || !inRegion(g.pos(b))) continue
        const ka = touch(a), kb = touch(b)
        const pa = posOf.get(ka), pb = posOf.get(kb)
        const w = Math.hypot(pa.x - pb.x, pa.z - pb.z)
        adj.get(ka).push({ to: kb, w }); adj.get(kb).push({ to: ka, w })
    }
    return { posOf, idOf, adj }
}

export class MissionSystem {
    /**
     * @param {object} o
     * @param {() => import('./road.js').RoadSystem} o.getRoad — getter for the PLAY road system
     *        (a getter, not the instance: main.js swaps RoadSystem instances on seed regen)
     * @param {() => {x:number,z:number}} o.getCar
     * @param {(x:number,z:number,heading:number)=>void} o.teleport
     * @param {()=>void} [o.setSpawn] — FEAT-46: set the spawn point to the truck's current pose.
     *        Called on ACCEPT only (never retry): taking a job is the commitment, so it is also the
     *        checkpoint. Optional — headless gates roll missions without ever launching one.
     * @param {(open:boolean)=>void} o.setMapOpen
     * @param {()=>number} [o.getSeed] — world seed; road-surface quality is seeded from it
     * @param {()=>void} [o.onChange] — called whenever the UI-visible state changes
     * @param {()=>({x:number,z:number,r:number}|null)} [o.getRegion] — FEAT-43 story region, when
     *        one is active. Missions are confined to it, and the planner ANCHORS on its centre
     *        instead of following the car (see _planner).
     * @param {()=>{day:number,dayTier:number,thresholds:object}} [o.getTerms] — FEAT-53: the
     *        economy's terms at this moment (EconomySystem.terms()). Stamped onto the mission at
     *        ACCEPT and read back at settlement. Optional — without it, jobs grade on the day-1
     *        default thresholds and nothing pays.
     * @param {(result:object, mission:object)=>{payout:number,points:number}} [o.onSettle] —
     *        FEAT-53: settle a finished POI job (EconomySystem.settle). Optional, POI jobs only.
     */
    constructor({ getRoad, makePlanner, getCar, getSeed, getRegion, teleport, setSpawn, setMapOpen, onChange, getTerms, onSettle }) {
        this._getRoad = getRoad
        this._makePlanner = makePlanner || null
        this._plan = null            // { road, seed, center } — the streamed planning network
        this._getCar = getCar
        this._getRegion = getRegion || (() => null)
        this._getSeed = getSeed || (() => 0)
        this._teleport = teleport
        this._setSpawn = setSpawn || null
        this._setMapOpen = setMapOpen
        this._onChange = onChange || (() => {})
        this._getTerms = getTerms || null
        this._onSettle = onSettle || null

        // 'idle' | 'generating' | 'offer' | 'countdown' | 'staging' | 'running' | 'done'
        // 'countdown' and 'staging' are the two mutually exclusive start rituals: a Quick Job counts
        // down at the pin it teleported you to, a POI job stages inside its start zone (see
        // START_ZONE_R). Nothing ever passes through both.
        this.state = 'idle'
        this.mission = null      // { start, end, par, distance, poly }
        this.elapsed = 0
        this.countdown = 0
        this.result = null       // { elapsed, par, letter, ratio, margin }
        this.error = null
        this._trace = []         // driven trace rows (see update); reset on accept
        this._traceTick = 0
        // FEAT-46: the anchor the CURRENT offer was generated from ({aId,bId,s,poiId}), or null for
        // a free Quick Job roll. Held so `regenerate` re-rolls the DESTINATION while keeping the
        // start pinned to the POI you are standing at — see regenerate().
        this._anchor = null
        // FEAT-53: the single-offer rule (owner, 2026-08-01). One offer per POI per day, cached so
        // walking away and re-parking presents the SAME job — a giver you can decline-and-re-park
        // into a fresh roll is the same slot machine as the regenerate button. Keyed
        // `${poiId}|${day}`, so the offer re-rolls only at a day boundary. Holds live centerline
        // references (mission.segments) — clearOffers() from invalidatePlan()/region exit is
        // MANDATORY or a seed regen leaves this pinning a dead RoadSystem.
        this._offers = new Map()
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
        const seed = this._getSeed()
        // FEAT-43: in story mode the planner ANCHORS on the region centre, not the car. A
        // car-following window slides outward as you drive, which both re-streams for nothing (the
        // region's roads are already routed and frozen) and drags the candidate node set past the
        // wall. Anchored, the window is the same every roll — and PLAN_RESTREAM_MOVE can never fire.
        const region = this._getRegion()
        const c = region || this._getCar()
        const stale = !this._plan || this._plan.seed !== seed
            || Math.hypot(this._plan.center.x - c.x, this._plan.center.z - c.z) > PLAN_RESTREAM_MOVE
        if (stale) {
            // main.js owns the streaming call: RoadSystem.update wants a THREE.Vector3 (it calls
            // distanceTo on it), and keeping THREE out of this module keeps it cheap to import.
            const road = this._makePlanner(seed, c.x, c.z, MISSION_PLAN_RADIUS)
            if (!road) return null
            this._plan = { road, seed, center: { x: c.x, z: c.z } }
        }
        return this._plan.road
    }

    /**
     * The planning network, streamed on demand. Public because FEAT-61's paper route plans its tour
     * on the SAME one — the region is warmed once and its edges are already routed, so a second
     * planner would re-stream a network that exists a metre away in memory. Shared read-only: the
     * tour reads networkGraph/edgeParData and writes nothing.
     */
    planner() { return this._planner() }

    /** Drop the planning network (seed change / explicit reset) so the next roll re-streams. */
    invalidatePlan() { this._plan = null; this.clearOffers() }

    /** FEAT-53: forget all cached POI offers (region enter/exit, seed change). */
    clearOffers() { this._offers.clear() }

    /** Enter story mode: roll a mission and offer it on the map. */
    enter() {
        this.state = 'generating'
        this.result = null
        this.error = null
        this._onChange()
        // Yield one frame so the "planning" panel paints before the (blocking) stream + routing.
        setTimeout(() => this._generate(), 0)
    }

    /**
     * FEAT-46: take a job from the POI you are parked at. Same generator, but the start is PINNED to
     * the marker's own (edge, arc) point and accepting does NOT teleport — you are already standing
     * there, and the run begins when you drive out of the marker's start zone (START_ZONE_R).
     *
     * FEAT-53: the single-offer rule. The first park of the day rolls the offer; every later park
     * at the same POI (same day) presents the SAME cached job, instantly — no _generate, no
     * spinner. The cache entry dies when the job is accepted or the day rolls over.
     *
     * @param {object} poi — a record from PoiSystem.list()
     */
    enterFromPoi (poi) {
        if (!poi) return
        const day = this._getTerms ? this._getTerms().day : 1
        const key = `${poi.id}|${day}`
        const cached = this._offers.get(key)
        if (cached) {
            this._anchor = cached.anchor
            this.mission = cached.mission
            this.result = null
            this.error = null
            this.state = 'offer'
            this._setMapOpen(true)
            this._onChange()
            return
        }
        this.state = 'generating'
        this.result = null
        this.error = null
        this._onChange()
        // poiX/poiZ ride along for the start zone: the threshold is centred on the MARKER (where you
        // are parked), not on the mission's road-side start pin ~11 m out across the shoulder.
        setTimeout(() => this._generate({
            aId: poi.aId, bId: poi.bId, s: poi.s, poiId: poi.id, offerKey: key,
            poiX: poi.x, poiZ: poi.z, poiY: poi.y,
        }), 0)
    }

    /**
     * Re-roll the offer. TESTING ONLY — real story mode has no do-overs.
     *
     * FEAT-46: an ANCHORED offer re-rolls its DESTINATION ONLY; the start stays pinned to the POI
     * you are standing at. Regenerating used to drop the anchor and hand back a free
     * anywhere-to-anywhere Quick Job, which meant the second offer from a marker had nothing to do
     * with the marker — you would accept a job that started somewhere across the region while
     * parked in a pullout (owner, 2026-07-28). A quest giver offers you a different job, not a
     * different place to be standing.
     *
     * FEAT-53: that "longer term" arrived — paid (POI) jobs have NO do-overs unless
     * PAID_JOB_DO_OVERS is flipped for a calibration session. Quick Job keeps the button.
     */
    regenerate() {
        if (this.state !== 'offer') return
        if (!PAID_JOB_DO_OVERS && this.mission?.fromPoi) return
        this.state = 'generating'
        this._onChange()
        const anchor = this._anchor
        setTimeout(() => this._generate(anchor), 0)
    }

    /**
     * Take the job. Two things happen here that do NOT happen on retry:
     *   • a POI job does not seat you at the start pin — you are already standing on the pad, and it
     *     goes straight to 'staging': turn around at your leisure, the clock starts when you leave
     *     the marker's start zone;
     *   • THE SPAWN POINT MOVES TO WHERE YOU ACCEPTED FROM. Accepting a job is the commitment, so
     *     it is also the checkpoint: reset now and you come back to the job you took, not to
     *     wherever you last happened to stop.
     */
    accept() {
        if (this.state !== 'offer' || !this.mission) return
        // FEAT-53: freeze the TERMS of the contract — day tier AND rank thresholds — at the moment
        // of commitment (SM-INV-4; owner 2026-08-01: lock both). Settlement reads these, never the
        // finish-day's values, so a job accepted at 23:58 pays and grades on the day you took it.
        // The converse — accepting at 1 a.m. to buy tomorrow's HIGHER tier — is a RATIFIED feature
        // (DESIGN.md: "Nobody authored it; do not 'fix' it").
        if (this._getTerms) this.mission.terms = this._getTerms()
        // The job is taken: the giver's offer is spent (single-offer rule).
        if (this.mission.offerKey) this._offers.delete(this.mission.offerKey)
        this._launch({ seat: !this.mission.fromPoi, setSpawn: true })
    }

    /**
     * Re-run the SAME mission from its start line. TESTING ONLY, like regenerate — real story
     * mode has no do-overs — but for calibration it is exactly what you want: a second lap of a
     * route you now know isolates "learning the road" from everything else.
     */
    retry() {
        if (this.state !== 'done' || !this.mission) return
        // FEAT-53: no retry on a paid job — driving it badly, retrying, and getting paid for the
        // good lap is a direct payout exploit. (The _settled flag below is the second line of
        // defence if this gate is ever bypassed.)
        if (!PAID_JOB_DO_OVERS && this.mission.fromPoi) return
        this.result = null
        // ALWAYS seats, even for a POI job: a retry is a second lap of a known road for calibration,
        // and it is only comparable if it starts at the same start line. Without this you would
        // "retry" from wherever the last run ENDED. It does not move the spawn either — retry is a
        // testing affordance, not a commitment.
        this._launch({ seat: true, setSpawn: false })
    }

    /**
     * Shared start path for accept/retry: (optionally) seat at the start pin, reset the run state,
     * count down.
     *
     * FEAT-46: a POI job skips the seat on ACCEPT — the player drove to the marker themselves and
     * the job starts from where they are parked. (Owner, 2026-07-28: "no need to teleport the car to
     * the road. the player should know they need to get outta there quick.") The pad sits beside the
     * centerline, so the first few metres are the driver's own problem, which is the point — and
     * since 2026-08-02 those metres are UNTIMED: the start zone is where you sort out the pull-out.
     *
     * @param {{seat:boolean, setSpawn:boolean}} o
     */
    _launch({ seat = true, setSpawn = false } = {}) {
        const s = this.mission.start
        if (seat) this._teleport(s.x, s.z, s.heading)
        // Spawn-checkpoint write, ONLY when we did not just teleport. The teleport's own spawn
        // override already IS the respawn pose (the start pin), and the reseat it queues is
        // ASYNC — calling setSpawn here on the same tick would overwrite that override with the
        // PRE-teleport pose, and the queued reseat would then land the truck right back where it
        // stood (BUG 2026-08-01: "quick job no longer teleports you"). For a POI job (no seat)
        // this reads the pad you are parked on, which is exactly the checkpoint we want.
        if (setSpawn && !seat) this._setSpawn?.()
        this._setMapOpen(false)
        // A POI job STAGES (free to manoeuvre inside its zone, clock starts on the way out); a Quick
        // Job counts down where it was just seated. `seat` is not the discriminator — a POI RETRY
        // seats and must still stage, because its start zone is the thing being retried.
        const staged = !!this.mission.startZone
        this.state = staged ? 'staging' : 'countdown'
        this._polyIdx = 0            // route-remaining projection restarts at the start pin
        this.countdown = staged ? 0 : COUNTDOWN
        this.elapsed = 0
        this._trace = []
        this._traceTick = 0
        this._onChange()
    }

    /** Put the job down: no offer, no run. (Decline, or leaving the mode.) */
    exit() {
        this.state = 'idle'
        this.mission = null
        this.result = null
        this._anchor = null
        // NOTE: _offers is deliberately NOT cleared — declining is exactly what the single-offer
        // cache exists for. Re-park at the same POI today and you face the same job (FEAT-53).
        this._setMapOpen(false)
        this._onChange()
    }

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
        // curv_1pm (road.js camberFromCurvature — saturating superelevation), so storing it would
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
            // PAR_SLACK rides along with PAR_REF [2026-08-16]: `par_s` is referenceTime × PAR_SLACK,
            // so a run recorded under a different slack is measured against a different STANDARD
            // even at identical PAR_REF. Without this the corpus cannot tell the two apart and any
            // future refit silently mixes scales — which is exactly the trap the runs recorded
            // before the re-anchor fell into.
            par_ref: { ...PAR_REF, slack: PAR_SLACK },
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

    /**
     * The POI start threshold ({x,y,z,r}) of the job in hand, or null for a Quick Job. Read by
     * main.js to draw the in-world circle; the zone exists from the moment the offer is rolled, but
     * only 'staging' has any reason to show it.
     */
    startZone() { return this.mission?.startZone || null }

    /**
     * Metres of slack left inside the start zone: r − (distance from its centre). Zero or below
     * means the truck has crossed the threshold. Returns 0 when there is no zone, so a job that
     * somehow reaches 'staging' without one starts immediately rather than hanging there forever.
     */
    startZoneExitDist() {
        const z = this.mission?.startZone
        if (!z) return 0
        const c = this._getCar()
        return z.r - Math.hypot(c.x - z.x, c.z - z.z)
    }

    /** Metres remaining, as the crow flies. Used for the ARRIVAL check (a radius on a point). */
    distanceToGo() {
        if (!this.mission) return 0
        const c = this._getCar(), e = this.mission.end
        return Math.hypot(c.x - e.x, c.z - e.z)
    }

    /**
     * Metres remaining ALONG THE ROUTE — the honest HUD number. Crow-flies distance INCREASES
     * while you drive a winding route correctly, which reads as "going the wrong way" (and once
     * broke a verification run). Projects the car onto the mission polyline (windowed around the
     * last match, full re-scan when the window loses the car) and reports the arc left from there.
     * Arrival still uses distanceToGo() — this is display, not game state.
     */
    routeRemaining() {
        const m = this.mission
        if (!m || !m.poly || m.poly.length < 2 || !m.polyCum) return this.distanceToGo()
        const c = this._getCar()
        const poly = m.poly, cum = m.polyCum
        const last = this._polyIdx ?? 0
        let bi = last, bd = Infinity
        const scan = (lo, hi) => {
            for (let i = lo; i <= hi; i++) {
                const d = (poly[i].x - c.x) ** 2 + (poly[i].z - c.z) ** 2
                if (d < bd) { bd = d; bi = i }
            }
        }
        scan(Math.max(0, last - 20), Math.min(poly.length - 1, last + 40))
        if (bd > 200 * 200) scan(0, poly.length - 1)     // off the window (teleport, big shortcut)
        this._polyIdx = bi
        return Math.max(this.distanceToGo(), cum[cum.length - 1] - cum[bi])
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
        // Staging: one distance check. Crossing OUT of the start zone is the start — there is no
        // countdown, no hold, and no way back in (the zone is a threshold, not a trigger volume, so
        // re-entering it does not stop the clock you already started).
        if (this.state === 'staging') {
            if (this.startZoneExitDist() <= 0) { this.state = 'running'; this.elapsed = 0; this._onChange() }
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
            // FEAT-53: grade on the thresholds FROZEN at accept (missing terms → day-1 default
            // inside gradeRun — headless gates and free-roam rolls are unchanged).
            this.result = { elapsed: this.elapsed, par, ...gradeRun(this.elapsed, par, this.mission.terms?.thresholds) }
            // Settle a paid job exactly once (_settled = the double-pay guard; it lives on the
            // mission object so ANY future re-entry path inherits it). Quick Job never settles —
            // it is the calibration rig and pays nothing. The settle callback runs inside the
            // physics step, so a broken economy must degrade to "no payout", never a dropped loop.
            if (this.mission.fromPoi && !this.mission._settled && this._onSettle) {
                this.mission._settled = true
                try {
                    const s = this._onSettle(this.result, this.mission)
                    if (s) { this.result.payout = s.payout; this.result.points = s.points }
                } catch (e) {
                    console.warn('[mission] settle failed — run graded but unpaid', e)
                }
            }
            this.state = 'done'
            this._onChange()
        }
    }

    /**
     * True while the player must sit still (the start countdown holds the truck).
     *
     * 'staging' is deliberately NOT held: manoeuvring inside the start zone is the whole point of it
     * — a hold there would be the 3-2-1 launch by another name.
     */
    isHeld() { return this.state === 'countdown' }

    // ── generation ──────────────────────────────────────────────────────────────────────────
    _generate(anchor = null) {
        // Remember what this offer is anchored to (null = a free Quick Job roll) so `regenerate`
        // can re-roll the destination without losing the POI start.
        this._anchor = anchor
        try {
            // A roll can come up empty because the FEAT-43 region rejected the leg it happened to
            // draw (guard 2 only fires after the route is built), so inside a region we re-roll
            // before reporting failure. Retries are cheap THERE and only there: the region is
            // pre-warmed, so every edgeParData is a cache hit. Outside a region a failed roll still
            // reports immediately — retrying could route live edges and block for seconds.
            const tries = this._getRegion() ? REGION_ROLL_TRIES : 1
            this.mission = null
            for (let i = 0; i < tries && !this.mission; i++) this.mission = this._roll(anchor)
            if (this.mission) {
                this.mission.fromPoi = anchor ? anchor.poiId : null
                // The start threshold, for a POI job only. Held on the MISSION (not on the system)
                // so the cached single-offer entry carries it and a re-park presents the same zone.
                this.mission.startZone = anchor
                    ? { x: anchor.poiX, z: anchor.poiZ, y: anchor.poiY ?? 0, r: START_ZONE_R }
                    : null
                // FEAT-53: a POI roll is cached under its (poi, day) key — the giver's one offer
                // for today. regenerate() can only reach here for Quick Jobs (or with
                // PAID_JOB_DO_OVERS flipped, where overwriting the entry is the point).
                if (anchor?.offerKey) {
                    this.mission.offerKey = anchor.offerKey
                    this._offers.set(anchor.offerKey, { mission: this.mission, anchor })
                }
            }
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
     *
     * @param {{aId:any,bId:any,s:number}|null} [anchor] — FEAT-46: pin the START to a POI's exact
     *   (graph edge, arc) point instead of rolling it. The END still rolls freely.
     */
    _roll(anchor = null) {
        const road = this._planner()
        if (!road) return null
        // The POST-CULL registered network — the roads that actually exist. Planning off the raw
        // Urquhart set (what this did originally) invents routes across empty hillsides.
        const g = road.networkGraph()
        if (!g.edges.length) return null

        // FEAT-43 guard 1: drop everything outside the story region before any planning happens.
        // buildGraphAdj applies it per EDGE — see the note there for why that is the part that
        // matters. Guard 2 (the routed polyline) is further down.
        const region = this._getRegion()
        const rMax = region ? region.r - REGION_MARGIN : Infinity
        const inRegion = (p) => !region || Math.hypot(p.x - region.x, p.z - region.z) <= rMax

        const { posOf, idOf, adj } = buildGraphAdj(g, inRegion)

        // Start node: ANY node in the planned network, not just the one nearest the car. _launch()
        // teleports the player to the start pin regardless (see accept/retry), so pinning the start
        // to the car threw away nearly the whole streamed network as possible origins and made every
        // mission radiate from one point — a handful of shortest-path fans that all shared a long
        // common prefix ("a couple of options with subtle variations"). Rolling BOTH endpoints freely
        // turns the pool from O(endpoints) into O(pairs) at zero extra streaming cost (the planner
        // already holds these roads). The planner still streams AROUND THE CAR, so "the whole network"
        // is the ~4 km footprint by the player — that windowing, and the shortest-path route body, are
        // both intentional (a quick job stays in warm near country and takes the natural line).

        // Dijkstra over straight-line graph edges from one start → reachable nodes in the leg band,
        // capped at MAX_EDGES hops. No routing here (graph metric only), so it's cheap to run per
        // start candidate. Returns the parent chain plus the qualifying endpoints.
        const legCandidates = (startK) => {
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
            const ends = [...dist.entries()]
                .filter(([k, d]) => d >= LEG_MIN && d <= LEG_MAX && k !== startK)
                .filter(([k]) => _pathLength(prev, k, startK) <= MAX_EDGES)
            return { prev, ends }
        }

        let startK = null, prev = null, endK = null
        // FEAT-46: the anchored roll. A POI sits mid-edge, so the leg LEAVES that edge through one
        // of its two nodes; that node is the start of the ordinary node-path search, and the partial
        // stretch from the POI out to it is prepended as a segment afterwards. The player is NOT
        // teleported — they are already standing on the pad — so unlike the free roll there is no
        // freedom in where this begins.
        let exitK = null
        if (anchor) {
            const ka = g.key(anchor.aId), kb = g.key(anchor.bId)
            if (!adj.has(ka) || !adj.has(kb)) return null      // POI edge outside the planner's set
            const pair = Math.random() < 0.5 ? [[ka, kb], [kb, ka]] : [[kb, ka], [ka, kb]]
            for (const [ex, other] of pair) {
                const c = legCandidates(ex)
                // Reject any leg whose FIRST hop doubles back along the anchor edge — the route
                // would drive off the pad, past the POI, and traverse the same stretch twice.
                const ends = c.ends.filter(([k]) => _firstHop(c.prev, k, ex) !== other)
                if (!ends.length) continue
                exitK = ex; startK = ex; prev = c.prev
                endK = ends[(Math.random() * ends.length) | 0][0]
                break
            }
        } else {
            // Shuffle the node set and take the first start with a reachable endpoint in the leg band.
            // Most nodes qualify; the loop just skips the few dead-end / window-edge nodes whose whole
            // leg band falls off the streamed network. Mission rolls are run-layer randomness — free to
            // use Math.random (SM-INV-12).
            const starts = [...posOf.keys()]
            for (let i = starts.length - 1; i > 0; i--) {           // Fisher-Yates
                const j = (Math.random() * (i + 1)) | 0
                ;[starts[i], starts[j]] = [starts[j], starts[i]]
            }
            for (const s of starts) {
                const c = legCandidates(s)
                if (!c.ends.length) continue
                startK = s; prev = c.prev
                endK = c.ends[(Math.random() * c.ends.length) | 0][0]
                break
            }
        }
        if (startK == null || endK == null) return null

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
            // QUAL-24: an edge may be a STRETCH of a longer run (a deg-2 chain merge swallowed it), so
            // its arc domain is [off, off+L] inside the registered run, not [0, len]. Unmerged edges
            // report off=0 and L=len, so this is identity for them.
            const off = ed.arcOffset ?? 0
            const L = ed.arcLength ?? ed.centerline.length
            // Which way does this centerline run? Compare its start point to node A's position.
            const p0 = ed.centerline.pointAt(off)
            const pa = posOf.get(nodePath[i])
            const pEndE = ed.centerline.pointAt(off + L)
            const forward = Math.hypot(p0.x - pa.x, p0.z - pa.z) < Math.hypot(pEndE.x - pa.x, pEndE.z - pa.z)
            let s0 = forward ? off : off + L, s1 = forward ? off + L : off

            // Mid-edge endpoints on the first and last edge. An ANCHORED roll has no freedom at the
            // start — the POI's own partial stretch is prepended below and IS the first segment.
            if (i === 0 && !anchor) {
                const t = EDGE_T_MARGIN + Math.random() * (0.55 - EDGE_T_MARGIN)
                s0 = off + (forward ? L * t : L * (1 - t))
            }
            if (i === nodePath.length - 2) {
                const t = EDGE_T_MARGIN + Math.random() * (0.55 - EDGE_T_MARGIN)
                s1 = off + (forward ? L * (1 - t) : L * t)
            }
            // FEAT-39: DEGREE of the node this edge ends at. A join is a real intersection — a
            // place the driver has a choice — only when that node carries three or more edges; a
            // degree-2 node is just the road bending through (QUAL-16 made those first-class), and
            // the turn angle alone cannot tell the two apart. The GPS assist filters on this.
            const endDeg = (adj.get(nodePath[i + 1]) || []).length
            // QUAL-24: carry the ABSTRACT EDGE (site pair) alongside the runKey. A runKey names a run
            // GROUPING, and a deg-2 chain merge groups by the streamed band — so a mission planned at
            // MISSION_PLAN_RADIUS can name a chain the 320 m play stream never forms, and the drop
            // point looks like it evaporated. The site pair is stable across windows, so this is what
            // anything re-resolving the road later should key on.
            segments.push({ centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1, runKey: ed.key, cellA: a, cellB: b, endDeg })

            // Map polyline for this traversed range.
            const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 25))
            for (let j = 0; j <= n; j++) {
                const s = s0 + (s1 - s0) * (j / n)
                const p = ed.centerline.pointAt(s)
                poly.push({ x: p.x, z: p.z })
            }
        }

        // FEAT-46: prepend the POI's own partial stretch — from the marker's arc position out to the
        // node the leg leaves through. DESIGN.md's arc-RANGE rule is exactly what makes this free:
        // par already integrates partial edges, so a POI start needs no new machinery, just a segment.
        if (anchor) {
            const ed = road.edgeParData(anchor.aId, anchor.bId)
            if (!ed) return null
            // QUAL-24: arc domain is [off, off+L] within the registered run (identity when unmerged).
            const off = ed.arcOffset ?? 0
            const L = ed.arcLength ?? ed.centerline.length
            const ex = posOf.get(exitK)
            const pEnd = ed.centerline.pointAt(off + L), pStart = ed.centerline.pointAt(off)
            const s1 = Math.hypot(pEnd.x - ex.x, pEnd.z - ex.z) < Math.hypot(pStart.x - ex.x, pStart.z - ex.z) ? off + L : off
            // The POI's arc was measured on the PLAY network's copy of this edge; clamp rather than
            // trust it blind, so a length that differs in the last ulp can't produce an out-of-range s.
            const s0 = Math.max(off, Math.min(off + L, anchor.s))
            if (Math.abs(s1 - s0) < 1) return null      // the marker sits on top of the exit node
            const head = []
            const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 25))
            for (let j = 0; j <= n; j++) {
                const p = ed.centerline.pointAt(s0 + (s1 - s0) * (j / n))
                head.push({ x: p.x, z: p.z })
            }
            segments.unshift({
                centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1, runKey: ed.key,
                cellA: anchor.aId, cellB: anchor.bId,   // QUAL-24: window-stable edge identity
                endDeg: (adj.get(exitK) || []).length,
            })
            poly.unshift(...head)
        }

        const { time, distance } = computePar(segments)
        if (!(time > 0)) return null

        // Cumulative XZ arc along the map polyline, for the HUD's route-remaining readout.
        const polyCum = [0]
        for (let i = 1; i < poly.length; i++) {
            polyCum.push(polyCum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z))
        }

        // FEAT-43 guard 2: the routed road between two in-region nodes can still bow past the wall,
        // so re-check what the player will actually drive. Cheap — poly is already built, and it is
        // the same 25 m sampling the map draws.
        if (region && poly.some(p => !inRegion(p))) return null

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
            polyCum,
            edges: segments.length,
            // The priced route, retained so par can be recomputed under a different PAR_REF
            // without re-routing (FEAT-30 calibration). Not read by gameplay.
            segments,
        }
    }
}

// FEAT-46: the FIRST node stepped to on the way from `root` out to `k` (i.e. the last node before
// root when the parent chain is walked back). Used to reject an anchored leg that doubles back along
// the POI's own edge. Returns null if the chain doesn't reach root.
function _firstHop(prev, k, root) {
    let last = null, n = 0
    while (k != null && k !== root && n < 64) { last = k; k = prev.get(k); n++ }
    return k === root ? last : null
}

// Hop count from `k` back to `root` through the Dijkstra parent chain (bounded scan).
function _pathLength(prev, k, root) {
    let n = 0
    while (k != null && k !== root && n < 64) { k = prev.get(k); n++ }
    return k === root ? n : Infinity
}

export { formatTime }
