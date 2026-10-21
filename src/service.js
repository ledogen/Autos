// ── SM-3: the service center — repairs and part swaps at an auto shop ───────────────────────────
//
// Owner rulings (2026-10-20):
//   • Every auto shop is a service center: repairs, part swaps, and it still posts missions.
//   • REPAIR and BUY are separate. A repair restores the fitted part's tracks to 100% for money and
//     labour hours (data/parts.js REPAIRS, pro rata on the missing condition). Buying is the only way
//     to change a part's family.
//   • A part is one tire, or one axle's pair (data/parts.js SLOTS). A part in the inventory can be
//     repaired as its own item — a flat tire patched, a worn one renewed — and refitted later.
//   • A part that comes off is SOLD (half its price × its condition) or KEPT in inventory with its
//     wear. A massless stock part ('No lift') is an absence: nothing to sell or keep.
//   • Browsing is free — the frame loop holds the clock while the screen is open — and each repair or
//     swap adds its labour hours, the way the tow does.
//   • Prices ride the day tier like the tow (economy.tierNow); FEAT-69 re-cuts them.
//
// The renderer-agnostic half (the fuel-stop.js pattern): main.js owns the DOM, this owns the rules,
// so a headless gate can drive a whole visit. Every dependency arrives through the constructor.

import { PARTS, SLOTS, REPAIRS, SELL_FRACTION, socketsFor, takes } from '../data/parts.js'
import { TRACKS } from './damage.js'

const cents = (x) => Math.round(x * 100) / 100
const REPAIR_FLOOR = 0.02   // missing condition below which the bench has nothing to do
const socketOfTrack = (id) => Object.keys(SLOTS).find(s => SLOTS[s].tracks.includes(id)) ?? null
/** A part's damage class (the REPAIRS row), or null for a part the damage model doesn't track. By the
 *  kind of socket, so the spare (which never goes on as itself) is still a tire to repair. */
const classOf = (id) => {
    const t = SLOTS[Object.keys(SLOTS).find(s => takes(s) === PARTS[id]?.slot)]?.tracks[0]
    return t ? TRACKS[t].cls : null
}

export class ServiceCenter {
    /**
     * @param {object} deps
     *   damage, parts, inventory   the DamageModel, PartsSystem and InventorySystem
     *   money() / spend($) / earn($)   the wallet (economySystem.money / spend / addSpot)
     *   tier()                     the price multiplier now (economySystem.tierNow)
     *   advanceHours(h)            labour on the clock (daySystem.advanceMinutes)
     *   onChange()                 something changed; the screen re-renders
     */
    constructor (deps) {
        Object.assign(this, deps)
        this.onChange ??= () => {}
        this.off = null      // the part just taken off, waiting on sell / keep: { id, cond, flat }
    }

    // ── Repairs ──────────────────────────────────────────────────────────────────────────────────

    /**
     * Restoring `cond` → 100% on a part of class `cls` ({ price, hours }), pro rata on what's missing.
     * `partId` prices the classes REPAIRS leaves to the part. A flat is a hole, not wear: patching it
     * is a quarter tire's labour even on fresh rubber. Below the floor it isn't a repair: a drive
     * leaves every track a hair under new.
     */
    _quote (cls, partId, cond, flat) {
        const r = REPAIRS[cls]
        const need = flat ? Math.max(1 - cond, 0.25) : 1 - cond
        if (need < REPAIR_FLOOR) return { price: 0, hours: 0 }
        return { price: cents((r.price ?? PARTS[partId].price) * need * this.tier()), hours: r.hours * need }
    }

    /** What restoring one fitted track to 100% costs now: { price, hours }. Zero for a sound track. */
    repairQuote (id) {
        const t = TRACKS[id], socket = socketOfTrack(id)
        return this._quote(t.cls, socket && this.parts.fitted(socket), this.damage.get(id), t.cls === 'tire' && this.damage.flat[t.wheel])
    }
    /** Every track that wants work, worst first. A manual's synchros only while a manual is fitted. */
    repairRows () {
        return Object.keys(TRACKS)
            .filter(id => !TRACKS[id].manualOnly || this.damage.manualBox)
            .map(id => ({ id, label: TRACKS[id].label, cond: this.damage.get(id),
                flat: TRACKS[id].cls === 'tire' && this.damage.flat[TRACKS[id].wheel], ...this.repairQuote(id) }))
            .filter(r => r.price > 0 || r.hours > 0)
            .sort((a, b) => a.cond - b.cond)
    }

    /** Repair one track to 100%. False (nothing charged) if it is sound or the wallet can't cover it. */
    repair (id) {
        const q = this.repairQuote(id)
        if (q.hours <= 0 || !this.spend(q.price)) return false
        const d = this.damage, t = TRACKS[id]
        d.set(id, 1)
        if (t.cls === 'tire') d.flat[t.wheel] = false
        // The alignment track is a readout of the bent geometry (damage.js setAll): straighten it too.
        if (t.cls === 'alignment') { d.toeOffsetDeg[t.wheel] = 0; d.camberOffsetDeg[t.wheel] = 0 }
        this.advanceHours(q.hours)
        this.onChange()
        return true
    }

    /** Price and hours of every repair on the list at once. */
    repairAllQuote () {
        return this.repairRows().reduce((a, r) => ({ price: cents(a.price + r.price), hours: a.hours + r.hours }),
            { price: 0, hours: 0 })
    }

    /** Repair everything, only if the wallet covers all of it. */
    repairAll () {
        if (this.money() + 1e-9 < this.repairAllQuote().price) return false
        for (const r of this.repairRows()) this.repair(r.id)
        return true
    }

    /** Parts in the inventory that want work — a worn or flat tire, a tired spring pair — worst first. */
    ownedRepairRows () {
        return this.inventory.list()
            .filter(r => classOf(r.id))
            .map(r => ({ index: r.index, id: r.id, cond: r.cond ?? 1, flat: r.flat, ...this._quote(classOf(r.id), r.id, r.cond ?? 1, r.flat) }))
            .filter(r => r.hours > 0)
            .sort((a, b) => a.cond - b.cond)
    }

    /** Repair inventory entry `index` to new, as its own item (owner, 2026-10-20). */
    repairOwned (index) {
        const r = this.ownedRepairRows().find(r => r.index === index)
        if (!r || !this.spend(r.price)) return false
        this.inventory.amend(index, { cond: 1, flat: false })
        this.advanceHours(r.hours)
        this.onChange()
        return true
    }

    // ── Parts ────────────────────────────────────────────────────────────────────────────────────

    buyPrice (id) { return cents(PARTS[id].price * this.tier()) }

    /** What a part sells back for: half its price × its condition (new = 1). */
    sellValue (id, cond = null) {
        return cents(PARTS[id].price * SELL_FRACTION * (cond ?? 1) * this.tier())
    }

    /** Buy a new part and bolt it into `socket` (a tire needs its corner). The old one waits in `off`. */
    buyAndFit (id, socket = PARTS[id]?.slot) {
        if (this.off || !socketsFor(id).includes(socket) || this.parts.fitted(socket) === id || !this.spend(this.buyPrice(id))) return false
        this._swap(id, null, socket)
        return true
    }

    /** Buy a new part to carry, not fit — a spare for the road. Full inventory → the swap prompt. */
    buyToInventory (id) {
        if (!PARTS[id] || !this.spend(this.buyPrice(id))) return false
        this.inventory.grant(id, 1, { cond: 1 })
        this.onChange()
        return true
    }

    /** Bolt on a part from inventory (entry `index`), with its wear. A flat tire is repaired first. */
    fitFromInventory (index, socket) {
        if (this.off) return false
        const e = this.inventory.list()[index]
        if (!e || e.flat || !socketsFor(e.id).includes(socket ?? PARTS[e.id]?.slot)) return false
        this.inventory.take(index)
        this._swap(e.id, e.cond, socket ?? PARTS[e.id].slot)
        return true
    }

    /**
     * Swap the mounted pair at inventory entry `index` (a spare, or the flat pair a roadside swap left
     * in the inventory) with `corner`'s tire and wheel: the pair that comes off takes its place, still
     * mounted — so a tire the spare displaced can go back on. A flat pair won't go on. A tire's labour.
     */
    swapPair (index, corner) {
        const r = this.inventory.list()[index]
        if (this.off || !PARTS[r?.id]?.mounted || r.flat) return false
        this.inventory.amend(index, this.parts.fitMounted(r, corner))
        this.advanceHours(SLOTS.tireFL.hours)
        this.onChange()
        return true
    }

    _swap (id, cond, socket) {
        const off = this.parts.fit(id, cond, socket)
        this.advanceHours(SLOTS[socket].hours)
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
    close () { if (this.off) this.settleOff('keep') }
}
