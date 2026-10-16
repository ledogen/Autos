// ── FEAT-67: the mission board — who posts work, what is on offer, and when it turns over ──────
//
// Spec: .planning/todos/pending/feat-67-visible-offer-board.md (every ruling there is binding).
//
// WHAT THIS OWNS. Two kinds of slot (data/offers.js SOURCES; FEAT-101, pois.md § Job supply):
//   • ALWAYS-ON — a place's own slots (Larry, the haul yard, the food vendor). When an offer expires
//     a new one is rolled into its slot straight away, so the expiry length IS the turnover rate.
//   • THE BUDGET — BUDGET_JOBS slots shared by every `cap` giver. When a budget offer expires its
//     slot refills at once at a uniformly random ELIGIBLE giver: one with something to post, under
//     its cap, and not locked.
// THE LOCK RULE (owner, 2026-10-07): a COMPLETION and a CANCEL both lock the slot for a fresh full
// expiry from that moment (or the source's `lockH`). A locked budget slot stays parked on its place
// — which takes no new budget job meanwhile — then refills somewhere random. So finishing a job
// never brings the next one sooner. While an offer is TAKEN its slot shows nothing.
// THE DEADLINE (FEAT-113): take() stamps `dueH` (accept + par × (1 + slack)). A taken slot
// still in hand at dueH locks AT dueH under the same rule — a lazy timer like the others, so the
// lock never depends on when the player gets round to signing the expired job off.

// PURE. No THREE, no road, no DOM. Imports only the two content tables, the seeded hash/PRNG, and
// the economy's pure pay functions. main.js owns the board's lifetime (built when a story region
// goes live, dropped on exit or a seed change) and hands it the clock on every query.
//
// LAZY TIMERS. There is no per-frame tick. Every query takes `nowH` (the absolute game clock,
// DaySystem.clockH()) and calls advance(nowH) first, which replays every expiry since the last
// query. That is idempotent and only ever moves forward, so a 10-hour sleep costs one catch-up of a
// few cheap lifetime draws, and "the board after one 30 h jump" equals "the board after 1800
// one-minute steps" exactly (gated).
//
// DETERMINISM. Every roll draws from its own seeded stream (djb2 of a string key → mulberry32), so
// the board is a pure function of (seed, POI list, clock, the completion/cancel log). Nothing reads
// Math.random. The streams per offer are keyed `offer:<seed>:<poiId>:<slot>:<k>:<stream>`, where
// slot is an index (always-on) or `b<i>` (budget), and k counts the offers that slot has held: `life` (how long it lasts), `spec` (what it is), `route`
// (the mission planner's rolls — handed out by routeRng). Per-POI streams (names, people, the
// generic giver's expiry centre) are keyed `poi:<seed>:<poiId>:<what>`. Where a budget slot refills
// is keyed `budget:<seed>:<slot>:<k>:place`. The budget couples places' timing to one another — the
// accepted cost (pois.md) — so its events replay in GLOBAL time order (advance()).
//
// Offer ids are `${poiId}#${slot}#${k}` — stable, unique for the run, and readable in a log.

import {
    THINGS, REWARDS, SOURCES, BUDGET_JOBS, EXPIRY_NOISE, BONUS_CHANCE, BONUS_PAY_MULT, GATE_WEIGHTS,
    DEST_POI_CHANCE, PEOPLE_PER_POI, HAUL_BUNDLES, HAUL_BUNDLE_KG, HAUL_PAY_PER_BUNDLE, HAUL_PAR_SLACK, FREIGHT_PAY_PER_KG, DEADLINE_SLACK,
} from '../data/offers.js'
import {
    FIRST_NAMES, FEMALE_CHANCE, LAST_NAMES, NICKNAMES, NICKNAME_CHANCE, POI_ADJECTIVES,
    POI_ADJECTIVE_CHANCE, POI_THE_CHANCE, BUSINESS_TYPES, NAME_FORMS, HOUSEHOLDS, PLACE_NOUNS, LANDMARKS,
} from '../data/offer-names.js'
import { djb2, mulberry32 } from './seed.js'
import { basePay, formatMoney } from './economy.js'
import { DAY_PARAMS } from './day.js'

/**
 * The mission families that have gameplay behind them today. demolition is in the tables (so the
 * card, the colours and the lists are ready) but has no code, so it must simply never roll — not
 * be half-built. Add a family here the day its mission ships.
 */
export const BUILT_FAMILIES = new Set(['delivery', 'papers', 'haul', 'freight', 'fragile'])

// Fixed names for roster types that are NOT sources (and Larry) — they can still be a DESTINATION,
// and "delivered to <nothing>" is not a sentence. PLACEHOLDERS: the owner authors names; a type
// becomes rolled by turning it into a source with NAME_FORMS (data/offer-names.js).
const FIXED_NAMES = {
    larrysHouse: "Larry's",
    momsHouse:   "Mom's",
    gasStation:  'the gas station',
}

const rngFor = (key) => mulberry32(djb2(key))

/** Can a `type` post this thing — as its courier giver (`pools`) or as a fetcher (`fetchBy`)? */
const postsThing = (t, type) => t.pools.includes(type) || !!t.fetchBy?.includes(type)
const pick = (r, list) => list[Math.floor(r() * list.length)]

/** Weighted pick over an object of { key: weight }, driven by one uniform draw `u`. */
function pickWeighted (u, weights) {
    const keys = Object.keys(weights)
    const total = keys.reduce((s, k) => s + weights[k], 0)
    let x = u * total
    for (const k of keys) { x -= weights[k]; if (x < 0) return k }
    return keys[keys.length - 1]
}

/**
 * The job-type badge on a card (owner, 2026-10-10): a PLACEHOLDER letter in a box until the map /
 * card iconography pass. Three types start with F, so those take two letters. Larry's route has none.
 */
export function jobBadge (sp) {
    if (sp.family === 'papers') return null
    if (sp.family === 'haul') return 'H'
    if (sp.family === 'freight') return 'Fr'
    if (sp.family === 'fragile') return 'Fg'
    return sp.shape === 'fetch' ? 'Fe' : 'C'
}

/** "S only" / "A or better" — how a card states a rank gate. */
export function gateText (gate) { return gate === 'S' ? 'S only' : `${gate} or better` }

/**
 * A game-time duration as a card reads it: "18 min", "2h 05m", "1d 4h". Game hours in, so the
 * figure means the same thing whether the player sleeps through it or drives through it.
 */
export function formatGameDuration (h) {
    if (!(h > 0)) return '0 min'
    const mins = Math.round(h * 60)
    if (mins < 60) return `${mins} min`
    if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
    const hrs = Math.round(h)
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}

/**
 * FEAT-113: an absolute game clock (DaySystem.clockH) as the deadline line reads it — "Day 3, 2 am".
 * A fixed time, never a countdown (SM-INV-3).
 */
export function formatDue (h) {
    const t = Math.round(h * 60)   // whole minutes FIRST, so 47.9999 h reads Day 3, 12 am
    const day = Math.floor(t / 1440) + 1
    const mins = t % 1440
    const hr = Math.floor(mins / 60), m = mins % 60
    const h12 = hr % 12 || 12
    return `Day ${day}, ${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${hr < 12 ? 'am' : 'pm'}`
}

/**
 * 'Deb Hadley' / 'Earl "Two-Tone" Pruitt' — how a sentence names a person: the full grammar,
 * [first] "[nickname]"? [last] (owner, 2026-09-28: last names on the card). Larry has no last name.
 */
export function personLabel (p) {
    if (!p) return ''
    return p.first + (p.nick ? ` "${p.nick}"` : '') + (p.last ? ` ${p.last}` : '')
}

export class OfferBoard {
    /**
     * @param {object} o
     * @param {number} o.seed        world seed
     * @param {Array<{id:string,type:string}>} o.pois — PoiSystem.list(), the roster
     * @param {number} o.nowH        the absolute game clock at creation (DaySystem.clockH())
     */
    constructor ({ seed, pois, nowH }) {
        this._seed = seed >>> 0
        this._now = nowH
        this._pois = new Map()
        for (const q of pois || []) this._pois.set(q.id, q)
        this._names = new Map()       // poiId → { name, people }
        this._always = new Map()      // poiId → its own slots (always-on sources)
        this._budget = []             // the BUDGET_JOBS shared slots, b0…
        this._slots = []              // every slot on the board: always-on first, then the budget
        this._rollNames()

        // Deterministic source order: the roster list's order is an assignment artefact, so sort by
        // id — the same discipline poi.js follows for placement.
        const ids = [...this._pois.keys()].sort()
        this._givers = ids.filter(id => this._postsAnything(this._pois.get(id).type))
        this._budgetGivers = this._givers.filter(id => SOURCES[this._pois.get(id).type].cap)
        for (const id of this._givers) {
            const q = this._pois.get(id)
            const src = SOURCES[q.type]
            if (src.slots == null) continue
            const n = Array.isArray(src.slots)
                ? src.slots[0] + Math.floor(rngFor(`poi:${this._seed}:${id}:slots`)() * (src.slots[1] - src.slots[0] + 1))
                : src.slots
            const slots = []
            for (let i = 0; i < n; i++) {
                const s = { poiId: id, type: q.type, slot: i, k: -1, offer: null, state: 'live', until: 0 }
                this._roll(s, nowH)
                this._desync(s, `offer:${this._seed}:${id}:${i}:0:age`, nowH)
                slots.push(s)
            }
            this._always.set(id, slots)
            this._slots.push(...slots)
        }
        for (let i = 0; i < BUDGET_JOBS; i++) {
            const s = { poiId: null, type: null, slot: `b${i}`, k: -1, offer: null, state: 'idle', until: nowH }
            this._budget.push(s)
            this._slots.push(s)
            this._refill(s, nowH)
            if (s.state === 'live') this._desync(s, `budget:${this._seed}:b${i}:age`, nowH)
        }
    }

    /** Does this type have anything it could post — a source row and at least one built thing? */
    _postsAnything (type) {
        const src = SOURCES[type]
        return !!src && THINGS.some(t => postsThing(t, type) && src.families.includes(t.family)
            && BUILT_FAMILIES.has(t.family))
    }

    /**
     * DESYNC AT WORLD START: a slot's first offer is given a random AGE, uniform over its own rolled
     * life, so it starts partway through. Starting every timer at L/2 would line them all up — the
     * thing to avoid. (Gated over 2000 seeds.) A never-expiring offer has no age to give.
     */
    _desync (s, key, nowH) {
        if (!isFinite(s.offer.lifeH)) return
        s.offer.bornH = nowH - rngFor(key)() * s.offer.lifeH
        s.offer.expiresH = s.offer.bornH + s.offer.lifeH
    }

    // ── time ───────────────────────────────────────────────────────────────────────────────────

    /** Move the board's clock forward to `nowH`, replaying every expiry since. Never moves back. */
    advance (nowH) {
        if (!(nowH > this._now)) return
        for (const slots of this._always.values()) for (const s of slots) this._advanceSlot(s, nowH)
        // The budget's slots are COUPLED — where one refills depends on where the others sit — so
        // their events replay in global time order, earliest first, ties to the lower slot. That is
        // what keeps "one 30 h jump == 1800 one-minute steps" exact.
        for (let guard = 0; guard < 100000; guard++) {
            let next = null, t = Infinity
            for (const s of this._budget) {
                const e = s.state === 'live' ? s.offer.expiresH : s.state === 'taken' ? s.offer.dueH ?? Infinity : s.until
                if (e < t) { t = e; next = s }
            }
            if (!next || t > nowH) break
            if (next.state === 'taken') this._lockAt(next, t)
            else this._refill(next, t)
        }
        this._now = nowH
    }

    _advanceSlot (s, nowH) {
        // Bounded: a food slot turns over ~12×/day, so even a multi-day jump is a few dozen rolls.
        for (let guard = 0; guard < 100000; guard++) {
            if (s.state === 'live' && s.offer.expiresH <= nowH) this._roll(s, s.offer.expiresH)
            else if (s.state === 'locked' && s.until <= nowH) this._roll(s, s.until)
            else if (s.state === 'taken' && s.offer.dueH <= nowH) this._lockAt(s, s.offer.dueH)
            else return
        }
    }

    /**
     * Move budget slot `s` to a uniformly random ELIGIBLE giver and roll its next offer there, born
     * at `t`. Eligible: a budget giver holding fewer than its cap of budget slots (live, taken or
     * locked — `s` itself aside, it is leaving) and with no LOCKED budget slot parked on it.
     */
    _refill (s, t) {
        const eligible = this._budgetGivers.filter(id => {
            let held = 0
            for (const o of this._budget) {
                if (o === s || o.poiId !== id || o.state === 'idle') continue
                if (o.state === 'locked') return false
                held++
            }
            return held < SOURCES[this._pois.get(id).type].cap
        })
        if (!eligible.length) {
            // ponytail: retry hourly. Never fires at 12 jobs over ~17 givers × cap 2; a smarter
            // wake-up (the next lock clearing) only matters if the budget nears total capacity.
            s.state = 'idle'; s.poiId = null; s.type = null; s.offer = null; s.until = t + 1
            return
        }
        const id = eligible[Math.floor(rngFor(`budget:${this._seed}:${s.slot}:${s.k + 1}:place`)() * eligible.length)]
        s.poiId = id
        s.type = this._pois.get(id).type
        this._roll(s, t)
    }

    /** Put the next offer into slot `s`, born at `bornH`. Only its lifetime is drawn now. */
    _roll (s, bornH) {
        s.k++
        const lifeH = this._lifeH(s.poiId, s.type, s.slot, s.k)
        s.offer = {
            id: `${s.poiId}#${s.slot}#${s.k}`, poiId: s.poiId, type: s.type, slot: s.slot, k: s.k,
            bornH, lifeH, expiresH: bornH + lifeH,
            _spec: undefined,   // lazily rolled — see spec()
            route: undefined,   // main.js's route memo: undefined = not tried, null = no route found
        }
        s.state = 'live'
        s.until = 0
    }

    /**
     * An offer's rolled lifetime: the source's centre (per-POI for a [lo,hi] range) ± EXPIRY_NOISE.
     * Infinity for a source whose offers never expire (expiryH null — Larry).
     */
    _lifeH (poiId, type, slot, k) {
        let centre = SOURCES[type].expiryH
        if (centre == null) return Infinity
        if (Array.isArray(centre)) {
            const u = rngFor(`poi:${this._seed}:${poiId}:expiry`)()
            centre = centre[0] + (centre[1] - centre[0]) * u
        }
        const u = rngFor(`offer:${this._seed}:${poiId}:${slot}:${k}:life`)()
        return centre * (1 + EXPIRY_NOISE * (2 * u - 1))
    }

    /**
     * Forget every memoised route. Routes hold live centerline references, so this is MANDATORY
     * when the play network is swapped under the board (a seed change, a water-exclusion change) —
     * otherwise the board would pin a dead RoadSystem and quote routes that no longer exist.
     */
    clearRoutes () {
        for (const s of this._slots) if (s.offer) s.offer.route = undefined
    }

    // ── queries ────────────────────────────────────────────────────────────────────────────────

    /** Every POI that posts work (always-on or budget), sorted — including one empty right now. */
    sources () { return this._givers.slice() }

    /** Does this POI post work at all? A budget giver with nothing on offer right now still does. */
    isGiver (poiId) { return this._givers.includes(poiId) }

    /** Every slot currently at this POI: its own slots, then any budget slots parked there. */
    _at (poiId) { return this._slots.filter(s => s.poiId === poiId) }

    /** The live offers at a POI, in slot order. Taken and locked slots show nothing. */
    offers (poiId, nowH) {
        this.advance(nowH)
        return this._at(poiId).filter(s => s.state === 'live' && this.spec(s.offer)).map(s => s.offer)
    }

    /** Is this exact offer still on the board (not expired, not taken)? The accept guard. */
    isLive (offerId, nowH) {
        this.advance(nowH)
        const s = this._slotOf(offerId)
        return !!s && s.state === 'live' && s.offer.id === offerId
    }

    /**
     * The absolute clock at which a new offer next appears HERE: one of this POI's own slots
     * turning over (an offer expiring, a lock clearing). Budget slots do not count — where a budget
     * slot refills is a roll, not a schedule. A taken slot does not count either: what happens to it
     * depends on the player. Null when nothing is scheduled (or the offer never expires).
     */
    nextTurnoverH (poiId, nowH) {
        this.advance(nowH)
        let best = null
        for (const s of this._always.get(poiId) || []) {
            const t = s.state === 'live' ? s.offer.expiresH : s.state === 'locked' ? s.until : null
            if (t != null && isFinite(t) && (best == null || t < best)) best = t
        }
        return best
    }

    /** Slot states at a POI, for the map's grey-when-empty diamond: [{state, family}]. */
    slotStates (poiId, nowH) {
        this.advance(nowH)
        return this._at(poiId).map(s => ({
            state: s.state, family: s.state === 'live' ? this.spec(s.offer)?.family ?? null : null,
        }))
    }

    // ── the player's actions ───────────────────────────────────────────────────────────────────

    /**
     * Accept: the offer leaves the board. Returns the offer, or null if it is no longer live (it
     * expired while the panel was up — food offers live ~2 real minutes).
     */
    take (offerId, nowH, parS) {
        if (!this.isLive(offerId, nowH)) return null
        const s = this._slotOf(offerId)
        s.state = 'taken'
        // FEAT-113: the delivery deadline. No par (a caller with no planned route) → no deadline.
        s.offer.dueH = parS > 0 ? nowH + this.deadlineH(s.offer, parS) : Infinity
        return s.offer
    }

    /**
     * FEAT-113: how long the job may be in hand, in game hours — par (real seconds, one game minute
     * each) × (1 + the thing's slack). One function behind take(), the card and Larry's panel.
     */
    deadlineH (offer, parS) {
        return parS / (DAY_PARAMS.dayLengthSec / 24) * (1 + this.spec(offer).deadlineSlack)
    }

    /** A taken offer was finished — ANY settled result, D included. The slot locks (see header). */
    complete (offerId, nowH) { return this._lock(offerId, nowH) }

    /**
     * A taken offer was CANCELLED — the player phoned the customer (the cancel button is the only
     * caller). The slot locks exactly as for a completion: never free, even when the original timer
     * has already run out.
     */
    abandon (offerId, nowH) { return this._lock(offerId, nowH) }

    /** THE LOCK RULE: a fresh full expiry from now (or the source's lockH). */
    _lock (offerId, nowH) {
        this.advance(nowH)
        const s = this._takenSlot(offerId)
        if (!s) return false
        this._lockAt(s, this._now)
        return true
    }

    _lockAt (s, t) {
        s.state = 'locked'
        s.until = t + (SOURCES[s.type].lockH ?? s.offer.lifeH)
    }

    _slotOf (offerId) {
        if (typeof offerId !== 'string') return null
        const [poiId, slot] = offerId.split('#')
        if (slot?.[0] === 'b') return this._budget[Number(slot.slice(1))] ?? null
        return this._always.get(poiId)?.[Number(slot)] ?? null
    }

    _takenSlot (offerId) {
        const s = this._slotOf(offerId)
        return s && s.state === 'taken' && s.offer.id === offerId ? s : null
    }

    // ── what an offer IS (lazy, seeded) ────────────────────────────────────────────────────────

    /**
     * The offer's content, rolled on first read from its own `spec` stream — so WHEN it is read never
     * changes WHAT it is. Null only if the source has no built thing to post (a table gap).
     *
     * { family, thingId, phrase, massKg, person, bonus: {rewardId,name,gate}|null, payMult,
     *   destKind: 'poi'|'roadside'|null, destPick, placeName, bundles: number|null, to: string[]|null,
     *   passenger: boolean, shape: 'courier'|'fetch', from: string[]|null, load: string|null,
     *   deadlineSlack: number }
     * deadlineSlack (FEAT-113): the deadline is par × (1 + it) from accept — see deadlineH().
     * bundles is the haul load's piece count (FEAT-88), null for every other family. It is drawn on
     * its OWN `bundles` stream: one more draw on `spec` would shift the destination and place name
     * of every existing offer on every seed.
     * destKind is null for papers (the paper route picks its own customers). destPick is the uniform
     * number the mission planner uses to choose among the destination POIs it can actually reach;
     * placeName is the roadside name, rolled always, used whenever no POI destination fits.
     * to is the thing's destination classes (FEAT-100): a tagged thing always goes to a POI.
     */
    spec (offer) {
        if (!offer) return null
        if (offer._spec !== undefined) return offer._spec
        const src = SOURCES[offer.type]
        const r = rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:spec`)
        const things = THINGS.filter(t => postsThing(t, offer.type)
            && src.families.includes(t.family) && BUILT_FAMILIES.has(t.family))
        if (!things.length) return (offer._spec = null)
        // FAMILY FIRST, then the thing (owner, 2026-10-12: too little freight): every family a source
        // posts gets an even share there, however many phrases each has. Its own stream, so the
        // `spec` draws below — destination, place name, bonus — keep their order.
        const families = [...new Set(things.map(t => t.family))]
        const family = pick(rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:family`), families)
        const thing = pick(r, things.filter(t => t.family === family))
        const [lo, hi] = thing.massKg
        const m = lo + (hi - lo) * r()
        const massKg = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10
        const people = this._names.get(offer.poiId)?.people ?? []
        const person = people.length ? people[Math.floor(r() * people.length)] : null

        // BONUS (25 %). The gate is drawn only among gates this source actually has a reward for,
        // so a source whose list lacks an S reward still posts bonuses at the full share instead of
        // silently rolling a gate it cannot fill. A source with no rewards at all never bonuses.
        let bonus = null
        const bonusRoll = r(), gateRoll = r(), rewardRoll = r()
        if (bonusRoll < BONUS_CHANCE) {
            const pool = REWARDS.filter(w => w.pools.includes(offer.type))
            const w = {}
            for (const g of Object.keys(GATE_WEIGHTS)) if (pool.some(x => x.gates.includes(g))) w[g] = GATE_WEIGHTS[g]
            if (Object.keys(w).length) {
                const gate = pickWeighted(gateRoll, w)
                const at = pool.filter(x => x.gates.includes(gate))
                const reward = at[Math.floor(rewardRoll * at.length)]
                bonus = { rewardId: reward.id, name: reward.name, gate }
            }
        }

        const papers = thing.family === 'papers'
        const destRoll = r(), destPick = r()
        const placeName = this._placeName(r)
        let bundles = null
        if (thing.family === 'haul') {
            const [bLo, bHi] = HAUL_BUNDLES
            bundles = bLo + Math.floor(rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:bundles`)() * (bHi - bLo + 1))
        }
        // FEAT-102: a FETCH when this source is one of the thing's fetchers — go to a pickup (a POI of
        // `from`), park there, bring it back. Otherwise the courier shape, as built.
        const fetch = !!thing.fetchBy?.includes(offer.type)
        return (offer._spec = {
            deadlineSlack: thing.deadlineSlack ?? DEADLINE_SLACK[thing.family],   // FEAT-113
            shape: fetch ? 'fetch' : 'courier', from: fetch ? (thing.fetchFrom ?? thing.pools) : null,
            family: thing.family, thingId: thing.id, phrase: thing.phrase, person, bonus,
            massKg: bundles ? bundles * HAUL_BUNDLE_KG : massKg, bundles,
            // ÷ HAUL_PAR_SLACK: the haul's par is that much longer and pay rides par (data/offers.js).
            payMult: (bonus ? BONUS_PAY_MULT : 1) * (bundles ? bundles * HAUL_PAY_PER_BUNDLE / HAUL_PAR_SLACK : 1)
                * (thing.load ? 1 + FREIGHT_PAY_PER_KG * massKg : 1),   // FEAT-96: freight's weight bonus on pay
            destKind: papers ? null : (thing.to || fetch || destRoll < DEST_POI_CHANCE ? 'poi' : 'roadside'),
            destPick, placeName, to: thing.to ?? null, passenger: !!thing.passenger,
            load: thing.load ?? null,   // FEAT-96: the freight load (data/freight.js) — null otherwise
            // FEAT-97: a fragile load's tolerance and hit sound (src/fragile.js) — null otherwise.
            fragile: thing.family === 'fragile'
                ? { shockFloorG: thing.shockFloorG, breakG: thing.breakG, sound: thing.sound } : null,
        })
    }

    /**
     * The offers currently in the OTHER slots at this offer's POI (live or taken) that were rolled
     * BEFORE it — ties broken by slot. Every sibling that is live alongside this offer is in here:
     * an older offer still in its slot was necessarily live when this one was born.
     */
    olderSiblings (offer) {
        return this._at(offer.poiId)
            .filter(s => s.slot !== offer.slot && (s.state === 'live' || s.state === 'taken')
                && (s.offer.bornH < offer.bornH || (s.offer.bornH === offer.bornH && s.slot < offer.slot)))
            .map(s => s.offer)
    }

    /**
     * Plan an offer's route so that NO TWO OFFERS AT A POI ARE THE SAME JOB (owner, 2026-09-27: two
     * identical takeout orders to the gas station). Two offers are the same job when they carry the
     * same thing AND the same reward AND go to the same place; the food vendor posts only takeout,
     * so for it the destination is what has to differ.
     *
     * The rule is resolved oldest-first: each older sibling is planned first (memoised), and an
     * offer whose thing + reward match a sibling's must avoid that sibling's destination — its
     * planner is handed those POI ids to exclude, and a roadside drop re-rolls its place name until
     * it differs. Older offers therefore never change under the player; only the newcomer yields.
     *
     * @param {object} offer
     * @param {(offer:object, excludePoiIds:Set<string>) => object|null} planOne — the mission
     *        planner for one offer (main.js wraps MissionSystem.planOffer); memoised here on
     *        `offer.route`, and `route.placeName` is set on a roadside drop.
     */
    planDistinct (offer, planOne) {
        if (offer.route !== undefined) return offer.route
        const sp = this.spec(offer)
        if (!sp) return (offer.route = null)
        const same = []
        for (const o of this.olderSiblings(offer)) {
            const r = this.planDistinct(o, planOne), so = this.spec(o)
            if (r && so && so.thingId === sp.thingId
                && (so.bonus?.rewardId ?? null) === (sp.bonus?.rewardId ?? null)) same.push(r)
        }
        const m = planOne(offer, new Set(same.map(r => r.endPoiId).filter(Boolean)))
        if (m && !m.endPoiId) {
            const used = new Set(same.filter(r => !r.endPoiId).map(r => r.placeName))
            let name = sp.placeName
            for (let n = 1; used.has(name) && n <= 32; n++) {
                name = this._placeName(rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:place:${n}`))
            }
            m.placeName = name
        }
        return (offer.route = m)
    }

    /**
     * The planner's destination wish for an offer (MissionSystem.planOffer `dest`). A generic thing
     * goes to any other POI on its DEST_POI_CHANCE roll, else to a roadside spot. A fetch wishes for
     * its pickup (see below). A thing with a
     * `to` (FEAT-100) goes only to a POI carrying one of those tags, and is STRICT: no candidate in
     * reach means no route, never a roadside drop — roadside spots are for generic things only.
     *
     * @param {object} offer
     * @param {object[]} pois — the roster (PoiSystem.list())
     * @param {Set<string>} exclude — POI ids planDistinct says to avoid
     */
    destWish (offer, pois, exclude) {
        const sp = this.spec(offer)
        if (sp.destKind !== 'poi') return { kind: 'roadside' }
        // A FETCH (FEAT-102) wishes for its PICKUP — a POI of `from`, strictly — and says so, so the
        // planner returns the same way and settles back here.
        const want = sp.shape === 'fetch' ? sp.from : sp.to
        const fits = (q) => q.id !== offer.poiId && !exclude.has(q.id)
            && (!want || want.some(t => q.tags?.includes(t)))
        return { kind: 'poi', pick: sp.destPick, pois: pois.filter(fits), strict: !!want, fetch: sp.shape === 'fetch' }
    }

    /** A seeded stream for the mission planner's own rolls on this offer (route determinism). */
    routeRng (offer) { return rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:route`) }

    /** A roadside drop's name: a stand-alone landmark, or "the <last> <place noun>". */
    _placeName (r) {
        const lm = r() < 0.5
        const a = r(), b = r(), n = 1 + Math.floor(r() * 9)
        if (lm) return LANDMARKS[Math.floor(a * LANDMARKS.length)].replace('#', String(n))
        return `the ${LAST_NAMES[Math.floor(a * LAST_NAMES.length)]} ${PLACE_NOUNS[Math.floor(b * PLACE_NOUNS.length)]}`
    }

    // ── names ──────────────────────────────────────────────────────────────────────────────────

    /** The POI's rolled name, or null for a giver named by the person alone. */
    poiName (poiId) { return this._names.get(poiId)?.name ?? null }

    /** The POI's people (sources only; [] elsewhere). */
    people (poiId) { return this._names.get(poiId)?.people ?? [] }

    /** How a sentence names a POI as a DESTINATION: its name, or its first person's first name. */
    placeLabel (poiId) {
        const n = this._names.get(poiId)
        if (!n) return null
        return n.name ?? (n.people[0] ? personLabel(n.people[0]) : null)
    }

    /**
     * Roll every POI's name and people once, at construction, deduplicated within the region: a
     * collision re-rolls that POI on the next attempt stream, so two Deb's Burgers never share a
     * board. People's full names are kept unique the same way, and so are HOUSEHOLD surnames —
     * "Pruitt's" and "Pruitt house" are different strings but read as one family twice.
     */
    _rollNames () {
        const usedPoi = new Set(), usedPeople = new Set(), usedHouse = new Set()
        for (const id of [...this._pois.keys()].sort()) {
            const q = this._pois.get(id)
            let out = null
            for (let attempt = 0; attempt < 32 && !out; attempt++) {
                const cand = this._rollPoi(q, rngFor(`poi:${this._seed}:${id}:names:${attempt}`))
                // Fixed placeholder names ("the gas station" ×2) are not rolled, so they cannot clash.
                const fixed = cand.name === FIXED_NAMES[q.type]
                const full = cand.people.filter(p => p.last).map(p => `${p.first} ${p.last}`)
                const clash = (cand.name && !fixed && usedPoi.has(cand.name))
                    || new Set(full).size !== full.length          // two Deb Hadleys in one household
                    || full.some(f => usedPeople.has(f))
                    || (HOUSEHOLDS.includes(q.type) && usedHouse.has(cand.people[0]?.last))
                if (!clash || attempt === 31) out = cand
            }
            if (out.name) usedPoi.add(out.name)
            if (HOUSEHOLDS.includes(q.type)) usedHouse.add(out.people[0]?.last)
            for (const p of out.people) if (p.last) usedPeople.add(`${p.first} ${p.last}`)
            this._names.set(id, out)
        }
    }

    _rollPoi (q, r) {
        if (q.type === 'larrysHouse') {
            // Larry is just "Larry" and posts papers only (owner, 2026-09-26).
            return { name: FIXED_NAMES.larrysHouse,
                     people: [{ sex: 'male', first: 'Larry', nick: null, last: null }] }
        }
        const src = SOURCES[q.type]
        const forms = NAME_FORMS[q.type]
        const people = []
        // Sources roll their people; so does a non-source with name forms (the office, the school),
        // whose first person is only there to name it.
        if (src || forms) {
            // A source with no name forms is named by its person alone (a stranded motorist), and is
            // ONE person — the card says "Earl needs…", and a second voice from the same wreck would
            // read oddly.
            const n = forms ? Number(pickWeighted(r(), PEOPLE_PER_POI)) : 1
            for (let i = 0; i < n; i++) {
                const p = this._rollPerson(r)
                if (HOUSEHOLDS.includes(q.type) && i > 0) p.last = people[0].last
                people.push(p)
            }
        }
        const name = forms && people.length ? this._fillForm(pick(r, forms), people[0], q.type, r)
                   : FIXED_NAMES[q.type] ?? null
        return { name, people }
    }

    /** One name form filled in (data/offer-names.js header). Each slot draws only if present. */
    _fillForm (form, p, type, r) {
        return form
            .replace('{the}', () => (r() < POI_THE_CHANCE ? 'The ' : ''))
            .replace('{adj}', () => (r() < POI_ADJECTIVE_CHANCE ? pick(r, POI_ADJECTIVES) + ' ' : ''))
            .replace('{biz}', () => pick(r, BUSINESS_TYPES[type]))
            .replace('{first}', () => p.first)
            .replace('{last}', () => p.last)
    }

    _rollPerson (r) {
        // Sex is rolled FIRST: it picks the first-name list now and the portrait pool later, so a
        // name and its picture always agree (owner, 2026-09-26).
        const sex = r() < FEMALE_CHANCE ? 'female' : 'male'
        const first = pick(r, FIRST_NAMES[sex])
        const nick = r() < NICKNAME_CHANCE ? pick(r, NICKNAMES) : null
        const last = pick(r, LAST_NAMES)
        return { sex, first, nick, last }
    }

    // ── the card ───────────────────────────────────────────────────────────────────────────────

    /**
     * The card view-model for one offer. Pure data — map2d draws it and knows no economy.
     *
     * @param {object} offer
     * @param {object} ctx
     * @param {number} ctx.nowH
     * @param {number} [ctx.payTier]    economySystem.terms().payTier NOW (terms only freeze at accept)
     * @param {object|null} [ctx.route] the planned mission ({par, distance, endPoiId, placeName}) or null
     * @param {number} [ctx.customers]  paper route: stops on the planned tour
     * @returns {{family, portrait: {sex,name}|null, flavor: string|null, sentence: Array<{t:string,b?:boolean}>,
     *            pay: string|null, terms: string[], bonus: string|null, expiresInH: number}|null}
     */
    card (offer, { nowH, payTier = 1, route = null, customers = null } = {}) {
        const sp = this.spec(offer)
        if (!sp) return null
        const n = this._names.get(offer.poiId)
        const sentence = [{ t: personLabel(sp.person), b: true }]
        if (sp.family === 'papers') {
            sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true }, { t: ' delivered' })
            if (customers) sentence.push({ t: ' to ' }, { t: `${customers} customers`, b: true })
            sentence.push({ t: '.' })
        } else {
            if (n?.name) sentence.push({ t: ` at ${n.name}` })
            const dest = route?.endPoiId ? this.placeLabel(route.endPoiId) : (route?.placeName ?? sp.placeName)
            if (sp.bundles) {
                sentence.push({ t: ' needs ' }, { t: `${sp.bundles} bundles of ${sp.phrase}`, b: true },
                              { t: ' hauled to ' }, { t: dest, b: true }, { t: '.' })
            } else {
                // A passenger is the poster themselves: "Earl needs a ride to Rust Belt Auto." A fetch
                // names its pickup: "Earl needs a full jerry can fetched from Pump & Go."
                // (a template literal: test/offer-board.mjs's import scan would read the quoted form as an import)
                const verb = sp.passenger ? ' to ' : sp.shape === 'fetch' ? ` fetched from ` : ' delivered to '
                sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true }, { t: verb },
                              { t: dest, b: true }, { t: '.' })
            }
        }
        const par = route?.par
        const pay = par > 0 ? `Base pay $${formatMoney(basePay(par, payTier, sp.payMult))}`
                  : null
        const terms = []
        if (route?.distance > 0) terms.push(`${(route.distance / 1000).toFixed(1)} km`)
        terms.push(`${sp.massKg} kg`)
        const expiresInH = offer.expiresH - nowH
        // A never-expiring offer (Larry's) shows no timer at all (owner, 2026-10-07).
        if (isFinite(expiresInH)) terms.push(`expires in ${formatGameDuration(expiresInH)}`)
        if (par > 0) terms.push(`deliver within ${formatGameDuration(this.deadlineH(offer, par))}`)   // FEAT-113: from accept
        return {
            family: sp.family,
            badge: jobBadge(sp),
            // The giver's portrait. PLACEHOLDER art today; `sex` is the field that will pick the
            // portrait pool (ruled 2026-09-26: sex is rolled first so name and picture agree).
            portrait: sp.person ? { sex: sp.person.sex, name: sp.person.first } : null,
            // The giver's short line of dialogue on the parked panel. OWNER-AUTHORED and not written
            // yet (2026-09-28) — null means the panel shows its placeholder. When the lines exist
            // they belong in a data table (data/offers.js), picked here from the offer's spec stream.
            flavor: null,
            sentence,
            pay,
            terms,
            // Larry's card shows base pay only (owner ruling) — papers never roll a bonus anyway.
            bonus: sp.bonus ? `Bonus: ${sp.bonus.name} — ${gateText(sp.bonus.gate)}` : null,
            expiresInH,
        }
    }
}
