// ── FEAT-122: the inventory — what the player owns this run ──────────────────────────────────
//
// Owner rulings (2026-10-16, items.md Gaps #3 — full text in the FEAT-122 ticket):
//   • MASS + SLOTS. Every stowed item is real load on the chassis (`stowedKg` → main.js →
//     syncChassisMass); on top of that the truck has `inventorySlots` (8 stock, bed parts add).
//     Consumables and food STACK — one kind, one slot. Tools, camp gear and unfitted parts take a
//     slot EACH. Fitted parts and mission cargo take none (cargo is payload, not inventory).
//   • ONE GRANT PATH. Rewards (FEAT-67), shop purchases (FEAT-104) and finds all call grant().
//   • FULL → SWAP PROMPT. A grant that doesn't fit waits as `pending` until the player drops
//     something and takes it, or leaves it. There is ONE pending place: a second grant arriving
//     while one waits replaces it (the first is left behind).
//   • QUICK SLOTS 1–4 are SHORTCUTS to owned items, not extra storage. An item whose effect is
//     built auto-binds to the first free one; it unbinds when the last unit is gone.
//   • Items die with the run (SM-INV-8/9): start() empties everything. The run save (FEAT-42,
//     SM-4) will carry `runInventory`; until then it lives in memory.
//
// Run-layer state is a plain module object (the economy.js `runEconomy` pattern). Imports only the
// catalog, so the headless gate runs it in pure node.

import { ITEMS, STACKING_KINDS } from '../data/items.js'

export const QUICK_SLOTS = 4

export const runInventory = {
    entries: [],                          // { id, n } — a stacking kind has ONE entry; others one per unit
    pending: null,                        // { id, n } waiting on a free slot (the swap prompt)
    quick: new Array(QUICK_SLOTS).fill(null),   // item ids bound to keys 1–4
}

const _stacks = (id) => STACKING_KINDS.has(ITEMS[id].kind)

export class InventorySystem {
    /**
     * @param {object} deps - adapter into main.js:
     *   slotCap()          — the truck's slot count (RANGER_PARAMS.inventorySlots)
     *   onMassChange(kg)   — stowed mass changed; main.js pushes it onto the chassis
     *   onChange()         — anything changed; the screen re-renders
     *   effects            — { [hook]: () => void } for items whose effect is built (ITEMS[id].use)
     */
    constructor (deps = {}) {
        this._slotCap = deps.slotCap ?? (() => 8)
        this._onMassChange = deps.onMassChange ?? (() => {})
        this._onChange = deps.onChange ?? (() => {})
        this._effects = deps.effects ?? {}
    }

    /** Begin a story run: nothing owned. Called from onRegionLive beside economySystem.start(). */
    start () {
        runInventory.entries = []
        runInventory.pending = null
        runInventory.quick.fill(null)
        this._changed()
    }

    slotCap () { return this._slotCap() }
    slotsUsed () { return runInventory.entries.length }
    stowedKg () { return runInventory.entries.reduce((kg, e) => kg + e.n * ITEMS[e.id].massKg, 0) }
    pending () { return runInventory.pending }
    nameOf (id) { return ITEMS[id]?.name ?? id }
    usable (id) { const h = ITEMS[id]?.use; return !!(h && this._effects[h]) }

    /** Slots a grant of `n` × `id` would need right now. */
    _need (id, n) {
        if (!_stacks(id)) return n
        return runInventory.entries.some(e => e.id === id) ? 0 : 1
    }
    fits (id, n = 1) { return this.slotsUsed() + this._need(id, n) <= this.slotCap() }

    /**
     * THE grant path. Returns 'taken', 'pending' (no room — the swap prompt), or null for an id the
     * catalog doesn't know.
     */
    grant (id, n = 1) {
        if (!ITEMS[id]) return null
        if (!this.fits(id, n)) {
            runInventory.pending = { id, n }
            this._changed()
            return 'pending'
        }
        const e = _stacks(id) && runInventory.entries.find(e => e.id === id)
        if (e) e.n += n
        else if (_stacks(id)) runInventory.entries.push({ id, n })
        else for (let i = 0; i < n; i++) runInventory.entries.push({ id, n: 1 })
        this._changed()
        return 'taken'
    }

    /** Swap prompt: take the waiting item if it fits now. */
    takePending () {
        const p = runInventory.pending
        if (!p || !this.fits(p.id, p.n)) return false
        runInventory.pending = null
        return this.grant(p.id, p.n) === 'taken'
    }

    leavePending () {
        runInventory.pending = null
        this._changed()
    }

    /** Drop the entry at `index` (the whole stack, for a stacking kind). */
    drop (index) {
        if (!runInventory.entries[index]) return false
        runInventory.entries.splice(index, 1)
        this._changed()
        return true
    }

    /** Use one unit: run its effect and spend it. False if not owned or its effect isn't built. */
    use (id) {
        const i = runInventory.entries.findIndex(e => e.id === id)
        if (i < 0 || !this.usable(id)) return false
        this._effects[ITEMS[id].use]()
        const e = runInventory.entries[i]
        if (--e.n <= 0) runInventory.entries.splice(i, 1)
        this._changed()
        return true
    }

    /** Keys 1–4: use whatever quick slot `slot` (0-based) points at. */
    useQuick (slot) {
        const id = runInventory.quick[slot]
        return id ? this.use(id) : false
    }

    /** Rows for the screen: the entry, its catalog line, and its quick key (1-based) if bound. */
    list () {
        return runInventory.entries.map((e, index) => {
            const q = runInventory.quick.indexOf(e.id)
            return { index, id: e.id, n: e.n, ...ITEMS[e.id], usable: this.usable(e.id), key: q < 0 ? null : q + 1 }
        })
    }

    _changed () {
        const q = runInventory.quick
        for (let i = 0; i < q.length; i++) {
            if (q[i] && !runInventory.entries.some(e => e.id === q[i])) q[i] = null
        }
        for (const e of runInventory.entries) {
            if (!this.usable(e.id) || q.includes(e.id)) continue
            const free = q.indexOf(null)
            if (free >= 0) q[free] = e.id
        }
        this._onMassChange(this.stowedKg())
        this._onChange()
    }

    /** Self-contained debug folder (the EconomySystem.addGui pattern): grant any catalog item. */
    addGui (gui) {
        if (!gui) return null
        const f = gui.addFolder('Story · Inventory (FEAT-122)')
        const ctl = { item: Object.keys(ITEMS)[0], grant: () => this.grant(ctl.item) }
        f.add(ctl, 'item', Object.keys(ITEMS)).name('item')
        f.add(ctl, 'grant').name('grant item')
        f.close()
        return f
    }
}
