// ── SM-3: the service center — repairs and part swaps at an auto shop ───────────────────────────
//
// Owner rulings (2026-10-20, repair rules re-cut 2026-10-22):
//   • Every auto shop is a service center: repairs, part swaps, and it still posts missions.
//   • REPAIR and BUY are separate. Buying is the only way to change a part's family, and the only way
//     back to 100%: a repair reaches data/parts.js REPAIR_CAP at most, in REPAIR_STEP increments, for
//     money and labour hours pro rata on the gap repaired (REPAIRS). Tires, brakes, the air filter and
//     the headlights are REPLACE-ONLY (no REPAIRS row); the shop still PATCHES a flat (PATCH) — the
//     hole, not the wear. Alignment is an adjustment: always straight back to 100%.
//   • A part is one tire, or one axle's pair (data/parts.js SLOTS). A part in the inventory follows the
//     same rules as its own item — a worn spring pair re-arched, a flat tire patched — and is refitted later.
//   • A part that comes off is SOLD (half its price × its condition) or KEPT in inventory with its
//     wear. A massless stock part ('No lift') is an absence: nothing to sell or keep.
//   • Browsing is free — the frame loop holds the clock while the screen is open — and each repair or
//     swap adds its labour hours, the way the tow does.
//   • Prices ride the day tier like the tow (economy.tierNow); FEAT-69 re-cuts them.
//   • Tires and wheels (owner, 2026-10-23): a loose tire, a loose wheel, or a mounted tire (the spare's
//     item: tire + wheel, each with its own wear). Corner work is priced as BEAD jobs and HUB swaps
//     (data/parts.js); the bench splits a mounted tire or combines a tire and a wheel, one bead job each.
//
// The renderer-agnostic half (the fuel-stop.js pattern): main.js owns the DOM, this owns the rules,
// so a headless gate can drive a whole visit. Every dependency arrives through the constructor.

import { PARTS, SLOTS, REPAIRS, REPAIR_CAP, REPAIR_STEP, PATCH, BEAD, HUB, SELL_FRACTION, socketsFor, takes } from '../data/parts.js'
import { TRACKS, TIRE_IDS, WHEEL_IDS } from './damage.js'
import { shelfPrice } from './shop-stock.js'

const cents = (x) => Math.round(x * 100) / 100
const EPS = 1e-9
const ALIGN_FLOOR = 0.02   // a drive leaves alignment a hair under straight: not a job
/** A tire or wheel socket's corner (0=FL … 3=RR), else −1. */
const cornerOf = (socket) => Math.max(TIRE_IDS.indexOf(socket), WHEEL_IDS.indexOf(socket))
const socketOfTrack = (id) => Object.keys(SLOTS).find(s => SLOTS[s].tracks.includes(id)) ?? null
/** A part's damage class (the REPAIRS row), or null for a part the damage model doesn't track. By the
 *  kind of socket, so the spare (which never goes on as itself) is still a tire. */
const classOf = (id) => {
    const t = SLOTS[Object.keys(SLOTS).find(s => takes(s) === PARTS[id]?.slot)]?.tracks[0]
    return t ? TRACKS[t].cls : null
}

/**
 * The conditions a repair can bring a part of class `cls` at `cond` up to, lowest first: every
 * REPAIR_STEP multiple above it, up to REPAIR_CAP — or, for alignment, only straight. Empty when
 * there is nothing to do (replace-only, or already at the cap).
 */
export function repairTargets (cls, cond) {
    if (!REPAIRS[cls]) return []
    if (cls === 'alignment') return cond < 1 - ALIGN_FLOOR ? [1] : []
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
     *   stock() / unstock(i)       this shop's shelf now (src/shop-stock.js shelf / take)
     *   onChange()                 something changed; the screen re-renders
     */
    constructor (deps) {
        Object.assign(this, deps)
        this.onChange ??= () => {}
        this.off = null      // the part just taken off, waiting on sell / keep: { id, cond, flat }
        this._preview = null // PartsSystem.snapshot() while a shelf item is fitted for a look
    }

    // ── Repairs ──────────────────────────────────────────────────────────────────────────────────

    /** Taking a part of class `cls` from `cond` to `target`: pro rata on the gap, × the day tier.
     *  `partId` prices the classes REPAIRS leaves to the part. */
    _quote (cls, partId, cond, target) {
        const r = REPAIRS[cls], gap = Math.max(0, target - cond)
        return { price: cents((r.price ?? PARTS[partId].price) * gap * this.tier()), hours: r.hours * gap }
    }

    /** What the bench can bring fitted track `id` up to (repairTargets). */
    targets (id) {
        if (TRACKS[id].manualOnly && !this.damage.manualBox) return []
        return repairTargets(TRACKS[id].cls, this.damage.get(id))
    }

    /** What repairing fitted track `id` to `target` costs now (default: as far as it goes). */
    repairQuote (id, target = this.targets(id).at(-1)) {
        const socket = socketOfTrack(id)
        return this._quote(TRACKS[id].cls, socket && this.parts.fitted(socket), this.damage.get(id), target ?? 0)
    }

    /** Repair one fitted track to `target` (one of targets(id)). False, nothing charged, if it isn't
     *  one or the wallet can't cover it. Straightening alignment also zeroes the bent geometry. */
    repair (id, target = this.targets(id).at(-1)) {
        if (!this.targets(id).includes(target)) return false
        const q = this.repairQuote(id, target)
        if (!this.spend(q.price)) return false
        const d = this.damage, t = TRACKS[id]
        d.set(id, target)
        // The alignment track is a readout of the bent geometry (damage.js setAll): straighten it too.
        if (t.cls === 'alignment') { d.toeOffsetDeg[t.wheel] = 0; d.camberOffsetDeg[t.wheel] = 0 }
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** The shop's flat patch, at today's tier. */
    patchQuote () { return { price: cents(PATCH.price * this.tier()), hours: PATCH.hours } }

    /** Patch the flat on fitted tire track `id`: air back in, condition unchanged. */
    patch (id) {
        const w = TIRE_IDS.indexOf(id)
        if (w < 0 || !this.damage.flat[w] || !this.spend(this.patchQuote().price)) return false
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
            .map(r => ({ index: r.index, id: r.id, cond: r.cond ?? 1, flat: r.flat, targets: repairTargets(classOf(r.id), r.cond ?? 1) }))
            .filter(r => r.targets.length || r.flat)
            .sort((a, b) => a.cond - b.cond)
    }

    /** What repairing inventory entry `index` to `target` costs now. */
    ownedQuote (index, target) {
        const r = this.inventory.list()[index]
        return this._quote(classOf(r.id), r.id, r.cond ?? 1, target)
    }

    /** Repair inventory entry `index` to `target`, as its own item (owner, 2026-10-20). */
    repairOwned (index, target) {
        const r = this.ownedRepairRows().find(r => r.index === index)
        if (!r?.targets.includes(target)) return false
        const q = this.ownedQuote(index, target)
        if (!this.spend(q.price)) return false
        this.inventory.amend(index, { cond: target })
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** Patch the flat tire (or mounted pair) at inventory entry `index`. */
    patchOwned (index) {
        const r = this.inventory.list()[index]
        if (!r?.flat || !this.spend(this.patchQuote().price)) return false
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

    /** Sell the part at inventory entry `index` to the shop (sellValue). Parts only. */
    sellOwned (index) {
        const r = this.inventory.list()[index]
        if (r?.kind !== 'part') return false
        this.inventory.take(index)
        this.earn(this.sellValue(r.id, r.cond))
        this.onChange()
        return true
    }

    // ── The shelf: this shop's stock right now (src/shop-stock.js; the deps `stock()` / `unstock(i)`).
    //    The Parts Shop sells ONLY what is on it — repairs are labour and never out of stock.

    /** Shelf slot `i`'s price now (a used part is priced by its condition), or null if it is empty. */
    shelfPrice (i) {
        const e = this.stock()[i]
        return e ? cents(shelfPrice(e) * this.tier()) : null
    }

    /** Buy shelf slot `i` and bolt it into `socket` (a tire or wheel needs its corner), with its
     *  condition, paying for the part and the fitting. The old part waits in `off`. */
    buyAndFit (i, socket) {
        const e = this.stock()[i]
        if (this.off || !e || !socketsFor(e.id).includes(socket)) return false
        const q = this.fitLabour(e.id, socket)
        if (!this.spend(cents(this.shelfPrice(i) + q.price))) return false
        this.unstock(i)
        this._swap(e.id, e.cond, socket, q)
        return true
    }

    /** Buy shelf slot `i` to carry. Full inventory → the swap prompt. */
    buyToInventory (i) {
        const e = this.stock()[i]
        if (!e || !this.spend(this.shelfPrice(i))) return false
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
        if (this.off || !e || !socketsFor(e.id).includes(socket)) return false
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

    /** Swap `socket`'s part for inventory entry `index`: the old part goes to the bench with its wear. */
    exchange (index, socket) {
        return PARTS[this.inventory.list()[index]?.id]?.mounted
            ? this.swapPair(index, cornerOf(socket))
            : this.fitFromInventory(index, socket)
    }

    /** Bolt on a part from inventory (entry `index`), with its wear. A flat tire is patched first. */
    fitFromInventory (index, socket) {
        if (this.off) return false
        const e = this.inventory.list()[index]
        socket ??= PARTS[e?.id]?.slot
        if (!e || e.flat || !socketsFor(e.id).includes(socket)) return false
        const q = this.fitLabour(e.id, socket)
        if (!this.spend(q.price)) return false
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
     *  socket is its hours and no fee. */
    fitLabour (id, socket) {
        if (cornerOf(socket) < 0) return { price: 0, hours: SLOTS[socket].hours }
        return this._jobs(2, PARTS[id].mounted ? 0 : 2)
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
        if (this.off || !PARTS[r?.id]?.mounted || r.flat) return false
        const q = this.fitLabour(r.id, TIRE_IDS[corner])
        if (!this.spend(q.price)) return false
        this.inventory.amend(index, this.parts.fitMounted(r, corner))
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    _swap (id, cond, socket, q) {
        const off = this.parts.fit(id, cond, socket)
        this.advanceHours(q.hours)
        this.off = PARTS[off.id].massKg > 0 ? off : null
        this.onChange()
    }

    /** The part that came off: 'sell' it to the shop or 'keep' it (inventory; full → the swap prompt). */
    settleOff (how) {
        const off = this.off
        if (!off) return false
        this.off = null
        if (how === 'sell') this.earn(this.sellValue(off.id, off.cond))
        else this.inventory.grant(off.id, 1, { cond: off.cond, flat: off.flat })
        this.onChange()
        return true
    }
    /** Leaving with a part still on the bench keeps it — nothing is ever thrown away silently. */
    close () {
        this.unpreview()
        if (this.off) this.settleOff('keep')
    }
}
