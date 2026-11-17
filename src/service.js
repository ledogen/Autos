// ── SM-3: the service center — repairs and part swaps at an auto shop ───────────────────────────
//
// Owner rulings (2026-10-20, repair rules re-cut 2026-10-22):
//   • Every auto shop is a service center: repairs, part swaps, and it still posts missions.
//   • REPAIR and BUY are separate. Buying is the only way to change a part's family, and the only way
//     back to 100%: a repair reaches data/parts.js REPAIR_CAP at most, in REPAIR_STEP increments, for
//     money and labour hours pro rata on the gap repaired (REPAIRS). Tires, brakes, the air filter and
//     the headlights are REPLACE-ONLY (no REPAIRS row); the shop still PATCHES a flat (PATCH) — the
//     hole, not the wear. Alignment is an adjustment: always straight back to 100%, and ONE job for
//     all four corners at one flat price (owner, 2026-11-05: align()).
//   • A part is one tire, or one axle's pair (data/parts.js SLOTS). A part in the inventory follows the
//     same rules as its own item — a worn spring pair re-arched, a flat tire patched — and is refitted later.
//   • A part that comes off goes STRAIGHT into the inventory with its wear (owner 11-04: "get rid of
//     that dialogue entirely") — selling is My Items' job (half its price × its condition). A massless
//     stock part ('No lift') is an absence: nothing comes off.
//   • Browsing is free — the frame loop holds the clock while the screen is open — and each repair or
//     swap adds its labour hours, the way the tow does.
//   • FEAT-212 (owner, 2026-11-13): THE CART. "You queue up all the work that you want to do. The vehicle updates in real
//     time … Payment and time skip only occurs on checkout." queue() runs a job for real on the truck and the inventory
//     (so later jobs see what earlier ones did: swap a corner, then repair what is on it now), and holds its money, its
//     hours, its shelf take, mom's tire and a free repair on the line. checkout() pays the lot once and runs the clock
//     once; discard() puts back the snapshot taken before the first line; remove() is that snapshot plus the other lines
//     replayed, and a line whose part is no longer where it was (bought by the removed line) comes out with it.
//   • Prices ride the day tier like the tow (economy.tierNow); FEAT-69 re-cuts them.
//   • Tires and wheels (owner, 2026-10-23): a loose tire, a loose wheel, or a mounted tire (the spare's
//     item: tire + wheel, each with its own wear). Corner work is priced as BEAD jobs and HUB swaps
//     (data/parts.js); the bench splits a mounted tire or combines a tire and a wheel, one bead job each.
//
// The renderer-agnostic half (the fuel-stop.js pattern): main.js owns the DOM, this owns the rules,
// so a headless gate can drive a whole visit. Every dependency arrives through the constructor.

import { PARTS, SLOTS, REPAIRS, REPAIR_SETUP, SEIZED_REPAIR_X, REPAIR_CAP, REPAIR_STEP, PATCH, OIL_CHANGE, BEAD, HUB, SELL_FRACTION, socketsFor, takes } from '../data/parts.js'
import { TRACKS, TIRE_IDS, WHEEL_IDS } from './damage.js'
import { shelfPrice } from './shop-stock.js'
import { ITEMS } from '../data/items.js'   // FEAT-232: a shelf meal's eatIn / eatH / hold
import { swapCorners } from './recovery.js'
import { runLog } from './run-log.js'   // FEAT-242: the opt-in run log (every hook is behind runLog.on)

const cents = (x) => Math.round(x * 100) / 100
const EPS = 1e-9
const ALIGN_FLOOR = 0.02   // a drive leaves alignment a hair under straight: not a job
const ALIGN = Object.keys(TRACKS).filter(id => TRACKS[id].cls === 'alignment')   // the four corners
/** A tire or wheel socket's corner (0=FL … 3=RR), else −1. */
const cornerOf = (socket) => Math.max(TIRE_IDS.indexOf(socket), WHEEL_IDS.indexOf(socket))
const socketOfTrack = (id) => Object.keys(SLOTS).find(s => SLOTS[s].tracks.includes(id)) ?? null
/** A part's damage class (the REPAIRS row), or null for a part the damage model doesn't track. By the
 *  kind of socket, so the spare (which never goes on as itself) is still a tire. */
const classOf = (id) => {
    const t = SLOTS[Object.keys(SLOTS).find(s => takes(s) === PARTS[id]?.slot)]?.tracks[0]
    return t ? TRACKS[t].cls : null
}
/** FEAT-212: which of a job's args name an inventory entry, a shelf slot or a fitted track (ServiceCenter._reads). */
const READS = {
    repair: { track: [0] }, repairOwned: { inv: [0] }, patchOwned: { inv: [0] }, sellOwned: { inv: [0] }, split: { inv: [0] },
    combine: { inv: [0, 1] }, exchange: { inv: [0] }, fitFromInventory: { inv: [0] }, swapPair: { inv: [0] },
    buyAndFit: { shelf: [0] }, buyToInventory: { shelf: [0] }, buyAndEat: { shelf: [0] },
}
/** An inventory row as what it is, not where it is. */
const rowKey = (r) => { if (!r) return null; const { index, key, ...rest } = r; return JSON.stringify(rest) }

/**
 * The conditions a repair can bring a part of class `cls` at `cond` up to, lowest first: every
 * REPAIR_STEP multiple above it, up to REPAIR_CAP — or, for alignment, only straight. Empty when
 * there is nothing to do (replace-only, or already at the cap).
 */
export function repairTargets (cls, cond, partId = null) {
    if (!REPAIRS[cls]) return []
    if (cls === 'alignment') return cond < 1 - ALIGN_FLOOR ? [1] : []
    // FEAT-166: a differential's only wear is the clutch LSD's packs, and a rebuild is new packs —
    // straight to 100%, and only for a part that has them (PARTS[id].rebuild).
    if (cls === 'diff') return PARTS[partId]?.rebuild && cond < 1 - EPS ? [1] : []
    // FEAT-162: a collapsed wheel is scrap — replace it; a seized engine is rebuilt whole, to the cap
    // (SEIZED_REPAIR_X prices it), never a cheap first step that frees it.
    if (cls === 'wheel' && cond <= 0) return []
    if (cls === 'engine' && cond <= 0) return [REPAIR_CAP]
    const out = []
    for (let t = Math.floor(cond / REPAIR_STEP + EPS) + 1; t * REPAIR_STEP <= REPAIR_CAP + EPS; t++) out.push(Math.round(t * REPAIR_STEP * 100) / 100)
    return out
}

export class ServiceCenter {
    /**
     * @param {object} deps
     *   damage, parts, inventory   the DamageModel, PartsSystem and InventorySystem
     *   money() / spend($) / earn($)   the wallet (economySystem.money / spend / addSpot)
     *   tier()                     the price multiplier now (economySystem.tierNow)
     *   advanceHours(h)            labour on the clock (daySystem.advanceMinutes)
     *   eat(h)                     FEAT-232: a meal eaten here holds hunger `h` hours (daySystem.eat); optional
     *   stock() / unstock(i)       this shop's shelf now (src/shop-stock.js shelf / take)
     *   freeRepairs() / useFreeRepair()   repairs owed for nothing (expedition-rewards); optional
     *   onMom(id, k) / useMom(id, k)   on mom (FEAT-184): part `id`'s k = 'part' or 'labour' is free, once; optional
     *   locked(e)                  DEC-356: why shelf entry `e` is not for sale now (a short line), or null; optional
     *   onChange()                 something changed; the screen re-renders
     */
    constructor (deps) {
        Object.assign(this, deps)
        this.onChange ??= () => {}
        this._preview = null // PartsSystem.snapshot() while a shelf item is fitted for a look
        // FEAT-212: the cart. While a job runs through queue() (`_line` set) the wallet, the clock, the shelf, mom and the
        // free repairs are its line's, not the world's; quotes read the cart's lines, so a tire on mom is free once.
        this.cart = []       // the queued lines, oldest first
        this._snap = null    // the state before the first line (_capture), or null with the cart empty
        this._line = null    // the line being run
        const lines = () => this._line ? [...this.cart, this._line] : this.cart
        const d = this._deps = deps
        this.spend = ($) => this._line ? (this._line.price += $, true) : d.spend($)
        this.earn = ($) => this._line ? void (this._line.earn += $) : d.earn($)
        this.advanceHours = (h) => this._line ? void (this._line.hours += h) : d.advanceHours(h)
        this.unstock = (i) => this._line ? void this._line.taken.push(i) : d.unstock(i)
        // A slot in the cart reads empty — unless the item is always on the shelf (shop-stock.js KINDS.always: no end).
        this.stock = () => { const t = new Set(lines().flatMap(l => l.taken)); return d.stock().map((e, i) => t.has(i) && e?.expiresAt !== Infinity ? null : e) }
        this.useMom = (id, k) => this._line ? void this._line.mom.push([id, k]) : d.useMom?.(id, k)
        this.onMom = d.onMom && ((id, k) => !lines().some(l => l.mom.some(m => m[1] === k)) && d.onMom(id, k))
        this.freeRepairs = d.freeRepairs && (() => d.freeRepairs() - lines().reduce((n, l) => n + l.free, 0))
        this.useFreeRepair = () => this._line ? void this._line.free++ : d.useFreeRepair()
        this.eat = (h) => this._line ? void (this._line.eat += h) : d.eat?.(h)   // a cart line's meal is eaten at checkout
    }

    // ── The cart (FEAT-212) ──────────────────────────────────────────────────────────────────────

    /** Everything a job can change that is not the wallet, the clock or the shelf: the truck and the inventory. */
    _capture () {
        const d = this.damage
        return { parts: this.parts.snapshot(), toe: d.toeOffsetDeg.slice(), camber: d.camberOffsetDeg.slice(), inv: this.inventory.snapshot() }
    }

    _restore (s) {
        this.unpreview()
        this.parts.restore(s.parts)
        this.damage.toeOffsetDeg.splice(0, 4, ...s.toe)
        this.damage.camberOffsetDeg.splice(0, 4, ...s.camber)
        this.inventory.restore(structuredClone(s.inv))
    }

    /** What line `l` read to be the job it is: each inventory entry and shelf slot it names, the track it repairs. A replay
     *  that reads otherwise is a different job (_resolve). */
    _reads (m, args) {
        const r = READS[m] ?? {}, inv = this.inventory.list()
        return { inv: (r.inv ?? []).map(p => rowKey(inv[args[p]])), shelf: (r.shelf ?? []).map(p => JSON.stringify(this.stock()[args[p]] ?? null)),
                 track: (r.track ?? []).map(p => JSON.stringify([this.damage.get(args[p]), this.parts.fitted(socketOfTrack(args[p]))])) }
    }

    /** Line `l`'s args against the state now: an inventory entry that moved up (one before it came out) is found again by
     *  what it is. Null when what it read is gone. */
    _resolve (l) {
        const args = l.args.slice(), inv = this.inventory.list(), used = new Set()
        for (const [k, p] of (READS[l.m]?.inv ?? []).entries()) {
            const hit = [args[p], ...inv.map(r => r.index)].find(i => !used.has(i) && rowKey(inv[i]) === l.reads.inv[k])
            if (hit === undefined) return null
            used.add(hit); args[p] = hit
        }
        const now = this._reads(l.m, args)
        return now.shelf.join() === l.reads.shelf.join() && now.track.join() === l.reads.track.join() ? args : null
    }

    /** Run job `m` (a method below, with `args`) onto the cart under `label`: the truck and the inventory change now, its
     *  price and hours wait for checkout. Money never refuses a line (checkout does). False, nothing queued, when the job
     *  itself refuses. */
    queue (m, args, label) {
        this.unpreview()
        this._snap ??= this._capture()
        const line = { m, args, label, price: 0, earn: 0, hours: 0, taken: [], mom: [], free: 0, eat: 0, reads: this._reads(m, args) }
        this._line = line
        let ok = false
        try { ok = this[m](...args) } finally { this._line = null }
        if (ok) this.cart.push(line)
        else if (!this.cart.length) this._snap = null
        this.onChange()
        return ok
    }

    /** The cart's subtotal: `price` net of what it sells, `hours` (the jobs one after another: they add), and the two sides. */
    total () {
        const sum = (k) => this.cart.reduce((a, l) => a + l[k], 0)
        return { price: cents(sum('price') - sum('earn')), hours: sum('hours'), spend: cents(sum('price')), earn: cents(sum('earn')) }
    }

    /** How far the wallet (with what the cart sells) falls short of the cart; 0 when it covers it. Checkout waits for 0. */
    short () { return Math.max(0, cents(this.total().price - this._deps.money())) }

    /** Something is on the truck or in the inventory that is not paid for: a line in the cart, or a shelf item fitted for
     *  a look. The run must not be saved like that (main.js _saveBlock). */
    pending () { return this.cart.length > 0 || !!this._preview }

    /** Pay for the cart once and run the clock once. False, nothing changed, when it is empty or the wallet falls short. */
    checkout () {
        if (!this.cart.length || this.short() > 0) return false
        const d = this._deps, t = this.total()
        this.unpreview()
        for (const l of this.cart) {
            for (const i of l.taken) d.unstock(i)
            for (const [id, k] of l.mom) d.useMom?.(id, k)
            for (let n = 0; n < l.free; n++) d.useFreeRepair()
        }
        if (t.earn > 0) d.earn(t.earn)   // what it sells first: it may pay for the rest
        if (t.spend > 0) d.spend(t.spend)
        if (t.hours > 0) d.advanceHours(t.hours)
        for (const l of this.cart) if (l.eat > 0) d.eat?.(l.eat)   // after the table time, so the hold runs from the last bite
        runLog.on && runLog.event('purchase', { at: 'service', ...t, wallet: d.money(),
            lines: this.cart.map(l => ({ m: l.m, label: l.label, args: l.args, price: l.price, earn: l.earn, hours: l.hours, eat: l.eat, free: l.free, mom: l.mom.length })) })
        this.cart = []; this._snap = null
        this.onChange()
        return true
    }

    /** Empty the cart: the truck and the inventory exactly as they were before its first line. */
    discard () {
        if (this._snap) this._restore(this._snap)
        this.cart = []; this._snap = null
        this.onChange()
    }

    /** Take line `j` out: back to the snapshot, the other lines replayed in order. Returns how many lines came out with it
     *  (a part it bought that a later line fitted, a slot it sold into). */
    remove (j) {
        const snap = this._snap, rest = this.cart.filter((_, k) => k !== j)
        if (!snap || rest.length === this.cart.length) return 0
        this._restore(snap)
        this.cart = []; this._snap = snap
        let dropped = 0
        for (const l of rest) {
            const args = this._resolve(l)
            if (!args || !this.queue(l.m, args, l.label)) dropped++
        }
        if (!this.cart.length) this._snap = null
        this.onChange()
        return dropped
    }

    // ── Repairs ──────────────────────────────────────────────────────────────────────────────────

    /** Taking a part of class `cls` from `cond` to `target`: REPAIR_SETUP, then pro rata on the gap,
     *  × the day tier. `partId` prices the classes REPAIRS leaves to the part. `onTruck`: the
     *  mechanic has to get at it first. */
    /** expedition-rewards option 2: the crew's line at A or better owes one repair — a bench repair at no charge while
     *  one is held (the labour still goes on the clock). Deps `freeRepairs()` / `useFreeRepair()`, both optional. */
    _free () { return (this.freeRepairs?.() ?? 0) > 0 }
    /** FEAT-184 (DEC-151, owner 2026-11-14: "i had no money to buy a spare. that should also be 'on mom'"): the
     *  tutorial's tire. While `onMom(id, 'part')` holds the part costs nothing, and while `onMom(id, 'labour')` holds
     *  its fitting doesn't either; each is used up (`useMom`) by the purchase or the fitting it paid for. */
    _mom (id, k) { return !!this.onMom?.(id, k) }
    _usedMom (id, k, was) { if (was) this.useMom?.(id, k) }

    _quote (cls, partId, cond, target, onTruck) {
        const r = REPAIRS[cls], gap = Math.max(0, target - cond)
        const seized = cls === 'engine' && cond <= 0 ? SEIZED_REPAIR_X : 1   // FEAT-162
        return { price: this._free() ? 0 : cents((REPAIR_SETUP.price + (r.price ?? PARTS[partId].price) * gap) * seized * this.tier()),
                 hours: (onTruck ? REPAIR_SETUP.hours : 0) + r.hours * gap }
    }

    /** What the bench can bring fitted track `id` up to (repairTargets). */
    targets (id) {
        if (TRACKS[id].manualOnly && !this.damage.manualBox) return []
        return repairTargets(TRACKS[id].cls, this.damage.get(id), this.parts.fitted(socketOfTrack(id)))
    }

    /** What repairing fitted track `id` to `target` costs now (default: as far as it goes). */
    repairQuote (id, target = this.targets(id).at(-1)) {
        const socket = socketOfTrack(id)
        return this._quote(TRACKS[id].cls, socket && this.parts.fitted(socket), this.damage.get(id), target ?? 0, true)
    }

    /** Repair one fitted track to `target` (one of targets(id)). False, nothing charged, if it isn't
     *  one or the wallet can't cover it. Alignment is never a corner on its own: align(). */
    repair (id, target = this.targets(id).at(-1)) {
        if (TRACKS[id].cls === 'alignment' || !this.targets(id).includes(target)) return false
        const q = this.repairQuote(id, target), free = this._free()
        if (!this.spend(q.price)) return false
        if (free) this.useFreeRepair()
        this.damage.set(id, target)
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** Is any corner bent enough to be a job (targets)? */
    bent () { return ALIGN.some(id => this.targets(id).length) }

    /** The alignment: one flat price × the day tier, and one setup plus each corner's gap on the clock. */
    alignQuote () {
        const r = REPAIRS.alignment
        return { price: cents(r.price * this.tier()), hours: REPAIR_SETUP.hours + ALIGN.reduce((h, id) => h + r.hours * (1 - this.damage.get(id)), 0) }
    }

    /** Straighten all four corners. The tracks are a readout of the bent geometry (damage.js setAll),
     *  so that goes back to zero too. False, nothing charged, when straight or short of the wallet. */
    align () {
        if (!this.bent()) return false
        const q = this.alignQuote()
        if (!this.spend(q.price)) return false
        const d = this.damage
        for (const id of ALIGN) { d.set(id, 1); d.toeOffsetDeg[TRACKS[id].wheel] = 0; d.camberOffsetDeg[TRACKS[id].wheel] = 0 }
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** FEAT-202: the oil change, a flat price at today's tier. Every shop, always. */
    oilQuote () { return { price: cents(OIL_CHANGE.price * this.tier()), hours: OIL_CHANGE.hours } }

    /** Change the oil: straight back to new. False, nothing charged, when it is already new or short of the wallet. */
    changeOil () {
        if (this.damage.get('oil') >= 1 - EPS || !this.spend(this.oilQuote().price)) return false
        this.damage.set('oil', 1)
        this.advanceHours(OIL_CHANGE.hours)
        this.onChange()
        return true
    }

    /** The shop's flat patch, at today's tier. */
    patchQuote () { return { price: this._mom('patch', 'patch') ? 0 : cents(PATCH.price * this.tier()), hours: PATCH.hours } }   // FEAT-217 (526f): the evening's first patch is on mom too, so a broke player is never $5 short

    /** Patch the flat on fitted tire track `id`: air back in, condition unchanged. */
    patch (id) {
        const w = TIRE_IDS.indexOf(id)
        const free = this._mom('patch', 'patch')
        if (w < 0 || !this.damage.flat[w] || !this.spend(this.patchQuote().price)) return false
        this._usedMom('patch', 'patch', free)
        this.damage.flat[w] = false
        this.advanceHours(PATCH.hours)
        this.onChange()
        return true
    }

    /** Parts in the inventory the bench can do something for — repairable below the cap, or a flat
     *  tire to patch — worst first, each with its repair `targets`. */
    ownedRepairRows () {
        return this.inventory.list()
            .filter(r => classOf(r.id))
            .map(r => ({ index: r.index, id: r.id, cond: r.cond ?? 1, flat: r.flat, targets: repairTargets(classOf(r.id), r.cond ?? 1, r.id) }))
            .filter(r => r.targets.length || r.flat)
            .sort((a, b) => a.cond - b.cond)
    }

    /** FEAT-196: the wheel of a mounted pair in the inventory (a spare, a pair a swap took off) is
     *  straightened as its own part, still mounted — what the bench can bring it up to. */
    ownedWheelTargets (index) {
        const r = this.inventory.list()[index]
        return PARTS[r?.id]?.mounted ? repairTargets('wheel', r.wheelCond ?? 1) : []
    }

    /** What repairing inventory entry `index` to `target` costs now; `wheel`: a mounted pair's wheel. */
    ownedQuote (index, target, wheel = false) {
        const r = this.inventory.list()[index]
        return wheel ? this._quote('wheel', r.wheel ?? PARTS[r.id].mounted.wheel, r.wheelCond ?? 1, target, false)
                     : this._quote(classOf(r.id), r.id, r.cond ?? 1, target, false)
    }

    /** Repair inventory entry `index` to `target`, as its own item (owner, 2026-10-20); `wheel`: a mounted pair's wheel. */
    repairOwned (index, target, wheel = false) {
        const ts = wheel ? this.ownedWheelTargets(index) : this.ownedRepairRows().find(r => r.index === index)?.targets
        if (!ts?.includes(target)) return false
        const q = this.ownedQuote(index, target, wheel), free = this._free()
        if (!this.spend(q.price)) return false
        if (free) this.useFreeRepair()
        this.inventory.amend(index, wheel ? { wheelCond: target } : { cond: target })
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** Patch the flat tire (or mounted pair) at inventory entry `index`. */
    patchOwned (index) {
        const r = this.inventory.list()[index]
        const free = this._mom('patch', 'patch')
        if (!r?.flat || !this.spend(this.patchQuote().price)) return false
        this._usedMom('patch', 'patch', free)
        this.inventory.amend(index, { flat: false })
        this.advanceHours(PATCH.hours)
        this.onChange()
        return true
    }

    // ── Parts ────────────────────────────────────────────────────────────────────────────────────

    /** What a part sells back for: half its price × its condition (new = 1). */
    sellValue (id, cond = null) {
        return cents(PARTS[id].price * SELL_FRACTION * (cond ?? 1) * this.tier())
    }

    /** What inventory row `r` sells for: a mounted tire is its tire plus its wheel, each at its own
     *  wear (owner, 2026-10-23), so selling it whole or split differs only by the split's bead job. */
    ownedValue (r) {
        const m = PARTS[r.id]?.mounted
        return m ? cents(this.sellValue(r.tire ?? m.tire, r.cond) + this.sellValue(r.wheel ?? m.wheel, r.wheelCond))
                 : this.sellValue(r.id, r.cond)
    }

    /** Sell the part at inventory entry `index` to the shop (ownedValue). Parts only. */
    sellOwned (index) {
        const r = this.inventory.list()[index]
        if (r?.kind !== 'part') return false
        this.inventory.take(index)
        this.earn(this.ownedValue(r))
        this.onChange()
        return true
    }

    // ── The shelf: this shop's stock right now (src/shop-stock.js; the deps `stock()` / `unstock(i)`).
    //    The Parts Shop sells ONLY what is on it — repairs are labour and never out of stock.

    /** Shelf slot `i`'s price now (a used part is priced by its condition), or null if it is empty. */
    shelfPrice (i) {
        const e = this.stock()[i]
        return e ? (this._mom(e.id, 'part') ? 0 : cents(shelfPrice(e) * this.tier())) : null
    }

    /** FEAT-212: what buying shelf slot `i` costs, money and hours: to carry (no `socket`; no time), or bolted
     *  into `socket` (its fitting added). Null for an empty slot. The Shop tab's every option shows it. */
    buyQuote (i, socket = null) {
        const e = this.stock()[i]
        if (!e) return null
        const f = socket ? this.fitLabour(e.id, socket) : { price: 0, hours: ITEMS[e.id]?.eatH ?? 0 }   // FEAT-232: a meal's table time
        return { price: cents(this.shelfPrice(i) + f.price), hours: f.hours }
    }

    /** Buy shelf slot `i` and bolt it into `socket` (a tire or wheel needs its corner), with its
     *  condition, paying for the part and the fitting. The old part goes into the inventory. */
    buyAndFit (i, socket) {
        const e = this.stock()[i]
        if (!e || !socketsFor(e.id).includes(socket)) return false
        const q = this.fitLabour(e.id, socket), part = this._mom(e.id, 'part'), labour = this._mom(e.id, 'labour')
        if (!this.spend(this.buyQuote(i, socket).price)) return false
        this._usedMom(e.id, 'part', part); this._usedMom(e.id, 'labour', labour)
        this.unstock(i)
        this._swap(e.id, e.cond, socket, q)
        return true
    }

    /** FEAT-232: buy an `eatIn` shelf meal and eat it here: paid, `eatH` on the clock, hunger held `hold` hours. Never stowed. */
    buyAndEat (i) {
        const e = this.stock()[i], it = ITEMS[e?.id]
        if (!it?.eatIn || !this.spend(this.buyQuote(i).price)) return false
        this.advanceHours(it.eatH)
        this.eat(it.hold)
        this.onChange()
        return true
    }

    /** Buy shelf slot `i` to carry. Full inventory → the swap prompt. */
    buyToInventory (i) {
        const e = this.stock()[i]
        if (ITEMS[e?.id]?.eatIn) return false   // a dine-in meal is eaten at the counter (buyAndEat)
        const part = !!e && this._mom(e.id, 'part')
        if (!e || !this.spend(this.buyQuote(i).price)) return false
        this._usedMom(e.id, 'part', part)
        this.unstock(i)
        this.inventory.grant(e.id, 1, e.cond === null ? null : { cond: e.cond })
        this.onChange()
        return true
    }

    /**
     * Fit shelf slot `i` onto `socket` for a look — nothing charged, no clock, nothing benched. Only one
     * at a time; unpreview() puts back exactly what was there (PartsSystem.snapshot). Every real action
     * goes through unpreview first (the screen's click handler, close()).
     */
    preview (i, socket) {
        this.unpreview()
        const e = this.stock()[i]
        if (!e || !socketsFor(e.id).includes(socket)) return false
        this._preview = this.parts.snapshot()
        this.parts.fit(e.id, e.cond, socket)
        return true
    }

    unpreview () {
        if (!this._preview) return
        this.parts.restore(this._preview)
        this._preview = null
    }

    // ── Exchange: a socket's part for one you own ────────────────────────────────────────────────

    /** Inventory entries that can go into `socket` now: a part that fits it and holds air; on a tire
     *  or wheel corner, a mounted pair too (it swaps whole, swapPair). */
    exchangeOptions (socket) {
        const corner = cornerOf(socket)
        return this.inventory.list().filter(r => !r.flat && (socketsFor(r.id).includes(socket) || (corner >= 0 && PARTS[r.id]?.mounted)))
    }

    /** Swap `socket`'s part for inventory entry `index`: the old part goes into the inventory with its wear. */
    exchange (index, socket) {
        return PARTS[this.inventory.list()[index]?.id]?.mounted
            ? this.swapPair(index, cornerOf(socket))
            : this.fitFromInventory(index, socket)
    }

    /** Bolt on a part from inventory (entry `index`), with its wear. A flat tire is patched first. */
    fitFromInventory (index, socket) {
        const e = this.inventory.list()[index]
        socket ??= PARTS[e?.id]?.slot
        if (!e || e.flat || !socketsFor(e.id).includes(socket)) return false
        const q = this.fitLabour(e.id, socket), labour = this._mom(e.id, 'labour')
        if (!this.spend(q.price)) return false
        this._usedMom(e.id, 'labour', labour)
        this.inventory.take(index)
        this._swap(e.id, e.cond, socket, q)
        return true
    }

    /** `hubs` hub swaps and `beads` bead jobs, at today's tier. */
    _jobs (hubs, beads) {
        return { price: cents((hubs * HUB.price + beads * BEAD.price) * this.tier()), hours: hubs * HUB.hours + beads * BEAD.hours }
    }

    /** The labour to put part `id` into `socket`: on a corner, a mounted tire is the pair off and on
     *  (2 hub); a loose tire or wheel also comes off and goes on its partner (+2 bead). Any other
     *  socket is its hours and the shop's minimum charge, REPAIR_SETUP's price (owner, 2026-10-23), × the socket's
     *  `fitX` (the air filter's third). */
    fitLabour (id, socket) {
        const q = cornerOf(socket) < 0 ? { price: cents(REPAIR_SETUP.price * (SLOTS[socket].fitX ?? 1) * this.tier()), hours: SLOTS[socket].hours }
            : this._jobs(2, PARTS[id].mounted ? 0 : 2)
        return this._mom(id, 'labour') ? { ...q, price: 0 } : q
    }

    /** Splitting a mounted tire, or combining a tire and a wheel: one bead job. */
    beadQuote () { return this._jobs(0, 1) }

    /** Split the mounted tire at inventory entry `index` into its tire and its wheel, each with its
     *  wear (the tire keeps its puncture). Needs a free slot: one entry becomes two. */
    split (index) {
        const r = this.inventory.list()[index], m = PARTS[r?.id]?.mounted
        if (!m || !this.inventory.fits(r.wheel ?? m.wheel)) return false
        const q = this.beadQuote()
        if (!this.spend(q.price)) return false
        this.inventory.take(index)
        this.inventory.grant(r.tire ?? m.tire, 1, { cond: r.cond, flat: r.flat })
        this.inventory.grant(r.wheel ?? m.wheel, 1, { cond: r.wheelCond ?? null })
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** The loose wheels a loose tire at `index` can be mounted on, or the loose tires for a wheel. */
    combineOptions (index) {
        const want = { tire: 'wheel', wheel: 'tire' }[PARTS[this.inventory.list()[index]?.id]?.slot]
        const loose = (id) => PARTS[id] && !PARTS[id].mounted
        if (!want || !loose(this.inventory.list()[index].id)) return []
        return this.inventory.list().filter(r => loose(r.id) && PARTS[r.id].slot === want)
    }

    /** Mount the tire and the wheel at inventory entries `a` and `b` (either order) into one mounted
     *  tire, each keeping its wear. */
    combine (a, b) {
        if (!this.combineOptions(a).some(r => r.index === b)) return false
        const list = this.inventory.list()
        const [tire, wheel] = PARTS[list[a].id].slot === 'tire' ? [list[a], list[b]] : [list[b], list[a]]
        const q = this.beadQuote()
        if (!this.spend(q.price)) return false
        for (const i of [a, b].sort((x, y) => y - x)) this.inventory.take(i)   // the later one first: indices hold
        this.inventory.grant('spareTire', 1, { tire: tire.id, cond: tire.cond, flat: tire.flat, wheel: wheel.id, wheelCond: wheel.cond })
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /**
     * Swap the mounted pair at inventory entry `index` (a spare, or the flat pair a roadside swap left
     * in the inventory) with `corner`'s tire and wheel: the pair that comes off takes its place, still
     * mounted — so a tire the spare displaced can go back on. A flat pair won't go on. Two hub swaps.
     */
    swapPair (index, corner) {
        const r = this.inventory.list()[index]
        if (!PARTS[r?.id]?.mounted || r.flat) return false
        const q = this.fitLabour(r.id, TIRE_IDS[corner]), labour = this._mom(r.id, 'labour')
        if (!this.spend(q.price)) return false
        this._usedMom(r.id, 'labour', labour)
        this.inventory.amend(index, this.parts.fitMounted(r, corner))
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** FEAT-196 (owner, 2026-11-12): move a corner's tire to another corner in one job — the two mounted
     *  pairs trade places, each tire and wheel with its wear (recovery.js swapCorners, the roadside's
     *  "Swap two wheels"): four hub swaps, both pairs off and on. */
    cornerSwapQuote () { return this._jobs(4, 0) }

    swapCorners (a, b) {
        const q = this.cornerSwapQuote()
        if (a === b || !(a >= 0 && a < 4 && b >= 0 && b < 4) || !this.spend(q.price)) return false
        swapCorners(this.parts, this.damage, a, b)
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** Fit `id` into `socket`: the part that comes off goes into the inventory with its wear and its
     *  puncture (a full inventory → its swap prompt). Nothing is ever thrown away silently. */
    _swap (id, cond, socket, q) {
        const off = this.parts.fit(id, cond, socket)
        this.advanceHours(q.hours)
        if (PARTS[off.id].massKg > 0) this.inventory.grant(off.id, 1, { cond: off.cond, flat: off.flat })
        this.onChange()
    }

    /** The screen closed. The screen asks for checkout or discard before it lets the player go; a close it cannot ask
     *  about (the truck towed away) discards. */
    close () { this.unpreview(); if (this.cart.length) this.discard() }
}
