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
//   • THE FRESH CLOCK (FEAT-230 slice 2, items.md §1b, DEC-338): an item with `freshH` carries `ages` on its entry,
//     one per unit, game hours of fresh life spent; a unit at freshH is gone, the rest of the stack stays. It runs on
//     the ONE world clock (tick, fed daySystem.clockH()), so it runs asleep and holds wherever that clock holds (the
//     brake's latch, DEC-289; an idle camp; the opening's evening). An iced cooler runs `holds` units of food at its
//     coolRate. Ice is on the clock too (it melts); a bag used into a cooler becomes the cooler's `iceH`. A save
//     without `ages` loads fresh.
//   • Items die with the run (SM-INV-8/9): start() resets to the starting kit — the equipped Pack
//     with the bedroll in it. The run save (FEAT-42, SM-4) will carry `runInventory`; until then
//     it lives in memory.
//
// Run-layer state is a plain module object (the economy.js `runEconomy` pattern). Imports only the
// catalog, so the headless gate runs it in pure node.

import { ITEMS, STACKING_KINDS } from '../data/items.js'
import { runLog } from './run-log.js'   // FEAT-242: the opt-in run log (every hook is behind runLog.on)

export const QUICK_SLOTS = 4

export const runInventory = {
    entries: [],                          // { id, n } — a stacking kind has ONE entry; others one per unit.
                                          // A pack adds { equipped, contents: [itemId, …] }.
    pending: null,                        // { id, n } waiting on a free slot (the swap prompt)
    quick: new Array(QUICK_SLOTS).fill(null),   // item ids bound to keys 1–4
}

const _stacks = (id) => STACKING_KINDS.has(ITEMS[id].kind)
/** FEAT-230: units to a slot — ITEMS[id].stack (the potato's 5, items.md §1); unset = one slot holds any number. */
const _cap = (id) => ITEMS[id].stack ?? Infinity
const _isPack = (e) => ITEMS[e?.id]?.kind === 'pack'
const _bed = (id) => ITEMS[id]?.bed ?? null   // FEAT-171: 'ground' | 'bedding' | 'blanket'
const _isBedding = (id) => _bed(id) === 'bedding'
// A can (`capGal`) comes full; its entry carries the gallons in it as `gal`.
/** The starting kit's one entry: the equipped Pack with the bedroll in it (a fresh copy each call — entries are mutated).
 *  FEAT-184 (DEC-238): in a played tutorial it is Larry's old pack, which mom sends back to him and he gives you. */
export const startingPack = () => ({ id: 'pack', n: 1, equipped: true, contents: ['bedroll'] })
/** FEAT-230 (DEC-338): a fresh-clock entry's per-unit ages, youngest first, synced to its count: a new unit comes in
 *  fresh, a spent one is the oldest (the oldest is eaten first). Call it before changing `n` by hand. */
const _ages = (e) => {
    const a = (e.ages ??= [])
    while (a.length < e.n) a.unshift(0)
    a.length = e.n
    return a
}
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
     *   notes              — BUG-211: { [hook]: (entry) => string | null } what using it now would waste (a meal on a full
     *                        stomach), shown under its button before the player uses it
     */
    constructor (deps = {}) {
        this._slotCap = deps.slotCap ?? (() => 8)
        this._onMassChange = deps.onMassChange ?? (() => {})
        this._onChange = deps.onChange ?? (() => {})
        this._onDrop = deps.onDrop ?? (() => {})
        this._effects = deps.effects ?? {}
        this._notes = deps.notes ?? {}
    }

    /** Begin a story run with the starting kit. Called from onRegionLive beside economySystem.start(). */
    start () {
        this._lastH = null   // the fresh clock re-seats on the next tick
        runInventory.entries = [startingPack()]
        runInventory.pending = null
        runInventory.quick.fill(null)
        this._changed()
    }

    /** FEAT-42: put a saved runInventory back (the run save) and push its mass onto the chassis. */
    restore (s) {
        this._lastH = null
        runInventory.entries = s.entries
        runInventory.pending = s.pending
        runInventory.quick.splice(0, QUICK_SLOTS, ...s.quick)
        this._changed()
    }

    /** FEAT-212: a copy of everything restore() takes — the shop's cart puts it back on discard (restore a copy of it). */
    snapshot () { return structuredClone({ entries: runInventory.entries, pending: runInventory.pending, quick: runInventory.quick }) }

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
    /** FEAT-231: is this item in the run inventory (the bed mat / liner look follows it). */
    owns (id) { return runInventory.entries.some(e => e.id === id) }
    /** FEAT-231: the bed floor's grip — the best `bedMu` owned (the bedliner over the mat), null = the bare bed. */
    bedMu () {
        let mu = null
        for (const e of runInventory.entries) {
            const m = ITEMS[e.id]?.bedMu
            if (m != null && (mu == null || m > mu)) mu = m
        }
        return mu
    }
    pending () { return runInventory.pending }
    nameOf (id) { return ITEMS[id]?.name ?? id }
    usable (id) { const h = ITEMS[id]?.use; return !!(h && this._effects[h]) }

    /** BUG-211: what using entry `e` now would waste (the screen's hint), or null. */
    useNote (e) { return this._notes[ITEMS[e.id]?.use]?.(e) ?? null }

    /** Slots a grant of `n` × `id` would need right now. */
    _need (id, n) {
        if (!_stacks(id)) return n
        const have = runInventory.entries.filter(e => e.id === id)
        return Math.ceil((have.reduce((k, e) => k + e.n, 0) + n) / _cap(id)) - have.length
    }
    fits (id, n = 1) { return this.slotsUsed() + this._need(id, n) <= this.slotCap() }

    /**
     * THE grant path. Returns 'taken', 'pending' (no room — the swap prompt), or null for an id the
     * catalog doesn't know. `extra` rides on each non-stacking entry — a used part's `cond`
     * ({ trackId: condition }, src/parts.js) comes off the truck this way and goes back on with it.
     */
    grant (id, n = 1, extra = null) {
        if (!ITEMS[id]) return null
        runLog.on && runLog.event('item', { act: 'grant', id, n, fits: this.fits(id, n) })
        if (!this.fits(id, n)) {
            runInventory.pending = { id, n, extra }
            this._changed()
            return 'pending'
        }
        if (_stacks(id)) {   // fill the open stacks first, then start new ones (a capped kind spans slots)
            for (let left = n; left > 0;) {
                const e = runInventory.entries.find(e => e.id === id && e.n < _cap(id))
                const put = Math.min(left, _cap(id) - (e?.n ?? 0))
                if (e) e.n += put
                else runInventory.entries.push({ id, n: put })
                left -= put
            }
        }
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
        runLog.on && runLog.event('item', { act: 'take', id: e.id })
        runInventory.entries.splice(index, 1)
        this._changed()
        return e
    }

    /** FEAT-184 (DEC-238): take the entry at `index` out of the run whatever its kind (the tutorial's pack, back to mom's). */
    remove (index) {
        const [e] = runInventory.entries.splice(index, 1)
        if (e) { runLog.on && runLog.event('item', { act: 'remove', id: e.id, n: e.n }); this._changed() }
        return e ?? null
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
        runLog.on && runLog.event('item', { act: 'consume', id })
        if (ITEMS[id].freshH) _ages(e)
        e.left = (e.left ?? uses) - 1
        if (e.left <= 0) { delete e.left; if (--e.n <= 0) runInventory.entries.splice(i, 1) }
        this._changed()
        return true
    }

    /** FEAT-230: turn one unit of `from` into one of `to` (a raw potato cooked). False, nothing changed, if
     *  none is owned or the result has no room (a lone raw frees its slot, so cooking the last one always fits). */
    convert (from, to) {
        if (!this.consume(from)) return false
        if (this.fits(to)) return this.grant(to) === 'taken'
        this.grant(from)
        return false
    }

    /** Drop the entry at `index` (the whole stack, for a stacking kind). Never the equipped pack or a
     *  pack with anything in it. */
    drop (index) {
        const e = runInventory.entries[index]
        if (!e || (_isPack(e) && (e.equipped || e.contents.length))) return false
        runInventory.entries.splice(index, 1)
        runLog.on && runLog.event('item', { act: 'drop', id: e.id, n: e.n })
        if (ITEMS[e.id].freshH) _ages(e)
        if (this._lastH != null) e.droppedH = this._lastH   // its fresh clock runs on the ground (restoreEntry)
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
        const s = _stacks(entry.id) && runInventory.entries.find(e => e.id === entry.id && e.n + entry.n <= _cap(entry.id))
        // ponytail: one open roll per stack — merging two keeps the emptier one's uses, so a merge can
        // lose a few but never mints any; track open rolls per unit if that ever matters.
        // The fresh clock ran on the ground too, uncooled, and a cooler's ice melted (drop stamped `droppedH`); a merged
        // stack keeps every unit's own age.
        const e = { ...entry }
        if (e.droppedH != null) {
            const g = Math.max(0, (this._lastH ?? e.droppedH) - e.droppedH)
            if (it.freshH) e.ages = _ages(e).map(a => a + g)
            if (e.iceH) e.iceH = Math.max(0, e.iceH - g)
            delete e.droppedH
        }
        if (s && it.freshH) s.ages = [..._ages(s), ..._ages(e)].sort((x, y) => x - y)
        if (s) { s.n += e.n; if (e.left != null) s.left = Math.min(s.left ?? it.uses, e.left) }
        else runInventory.entries.push(e)
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
        if (ITEMS[id].freshH) _ages(e)   // the unit spent is the oldest: its age is still the last one (iceCooler reads it)
        if (--e.n <= 0) runInventory.entries.splice(i, 1)
        if (this._effects[ITEMS[id].use](e) === false) {
            if (e.n++ <= 0) runInventory.entries.splice(i, 0, e)
            return false
        }
        runLog.on && runLog.event('item', { act: 'use', id })
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

    /**
     * FEAT-230 slice 2 (DEC-338): advance the fresh clock to world time `nowH` (daySystem.clockH(), every fixed step; a
     * sleep's jump lands on the next step). Every unit ages on its own and goes alone at freshH. The iced coolers, best
     * rate first, each chill `holds` units of food (youngest first, so a stack bigger than the room keeps its oldest
     * out and that one goes first); a unit's cold hours stop when its cooler's ice does, mid-jump included.
     */
    tick (nowH, held = false) {
        const dH = nowH - (this._lastH ?? nowH)
        this._lastH = nowH
        if (held || !(dH > 0)) return   // held: the hours pass unaged (the tutorial, DEC-339)
        const E = runInventory.entries
        const coolers = E.filter(e => ITEMS[e.id].coolRate && e.iceH > 0)
            .sort((a, b) => ITEMS[a.id].coolRate - ITEMS[b.id].coolRate).map(c => ({ c, room: ITEMS[c.id].holds }))
        let gone = false
        for (const e of E) {
            const it = ITEMS[e.id]
            if (!it.freshH) continue
            const a = _ages(e)
            for (let u = 0; u < a.length; u++) {
                const k = it.kind === 'food' && coolers.find(k => k.room > 0)
                if (k) k.room--
                const cold = k ? Math.min(dH, k.c.iceH) : 0
                a[u] += cold * (k ? ITEMS[k.c.id].coolRate : 1) + dH - cold
            }
            a.sort((x, y) => x - y)
            while (e.n && a[e.n - 1] >= it.freshH) { a.pop(); e.n--; gone = true }
        }
        for (const { c } of coolers) c.iceH = Math.max(0, c.iceH - dH)
        if (!gone) return
        for (let i = E.length; i--;) if (E[i].n <= 0) E.splice(i, 1)
        this._changed()
    }

    /** The Ice effect: the bag goes into the owned cooler with the least ice left, which then holds what the bag had
     *  left of its own day, stretched to the cooler's `iceLastsH`. False (keep the bag) with no cooler aboard. */
    iceCooler (bag) {
        const c = runInventory.entries.filter(e => ITEMS[e.id].coolRate).sort((a, b) => (a.iceH ?? 0) - (b.iceH ?? 0))[0]
        if (!c) return false
        const age = bag?.ages?.length > bag.n ? bag.ages[bag.ages.length - 1] : 0   // use() took the oldest off `n`
        c.iceH = Math.max(c.iceH ?? 0, ITEMS[c.id].iceLastsH * Math.max(0, 1 - age / ITEMS.ice.freshH))
        return true
    }

    /** The freshness bar (inventory-screen.js), 0–1, or null for no bar: a stack shows its oldest unit (the next to
     *  go), a cooler its ice while it has any. On the ground the clock ran since `droppedH`. */
    freshLeft (e) {
        const it = ITEMS[e.id], g = e.droppedH != null && this._lastH != null ? Math.max(0, this._lastH - e.droppedH) : 0
        if (it.iceLastsH) return e.iceH > 0 ? Math.max(0, e.iceH - g) / it.iceLastsH : null
        if (!it.freshH || !e.n) return null
        return Math.max(0, 1 - (_ages(e)[e.n - 1] + g) / it.freshH)
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
        return { id: e.id, n: e.n, ...ITEMS[e.id], usable: this.usable(e.id), note: this.useNote(e),
                 equipped: !!e.equipped, cond: e.cond ?? null, flat: !!e.flat,
                 tire: e.tire, wheel: e.wheel, wheelCond: e.wheelCond, left: e.left ?? ITEMS[e.id].uses ?? null, gal: e.gal ?? null, fresh: this.freshLeft(e), contents: e.contents?.map(id => ({ id, ...ITEMS[id] })) ?? null }
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
