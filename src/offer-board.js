// ── FEAT-67: the mission board — who posts work, what is on offer, and when it turns over ──────
//
// Spec: .planning/todos/pending/feat-67-visible-offer-board.md (every ruling there is binding).
//
// WHAT THIS OWNS. Every mission-source POI has a fixed number of SLOTS (data/offers.js SOURCES), and
// every slot is always full. When an offer expires a new one is rolled into its slot straight away,
// so the expiry length IS the turnover rate. A slot is empty in exactly two cases:
//   • after a COMPLETION — until the taken offer's ORIGINAL expiry (and at least the source's
//     `minEmptyH` after the completion; Larry's 24 h stops two paper rounds in one day);
//   • after a CANCEL — locked for the offer's FULL expiry length, counted from the cancel. The time
//     left on the original timer plays no part, so cancelling an expired offer is not free.
// While an offer is TAKEN (accepted, being driven) its slot shows nothing and its timer keeps
// running.
//
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
// Math.random. The streams per offer are keyed `offer:<seed>:<poiId>:<slot>:<k>:<stream>`, where k
// counts the offers that slot has held: `life` (how long it lasts), `spec` (what it is), `route`
// (the mission planner's rolls — handed out by routeRng). Per-POI streams (names, people, the
// generic giver's expiry centre) are keyed `poi:<seed>:<poiId>:<what>`.
//
// Offer ids are `${poiId}#${slot}#${k}` — stable, unique for the run, and readable in a log.

import {
    THINGS, REWARDS, SOURCES, EXPIRY_NOISE, BONUS_CHANCE, BONUS_PAY_MULT, GATE_WEIGHTS,
    DEST_POI_CHANCE, PEOPLE_PER_POI, HAUL_BUNDLES, HAUL_BUNDLE_KG, HAUL_PAY_PER_BUNDLE, HAUL_PAR_SLACK,
} from '../data/offers.js'
import {
    FIRST_NAMES, FEMALE_CHANCE, LAST_NAMES, NICKNAMES, NICKNAME_CHANCE, POI_ADJECTIVES,
    POI_ADJECTIVE_CHANCE, POI_THE_CHANCE, BUSINESS_TYPES, PLACE_NOUNS, LANDMARKS,
} from '../data/offer-names.js'
import { djb2, mulberry32 } from './seed.js'
import { basePay } from './economy.js'

/**
 * The mission families that have gameplay behind them today. fragile / demolition / freight are in
 * the tables (so the card, the colours and the lists are ready) but have no code, so they must
 * simply never roll — not be half-built. Add a family here the day its mission ships.
 */
export const BUILT_FAMILIES = new Set(['delivery', 'papers', 'haul'])

// Fixed names for roster types that are NOT sources and have no word list — they can still be a
// DESTINATION, and "delivered to <nothing>" is not a sentence. PLACEHOLDERS: the owner authors
// names; add these types to BUSINESS_TYPES (data/offer-names.js) to give them rolled ones.
const FIXED_NAMES = {
    larrysHouse: "Larry's",
    momsHouse:   "Mom's",
    gasStation:  'the gas station',
    tackleShop:  'the tackle shop',
}

const rngFor = (key) => mulberry32(djb2(key))
const pick = (r, list) => list[Math.floor(r() * list.length)]

/** Weighted pick over an object of { key: weight }, driven by one uniform draw `u`. */
function pickWeighted (u, weights) {
    const keys = Object.keys(weights)
    const total = keys.reduce((s, k) => s + weights[k], 0)
    let x = u * total
    for (const k of keys) { x -= weights[k]; if (x < 0) return k }
    return keys[keys.length - 1]
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
     * @param {Array<{id:string,type:string,modelKey?:string}>} o.pois — PoiSystem.list(), the roster
     * @param {number} o.nowH        the absolute game clock at creation (DaySystem.clockH())
     * @param {(modelKey:string)=>('home'|'person'|undefined)} [o.giverNameOf] — the giver-naming flag
     *        of a model (data/prop-models.js `giverName`). Injected so this module reads no registry.
     */
    constructor ({ seed, pois, nowH, giverNameOf = () => undefined }) {
        this._seed = seed >>> 0
        this._now = nowH
        this._pois = new Map()
        for (const q of pois || []) this._pois.set(q.id, q)
        this._giverNameOf = giverNameOf
        this._names = new Map()       // poiId → { name, people, giverName }
        this._slots = []              // every slot on the board
        this._bySource = new Map()    // poiId → slots[]
        this._rollNames()

        // Deterministic source order: the roster list's order is an assignment artefact, so sort by
        // id — the same discipline poi.js follows for placement.
        for (const id of [...this._pois.keys()].sort()) {
            const q = this._pois.get(id)
            const src = SOURCES[q.type]
            if (!src) continue
            const slots = []
            for (let i = 0; i < src.slots; i++) {
                const s = { poiId: id, type: q.type, slot: i, k: -1, offer: null, state: 'live', until: 0 }
                this._roll(s, nowH)
                // DESYNC AT WORLD START: each slot's first offer is given a random AGE, uniform over its
                // own rolled life, so it starts partway through. Starting every timer at L/2 would line
                // them all up — the thing to avoid. (Gated over 2000 seeds.)
                const age = rngFor(`offer:${this._seed}:${id}:${i}:0:age`)() * s.offer.lifeH
                s.offer.bornH = nowH - age
                s.offer.expiresH = s.offer.bornH + s.offer.lifeH
                slots.push(s)
                this._slots.push(s)
            }
            this._bySource.set(id, slots)
        }
    }

    // ── time ───────────────────────────────────────────────────────────────────────────────────

    /** Move the board's clock forward to `nowH`, replaying every expiry since. Never moves back. */
    advance (nowH) {
        if (!(nowH > this._now)) return
        this._now = nowH
        for (const s of this._slots) this._advanceSlot(s)
    }

    _advanceSlot (s) {
        // Bounded: a food slot turns over ~12×/day, so even a multi-day jump is a few dozen rolls.
        for (let guard = 0; guard < 100000; guard++) {
            if (s.state === 'live' && s.offer.expiresH <= this._now) this._roll(s, s.offer.expiresH)
            else if ((s.state === 'empty' || s.state === 'locked') && s.until <= this._now) this._roll(s, s.until)
            else return
        }
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

    /** An offer's rolled lifetime: the source's centre (per-POI for a [lo,hi] range) ± EXPIRY_NOISE. */
    _lifeH (poiId, type, slot, k) {
        let centre = SOURCES[type].expiryH
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

    /** Every source POI id, sorted. */
    sources () { return [...this._bySource.keys()] }

    /** The live offers at a POI, in slot order. Taken, empty and locked slots show nothing. */
    offers (poiId, nowH) {
        this.advance(nowH)
        const slots = this._bySource.get(poiId)
        if (!slots) return []
        return slots.filter(s => s.state === 'live' && this.spec(s.offer)).map(s => s.offer)
    }

    /** Is this exact offer still on the board (not expired, not taken)? The accept guard. */
    isLive (offerId, nowH) {
        this.advance(nowH)
        const s = this._slotOf(offerId)
        return !!s && s.state === 'live' && s.offer.id === offerId
    }

    /**
     * The absolute clock at which the NEXT slot at this POI turns over — an offer expiring, or an
     * empty/locked slot re-rolling. That is the moment a new offer appears there. A taken slot does
     * not count: what happens to it depends on the player. Null when nothing is scheduled.
     */
    nextTurnoverH (poiId, nowH) {
        this.advance(nowH)
        let best = null
        for (const s of this._bySource.get(poiId) || []) {
            const t = s.state === 'live' ? s.offer.expiresH
                    : (s.state === 'empty' || s.state === 'locked') ? s.until : null
            if (t != null && (best == null || t < best)) best = t
        }
        return best
    }

    /** Slot states at a POI, for the map's grey-when-empty diamond: [{state, family}]. */
    slotStates (poiId, nowH) {
        this.advance(nowH)
        return (this._bySource.get(poiId) || []).map(s => ({
            state: s.state, family: s.state === 'live' ? this.spec(s.offer)?.family ?? null : null,
        }))
    }

    // ── the player's actions ───────────────────────────────────────────────────────────────────

    /**
     * Accept: the offer leaves the board. Returns the offer, or null if it is no longer live (it
     * expired while the panel was up — food offers live ~2 real minutes). Its timer keeps running.
     */
    take (offerId, nowH) {
        if (!this.isLive(offerId, nowH)) return null
        const s = this._slotOf(offerId)
        s.state = 'taken'
        return s.offer
    }

    /**
     * A taken offer was finished — ANY settled result, D included. The slot waits out the offer's
     * original expiry (and at least the source's `minEmptyH` from now), then re-rolls; finished
     * after expiry, it re-rolls at once (unless minEmptyH says otherwise).
     */
    complete (offerId, nowH) {
        this.advance(nowH)
        const s = this._takenSlot(offerId)
        if (!s) return false
        s.state = 'empty'
        s.until = Math.max(s.offer.expiresH, this._now + (SOURCES[s.type].minEmptyH ?? 0))
        this._advanceSlot(s)
        return true
    }

    /**
     * A taken offer was CANCELLED — the player phoned the customer (the cancel button is the only
     * caller). The slot locks for the offer's full expiry length from now: the giver is unhappy with
     * you. Never free, even when the original timer has already run out.
     */
    abandon (offerId, nowH) {
        this.advance(nowH)
        const s = this._takenSlot(offerId)
        if (!s) return false
        s.state = 'locked'
        s.until = this._now + s.offer.lifeH
        return true
    }

    _slotOf (offerId) {
        if (typeof offerId !== 'string') return null
        const [poiId, slot] = offerId.split('#')
        return this._bySource.get(poiId)?.[Number(slot)] ?? null
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
     *   destKind: 'poi'|'roadside'|null, destPick, placeName, bundles: number|null }
     * bundles is the haul load's piece count (FEAT-88), null for every other family. It is drawn on
     * its OWN `bundles` stream: one more draw on `spec` would shift the destination and place name
     * of every existing offer on every seed.
     * destKind is null for papers (the paper route picks its own customers). destPick is the uniform
     * number the mission planner uses to choose among the destination POIs it can actually reach;
     * placeName is the roadside name, rolled always, used whenever no POI destination fits.
     */
    spec (offer) {
        if (!offer) return null
        if (offer._spec !== undefined) return offer._spec
        const src = SOURCES[offer.type]
        const r = rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:spec`)
        const things = THINGS.filter(t => t.pools.includes(offer.type)
            && src.families.includes(t.family) && BUILT_FAMILIES.has(t.family))
        if (!things.length) return (offer._spec = null)
        const thing = pick(r, things)
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
        return (offer._spec = {
            family: thing.family, thingId: thing.id, phrase: thing.phrase, person, bonus,
            massKg: bundles ? bundles * HAUL_BUNDLE_KG : massKg, bundles,
            // ÷ HAUL_PAR_SLACK: the haul's par is that much longer and pay rides par (data/offers.js).
            payMult: (bonus ? BONUS_PAY_MULT : 1) * (bundles ? bundles * HAUL_PAY_PER_BUNDLE / HAUL_PAR_SLACK : 1),
            destKind: papers ? null : (destRoll < DEST_POI_CHANCE ? 'poi' : 'roadside'),
            destPick, placeName,
        })
    }

    /**
     * The offers currently in the OTHER slots at this offer's POI (live or taken) that were rolled
     * BEFORE it — ties broken by slot. Every sibling that is live alongside this offer is in here:
     * an older offer still in its slot was necessarily live when this one was born.
     */
    olderSiblings (offer) {
        return (this._bySource.get(offer.poiId) || [])
            .filter(s => s.slot !== offer.slot && (s.state === 'live' || s.state === 'taken')
                && (s.offer.bornH < offer.bornH || (s.offer.bornH === offer.bornH && s.slot < offer.slot)))
            .map(s => s.offer)
    }

    /**
     * Plan an offer's route so that NO TWO OFFERS AT A POI ARE THE SAME JOB (owner, 2026-09-27: two
     * identical takeout orders to the gas station). Two offers are the same job when they carry the
     * same thing AND the same reward AND go to the same place; the burger joint posts only takeout,
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
     * collision re-rolls that POI on the next attempt stream, so two Deb's Burgers or two Hadley
     * places never share a board. People's full names are kept unique the same way.
     */
    _rollNames () {
        const usedPoi = new Set(), usedPeople = new Set()
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
                if (!clash || attempt === 31) out = cand
            }
            if (out.name) usedPoi.add(out.name)
            for (const p of out.people) if (p.last) usedPeople.add(`${p.first} ${p.last}`)
            this._names.set(id, out)
        }
    }

    _rollPoi (q, r) {
        if (q.type === 'larrysHouse') {
            // Larry is just "Larry" and posts papers only (owner, 2026-09-26).
            return { name: FIXED_NAMES.larrysHouse, giverName: null,
                     people: [{ sex: 'male', first: 'Larry', nick: null, last: null }] }
        }
        const src = SOURCES[q.type]
        const giverName = q.type === 'missionGiver' ? (this._giverNameOf(q.modelKey) ?? 'home') : null
        const people = []
        if (src) {
            // A giver named by the person alone (an RV, a broken-down car) is ONE person — the card
            // says "Earl needs…", and a second voice from the same wreck would read oddly.
            const n = giverName === 'person' ? 1 : Number(pickWeighted(r(), PEOPLE_PER_POI))
            for (let i = 0; i < n; i++) {
                const p = this._rollPerson(r)
                // A home is a household: everyone there shares the first person's last name.
                if (giverName === 'home' && i > 0) p.last = people[0].last
                people.push(p)
            }
        }
        let name = null
        if (giverName === 'home') name = `the ${people[0].last} place`
        else if (giverName === 'person') name = null
        else if (src?.nameForm === 'owned' && BUSINESS_TYPES[q.type] && people.length) {
            const adj = r() < POI_ADJECTIVE_CHANCE ? pick(r, POI_ADJECTIVES) + ' ' : ''
            name = `${people[0].first}'s ${adj}${pick(r, BUSINESS_TYPES[q.type])}`
        } else if (BUSINESS_TYPES[q.type]) {
            const the = r() < POI_THE_CHANCE ? 'The ' : ''
            const adj = r() < POI_ADJECTIVE_CHANCE ? pick(r, POI_ADJECTIVES) + ' ' : ''
            name = `${the}${adj}${pick(r, BUSINESS_TYPES[q.type])}`
        } else {
            name = FIXED_NAMES[q.type] ?? null
        }
        return { name, people, giverName }
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
                sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true }, { t: ' delivered to ' },
                              { t: dest, b: true }, { t: '.' })
            }
        }
        const par = route?.par
        const pay = par > 0 ? `Base pay $${basePay(par, payTier, sp.payMult).toLocaleString('en-US')}`
                  : null
        const terms = []
        if (route?.distance > 0) terms.push(`${(route.distance / 1000).toFixed(1)} km`)
        terms.push(`${sp.massKg} kg`)
        const expiresInH = offer.expiresH - nowH
        terms.push(`expires in ${formatGameDuration(expiresInH)}`)
        return {
            family: sp.family,
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
