// ── SM-3: the service center — repairs and part swaps at an auto shop ───────────────────────────
//
// Owner rulings (2026-10-20):
//   • Every auto shop is a service center: repairs, part swaps, and it still posts missions.
//   • REPAIR and BUY are separate. A repair restores the fitted part's tracks to 100% for money and
//     labour hours (data/parts.js REPAIRS, pro rata on the missing condition). Buying is the only way
//     to change a part's family.
//   • A part that comes off is SOLD (half its price × its condition) or KEPT in inventory with its
//     wear. A massless stock part ('No lift') is an absence: nothing to sell or keep.
//   • Browsing is free — the frame loop holds the clock while the screen is open — and each repair or
//     swap adds its labour hours, the way the tow does.
//   • Prices ride the day tier like the tow (economy.tierNow); FEAT-69 re-cuts them.
//
// The renderer-agnostic half (the fuel-stop.js pattern): main.js owns the DOM, this owns the rules,
// so a headless gate can drive a whole visit. Every dependency arrives through the constructor.

import { PARTS, SLOTS, REPAIRS, SELL_FRACTION } from '../data/parts.js'
import { TRACKS } from './damage.js'

const cents = (x) => Math.round(x * 100) / 100
const REPAIR_FLOOR = 0.02   // missing condition below which the bench has nothing to do
const slotOfTrack = (id) => Object.keys(SLOTS).find(s => SLOTS[s].tracks.includes(id)) ?? null

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
        this.off = null      // the part just taken off, waiting on sell / keep: { id, cond }
    }

    // ── Repairs ──────────────────────────────────────────────────────────────────────────────────

    /** What restoring one track to 100% costs now: { price, hours }. Zero for a sound track. */
    repairQuote (id) {
        const d = this.damage, t = TRACKS[id], r = REPAIRS[t.cls]
        const missing = 1 - d.get(id)
        // A flat is a hole, not wear: patching it is a whole tire's labour even on fresh rubber.
        const need = t.cls === 'tire' && d.flat[t.wheel] ? Math.max(missing, 0.25) : missing
        // Below the floor it isn't a repair line: a drive leaves every track a hair under new.
        if (need < REPAIR_FLOOR) return { price: 0, hours: 0 }
        const slot = slotOfTrack(id)
        const full = r.price ?? PARTS[this.parts.fitted(slot)].price / SLOTS[slot].tracks.length
        return { price: cents(full * need * this.tier()), hours: r.hours * need }
    }

    /** Every track that wants work, worst first. A manual's synchros only while a manual is fitted. */
    repairRows () {
        return Object.keys(TRACKS)
            .filter(id => !TRACKS[id].manualOnly || this.damage.manualBox)
            .map(id => ({ id, label: TRACKS[id].label, cond: this.damage.get(id), ...this.repairQuote(id) }))
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

    // ── Parts ────────────────────────────────────────────────────────────────────────────────────

    buyPrice (id) { return cents(PARTS[id].price * this.tier()) }

    /** What a part sells back for: half its price × its mean condition (new = 1). */
    sellValue (id, cond = null) {
        const c = cond ? Object.values(cond) : []
        const mean = c.length ? c.reduce((a, b) => a + b, 0) / c.length : 1
        return cents(PARTS[id].price * SELL_FRACTION * mean * this.tier())
    }

    /** The shop's parts for each slot that aren't fitted now: { slot: [id…] }. 'No lift' is how a lift comes off. */
    stock () {
        const out = {}
        for (const slot of Object.keys(SLOTS)) {
            out[slot] = Object.keys(PARTS).filter(id => PARTS[id].slot === slot && id !== this.parts.fitted(slot))
        }
        return out
    }

    /** Buy a new part and bolt it on. The old one waits in `off` for sell / keep. */
    buyAndFit (id) {
        if (this.off || !PARTS[id] || !this.spend(this.buyPrice(id))) return false
        this._swap(id, null)
        return true
    }

    /** Bolt on a part from inventory (entry `index`), with its wear. */
    fitFromInventory (index) {
        if (this.off) return false
        const e = this.inventory.list()[index]
        if (!e || !PARTS[e.id]) return false
        this.inventory.take(index)
        this._swap(e.id, e.cond)
        return true
    }

    _swap (id, cond) {
        const off = this.parts.fit(id, cond)
        this.advanceHours(SLOTS[PARTS[id].slot].hours)
        this.off = PARTS[off.id].massKg > 0 ? off : null
        this.onChange()
    }

    /** The part that came off: 'sell' it to the shop or 'keep' it (inventory; full → the swap prompt). */
    settleOff (how) {
        const off = this.off
        if (!off) return false
        this.off = null
        if (how === 'sell') this.earn(this.sellValue(off.id, off.cond))
        else this.inventory.grant(off.id, 1, { cond: off.cond })
        this.onChange()
        return true
    }

    /** Leaving with a part still on the bench keeps it — nothing is ever thrown away silently. */
    close () { if (this.off) this.settleOff('keep') }
}
