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
//
// The renderer-agnostic half (the fuel-stop.js pattern): main.js owns the DOM, this owns the rules,
// so a headless gate can drive a whole visit. Every dependency arrives through the constructor.

import { PARTS, SLOTS, REPAIRS, REPAIR_CAP, REPAIR_STEP, PATCH, SELL_FRACTION, socketsFor, takes } from '../data/parts.js'
import { TRACKS, TIRE_IDS, WHEEL_IDS } from './damage.js'

const cents = (x) => Math.round(x * 100) / 100
const EPS = 1e-9
const ALIGN_FLOOR = 0.02   // a drive leaves alignment a hair under straight: not a job
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
     *   onChange()                 something changed; the screen re-renders
     */
    constructor (deps) {
        Object.assign(this, deps)
        this.onChange ??= () => {}
        this.off = null      // the part just taken off, waiting on sell / keep: { id, cond, flat }
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
