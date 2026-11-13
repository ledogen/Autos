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
//   • BACKPACKS (items.md §2c; owner 2026-10-16). A pack takes ONE truck slot and holds its own
//     `packSlots`; camp gear packed inside frees its truck slot (it is still truck mass). Several
//     packs may be owned, never fewer than one; exactly one is EQUIPPED, and it always holds a
//     sleeping item — swapped for another bed, never removed for nothing. Only camp gear packs.
//   • Items die with the run (SM-INV-8/9): start() resets to the starting kit — the equipped Pack
//     with the bedroll in it. The run save (FEAT-42, SM-4) will carry `runInventory`; until then
//     it lives in memory.
//
// Run-layer state is a plain module object (the economy.js `runEconomy` pattern). Imports only the
// catalog, so the headless gate runs it in pure node.

import { ITEMS, STACKING_KINDS } from '../data/items.js'

export const QUICK_SLOTS = 4

export const runInventory = {
    entries: [],                          // { id, n } — a stacking kind has ONE entry; others one per unit.
                                          // A pack adds { equipped, contents: [itemId, …] }.
    pending: null,                        // { id, n } waiting on a free slot (the swap prompt)
    quick: new Array(QUICK_SLOTS).fill(null),   // item ids bound to keys 1–4
}

const _stacks = (id) => STACKING_KINDS.has(ITEMS[id].kind)
const _isPack = (e) => ITEMS[e?.id]?.kind === 'pack'
const _bed = (id) => ITEMS[id]?.bed ?? null   // FEAT-171: 'ground' | 'bedding' | 'blanket'
const _isBedding = (id) => _bed(id) === 'bedding'
// A can (`capGal`) comes full; its entry carries the gallons in it as `gal`.
const _newEntry = (id) => ITEMS[id].kind === 'pack' ? { id, n: 1, equipped: false, contents: [] }
    : ITEMS[id].capGal ? { id, n: 1, gal: ITEMS[id].capGal } : { id, n: 1 }

/** One entry's real mass [kg]: the stack, a can's gas, a pack's contents. */
export const entryKg = (e) => e.n * ITEMS[e.id].massKg + (e.gal ?? 0) * (ITEMS[e.id].kgPerGal ?? 0)
    + (e.contents ?? []).reduce((k, id) => k + ITEMS[id].massKg, 0)

export class InventorySystem {
    /**
     * @param {object} deps - adapter into main.js:
     *   slotCap()          — the truck's slot count (RANGER_PARAMS.inventorySlots)
     *   onMassChange(kg)   — stowed mass changed; main.js pushes it onto the chassis
     *   onChange()         — anything changed; the screen re-renders
     *   onDrop(entry)      — FEAT-143: an entry was dropped; main.js lays it on the ground
     *   effects            — { [hook]: () => void } for items whose effect is built (ITEMS[id].use)
     */
    constructor (deps = {}) {
        this._slotCap = deps.slotCap ?? (() => 8)
        this._onMassChange = deps.onMassChange ?? (() => {})
        this._onChange = deps.onChange ?? (() => {})
        this._onDrop = deps.onDrop ?? (() => {})
        this._effects = deps.effects ?? {}
    }

    /** Begin a story run with the starting kit. Called from onRegionLive beside economySystem.start(). */
    start () {
        runInventory.entries = [{ id: 'pack', n: 1, equipped: true, contents: ['bedroll'] }]
        runInventory.pending = null
        runInventory.quick.fill(null)
        this._changed()
    }

    /** FEAT-42: put a saved runInventory back (the run save) and push its mass onto the chassis. */
    restore (s) {
        runInventory.entries = s.entries
        runInventory.pending = s.pending
        runInventory.quick.splice(0, QUICK_SLOTS, ...s.quick)
        this._changed()
    }

    slotCap () { return this._slotCap() }
    slotsUsed () { return runInventory.entries.length }
    stowedKg () {
        return runInventory.entries.reduce((kg, e) => kg + entryKg(e), 0)
    }
    equippedIndex () { return runInventory.entries.findIndex(e => e.equipped) }
    /** What comes to camp: the equipped pack's contents (items.md §2c) — FEAT-66 renders exactly this. */
    packed () { return runInventory.entries.find(e => e.equipped)?.contents ?? [] }
    /** How far past the shoulder camp may be (items.md §2c): the equipped pack's reach, camp's tether (FEAT-182). */
    reachM () { return ITEMS[runInventory.entries.find(e => e.equipped)?.id]?.reachM }
    /** Camp sleep's recovery bonus: the `rest` of everything in the equipped pack (items.md §2b). */
    restBonus () { return this.packed().reduce((s, id) => s + (ITEMS[id].rest ?? 0), 0) }
    /** The vibe segments packed gear fills on the chosen site (camp.js vibeAssist). */
    fills () { return new Set(this.packed().map(id => ITEMS[id].fills).filter(Boolean)) }
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
     * catalog doesn't know. `extra` rides on each non-stacking entry — a used part's `cond`
     * ({ trackId: condition }, src/parts.js) comes off the truck this way and goes back on with it.
     */
    grant (id, n = 1, extra = null) {
        if (!ITEMS[id]) return null
        if (!this.fits(id, n)) {
            runInventory.pending = { id, n, extra }
            this._changed()
            return 'pending'
        }
        const e = _stacks(id) && runInventory.entries.find(e => e.id === id)
        if (e) e.n += n
        else if (_stacks(id)) runInventory.entries.push({ id, n })
        else for (let i = 0; i < n; i++) runInventory.entries.push({ ..._newEntry(id), ...extra })
        this._changed()
        return 'taken'
    }

    /** Swap prompt: take the waiting item if it fits now. */
    takePending () {
        const p = runInventory.pending
        if (!p || !this.fits(p.id, p.n)) return false
        runInventory.pending = null
        return this.grant(p.id, p.n, p.extra) === 'taken'
    }

    leavePending () {
        runInventory.pending = null
        this._changed()
    }

    /** Take the entry at `index` out to bolt it on (the service center): returns it, or null. */
    take (index) {
        const e = runInventory.entries[index]
        if (!e || ITEMS[e.id].kind !== 'part') return null
        runInventory.entries.splice(index, 1)
        this._changed()
        return e
    }

    /** Change fields on the entry at `index` in place — a repaired part's `cond`, a plugged tire's `flat`. */
    amend (index, fields) {
        const e = runInventory.entries[index]
        if (!e) return false
        Object.assign(e, fields)
        this._changed()
        return true
    }

    /**
     * Spend one unit of `id` without its effect (a plug kit spent by the repair it was chosen for). An
     * item with `uses` (a pack of zip ties, a roll of tape) spends one use of the open unit, kept on
     * the stack as `left`; the unit goes when its last use does, and the next one opens full.
     */
    consume (id) {
        const i = runInventory.entries.findIndex(e => e.id === id)
        if (i < 0) return false
        const e = runInventory.entries[i], uses = ITEMS[id].uses ?? 1
        e.left = (e.left ?? uses) - 1
        if (e.left <= 0) { delete e.left; if (--e.n <= 0) runInventory.entries.splice(i, 1) }
        this._changed()
        return true
    }

    /** Drop the entry at `index` (the whole stack, for a stacking kind). Never the equipped pack or a
     *  pack with anything in it. */
    drop (index) {
        const e = runInventory.entries[index]
        if (!e || (_isPack(e) && (e.equipped || e.contents.length))) return false
        runInventory.entries.splice(index, 1)
        this._onDrop(e)   // FEAT-143: it goes on the ground, not out of the game
        this._changed()
        return true
    }

    /**
     * FEAT-143: put back an entry picked up off the ground, exactly as it went down (its condition,
     * gallons, contents, an open roll's uses). No room → false, and it stays on the ground: never the
     * swap prompt, whose "leave it" would delete it.
     */
    restoreEntry (entry) {
        const it = ITEMS[entry?.id]
        if (!it || !this.fits(entry.id, entry.n)) return false
        const s = _stacks(entry.id) && runInventory.entries.find(e => e.id === entry.id)
        // ponytail: one open roll per stack — merging two keeps the emptier one's uses, so a merge can
        // lose a few but never mints any; track open rolls per unit if that ever matters.
        if (s) { s.n += entry.n; if (entry.left != null) s.left = Math.min(s.left ?? it.uses, entry.left) }
        else runInventory.entries.push({ ...entry })
        this._changed()
        return true
    }

    /**
     * Move the camp item at truck entry `index` into a pack (default: the equipped one). A bed layer
     * going into a pack that already has one of that layer SWAPS (FEAT-171): the old one takes the truck
     * slot the new one left.
     */
    packItem (index, packIndex = this.equippedIndex()) {
        if (!this.canPack(index, packIndex)) return false
        const e = runInventory.entries[index], p = runInventory.entries[packIndex]
        const bedAt = _bed(e.id) ? p.contents.findIndex(c => _bed(c) === _bed(e.id)) : -1
        if (bedAt >= 0) {
            runInventory.entries[index] = { id: p.contents[bedAt], n: 1 }
            p.contents[bedAt] = e.id
        } else {
            p.contents.push(e.id)
            runInventory.entries.splice(index, 1)
        }
        this._changed()
        return true
    }

    /** Whether packItem(index, packIndex) would go: a camp item, a pack, and a free slot in it or a bed layer to swap. */
    canPack (index, packIndex = this.equippedIndex()) {
        const e = runInventory.entries[index], p = runInventory.entries[packIndex]
        if (!e || !_isPack(p) || ITEMS[e.id].kind !== 'camp') return false
        return p.contents.length < ITEMS[p.id].packSlots || (!!_bed(e.id) && p.contents.some(c => _bed(c) === _bed(e.id)))
    }

    /** Move pack slot `slot` back into a free truck slot. The equipped pack keeps its bedding. */
    unpackItem (packIndex, slot) {
        const p = runInventory.entries[packIndex]
        const id = _isPack(p) ? p.contents[slot] : undefined
        if (!id || (p.equipped && _isBedding(id)) || this.slotsUsed() >= this.slotCap()) return false
        p.contents.splice(slot, 1)
        runInventory.entries.push({ id, n: 1 })
        this._changed()
        return true
    }

    /** Equip a spare pack. If it has no bedding, the current bedding moves across (it needs a free slot). */
    equip (packIndex) {
        const p = runInventory.entries[packIndex], cur = runInventory.entries[this.equippedIndex()]
        if (!_isPack(p) || p === cur) return false
        if (!p.contents.some(_isBedding)) {
            if (p.contents.length >= ITEMS[p.id].packSlots) return false
            p.contents.push(...cur.contents.splice(cur.contents.findIndex(_isBedding), 1))
        }
        cur.equipped = false
        p.equipped = true
        this._changed()
        return true
    }

    /**
     * Use one unit (entry `i`, default the first of `id`): run its effect and spend it. The unit is
     * out of the inventory while the effect runs — the effect gets its entry (a spare's wear) and the
     * room it left — and goes back where it was if the effect returns false: "nothing to do right
     * now, keep it" (FEAT-50: a gas can poured into a full tank would only be wasted). False too if
     * not owned or its effect isn't built.
     */
    use (id, i = runInventory.entries.findIndex(e => e.id === id)) {
        const e = runInventory.entries[i]
        if (e?.id !== id || !this.usable(id)) return false
        if (--e.n <= 0) runInventory.entries.splice(i, 1)
        if (this._effects[ITEMS[id].use](e) === false) {
            if (e.n++ <= 0) runInventory.entries.splice(i, 0, e)
            return false
        }
        this._changed()
        return true
    }

    /** The cans aboard as fill views { entry, gal, cap } for the pump; refill() writes them back. */
    cans () {
        return runInventory.entries.filter(e => ITEMS[e.id].capGal).map(e => ({ entry: e, gal: e.gal, cap: ITEMS[e.id].capGal }))
    }
    refill (cans) {
        for (const c of cans) { const i = this.indexOf(c.entry); if (i >= 0) runInventory.entries[i].gal = c.gal }
        this._changed()
    }

    /** Where an entry an effect was handed (use → effect) sits now: a choice it opens acts on it later. */
    indexOf (entry) { return runInventory.entries.indexOf(entry) }

    /** Keys 1–4: use whatever quick slot `slot` (0-based) points at. */
    useQuick (slot) {
        const id = runInventory.quick[slot]
        return id ? this.use(id) : false
    }

    /** Rows for the screen: the entry, its catalog line, and its quick key (1-based) if bound. */
    list () {
        return runInventory.entries.map((e, index) => {
            const q = runInventory.quick.indexOf(e.id)
            return { index, ...this.rowOf(e), key: q < 0 ? null : q + 1 }
        })
    }

    /** One entry as the screen reads it — a truck slot, or an item lying on the ground (FEAT-143). */
    rowOf (e) {
        return { id: e.id, n: e.n, ...ITEMS[e.id], usable: this.usable(e.id),
                 equipped: !!e.equipped, cond: e.cond ?? null, flat: !!e.flat,
                 tire: e.tire, wheel: e.wheel, wheelCond: e.wheelCond, left: e.left ?? ITEMS[e.id].uses ?? null, gal: e.gal ?? null, contents: e.contents?.map(id => ({ id, ...ITEMS[id] })) ?? null }
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
