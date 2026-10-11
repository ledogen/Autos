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
 *     construction. Quick Job keeps random points; POI jobs come from the mission board (FEAT-67).
 *   - SM-INV-2 — par comes from src/par.js, which reads road geometry only. Nothing here may feed
 *     it a vehicle quantity.
 *   - SM-INV-3 — no par countdown on the HUD while driving. The player sees elapsed time and
 *     distance-to-go; par is revealed only in the result card, after arrival.
 *   - REGENERATE/RETRY are testing affordances and are labelled as such. Real story mode has no
 *     do-overs: regenerate exists only for Quick Job (a POI job's offers come from the mission
 *     board, FEAT-67), and retry is gated off for paid jobs by PAID_JOB_DO_OVERS. Quick Job keeps
 *     both; it is the calibration rig and pays nothing.
 *   - FEAT-67 — a POI job is one of the MISSION BOARD's offers (src/offer-board.js). This module
 *     never imports the board: main.js hands enterFromPoi the POI's live offers plus a `plan`
 *     callback that turns one into a priced mission (planOffer below), and owns take/complete/
 *     cancel on the board around accept, settle and cancel().
 *   - SM-INV-4 (FEAT-53) — a POI job settles through the economy on arrival: terms (day tier +
 *     rank thresholds) are FROZEN at accept, payout/points fold into the result card. The
 *     economy arrives through the deps adapter (getTerms/onSettle); this module never imports
 *     economy.js, so headless gates can roll missions with no economy attached.
 *
 * Cost discipline (FEAT-29 acceptance): routing + par run ONCE at generate time, off the frame
 * loop. update() is a couple of distance checks per frame.
 */

import { computePar, gradeRun, PAR_REF, PAR_SLACK } from './par.js'
import { roadQuality } from './road-quality.js'

// THE PLANNING NETWORK IS THE PLAY NETWORK (owner, 2026-09-07). Missions used to plan on a second,
// PRIVATE RoadSystem streamed to its own 1400 m radius. That was necessary while Quick Job was a
// free-roam affordance and the play instance only ever held a ~320 m window. It is not necessary
// now: missions exist ONLY inside story mode — the Quick Job button is hidden outside it and POI
// givers are placed and dropped with the region — and story mode has already built the play
// instance out to REGION_RADIUS_M + WARM_MARGIN_M around the region centre and FROZEN it. That
// band is a strict superset of anything a mission may propose (the wall clips candidates well
// inside it), so the private instance was duplicated plan-layer work whose pre-warm could not even
// begin until the loading screen cleared. Rushing straight into a Quick Job beat the warm and paid
// the build synchronously on the main thread — that was "building the road network for this area".
// If free-roam missions ever return they need their own wide band again: blueprint it from here.
// Leg bounds are measured in ROAD metres along the planning graph (BUG-52 — they were chord-sum
// metres until then). Scaled ×1.3 from the chord-era 1500 / 4000 so leg lengths did not move with
// the fix: shortest-path distances read 1.19-1.35× (p50) longer in road metres than in chord-sum
// metres on seeds 6/20/11 at a 1400 m band. Payout scales with leg length, so retuning these is an
// economy call, not a planner one.
const LEG_MIN = 1950                // m of road
const LEG_MAX = 5200                // m of road
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
// FEAT-53: real story mode has no do-overs (DESIGN.md — a retried paid job is a direct payout
// exploit: drive badly, retry, get paid for the good lap). Held as a const flag in the
// DEBUG_LOCKOUT house style (story.js): flip to true to re-open retry on POI jobs for a calibration
// session. (Its regenerate half went with FEAT-67: a POI job's offers are the board's, and there is
// nothing to re-roll.) Quick Job (fromPoi === null) is untouched — it pays nothing.
const PAID_JOB_DO_OVERS = false
// FEAT-67: road-metre graph distance band for a POI DESTINATION (×1.3 from the chord-era 800, as
// LEG_MIN above). Wider at the bottom than the roadside band (LEG_MIN): a region holds ~14 POIs, so
// demanding the full LEG_MIN would leave most offers with no POI in range and quietly turn the
// 50 % POI share into a roadside one.
const POI_LEG_MIN = 1050            // m of road
const EDGE_T_MARGIN = 0.12          // keep endpoints off the junction pads at both ends
// FEAT-43: when story mode supplies a region, the whole mission must fit INSIDE its wall.
// The planning network ALWAYS reaches past that wall — story mode warms the play band to
// REGION_RADIUS_M + WARM_MARGIN_M precisely so the boundary roads are whole, and a streamed band
// carries a wide margin on top. Measured on seed 6 back when planning had its own 1400 m instance,
// it already offered nodes out to 2783 m, 4 of 43 beyond the 2500 m wall; _roll picks BOTH
// endpoints freely from that set, so ~1 roll in 10 landed outside. These two guards therefore
// carry MORE weight now that the candidate set is the whole region band: node candidates are
// filtered to the region, and the finished polyline is re-checked — a centerline between two
// in-region nodes can still bow past the wall.
// Exported (FEAT-61): the paper route's customers must be sited inside the SAME wall, or they are
// people no route can reach. One constant, so the two can never disagree about where the edge is.
export const REGION_MARGIN = 100    // m — keep missions this far clear of the wall itself
const REGION_ROLL_TRIES = 8         // re-rolls before admitting the region has no qualifying leg
// Exported (2026-08-17): the paper route samples its own drive trace, and buildRunExport() stamps
// `hz: TRACE_HZ` into every export — so a second sampler at a different rate would make the file
// lie about itself. One rate, one constant, both callers.
export const TRACE_HZ = 10          // driven-trace sample rate
export const TRACE_DIV = Math.round(60 / TRACE_HZ)
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
 * The planning graph, keyed by node key: positions, the original ids, and road-length adjacency.
 *
 * BUG-52: an edge weighs its run's driven arc length (the networkGraph tuple's 4th slot), NOT the
 * chord between its nodes. The chord under-priced exactly the edges the terrain punished hardest —
 * a big detour factor is what a ridge crossing looks like (seed 20's spawn edge: 452 m chord vs
 * 1134 m of road). Chord survives only as the fallback for an edge with no measured run.
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
    for (const [a, b, , len] of g.edges) {
        if (!inRegion(g.pos(a)) || !inRegion(g.pos(b))) continue
        const ka = touch(a), kb = touch(b)
        const pa = posOf.get(ka), pb = posOf.get(kb)
        const w = len > 0 ? len : Math.hypot(pa.x - pb.x, pa.z - pb.z)
        adj.get(ka).push({ to: kb, w }); adj.get(kb).push({ to: ka, w })
    }
    return { posOf, idOf, adj }
}

/**
 * Dijkstra from one node over a buildGraphAdj adjacency (road-length graph metric — cheap, nothing
 * is routed). Returns dist + parent chain to every reachable node. `maxD` stops expanding past that
 * distance (the leg planner's LEG_MAX band); the paper-route tour leaves it unbounded. Shared by the
 * mission leg planner and PaperRouteSystem so the two searches cannot drift (a linear-scan sorted
 * queue: fine at region graph sizes, and its tie order is part of what the gates pin).
 */
export function graphDijkstra(adj, startK, maxD = Infinity) {
    const dist = new Map([[startK, 0]]), prev = new Map()
    const queue = [{ k: startK, d: 0 }]
    while (queue.length) {
        queue.sort((a, b) => a.d - b.d)
        const { k, d } = queue.shift()
        if (d > (dist.get(k) ?? Infinity)) continue
        if (d > maxD) continue
        for (const e of adj.get(k) || []) {
            const nd = d + e.w
            if (nd < (dist.get(e.to) ?? Infinity)) {
                dist.set(e.to, nd); prev.set(e.to, k); queue.push({ k: e.to, d: nd })
            }
        }
    }
    return { dist, prev }
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
     *        one is active. Missions are confined to it (see REGION_MARGIN).
     * @param {()=>{day:number,dayTier:number,thresholds:object}} [o.getTerms] — FEAT-53: the
     *        economy's terms at this moment (EconomySystem.terms()). Stamped onto the mission at
     *        ACCEPT and read back at settlement. Optional — without it, jobs grade on the day-1
     *        default thresholds and nothing pays.
     * @param {(result:object, mission:object)=>{payout:number,base:number,tip:number,points:number}} [o.onSettle] —
     *        FEAT-53: settle a finished POI job (EconomySystem.settle). Optional, POI jobs only.
     */
    constructor({ getRoad, getCar, getSeed, getRegion, teleport, setSpawn, setMapOpen, onChange, getTerms, onSettle }) {
        this._getRoad = getRoad
        this._getCar = getCar
        this._getRegion = getRegion || (() => null)
        this._getSeed = getSeed || (() => 0)
        this._teleport = teleport
        this._setSpawn = setSpawn || null
        this._setMapOpen = setMapOpen
        this._onChange = onChange || (() => {})
        this._getTerms = getTerms || null
        this._onSettle = onSettle || null

        // 'idle' | 'generating' | 'offer' | 'countdown' | 'loading' | 'staging' | 'running' | 'done'
        // 'loading' (FEAT-88) comes before 'staging' on a HAUL job only: the load has to be in the
        // bed before the start zone means anything. main.js owns the loading beat (it can see the
        // truck and the debris) and calls loadingDone() when the last piece has dropped.
        // 'countdown' and 'staging' are the two mutually exclusive start rituals: a Quick Job counts
        // down at the pin it teleported you to, a POI job stages inside its start zone (see
        // START_ZONE_R). Nothing ever passes through both.
        this.state = 'idle'
        this.mission = null      // { start, end, par, distance, poly }
        this.elapsed = 0
        this.countdown = 0
        this.result = null       // { elapsed, par, letter, ratio, margin }
        this.leg = 0             // FEAT-102: which leg of a fetch is being driven (0 out, 1 back)
        this.error = null
        this._trace = []         // driven trace rows (see update); reset on accept
        this._traceTick = 0
        // FEAT-67: the parked POI's live board offers and which one the panel shows. `_plan` is
        // main.js's offer→mission callback (memoised on the offer, so cycling back is instant).
        this.offers = []
        this.offerIdx = 0
        this.offer = null
        this._plan = null
    }

    // ── lifecycle ───────────────────────────────────────────────────────────────────────────

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
     * FEAT-46/67: take a job from the POI you are parked at. The offers are the MISSION BOARD's live
     * offers at that POI (FEAT-67 — the single hidden offer per POI per day is gone); the panel
     * shows one at a time and cycle() steps through them. Each is priced by main.js's `plan`
     * callback — the start is PINNED to the marker's own (edge, arc) point and accepting does NOT
     * teleport — you are already standing there, and the run begins when you drive out of the
     * marker's start zone (START_ZONE_R).
     *
     * Offers whose route cannot be planned are dropped from the list; if none survive, the panel
     * says so and nothing opens.
     *
     * @param {object} poi — a record from PoiSystem.list()
     * @param {object[]} offers — the board's live offers at this POI (opaque here; `.id` is read)
     * @param {(offer:object)=>object|null} plan — offer → priced mission (see planOffer), or null
     */
    enterFromPoi (poi, offers = [], plan = null) {
        if (!poi || !plan) return
        this.offers = offers.slice()
        this.offerIdx = 0
        this._plan = plan
        this.result = null
        this.error = null
        this._present()
    }

    /** FEAT-67: step the parked panel to the previous (−1) / next (+1) live offer. */
    cycle (delta) {
        if (this.state !== 'offer' || this.offers.length < 2) return
        const n = this.offers.length
        this.offerIdx = ((this.offerIdx + delta) % n + n) % n
        this._present(Math.sign(delta) || 1)
    }

    /** Show offers[offerIdx], skipping (and dropping) any whose route cannot be planned. */
    _present (step = 1) {
        while (this.offers.length) {
            const o = this.offers[this.offerIdx]
            let m = null
            try { m = this._plan(o) } catch (e) { console.warn('[mission] offer planning failed', e) }
            if (m) {
                this.offer = o
                this.mission = m
                this.state = 'offer'
                this._setMapOpen(true)
                this._onChange()
                return
            }
            this.offers.splice(this.offerIdx, 1)
            if (step < 0) this.offerIdx--
            const n = this.offers.length
            if (n) this.offerIdx = ((this.offerIdx % n) + n) % n
        }
        this.offer = null
        this.mission = null
        this.state = 'idle'
        this.error = 'no route found for any offer here'
        this._onChange()
    }

    /**
     * Re-roll the offer. TESTING ONLY, and QUICK JOB ONLY — real story mode has no do-overs, and
     * since FEAT-67 a POI job's offers are the board's: there is nothing at a POI to re-roll.
     */
    regenerate() {
        if (this.state !== 'offer' || this.mission?.fromPoi) return
        this.state = 'generating'
        this._onChange()
        setTimeout(() => this._generate(), 0)
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
        // FEAT-96: a job with a time slack (freight) grades on looser letters — every frozen threshold
        // × the slack, so the result letter and the rank bar both follow. The tip reads the same slack
        // in economy.js settle().
        const slack = this.mission.timeSlack
        if (slack && this.mission.terms?.thresholds) {
            const t = this.mission.terms.thresholds
            this.mission.terms = { ...this.mission.terms,
                thresholds: Object.freeze(Object.fromEntries(Object.keys(t).map(k => [k, t[k] * slack]))) }
        }
        // FEAT-67: taking the offer OFF THE BOARD is main.js's job, done just before this call (it
        // owns the board and re-checks the offer is still live — a food offer lives ~2 real minutes).
        this._launch({ seat: !this.mission.fromPoi, setSpawn: true, load: !!this.mission.bundles })
    }

    /** FEAT-88: the haul load is in the bed — the job stages exactly like any other POI job. */
    loadingDone() {
        if (this.state !== 'loading') return
        this.state = 'staging'
        this._onChange()
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
    _launch({ seat = true, setSpawn = false, load = false } = {}) {
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
        this.state = staged ? (load ? 'loading' : 'staging') : 'countdown'
        this._polyIdx = 0            // route-remaining projection restarts at the start pin
        this.leg = 0                 // FEAT-102: a fetch starts on its outbound leg
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
        this.offers = []
        this.offer = null
        this._plan = null
        this._setMapOpen(false)
        this._onChange()
    }

    /**
     * FEAT-67: CANCEL the job in hand — the player phones the customer. The cancel button is the
     * only caller: leaving the route or the region never cancels (owner, 2026-09-27). Returns the
     * board offer id that was cancelled (null for a Quick Job, which has none) so main.js can lock
     * the slot; nothing settles.
     */
    cancel() {
        if (!this.isOnJob()) return null
        const id = this.mission?.offerId ?? null
        this.exit()
        return id
    }

    /** True while a job is taken and not yet finished — the states the cancel button applies to. */
    isOnJob() { return ['countdown', 'loading', 'staging', 'running'].includes(this.state) }

    isActive() { return this.state !== 'idle' }

    /** Markers for the 2D map (null when there's nothing to draw). */
    markers() {
        if (!this.mission) return null
        const legs = this.mission.legs
        return { start: this.mission.start, end: this.mission.end, poly: this.mission.poly,
                 pickup: legs ? legs[0].end : null }
    }

    /**
     * FEAT-102: the POI a running fetch is waiting for you to park at, or null (not a fetch, already
     * picked up, or not running). main.js's park trigger reads it.
     */
    pickupPoiId() {
        const legs = this.mission?.legs
        return this.state === 'running' && legs && this.leg === 0 ? legs[0].poiId : null
    }

    /**
     * FEAT-102: what the GPS guides along. A fetch's route lies exactly on top of itself, so a GPS
     * tracking the WHOLE thing cannot tell the outbound pass from the return after the U-turn —
     * it kept matching the outbound and pointing back at the pickup (owner, 2026-10-08). So each
     * leg is handed over as its OWN route: a new object per leg, which gps.js re-bakes and
     * re-acquires from zero (its identity seam). Any other job is its own route, as before.
     */
    guideRoute() {
        const m = this.mission
        if (!m?.legs) return m
        if (!m._legRoutes) {
            const k = m.legs[0].segIdx
            m._legRoutes = [{ segments: m.segments.slice(0, k) }, { segments: m.segments.slice(k) }]
        }
        return m._legRoutes[this.leg ?? 0]
    }

    /**
     * FEAT-102: the item is acquired — main.js calls this when the parking brake latches at the
     * pickup (owner, 2026-10-08: "pull up and park; the item is instantly acquired"). Advances to
     * the return leg. False (and nothing changes) unless a fetch is running on its outbound leg.
     */
    acquire() {
        if (!this.pickupPoiId()) return false
        this.leg = 1
        this._polyIdx = this.mission.legs[0].polyIdx   // the projection resumes at the pickup
        this._onChange()
        return true
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
        return buildRunExport({
            note,
            segs: this.mission.segments,
            result: this.result
                ? { elapsed_s: +this.result.elapsed.toFixed(2), par_s: +this.result.par.toFixed(2),
                    ratio: +this.result.ratio.toFixed(3), letter: this.result.letter,
                    margin_s: +this.result.margin.toFixed(2) }
                : { elapsed_s: +this.elapsed.toFixed(2), par_s: +this.mission.par.toFixed(2), incomplete: true },
            edges: this.mission.edges,
            start: { x: +this.mission.start.x.toFixed(1), z: +this.mission.start.z.toFixed(1),
                     heading_rad: +this.mission.start.heading.toFixed(4) },
            end: { x: +this.mission.end.x.toFixed(1), z: +this.mission.end.z.toFixed(1) },
            trace: this._trace,
            seed: this._getSeed(),
        })
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
        // FEAT-102: a fetch measures to the CURRENT leg's end — the pickup, then home.
        const legs = this.mission.legs
        const c = this._getCar(), e = legs ? legs[this.leg ?? 0].end : this.mission.end
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
        // FEAT-102: on a fetch's return leg the route retraces the outbound points, so never match
        // back onto the outbound half — the number would read the whole job again.
        const floor = m.legs && this.leg === 1 ? m.legs[0].polyIdx : 0
        scan(Math.max(floor, last - 20), Math.min(poly.length - 1, last + 40))
        if (bd > 200 * 200) scan(floor, poly.length - 1)     // off the window (teleport, big shortcut)
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
        // FEAT-102: a fetch's outbound leg ends with a PARK at the pickup (acquire()), never a
        // drive-by — and the giver's own end sits inside the start zone, so testing it here would
        // finish the job on its first frame.
        if (this.mission.legs && this.leg === 0) return
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
                    if (s) {
                        this.result.payout = s.payout; this.result.points = s.points; this.result.award = s.award ?? null
                        this.result.base = s.base ?? s.payout; this.result.tip = s.tip ?? 0   // the result card's two rows
                    }
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
    _generate() {
        try {
            // A roll can come up empty because the FEAT-43 region rejected the leg it happened to
            // draw (guard 2 only fires after the route is built), so inside a region we re-roll
            // before reporting failure. Retries are cheap THERE and only there: the region is
            // pre-warmed, so every edgeParData is a cache hit. Outside a region a failed roll still
            // reports immediately — retrying could route live edges and block for seconds.
            const tries = this._getRegion() ? REGION_ROLL_TRIES : 1
            this.mission = null
            for (let i = 0; i < tries && !this.mission; i++) this.mission = this._roll(null)
            if (this.mission) { this.mission.fromPoi = null; this.mission.startZone = null }
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
     * FEAT-67: price one board offer from `poi` WITHOUT touching the system's state — the map's
     * hover card and the parked panel both call this (through main.js, which memoises the result on
     * the offer). Same retry rule as _generate, but every roll draws from the offer's own seeded
     * stream, so the same offer always plans the same route.
     *
     * @param {object} poi — the source POI (PoiSystem record)
     * @param {object} o
     * @param {()=>number} o.rng — the offer's route stream (OfferBoard.routeRng)
     * @param {{kind:'poi'|'roadside', pick:number, pois:object[], strict?:boolean}|null} o.dest —
     *        destination wish: a POI (chosen by `pick` among the reachable candidates in `pois`) or a
     *        roadside point. A POI wish that finds no reachable candidate falls back to roadside —
     *        unless `strict` (FEAT-100: a thing bound for a class), when the roll fails instead.
     *        `fetch` (FEAT-102): the POI is a PICKUP and the job comes back here — see fetchRoute.
     * @returns {object|null} the mission, with fromPoi / startZone / endPoiId set
     */
    planOffer (poi, { rng, dest = null } = {}) {
        const anchor = { aId: poi.aId, bId: poi.bId, s: poi.s, poiId: poi.id }
        const tries = this._getRegion() ? REGION_ROLL_TRIES : 1
        let m = null
        for (let i = 0; i < tries && !m; i++) m = this._roll(anchor, { rng, dest })
        if (!m) return null
        if (dest?.fetch) m = fetchRoute(m, poi.id)
        m.fromPoi = poi.id
        // The start threshold is centred on the MARKER (where you are parked), not on the mission's
        // road-side start pin ~11 m out across the shoulder.
        m.startZone = { x: poi.x, z: poi.z, y: poi.y ?? 0, r: START_ZONE_R }
        return m
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
     *   (graph edge, arc) point instead of rolling it.
     * @param {object} [o]
     * @param {()=>number} [o.rng] — FEAT-67: the roll's randomness. A board offer passes its own
     *   seeded stream (same offer → same route); Quick Job keeps Math.random (SM-INV-12 run layer).
     * @param {object|null} [o.dest] — FEAT-67: destination wish (see planOffer). Anchored rolls only.
     */
    _roll(anchor = null, { rng = Math.random, dest = null } = {}) {
        const road = this._getRoad()
        if (!road) return null
        // The POST-CULL registered network — the roads that actually exist. Planning off the raw
        // Urquhart set (what this did originally) invents routes across empty hillsides.
        const g = road.networkGraph()
        if (!g.edges.length) return null

        // FEAT-43 guard 1: drop everything outside the story region before any planning happens.
        // buildGraphAdj applies it per EDGE — see the note there for why that is the part that
        // matters. Guard 2 (the routed polyline) is further down.
        // FEAT-77 follow-up (2026-09-08): with no story region, fence the roll to the BAND the
        // network was streamed on, less the same margin. The streamed graph reaches well past its
        // nominal radius (FEAT-43 measured 2783 m of nodes on a 1400 m band), and a T on that
        // frontier can exist in this band and not in the 320 m play band the truck streams on
        // arrival — its side road's far node lies beyond the other band's graph margin. A mission
        // planned onto a frontier edge then "evaporates" (mission-network's drop-point check,
        // seed 6 (3825,-1225): 1.95 km from a 1400 m band centre). Ground inside the radius is
        // complete in both bands; the frontier is not, and it is not the planner's to roll on.
        const region = this._getRegion()
            ?? (road._networkCenter && road._proto?.radius
                ? { x: road._networkCenter.x, z: road._networkCenter.z, r: road._proto.radius } : null)
        const rMax = region ? region.r - REGION_MARGIN : Infinity
        const inRegion = (p) => !region || Math.hypot(p.x - region.x, p.z - region.z) <= rMax

        const { posOf, idOf, adj } = buildGraphAdj(g, inRegion)

        // Start node: ANY node in the planned network, not just the one nearest the car. _launch()
        // teleports the player to the start pin regardless (see accept/retry), so pinning the start
        // to the car threw away nearly the whole streamed network as possible origins and made every
        // mission radiate from one point — a handful of shortest-path fans that all shared a long
        // common prefix ("a couple of options with subtle variations"). Rolling BOTH endpoints freely
        // turns the pool from O(endpoints) into O(pairs) at zero extra streaming cost (the network
        // already holds these roads). "The whole network" is now the frozen region band, so the
        // thing that bounds a job is the WALL rather than a window that slid about with the truck;
        // the shortest-path route body stays intentional (a quick job takes the natural line).

        // Dijkstra over straight-line graph edges from one start → reachable nodes in the leg band,
        // capped at MAX_EDGES hops. No routing here (graph metric only), so it's cheap to run per
        // start candidate. Returns the parent chain plus the qualifying endpoints.
        const legCandidates = (startK, lo = LEG_MIN) => {
            const { dist, prev } = graphDijkstra(adj, startK, LEG_MAX)
            const ends = [...dist.entries()]
                .filter(([k, d]) => d >= lo && d <= LEG_MAX && k !== startK)
                .filter(([k]) => _pathLength(prev, k, startK) <= MAX_EDGES)
            return { prev, ends, dist }
        }

        let startK = null, prev = null, endK = null
        // FEAT-46: the anchored roll. A POI sits mid-edge, so the leg LEAVES that edge through one
        // of its two nodes; that node is the start of the ordinary node-path search, and the partial
        // stretch from the POI out to it is prepended as a segment afterwards. The player is NOT
        // teleported — they are already standing on the pad — so unlike the free roll there is no
        // freedom in where this begins.
        let exitK = null
        // FEAT-67: a destination POI, when the offer wants one and one is reachable. `entry` is the
        // node of the destination's edge the route comes in through — the NEARER one by graph
        // distance, so the route never drives past the POI and doubles back to it. (The path to the
        // nearer node cannot pass through the farther one: that node would then be nearer.)
        let destPoi = null
        if (anchor) {
            const ka = g.key(anchor.aId), kb = g.key(anchor.bId)
            if (!adj.has(ka) || !adj.has(kb)) return null      // POI edge outside the planner's set
            const pair = rng() < 0.5 ? [[ka, kb], [kb, ka]] : [[kb, ka], [ka, kb]]
            const edgeKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`)
            const srcEdge = edgeKey(ka, kb)
            if (dest?.kind === 'poi' && dest.pois?.length) {
                // FEAT-100: a STRICT wish (a thing bound for a class) takes no leg floor. The floor
                // keeps a free choice of destination from settling on a short hop; a strict wish has
                // no choice — the one school is wherever it is — and par prices a short leg fairly.
                // Down to zero hops: the school's road may leave the very node the giver's does.
                const lo = dest.strict ? 0 : POI_LEG_MIN
                for (const [ex, other] of pair) {
                    const c = legCandidates(ex, lo)
                    const opts = []
                    for (const q of dest.pois) {
                        const qa = g.key(q.aId), qb = g.key(q.bId)
                        if (!adj.has(qa) || !adj.has(qb) || edgeKey(qa, qb) === srcEdge) continue
                        const da = c.dist.get(qa) ?? Infinity, db = c.dist.get(qb) ?? Infinity
                        const entry = da <= db ? qa : qb
                        const d = Math.min(da, db)
                        if (!(d >= lo && d <= LEG_MAX)) continue
                        if (_pathLength(c.prev, entry, ex) > MAX_EDGES) continue
                        // Same doubling-back rule as the roadside leg: never leave along the anchor edge.
                        if (_firstHop(c.prev, entry, ex) === other) continue
                        opts.push({ q, entry })
                    }
                    if (!opts.length) continue
                    opts.sort((a, b) => (a.q.id < b.q.id ? -1 : a.q.id > b.q.id ? 1 : 0))
                    const o = opts[Math.min(opts.length - 1, Math.floor(dest.pick * opts.length))]
                    exitK = ex; startK = ex; prev = c.prev; endK = o.entry; destPoi = o.q
                    break
                }
            }
            if (!destPoi && dest?.strict) return null
            if (!destPoi) {
                for (const [ex, other] of pair) {
                    const c = legCandidates(ex)
                    // Reject any leg whose FIRST hop doubles back along the anchor edge — the route
                    // would drive off the pad, past the POI, and traverse the same stretch twice.
                    const ends = c.ends.filter(([k]) => _firstHop(c.prev, k, ex) !== other)
                    if (!ends.length) continue
                    exitK = ex; startK = ex; prev = c.prev
                    endK = ends[(rng() * ends.length) | 0][0]
                    break
                }
            }
        } else {
            // Shuffle the node set and take the first start with a reachable endpoint in the leg band.
            // Most nodes qualify; the loop just skips the few dead-end / window-edge nodes whose whole
            // leg band falls off the streamed network. Quick Job rolls are run-layer randomness — free
            // to use Math.random (SM-INV-12).
            const starts = [...posOf.keys()]
            for (let i = starts.length - 1; i > 0; i--) {           // Fisher-Yates
                const j = (rng() * (i + 1)) | 0
                ;[starts[i], starts[j]] = [starts[j], starts[i]]
            }
            for (const s of starts) {
                const c = legCandidates(s)
                if (!c.ends.length) continue
                startK = s; prev = c.prev
                endK = c.ends[(rng() * c.ends.length) | 0][0]
                break
            }
        }
        if (startK == null || endK == null) return null

        // Node path start → end.
        const nodePath = []
        for (let k = endK; k != null; k = prev.get(k)) { nodePath.unshift(k); if (k === startK) break }
        // Zero hops is a route only between two POIs (FEAT-100): out along the giver's edge to the
        // node, straight in along the destination's. Both partial stretches are appended below.
        if (nodePath.length < 2 && !(anchor && destPoi)) return null

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
                const t = EDGE_T_MARGIN + rng() * (0.55 - EDGE_T_MARGIN)
                s0 = off + (forward ? L * t : L * (1 - t))
            }
            // A POI destination ends on its OWN edge (appended below), so the last node-path edge is
            // driven whole, right up to the entry node.
            if (i === nodePath.length - 2 && !destPoi) {
                const t = EDGE_T_MARGIN + rng() * (0.55 - EDGE_T_MARGIN)
                s1 = off + (forward ? L * (1 - t) : L * t)
            }
            // FEAT-39: DEGREE of the node this edge ends at. A join is a real intersection — a
            // place the driver has a choice — only when that node carries three or more edges; a
            // degree-2 node is just the road bending through (QUAL-16 made those first-class), and
            // the turn angle alone cannot tell the two apart. The GPS assist filters on this.
            const endDeg = (adj.get(nodePath[i + 1]) || []).length
            // QUAL-24: carry the ABSTRACT EDGE (site pair) alongside the runKey. A runKey names a run
            // GROUPING, and a deg-2 chain merge groups by the streamed band — so a mission planned on
            // one window could name a chain another never forms, and the drop point looked like it
            // evaporated. Planning on the play instance itself makes that class structurally
            // impossible in a frozen region, but NOT on the degraded entry path (a timed-out region
            // warm leaves streaming live), and the site pair is stable across windows either way —
            // so it stays what anything re-resolving the road later should key on.
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

        // FEAT-67: append the destination POI's own partial stretch — from the entry node in to the
        // marker's arc position. The mirror of the FEAT-46 head above, and just as free: par already
        // integrates partial edges.
        if (destPoi) {
            const ed = road.edgeParData(destPoi.aId, destPoi.bId)
            if (!ed) return null
            const off = ed.arcOffset ?? 0
            const L = ed.arcLength ?? ed.centerline.length
            const en = posOf.get(endK)
            const pEnd = ed.centerline.pointAt(off + L), pStart = ed.centerline.pointAt(off)
            const s0 = Math.hypot(pEnd.x - en.x, pEnd.z - en.z) < Math.hypot(pStart.x - en.x, pStart.z - en.z) ? off + L : off
            const s1 = Math.max(off, Math.min(off + L, destPoi.s))
            if (Math.abs(s1 - s0) >= 1) {
                const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 25))
                for (let j = 1; j <= n; j++) {
                    const p = ed.centerline.pointAt(s0 + (s1 - s0) * (j / n))
                    poly.push({ x: p.x, z: p.z })
                }
                segments.push({
                    centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1, runKey: ed.key,
                    cellA: destPoi.aId, cellB: destPoi.bId,   // QUAL-24: window-stable edge identity
                    endDeg: 2,                                // ends mid-edge: no junction to announce
                })
            }
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
            // FEAT-67: the destination POI, or null for a roadside drop. The card names it.
            endPoiId: destPoi?.id ?? null,
            // The priced route, retained so par can be recomputed under a different PAR_REF
            // without re-routing (FEAT-30 calibration). Not read by gameplay.
            segments,
        }
    }
}

/**
 * FEAT-102: turn a planned giver → pickup route into the whole FETCH — out to the pickup and back
 * the same way (FEAT-89: "the return re-uses the outbound route"). One par over both legs: the
 * outbound's last segment is a STOP, so the reference driver halts at the pickup (par.js caps the
 * speed to 0 there, which also absorbs the U-turn), and computePar prices the joined segments once.
 *
 * The return is the outbound reversed: segments in reverse order with s0/s1 swapped, and each
 * one's endDeg moved to the node it now ends at — the start node of the segment before it in the
 * outbound. The last one ends mid-edge at the giver, so 2 (no junction to announce).
 *
 * Fields: endPoiId stays the PICKUP (the card names it; no two offers fetch from the same place);
 * end becomes the giver's road point; legs[i].end is what each leg arrives at.
 */
function fetchRoute (m, giverId) {
    const out = m.segments.map((g, i, a) => (i === a.length - 1 ? { ...g, stop: true } : g))
    const n = out.length
    const back = out.slice().reverse().map((g, j) => ({
        ...g, s0: g.s1, s1: g.s0, stop: false, endDeg: j < n - 1 ? out[n - 2 - j].endDeg : 2,
    }))
    const segments = [...out, ...back]
    const { time, distance } = computePar(segments)
    const poly = [...m.poly, ...m.poly.slice(0, -1).reverse()]
    const polyCum = [0]
    for (let i = 1; i < poly.length; i++) {
        polyCum.push(polyCum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z))
    }
    const home = { x: m.start.x, z: m.start.z }
    return {
        ...m, par: time, distance, poly, polyCum, segments, edges: segments.length, end: home,
        fetch: true,
        legs: [{ end: m.end, poiId: m.endPoiId, polyIdx: m.poly.length - 1, segIdx: n }, { end: home, poiId: giverId }],
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


/**
 * Build a `rangersim-run-export/2` blob from a priced route plus the drive made on it.
 *
 * SHARED, NOT DUPLICATED [2026-08-17]. This was the body of `MissionSystem.exportRun` until the
 * paper route needed the same export. A second copy of the topology sampler would have been a
 * second thing to keep in step with par.js's own sampling — precisely the drift the project's SYNC
 * rules exist to prevent — so the mission types now differ only in what they can SAY about a route
 * (a point-to-point job has a start and an end; a paper round has customers). Anything a caller
 * wants to record beyond the shared shape rides in `extra`.
 *
 * Par is recomputed here from `segs` rather than passed in, deliberately: the export can then never
 * describe a different route than the one it reports par for.
 *
 * @param {object} o
 * @param {ParSegment[]} o.segs    the route AS PRICED, in travel order
 * @param {object} o.result        the `result` block verbatim (elapsed_s / par_s / ratio / letter / …)
 * @param {number} o.edges         edge count of the route
 * @param {object} o.start         { x, z, heading_rad }
 * @param {object} o.end           { x, z }
 * @param {number[][]} [o.trace]   driven-trace rows at TRACE_HZ
 * @param {number} [o.seed]        world seed (feeds the per-500 m road-quality column)
 * @param {object} [o.extra]       merged into the top level — mission-type-specific calibration data
 */
export function buildRunExport ({ note = '', segs, result, edges = 0, start = null, end = null,
                                  trace = [], seed = 0, extra = null }) {
    const par = computePar(segs)

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
        result,
            // PAR_SLACK rides along with PAR_REF [2026-08-16]: `par_s` is referenceTime × PAR_SLACK,
            // so a run recorded under a different slack is measured against a different STANDARD
            // even at identical PAR_REF. Without this the corpus cannot tell the two apart and any
            // future refit silently mixes scales — which is exactly the trap the runs recorded
            // before the re-anchor fell into.
            par_ref: { ...PAR_REF, slack: PAR_SLACK },
            route: {
                distance_m: +total.toFixed(1),
                edges,
                start, end,
                climb_m: +climb.toFixed(1), descent_m: +descent.toFixed(1),
                par_avg_kmh: +(total / par.time * 3.6).toFixed(1),
            },
            topology: { spacing_m: TOPO_DS, columns: cols, rows },
            trace: {
                hz: TRACE_HZ,
                columns: ['t_s', 'x', 'y', 'z', 'speed_ms', 'heading_rad', 'throttle', 'brake', 'steer_rad'],
                rows: trace,
            },
            ...(extra || {}),
        }
}
