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
    THINGS, REWARDS, REWARD_CATS, RARE_PULL, PART_REWARD_CAT, RARITY_GATES, SOURCES, BUDGET_JOBS, EXPIRY_NOISE, BONUS_CHANCE, GATE_WEIGHTS,
    DEST_POI_CHANCE, PEOPLE_PER_POI, HAUL_STOCK, HAUL_STOCK_PRICE, HAUL_BUNDLE_KG, HAUL_PAY_PER_BUNDLE, HAUL_PAR_SLACK, FREIGHT_PAY_PER_KG, FREIGHT_TIP_MULT, DEADLINE_SLACK, NOT_A_DESTINATION,
    REWARD_VALUE, REQUISITION, FIRST_JOB, TRAITS, TRAIT_COUNT_WEIGHTS, MULTI_DROP, GIVER_LINES, GIVER_LINE_P,
} from '../data/offers.js'
import { PARTS } from '../data/parts.js'
import { ITEM_PRICE } from '../data/shop-stock.js'
import {
    FIRST_NAMES, FEMALE_CHANCE, LAST_NAMES, NICKNAMES, NICKNAME_CHANCE, POI_ADJECTIVES,
    POI_ADJECTIVE_CHANCE, POI_THE_CHANCE, BUSINESS_TYPES, NAME_FORMS, HOUSEHOLDS, PLACE_NOUNS, LANDMARKS,
} from '../data/offer-names.js'
import { djb2, mulberry32 } from './seed.js'
import { STOCK_WEIGHT } from '../data/stock-weights.js'   // the bonus reward pick shares the shelf's weights
import { basePay, payRange, formatMoney, rankTable, fragileLines } from './economy.js'
import { DAY_PARAMS } from './day.js'

/**
 * The mission families that have gameplay behind them today. demolition is in the tables (so the
 * card, the colours and the lists are ready) but has no code, so it must simply never roll — not
 * be half-built. Add a family here the day its mission ships.
 */
export const BUILT_FAMILIES = new Set(['delivery', 'papers', 'haul', 'freight', 'fragile', 'demolition'])

// Fixed names for roster types with no NAME_FORMS row (data/offer-names.js) — Larry, mom, and the
// gas station, which posts work but is still just "the gas station". A destination needs a name:
// "delivered to <nothing>" is not a sentence. PLACEHOLDERS: the owner authors names.
const FIXED_NAMES = {
    larrysHouse: "Larry's",
    momsHouse:   "Mom's",
    gasStation:  'the gas station',
}

const rngFor = (key) => mulberry32(djb2(key))

/**
 * FEAT-148: the giver's line for an offer, or null (no line written yet — the panel then shows no quote).
 * The second line (keyed on the thing) comes GIVER_LINE_P of the time; the first comes GIVER_LINE_P of the
 * time too, and always when the second did not. From the offer's OWN stream, so a revisit says the same
 * thing and no spec draw moves.
 */
export function giverLine (offerId, thingId) {
    const r = rngFor(`line:${offerId}`)
    const pick = (a) => a[Math.floor(r() * a.length)]
    const seconds = GIVER_LINES.byThing[thingId] ?? []
    const second = seconds.length && r() < GIVER_LINE_P ? pick(seconds) : null
    const first = GIVER_LINES.first.length && (r() < GIVER_LINE_P || !second) ? pick(GIVER_LINES.first) : null
    return [first, second].filter(Boolean).join(' ') || null
}

/** Can a `type` post this thing — as its courier giver (`pools`) or as a fetcher (`fetchBy`)? */
const postsThing = (t, type) => t.pools.includes(type) || !!t.fetchBy?.includes(type)

/** Every built thing a source `type` can post (empty for a non-source). */
const postable = (type) => {
    const src = SOURCES[type]
    return src ? THINGS.filter(t => postsThing(t, type) && src.families.includes(t.family) && BUILT_FAMILIES.has(t.family)) : []
}

/**
 * BUG-88: how many times planDistinct re-rolls a newcomer that duplicates an older sibling's thing or
 * finds no destination left. Each attempt is one route plan; past this the slot shows nothing.
 * ponytail: blind re-rolls. The tackle shop's worst case (9 of 16 things are fetches from one store)
 * leaves (9/16)^16 ≈ 1e-4 of slots empty; drawing without replacement fixes that if it ever shows.
 */
const RE_ROLLS = 16
const pick = (r, list) => list[Math.floor(r() * list.length)]

/** Weighted pick over an object of { key: weight }, driven by one uniform draw `u`. */
/** The bonus reward among eligible REWARDS rows `at`, for a uniform draw `u`: weighted by the stock
 *  table the auto-shop shelf uses (owner, 2026-10-22). A reward the table doesn't list weighs 1 [DEFAULT]. */
export const pickReward = (at, u) => at.find(x => x.id === pickWeighted(u, Object.fromEntries(at.map(x => [x.id, STOCK_WEIGHT[x.id] ?? 1]))))

/** FEAT-168: may an offer born at `bornH` (DaySystem.clockH, day 1 starts at 0) carry REWARDS row `w`? */
const dayAllows = (w, bornH) => !(w.minDay > Math.floor(bornH / 24) + 1)

/** FEAT-168: every reward — the REWARDS rows, then each carried part with no row, under its slot's
 *  category at its rarity's gates (data/offers.js PART_REWARD_CAT / RARITY_GATES). */
export const REWARD_LIST = [...REWARDS, ...Object.entries(PARTS)
    .filter(([id, p]) => p.massKg > 0 && !REWARDS.some(w => w.id === id))
    .map(([id, p]) => ({ id, name: p.name, kind: 'part', gates: RARITY_GATES[p.rarity], cat: PART_REWARD_CAT[p.slot] }))]

/** FEAT-168: the rewards in categories `cats` that an offer born at `bornH` may carry. */
export const rewardsIn = (cats, bornH) => REWARD_LIST.filter(w => cats.includes(w.cat) && dayAllows(w, bornH))

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
    if (sp.family === 'demolition') return 'Dm'
    return sp.shape === 'fetch' ? 'Fe' : 'C'
}

/** FEAT-97: a fragile thing's tolerance and hit sound, as a spec carries it (src/fragile.js) — null otherwise. */
const fragileOf = (thing) => thing.family === 'fragile'
    ? { tier: thing.tier, tierName: thing.tierName, shockFloorG: thing.shockFloorG, onePctG: thing.onePctG, breakG: thing.breakG, sound: thing.sound } : null

/** FEAT-65: a demolition gate as a whole percent of the site smashed (economy.js RANK_TABLE.demolition). */
const smashedPct = (gate, region) => Math.round(rankTable('demolition', region)[gate] * 100)

/** "S only" / "A or better" — how a card states a rank gate. */
export function gateText (gate) { return gate === 'S' ? 'S only' : `${gate} or better` }

/**
 * A bonus gate as the card prints it (FEAT-114, amendment §6). Haul ranks on the count delivered
 * (FEAT-138), so its gate prints the count, never the letter: "deliver 18+ bundles" (owner, 2026-10-23:
 * the letter only ever decides the item, so the card names the threshold). Fragile likewise prints
 * the condition it must arrive in: "arrives 83%+ intact" (owner, 2026-10-23) — its tier's line, eased
 * by the route's `km` (economy.js fragileLines). Freight's tier is
 * INTERNAL (owner, 2026-10-22): the load is the poster's, the roll only offers items its mass can
 * reach, so the bonus is simply earned on delivery. Courier keeps the letter.
 * `kind` is 'haul' | 'fragile' | 'freight' | anything else; `cargoId` is the haul cargo or the fragile tier.
 */
export function gateLine (gate, kind, region = 1, cargoId = 'firewood', km = 0) {
    // R-17 (owner, 2026-10-24): ONE grammar on every surface — "if 22+ bundles delivered", "if 80%+
    // intact", "upon delivery", "if B or better" — so the card, the live HUD line and the result read alike.
    if (kind === 'haul') return `if ${rankTable('haul', region, cargoId)[gate]}+ bundles delivered`
    if (kind === 'fragile') return `if ${Math.round(fragileLines(region, cargoId, km)[gate] * 100)}%+ intact`
    if (kind === 'freight') return 'upon delivery'
    if (kind === 'demolition') return `if ${smashedPct(gate, region)}%+ smashed`   // FEAT-65: the share of the site
    return `if ${gateText(gate)}`
}

/**
 * GAME-FEEL REVIEW 2026-10-23 (R-07): a reward's day-1 dollar value for the card — its part price, its
 * shelf price, or the consumables table. Null when nothing prices it (the card then names it bare).
 */
export function rewardValue (id) {
    return PARTS[id]?.price ?? ITEM_PRICE[id] ?? REWARD_VALUE[id] ?? null
}

/**
 * GAME-FEEL REVIEW 2026-10-23 (R-09): THE GOOD-DEED LINE. Every card now states the third thing a job
 * pays — the deed toward the camp (SM-INV-14: 1 at B or better, ½ at C) — in the same plain terms the
 * item line uses, so the three promises (pay · tip · deed) read alike on every type. Before this the
 * deed rode an INTERNAL letter on haul, freight and fragile (owner, 2026-10-23: no letter shown
 * anywhere) and a player could finish a job and see "+0.5 good deed", or nothing, with no rule they
 * could have read first. Freight's deed is set by the posted mass, so the card says so up front.
 */
export function deedLine (kind, region = 1, cargoId = 'firewood', km = 0, massKg = 0) {
    // R-19 (owner, 2026-10-24): deeds are a currency, so they are always a NUMERAL — "1", "1/2" — never
    // "one" or "half"; and the gate is stated in the job's own axis (gateLine's grammar).
    if (kind === 'haul') return `Deed: 1 ${gateLine('B', kind, region, cargoId)} · 1/2 at ${rankTable('haul', region, cargoId).C}+`
    if (kind === 'fragile') return `Deed: 1 ${gateLine('B', kind, region, cargoId, km)} · 1/2 at ${Math.round(fragileLines(region, cargoId, km).C * 100)}%+`
    if (kind === 'freight') {
        // R-18: every freight load earns at least 1/2 (its C line is 0 kg); the posted kg decides which.
        const t = rankTable('freight', region)
        return massKg >= t.B ? 'Deed: 1 upon delivery' : `Deed: 1/2 upon delivery — under ${t.B} kg`
    }
    if (kind === 'demolition') return `Deed: 1 ${gateLine('B', kind, region)} · 1/2 at ${smashedPct('C', region)}%+`
    return 'Deed: 1 if B or better · 1/2 at C'
}

/**
 * What one haul piece costs to load (FEAT-114 §5b): HAUL_STOCK_PRICE of the job's base pay per piece,
 * to the cent. `pieceMult` is the haul spec's per-piece payMult.
 */
export function stockPrice (par, payTier, pieceMult) {
    return Math.round(HAUL_STOCK_PRICE * basePay(par, payTier, pieceMult) * 100) / 100
}

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
    // BUG-136: a FLOORED modulo. The opening's evening is day 0, before the clock's zero (18:00 is −6 h), and `%`
    // keeps the sign: 22:00 on day 0 read "Day 0, -2 am".
    const mins = ((t % 1440) + 1440) % 1440
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
     * @param {number} [o.region]    the story region (1-based) — which rank row a bonus gate reads
     */
    constructor ({ seed, pois, nowH, region = 1 }) {
        this._seed = seed >>> 0
        this._region = region
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
        // FEAT-103: THE REQUISITION — a third slot kind (data/offers.js REQUISITION). Each line sits at
        // its source, the nearest POI of its `from` type to the camp (ties to the id), and _at() shows
        // it at the camp too: one offer, two map tags. 'closed' until openLines(); then 'live' with no
        // expiry, 'taken', and 'done' once delivered. Never in _always or _budget, so advance() never
        // touches it, and never anyone's older sibling, so no ordinary offer plans differently for it.
        const camp = (pois || []).find(q => q.type === 'expeditionCamp')
        this._campId = camp?.id ?? null
        const d2 = (q) => (q.x - camp.x) ** 2 + (q.z - camp.z) ** 2
        this._lines = !camp ? [] : REQUISITION.map((line, i) => {
            const src = (pois || []).filter(q => q.type === line.from)
                .sort((a, b) => (d2(a) - d2(b)) || (a.id < b.id ? -1 : 1))[0]
            return src && { poiId: src.id, type: src.type, slot: `r${i}`, k: 0, line, offer: null, state: 'closed', until: 0 }
        }).filter(Boolean)
        this._slots.push(...this._lines)
        // FEAT-147: THE FIRST JOB — a fourth slot kind, one `f0` at mom's (data/offers.js FIRST_JOB).
        // 'closed' until the opening calls openFirst(); then 'live' with no expiry, 'taken' with no deadline
        // (BUG-117), and 'done' for good on its end (main.js offers no abandon for it, so in a run that is the delivery). Outside _slots altogether (_at and clearRoutes add it), so advance(), the
        // board census and every "always-on + budget" count stay exactly as they were.
        const mom = (pois || []).find(q => q.type === 'momsHouse')
        this._first = mom ? { poiId: mom.id, type: mom.type, slot: 'f0', k: 0, first: true, offer: null, state: 'closed', until: 0 } : null
    }

    /**
     * FEAT-147: post the first job at mom's. Idempotent (true only when it posted), like openLines. Its
     * spec is FIXED but shaped like any rolled courier spec — no `line` — so the card, pay, settle and deed
     * are the ordinary ones: the owner's "same rules" principle (2026-11-02). Except the DEADLINE (BUG-117,
     * owner 11-06: "this first mission must not be able to expire"): take() gives it none, as it gives a line none.
     */
    openFirst (nowH) {
        const s = this._first
        if (s?.state !== 'closed') return false
        const t = FIRST_JOB
        s.state = 'live'
        s.offer = {
            id: `${s.poiId}#${s.slot}#0`, poiId: s.poiId, type: s.type, slot: s.slot, k: 0,
            bornH: nowH, lifeH: Infinity, expiresH: Infinity, route: undefined,
            _spec: {
                first: true, family: t.family, thingId: t.id, phrase: t.phrase, person: t.person, bonus: null,
                traits: [], traitNames: [], tipMult: 1, thresholdScale: 1, deeds: null,
                shape: 'courier', from: null, stops: null, multiPhrase: null,
                massKg: t.massKg, stock: null, payMult: 1,
                destKind: 'poi', targets: null, destPick: 0, placeName: null, to: t.to, passenger: false,
                load: null, loose: null, atPickup: null, fragile: null,
                deadlineSlack: DEADLINE_SLACK[t.family],
            },
        }
        return true
    }

    /** FEAT-147: the first job's state — 'closed' | 'live' | 'taken' | 'done' — or null with no mom on the roster. */
    firstState () { return this._first?.state ?? null }

    /**
     * FEAT-103: open the requisition — main.js calls it once the run holds ECONOMY_PARAMS.campDeeds
     * good deeds. Idempotent: true only when it opened a line, so a caller logging board calls
     * (FEAT-42's save) sees one event, not one per poll. Every line's spec is FIXED (nothing rolled):
     * the camp is its only destination, no person, no bonus, no pay.
     */
    openLines (nowH) {
        let opened = false
        for (const s of this._lines) {
            if (s.state !== 'closed') continue
            opened = true
            const t = s.line
            s.state = 'live'
            s.offer = {
                id: `${s.poiId}#${s.slot}#0`, poiId: s.poiId, type: s.type, slot: s.slot, k: 0,
                bornH: nowH, lifeH: Infinity, expiresH: Infinity, route: undefined,
                _spec: {
                    line: t.id, family: t.family, thingId: t.id, phrase: t.phrase, person: null, bonus: null,
                    massKg: t.stock ? t.stock * HAUL_BUNDLE_KG : t.massKg, stock: t.stock ?? null, payMult: 0,
                    // FEAT-65: the camp's demolition line goes out to a roadside site, its place named like any job's.
                    destKind: t.targets ? 'roadside' : 'poi', destPick: 0, placeName: t.targets ? this._placeName(rngFor(`line:${this._seed}:${t.id}`)) : null,
                    to: null, passenger: !!t.passenger, targets: t.targets ?? null,
                    shape: 'courier', from: null, load: t.load ?? null, loose: null, atPickup: null, fragile: fragileOf(t),   // FEAT-157
                    deadlineSlack: 0,
                },
            }
        }
        return opened
    }

    /** FEAT-103: the requisition's lines, for the HUD and the win: [{ id, poiId, state }]. */
    lines () { return this._lines.map(s => ({ id: s.line.id, poiId: s.poiId, state: s.state, grade: s.grade ?? null })) }

    /** Does this type have anything it could post — a source row and at least one built thing? */
    _postsAnything (type) { return postable(type).length > 0 }

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
        if (this._first?.offer) this._first.offer.route = undefined
    }

    // ── queries ────────────────────────────────────────────────────────────────────────────────

    /** Every POI that posts work (always-on or budget), sorted — including one empty right now. */
    sources () { return this._givers.slice() }

    /** Does this POI post work at all? A budget giver with nothing on offer right now still does. */
    isGiver (poiId) { return this._givers.includes(poiId) || (poiId != null && poiId === this._campId) }

    /** Every slot currently at this POI: its own slots, then any budget slots parked there. */
    _at (poiId) {
        const at = this._slots.filter(s => s.poiId === poiId || (s.line && poiId === this._campId))
        if (this._first?.poiId === poiId) at.push(this._first)   // FEAT-147: mom's first job
        return at
    }

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
        // FEAT-113: the delivery deadline. No par (a caller with no planned route) → no deadline, and
        // a requisition line never has one (FEAT-103: no giver lockout, or the run could be unwinnable), nor
        // the first job (BUG-117: expired, it never reached Larry's, and his welcome is the tutorial's end).
        s.offer.dueH = parS > 0 && !s.line && !s.first ? nowH + this.deadlineH(s.offer, parS) : Infinity
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
    /** `grade` (expedition-rewards): a requisition line's letter, kept on it for the win card. The save replays it. */
    complete (offerId, nowH, grade = null) { return this._lock(offerId, nowH, 'done', grade) }

    /**
     * A taken offer was CANCELLED — the player phoned the customer (the cancel button is the only
     * caller). The slot locks exactly as for a completion: never free, even when the original timer
     * has already run out.
     */
    abandon (offerId, nowH) { return this._lock(offerId, nowH, 'live') }

    /**
     * THE LOCK RULE: a fresh full expiry from now (or the source's lockH). A requisition line never
     * locks (FEAT-103): it is delivered (`lineTo` 'done'), or back on the list unchanged ('live') with
     * its route memo dropped — the old mission object carries that job's settle and terms.
     */
    _lock (offerId, nowH, lineTo, grade = null) {
        this.advance(nowH)
        const s = this._takenSlot(offerId)
        if (!s) return false
        if (s.line) { s.state = lineTo; s.offer.route = undefined; if (lineTo === 'done') s.grade = grade }
        else if (s.first) s.state = 'done'   // FEAT-147: posted once; mom has no SOURCES row to lock against
        else this._lockAt(s, this._now)
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
        if (slot?.[0] === 'r') return this._lines.find(s => s.slot === slot && s.poiId === poiId) ?? null
        if (slot?.[0] === 'f') return this._first?.poiId === poiId ? this._first : null
        return this._always.get(poiId)?.[Number(slot)] ?? null
    }

    _takenSlot (offerId) {
        const s = this._slotOf(offerId)
        return s && s.state === 'taken' && s.offer.id === offerId ? s : null
    }

    /** FEAT-42: the offer the player has in hand under this id, or null — a resume's way back to it. */
    taken (offerId) { return this._takenSlot(offerId)?.offer ?? null }

    // ── what an offer IS (lazy, seeded) ────────────────────────────────────────────────────────

    /**
     * The offer's content, rolled on first read from its own `spec` stream — so WHEN it is read never
     * changes WHAT it is. Null only if the source has no built thing to post (a table gap).
     *
     * { family, thingId, phrase, massKg, person, bonus: {rewardId,name,gate,dineIn?}|null, payMult,
     *   destKind: 'poi'|'roadside'|null, destPick, placeName, stock: number|null, to: string[]|null,
     *   passenger: boolean, shape: 'courier'|'fetch'|'multi', from: string[]|null, load: string|null,
     *   stops: number|null, multiPhrase: string|null, deadlineSlack: number }
     * stops / multiPhrase (FEAT-89): a multi-drop's wished stop count and how the card says the goods;
     * null on every other shape. The planned tour may come up shorter (mission.js _multiDrop).
     * deadlineSlack (FEAT-113): the deadline is par × (1 + it) from accept — see deadlineH().
     * stock is the haul giver's piece count (FEAT-114) — the player picks 1…stock at accept — null
     * for every other family. It is drawn on its OWN `stock` stream: one more draw on `spec` would
     * shift the destination and place name of every existing offer on every seed. A haul's payMult
     * and its card's pay are PER PIECE; massKg is the whole stock's.
     * destKind is null for papers (the paper route picks its own customers). destPick is the uniform
     * number the mission planner uses to choose among the destination POIs it can actually reach;
     * placeName is the roadside name, rolled always, used whenever no POI destination fits.
     * to is the thing's destination classes (FEAT-100): a tagged thing always goes to a POI, unless
     * its `to` names 'roadside' (BUG-88).
     */
    spec (offer) {
        if (!offer) return null
        if (offer._spec === undefined) offer._spec = this._rollSpec(offer, 0)
        return offer._spec
    }

    /**
     * Roll an offer's content on attempt `n`. Attempt 0 is the offer as first posted; planDistinct
     * asks for n ≥ 1 when the newcomer duplicates a sibling (BUG-88), each on its own streams.
     */
    _rollSpec (offer, n) {
        const stream = (what) => rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:${what}` + (n ? `:${n}` : ''))
        const r = stream('spec')
        const things = postable(offer.type)
        if (!things.length) return null
        // FAMILY FIRST, then the thing (owner, 2026-10-12: too little freight): every family a source
        // posts gets an even share there, however many phrases each has. Its own stream, so the
        // `spec` draws below — destination, place name, bonus — keep their order.
        const families = [...new Set(things.map(t => t.family))]
        const family = pick(stream('family'), families)
        const thing = pick(r, things.filter(t => t.family === family))
        const [lo, hi] = thing.massKg
        const m = lo + (hi - lo) * r()
        const massKg = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10
        const people = this._names.get(offer.poiId)?.people ?? []
        const person = people.length ? people[Math.floor(r() * people.length)] : null

        const stockRoll = thing.family === 'haul' ? stream('stock')() : null

        // BONUS (BONUS_CHANCE). The gate is drawn only among gates this source actually has a reward for,
        // so a source whose list lacks an S reward still posts bonuses at the full share instead of
        // silently rolling a gate it cannot fill. A source with no rewards at all never bonuses.
        // FEAT-114 §6: a freight gate is a kg the load is posted with, so it is drawn only among gates
        // the load meets — a freight bonus is always earned on delivery. A haul gate is a count, and
        // the STOCK follows the gate instead (below): the bonus keeps its full share (owner, 2026-10-23:
        // filtering on a pre-drawn stock cut the yard's share to 18 %).
        let bonus = null
        const bonusRoll = r(), gateRoll = r(), rewardRoll = r()
        const amount = thing.family === 'freight' ? { have: massKg, row: rankTable('freight', this._region) } : null
        if (bonusRoll < BONUS_CHANCE) {
            // FEAT-168: the giver's categories; the bottom RARE_PULL of the roll is an off-list pull.
            const cats = REWARD_CATS[offer.type]
            const pool = rewardsIn((bonusRoll < BONUS_CHANCE * RARE_PULL && cats?.rare) || cats?.cats || [], offer.bornH)
            const w = {}
            for (const g of Object.keys(GATE_WEIGHTS)) {
                // R-18 keeps the ruling that a light load carries no item (DESIGN.md, owner 2026-10-22):
                // freight's C line is now 0 kg (every load earns ½ a deed), so a zero line never gates an item.
                if (amount && (amount.have < amount.row[g] || !(amount.row[g] > 0))) continue
                if (pool.some(x => x.gates.includes(g))) w[g] = GATE_WEIGHTS[g]
            }
            if (Object.keys(w).length) {
                const gate = pickWeighted(gateRoll, w)
                // Which reward: weighted by the stock table the auto-shop shelf uses (owner, 2026-10-22).
                const at = pool.filter(x => x.gates.includes(gate))
                const reward = pickReward(at, rewardRoll)
                bonus = { rewardId: reward.id, name: reward.name, gate, ...(reward.dineIn && { dineIn: true }) }
            }
        }
        // The haul stock: uniform over HAUL_STOCK, floored at the bonus gate's count so the reward is
        // always reachable on what the yard has.
        let stock = null
        if (stockRoll != null) {
            const [sLo, sHi] = HAUL_STOCK
            const lo = bonus ? Math.max(sLo, rankTable('haul', this._region, thing.id)[bonus.gate]) : sLo
            stock = lo + Math.floor(stockRoll * (sHi - lo + 1))
        }

        // FEAT-142: the giver's trait — at most ONE (owner, 2026-11-01: no stacking), on its OWN stream
        // (a draw on `spec` would shift every existing offer's destination and place name). Big tipper
        // never rides a bonus offer (its tip is the item, R-04). Kept a list: one trait or none.
        const traits = []
        if (thing.family !== 'papers') {
            const tr = stream('traits')
            if (Number(pickWeighted(tr(), TRAIT_COUNT_WEIGHTS)) > 0) {
                const ok = TRAITS.filter(t => t.families.includes(thing.family) && !(t.tip && bonus))
                if (ok.length) traits.push(ok[Math.floor(tr() * ok.length)])
            }
            if (stock != null && traits.some(t => t.stockFull)) stock = HAUL_STOCK[1]   // Wholesale: the whole yard
        }
        const tmul = (k) => traits.reduce((m, t) => m * (t[k] ?? 1), 1)

        const papers = thing.family === 'papers'
        const destRoll = r(), destPick = r()
        const placeName = this._placeName(r)
        // FEAT-102: a FETCH when this source is one of the thing's fetchers — go to a pickup (a POI of
        // `from`), park there, bring it back. Otherwise the courier shape, as built.
        const fetch = !!thing.fetchBy?.includes(offer.type)
        // FEAT-89: a MULTI-DROP — several stops, the order planned for you — for a thing with a
        // `multi` phrase. Its own `stops` stream: a draw on `spec` would move every other offer.
        const sr = thing.multi && !fetch ? stream('stops') : null
        const stops = sr && sr() < MULTI_DROP.chance ? Number(pickWeighted(sr(), MULTI_DROP.stops)) : null
        // A `to` naming 'roadside' (BUG-88) keeps the generic POI-or-roadside roll, just narrowed.
        const strictTo = !!thing.to && !thing.to.includes('roadside')
        const fragile = fragileOf(thing)
        const floors = tmul('floors')
        return {
            deadlineSlack: (thing.deadlineSlack ?? DEADLINE_SLACK[thing.family]) * tmul('deadline'),   // FEAT-113; FEAT-142
            // FEAT-142: the traits and the terms they move that the spec does not already carry.
            traits: traits.map(t => t.id), traitNames: traits.map(t => t.name),
            tipMult: tmul('tip'), thresholdScale: thing.family === 'delivery' ? tmul('thresholds') : 1,
            deeds: traits.find(t => t.deeds)?.deeds ?? null,
            shape: fetch ? 'fetch' : stops ? 'multi' : 'courier', from: fetch ? (thing.fetchFrom ?? thing.pools) : null,
            stops, multiPhrase: stops ? thing.multi : null,
            family: thing.family, thingId: thing.id, phrase: thing.phrase, person, bonus,
            massKg: stock ? stock * HAUL_BUNDLE_KG : massKg, stock,
            // Haul: PER PIECE — the pick multiplies it at accept. ÷ HAUL_PAR_SLACK: the haul's par is
            // that much longer and pay rides par (data/offers.js).
            // R-04: a bonus offer pays the FULL base (its cash tip is the item, economy.js settle).
            // R-05: a fragile tier's care premium rides the whole line (data/offers.js careMult).
            payMult: (stock ? HAUL_PAY_PER_BUNDLE / HAUL_PAR_SLACK : 1)
                * (thing.load ? 1 + FREIGHT_PAY_PER_KG * massKg : 1)   // FEAT-96: freight's weight bonus on pay
                * (thing.careMult ?? 1)
                * tmul('pay') * (stock ? tmul('perPiece') : 1),        // FEAT-142: the traits' pay
            // FEAT-65: a demolition job always ends roadside — its site is the route's last km of shoulder.
            destKind: papers ? null : thing.family === 'demolition' ? 'roadside'
                : (strictTo || fetch || stops || destRoll < DEST_POI_CHANCE ? 'poi' : 'roadside'),
            targets: thing.targets ?? null,   // FEAT-65: what stands on that shoulder (src/demolition.js)
            destPick, placeName, to: thing.to ?? null, passenger: !!thing.passenger,
            load: thing.load ?? null,   // FEAT-96: the freight load (data/freight.js) — null otherwise
            loose: thing.loose ?? null, // one loose bed body (src/debris.js kind) — the motorist's tire
            atPickup: thing.atPickup ?? null,   // a fetch's wait at the pickup: { min, park, done } prompts
            // FEAT-97; FEAT-142 Collector / Easygoing scale the load's shock thresholds (all three).
            fragile: fragile && floors !== 1
                ? { ...fragile, shockFloorG: fragile.shockFloorG * floors, breakG: fragile.breakG * floors,
                    ...(fragile.onePctG != null && { onePctG: fragile.onePctG * floors }) }
                : fragile,
        }
    }

    /**
     * The offers currently in the OTHER slots at this offer's POI (live or taken) that were rolled
     * BEFORE it — ties broken by slot. Every sibling that is live alongside this offer is in here:
     * an older offer still in its slot was necessarily live when this one was born.
     */
    olderSiblings (offer) {
        return this._at(offer.poiId)
            .filter(s => !s.line && s.slot !== offer.slot && (s.state === 'live' || s.state === 'taken')
                && (s.offer.bornH < offer.bornH || (s.offer.bornH === offer.bornH && s.slot < offer.slot)))
            .map(s => s.offer)
    }

    /**
     * Plan an offer's route so that NO TWO OFFERS AT A POI LOOK ALIKE (owner, 2026-10-16, BUG-88 —
     * widening 2026-09-27's "same thing AND reward AND place"). A newcomer may not repeat an older
     * sibling's THING (unless its source posts only one — the food vendor's takeout, the yard's
     * firewood), nor its DESTINATION: a POI (a fetch's is its pickup) or a roadside place name.
     *
     * Resolved oldest-first: each older sibling is planned first (memoised), so older offers never
     * change under the player; only the newcomer yields. A destination is avoided by handing the
     * planner the used POI ids, and a roadside name re-rolls until it differs. A repeated thing, or
     * a newcomer left with no route (a strict wish with every candidate used, or none in reach),
     * CYCLES to a new job: its spec is re-rolled on attempt n's streams, up to RE_ROLLS times.
     *
     * @param {object} offer
     * @param {(offer:object, excludePoiIds:Set<string>) => object|null} planOne — the mission
     *        planner for one offer (main.js wraps MissionSystem.planOffer); memoised here on
     *        `offer.route`, and `route.placeName` is set on a roadside drop.
     */
    planDistinct (offer, planOne) {
        if (offer.route !== undefined) return offer.route
        if (!this.spec(offer)) return (offer.route = null)
        if (offer._spec.line || offer._spec.first) {   // FEAT-103 / FEAT-147: fixed — nothing to re-roll
            offer.planned = { n: 0, exclude: [], placeName: null }
            return (offer.route = planOne(offer, new Set()))
        }
        const sibs = []
        for (const o of this.olderSiblings(offer)) {
            const r = this.planDistinct(o, planOne)
            if (r) sibs.push({ r, sp: this.spec(o) })
        }
        const usedThings = new Set(sibs.map(x => x.sp.thingId))
        const usedPois = new Set(sibs.flatMap(x => x.r.stopIds ?? [x.r.endPoiId]).filter(Boolean))   // FEAT-89: every stop
        const usedNames = new Set(sibs.filter(x => !x.r.endPoiId).map(x => x.r.placeName))
        const oneThing = postable(offer.type).length === 1
        let m = null, n = 0
        for (; n < RE_ROLLS; n++) {
            if (n) offer._spec = this._rollSpec(offer, n)
            if (!oneThing && usedThings.has(offer._spec.thingId)) continue
            if ((m = planOne(offer, usedPois))) break
        }
        if (m && !m.endPoiId) {
            let name = offer._spec.placeName
            for (let k = 1; usedNames.has(name) && k <= 32; k++) {
                name = this._placeName(rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:place:${k}`))
            }
            m.placeName = name
        }
        this._receiverBonus(offer, m, n)
        // FEAT-42: what this plan was resolved AGAINST. The siblings move on (expire, refill) while
        // the job is in hand, so a resume cannot re-run this resolution — it replays these instead.
        offer.planned = m ? { n, exclude: [...usedPois], placeName: m.placeName ?? null } : null
        return (offer.route = m)
    }

    /**
     * FEAT-67 amendment (owner, 2026-10-20; items.md): the RECEIVER hands the bonus over as a tip, and
     * its pool is a 50/50 roll between the giver's and the destination's. Only the plan knows the
     * destination, so this runs on it. The spec's GATE stays (drawn from the giver's pool; the haul
     * stock and the traits already depend on it). On the receiver's half the ITEM is re-picked among
     * the destination POI's rewards (its type or tags) at that gate. The giver's item stands for a fetch
     * (giver = receiver), a multi-drop (several receivers), a roadside drop (no receiver), and a
     * receiver with nothing at that gate. Its own stream per spec attempt, so replan agrees.
     */
    _receiverBonus (offer, m, n) {
        const sp = offer._spec
        if (!sp?.bonus) return
        sp.giverBonus ??= sp.bonus   // idempotent: a re-plan of a kept spec starts from the giver's item
        sp.bonus = sp.giverBonus
        if (m) m.bonus = sp.bonus
        if (!m || sp.shape !== 'courier' || !m.endPoiId) return
        const r = rngFor(`offer:${this._seed}:${offer.poiId}:${offer.slot}:${offer.k}:receiver` + (n ? `:${n}` : ''))
        if (r() < 0.5) return
        const q = this._pois.get(m.endPoiId)
        const cats = [q?.type, ...(q?.tags ?? [])].flatMap(k => REWARD_CATS[k]?.cats ?? [])
        const at = rewardsIn(cats, offer.bornH).filter(w => w.gates.includes(sp.bonus.gate))
        if (!at.length) return
        const reward = pickReward(at, r())
        sp.bonus = { rewardId: reward.id, name: reward.name, gate: sp.bonus.gate, ...(reward.dineIn && { dineIn: true }) }
        m.bonus = sp.bonus
    }

    /**
     * FEAT-42: re-plan a TAKEN offer exactly as it was planned (`planned`, saved from offer.planned):
     * the same spec attempt, the same POIs avoided, the same roadside name. Deterministic like
     * planDistinct — the planner draws from the offer's own seeded stream.
     */
    replan (offer, planned, planOne) {
        offer._spec = this._rollSpec(offer, planned.n)
        const m = planOne(offer, new Set(planned.exclude))
        if (m && planned.placeName) m.placeName = planned.placeName
        this._receiverBonus(offer, m, planned.n)
        offer.planned = planned
        return (offer.route = m)
    }

    /**
     * The planner's destination wish for an offer (MissionSystem.planOffer `dest`). A generic thing
     * goes to any other POI on its DEST_POI_CHANCE roll, else to a roadside spot. A fetch wishes for
     * its pickup (see below). A thing with a
     * `to` (FEAT-100) goes only to a POI carrying one of those tags, and is STRICT: no candidate in
     * reach means no route, never a roadside drop. A `to` that also names 'roadside' (BUG-88) keeps
     * the generic DEST_POI_CHANCE roll, with its POI side narrowed to those tags.
     *
     * @param {object} offer
     * @param {object[]} pois — the roster (PoiSystem.list())
     * @param {Set<string>} exclude — POI ids planDistinct says to avoid
     */
    destWish (offer, pois, exclude) {
        const sp = this.spec(offer)
        // FEAT-103: a line goes to the camp and nowhere else, at any length (mission.js `anyLeg`).
        // FEAT-65: …except the camp's own demolition line, which goes OUT to a roadside site.
        if (sp.line && sp.destKind === 'poi') return { kind: 'poi', pick: 0, pois: pois.filter(q => q.id === this._campId), strict: true, anyLeg: true }
        if (sp.destKind !== 'poi') return { kind: 'roadside' }
        // A FETCH (FEAT-102) wishes for its PICKUP — a POI of `from`, strictly — and says so, so the
        // planner returns the same way and settles back here.
        const want = sp.shape === 'fetch' ? sp.from : sp.to
        const fits = (q) => q.id !== offer.poiId && !exclude.has(q.id) && !NOT_A_DESTINATION.has(q.type)
            && (!want || want.some(t => q.tags?.includes(t)))
        // A `to` that names 'roadside' is not strict: no POI in reach drops it at a roadside spot.
        const strict = !!want && !want.includes('roadside')
        // FEAT-147: mom's and Larry's are both near the spawn, inside POI_LEG_MIN — the first job plans at any length.
        return { kind: 'poi', pick: sp.destPick, pois: pois.filter(fits), strict, fetch: sp.shape === 'fetch', stops: sp.stops, anyLeg: !!sp.first }
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

    /**
     * One name form filled in (data/offer-names.js header). Each slot draws only if present.
     * "{the}{adj}{biz}" must never shrink to the bare business word — a shop called just "Radiator"
     * (seed 3652181436) — so when {the} rolls empty the adjective is forced.
     */
    _fillForm (form, p, type, r) {
        let the = null   // stays null in forms with no {the} slot — "Deb's Burgers" needs no adjective
        return form
            .replace('{the}', () => (the = r() < POI_THE_CHANCE ? 'The ' : ''))
            .replace('{adj}', () => (r() < POI_ADJECTIVE_CHANCE || the === '' ? pick(r, POI_ADJECTIVES) + ' ' : ''))
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
     * @param {object|null} [ctx.verdict] FEAT-112: loadVerdict() for this offer's load on the truck as
     *        configured NOW, or null (cab cargo). Computed by the caller — the board never sees the truck
     *        (SM-INV-12), it only words the verdict.
     * @returns {{family, portrait: {sex,name}|null, flavor: string|null, sentence: Array<{t:string,b?:boolean}>,
     *            pay: string|null, terms: string[], times: string[], bonus: string|null,
     *            verdict: {level: 'warning'|'overload', text: string}|null}|null}
     */
    card (offer, { nowH, payTier = 1, route = null, customers = null, verdict = null } = {}) {
        const sp = this.spec(offer)
        if (!sp) return null
        if (sp.line) return this._lineCard(offer, sp, route, verdict, nowH)
        const n = this._names.get(offer.poiId)
        const sentence = [{ t: personLabel(sp.person), b: true }]
        if (sp.family === 'papers') {
            sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true }, { t: ' delivered' })
            // FEAT-141: `customers` is the route sizes on offer (any unlocked one) — "to 4 or 9 customers".
            const sizes = Array.isArray(customers) ? customers : customers ? [customers] : []
            if (sizes.length) sentence.push({ t: ' to ' }, { t: `${sizes.length > 1 ? sizes.slice(0, -1).join(', ') + ' or ' + sizes.at(-1) : sizes[0]} customers`, b: true })
            sentence.push({ t: '.' })
        } else {
            if (n?.name && !sp.first) sentence.push({ t: ` at ${n.name}` })   // FEAT-147: "Mom needs…", not "Mom at Mom's"
            const dest = route?.endPoiId ? this.placeLabel(route.endPoiId) : (route?.placeName ?? sp.placeName)
            if (sp.stock) {
                sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true },
                              { t: ' hauled to ' }, { t: dest, b: true }, { t: '.' })
            } else if (sp.targets) {
                // FEAT-65: "Earl needs his old drums crushed along the Miller place."
                sentence.push({ t: ' needs ' }, { t: sp.phrase, b: true }, { t: ' along ' }, { t: dest, b: true }, { t: '.' })
            } else {
                // A passenger is the poster themselves: "Earl needs a ride to Rust Belt Auto." A fetch
                // names its pickup: "Earl needs a full jerry can fetched from Pump & Go."
                // (a template literal: test/offer-board.mjs's import scan would read the quoted form as an import)
                const verb = sp.passenger ? ' to ' : sp.shape === 'fetch' ? ` fetched from ` : ' delivered to '
                // FEAT-89: a multi-drop names every stop, in the order the tour drives them.
                const stops = route?.stopIds?.map(id => this.placeLabel(id))
                sentence.push({ t: ' needs ' }, { t: stops ? sp.multiPhrase : sp.phrase, b: true }, { t: verb })
                for (const [i, t] of (stops ?? [dest]).entries()) {
                    if (i) sentence.push({ t: i === stops.length - 1 ? ' and ' : ', ' })
                    sentence.push({ t, b: true })
                }
                sentence.push({ t: '.' })
            }
        }
        const par = route?.par
        const km = (route?.distance ?? 0) / 1000
        const cargoId = sp.fragile ? sp.fragile.tier : sp.thingId
        // R-03: the card quotes BOTH ends of the line — the guaranteed base and the most a fast drive
        // pays. Freight's tip is scaled (FREIGHT_TIP_MULT, stamped on the mission by main.js). On a
        // bonus offer the cash tip is the item (R-04), so only the base is quoted and the TIP form says
        // what replaces it. FEAT-114: a haul quotes a RATE — the load isn't picked yet; the picker
        // shows the total.
        const tipMult = (sp.load && !sp.fragile ? FREIGHT_TIP_MULT : 1) * (sp.tipMult ?? 1)   // FEAT-142 Big tipper
        const range = par > 0 ? payRange(par, payTier, sp.payMult, tipMult) : null
        const money = (v) => `$${formatMoney(v)}`
        // R-20 (owner, 2026-10-24): "Pay $3.63 – $7.27 based on speed" — the range and what moves it,
        // in one breath; a bonus offer pays its base flat (the TIP form below says what replaces the
        // tip). A haul reads as a trade: "Bundle costs $0.25 · sells for $0.50 – $1.00 by speed".
        const pay = !range || sp.first ? null   // BUG-117: mom's casserole pays nothing
            : sp.stock ? `Bundle costs ${money(stockPrice(par, payTier, sp.payMult))} · sells for `
                + (sp.bonus ? `${money(range.base)} flat` : `${money(range.base)} – ${money(range.max)} by speed`)
            : sp.bonus ? `Pay ${money(range.base)} flat`
            : `Pay ${money(range.base)} – ${money(range.max)} based on speed`
        const terms = []
        if (route?.distance > 0) terms.push(`${(route.distance / 1000).toFixed(1)} km`)
        if (sp.fragile) terms.push(sp.fragile.tierName)   // what the player is up against (owner, 2026-10-23)
        // FEAT-65: a demolition job carries nothing; it states the site — how many stand, and that the pay
        // follows the share smashed (haul's rule, main.js onSettle).
        if (sp.targets) terms.push(`${route?.targets?.length ?? '?'} to smash`, 'pay per target smashed')
        else terms.push(sp.stock ? `${sp.stock} bundles available` : `${sp.massKg} kg`)
        // R-20: the tip is speed on fragile too; what the condition moves is the BASE (splitFragilePayout
        // pays half of it flat and half × health) — the owner asked, so the card says it.
        if (sp.fragile) terms.push('damage docks the base')
        // The clocks ride their OWN row (`times`, 2026-10-23): one row of distance + tier + kg + both
        // timers ran ~60 characters against the ~45 the map card fits, and spilled off it. BUG-162: a
        // haul shows both like every other job — its timers were dropped the same morning for that
        // overflow, and the own row fixed it.
        const times = []
        const expiresInH = offer.expiresH - nowH
        // A never-expiring offer (Larry's) shows no timer at all (owner, 2026-10-07).
        // R-10: two clocks in one grammar ("expires in … · deliver within …") read as one deadline
        // twice. The board clock is how long the offer stays POSTED; the other is the delivery window
        // once taken — so say each in its own words.
        // Reworded again 2026-10-24 (owner): "available for: 10h" and "time limit: 4h 22m".
        if (isFinite(expiresInH)) times.push(`available for: ${formatGameDuration(expiresInH)}`)
        if (!sp.line && !sp.first && par > 0) times.push(`time limit: ${formatGameDuration(this.deadlineH(offer, par))}`)   // FEAT-113: from accept; never on a job take() gives none
        return {
            family: sp.family,
            badge: jobBadge(sp),
            // The giver's portrait. PLACEHOLDER art today; `sex` is the field that will pick the
            // portrait pool (ruled 2026-09-26: sex is rolled first so name and picture agree).
            portrait: sp.person ? { sex: sp.person.sex, name: sp.person.first } : null,
            // FEAT-148: the giver's line on the parked panel (data/offers.js GIVER_LINES), or null — no quote.
            flavor: giverLine(offer.id, sp.thingId),
            sentence,
            pay,
            terms,
            times,
            // R-04/R-07: the TIP form — the item that replaces the cash tip, with its value and its gate.
            // Larry's card never rolls one (papers never bonus).
            bonus: sp.bonus ? `Tip: ${sp.bonus.name}${rewardValue(sp.bonus.rewardId) != null ? ` (${money(rewardValue(sp.bonus.rewardId))})` : ''}`
                + ` — ${gateLine(sp.bonus.gate, sp.family, this._region, cargoId, km)}` : null,
            // R-09: the deed line — what this job adds toward the camp, and the number behind it.
            // FEAT-142: Off the books earns no deed; The right thing to do adds ½ at C or better.
            deed: sp.family === 'papers' || sp.first ? null   // BUG-117: …and earns no deed
                : sp.deeds === 'none' ? 'Deed: none — off the books'
                : deedLine(sp.family, this._region, cargoId, km, sp.massKg) + (sp.deeds === 'extraHalf' ? ' · +1/2 at C or better' : ''),
            // FEAT-142: bottom-left of the card, the trait's name and what it does to THIS offer, in the
            // card's own numbers (owner, 2026-11-01: "i cant tell if the modifiers are actually doing anything").
            traits: sp.traits?.length ? sp.traits.map(id => this._traitLine(offer, sp, id, par, range, money)) : null,
            // FEAT-112: a load that fits says nothing. Otherwise the worst reason, in words:
            // "Warning: this load exceeds the recommended weight limit", "Overload: too heavy".
            verdict: verdict && verdict.verdict !== 'fits'
                ? { level: verdict.verdict, text: `${verdict.verdict === 'overload' ? 'Overload' : 'Warning'}: ${verdict.reasons[0].text}` }
                : null,
        }
    }

    /**
     * FEAT-142: one trait as the card prints it — "impatient: +$1.20 pay · deadline −1h 10m · ranks
     * 10% tighter". Each effect against the same offer WITHOUT the trait: pay is the quoted base
     * (per bundle on a haul), the deadline the time limit; the rest are the multipliers as percentages.
     */
    _traitLine (offer, sp, id, par, range, money) {
        const t = TRAITS.find(x => x.id === id)
        const pct = (m) => `${Math.round(Math.abs(m - 1) * 100)}%`
        const signed = (v, f) => `${v < 0 ? '−' : '+'}${f(Math.abs(v))}`
        const fx = []
        if (t.stockFull) fx.push(`the whole yard: ${sp.stock} bundles`)
        const payM = (t.pay ?? 1) * (t.perPiece ?? 1)
        if (payM !== 1) fx.push(range ? `${signed(range.base * (1 - 1 / payM), money)} ${sp.stock ? 'a bundle' : 'pay'}` : `${signed(payM - 1, () => pct(payM))} pay`)
        if (t.deadline && par > 0) fx.push(`deadline ${signed(this.deadlineH(offer, par) - par / (DAY_PARAMS.dayLengthSec / 24) * (1 + sp.deadlineSlack / t.deadline), formatGameDuration)}`)
        if (t.thresholds) fx.push(`rank times ${pct(t.thresholds)} ${t.thresholds < 1 ? 'tighter' : 'looser'}`)
        if (t.floors) fx.push(`load ${pct(t.floors)} ${t.floors < 1 ? 'more delicate' : 'sturdier'}`)
        if (t.tip) fx.push(`${signed(t.tip - 1, () => pct(t.tip))} tip`)
        if (t.deeds === 'none') fx.push('no good deed')
        if (t.deeds === 'extraHalf') fx.push('+1/2 deed at C or better')
        return fx.length ? `${t.name}: ${fx.join(' · ')}` : t.name
    }

    /**
     * FEAT-103: a requisition line's card. The same at the camp and at the source. No person, no pay
     * (the boss doesn't pay, for now), no timers; the deed slot states what makes the line count —
     * C or better, in the job's own axis (gateLine's grammar). PLACEHOLDER words.
     */
    _lineCard (offer, sp, route, verdict, nowH) {
        const terms = []
        if (route?.distance > 0) terms.push(`${(route.distance / 1000).toFixed(1)} km`)
        if (sp.fragile) terms.push(sp.fragile.tierName)
        if (sp.targets) terms.push(`${route?.targets?.length ?? '?'} to smash`)
        else terms.push(sp.stock ? `${sp.stock} bundles` : `${sp.massKg} kg`)
        if (sp.stock) {
            // The source's own haul offer is the stock on hand (owner, 2026-10-30): a player who wants the
            // line in one trip waits for it. offer.poiId is the source at the camp too (_at).
            const yard = this.offers(offer.poiId, nowH).map(o => this.spec(o)).find(x => x && !x.line && x.stock)
            terms.push(yard ? `${yard.stock} in stock at the yard` : 'yard out of stock right now')
        }
        return {
            family: sp.family, badge: jobBadge(sp), portrait: null, flavor: null,
            // A template literal for "from": test/offer-board.mjs's import scan. FEAT-65: the demolition line
            // names its site, not a source — the camp gives it.
            sentence: [{ t: 'The expedition camp', b: true }, { t: ' needs ' }, { t: sp.phrase, b: true },
                       ...(sp.targets ? [{ t: ' along ' }, { t: route?.placeName ?? sp.placeName, b: true }]
                           : [{ t: ` from ` }, { t: this.placeLabel(offer.poiId) ?? 'its source', b: true }]), { t: '.' }],
            pay: 'Unpaid — the camp’s requisition', terms, times: ['no time limit'], bonus: null,
            // FEAT-157: the line's own axis — bundles, "upon delivery", N%+ intact, or the letter.
            deed: `Counts ${gateLine('C', sp.family, this._region, sp.fragile?.tier, (route?.distance ?? 0) / 1000)} — else it goes back on the list`,
            verdict: verdict && verdict.verdict !== 'fits'
                ? { level: verdict.verdict, text: `${verdict.verdict === 'overload' ? 'Overload' : 'Warning'}: ${verdict.reasons[0].text}` }
                : null,
        }
    }
}
