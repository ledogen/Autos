// ── SM-3: the fitted parts — what is bolted onto the truck this run ─────────────────────────────
//
// The catalog is data/parts.js. This owns which part sits in each slot and what fitting one does:
//   • the part's `patch` is laid over params (the fitTransmission pattern), so physics reads plain
//     numbers and never knows a parts system exists;
//   • the slot's damage tracks take the incoming part's condition (1 = new) and its family's
//     durability (damage.js setDurability — the SM-3 parts lever);
//   • the outgoing part comes back as { id, cond } — its tracks' conditions — for the caller to sell
//     or stow (owner, 2026-10-20: that choice is the service center's, push 2).
// FEAT-112's load ratings come from loadUpgrades(), folded by truckConfig().
//
// Run-layer state is a plain module object (the runEconomy / runInventory pattern). Imports only the
// catalog, so the headless gate runs it in pure node; damage arrives as a constructor dependency.

import { PARTS, SLOTS, FAMILY_DURABILITY, stockPart } from '../data/parts.js'

export const runParts = {
    fitted: {},     // slot → part id
}

export class PartsSystem {
    /**
     * @param {object} deps
     *   params     the live vehicle params (RANGER_PARAMS) — patched in place
     *   damage     the DamageModel — conditions and durability per track
     *   onChange() anything fitted changed (main.js re-reads the load config and republishes damage)
     */
    constructor ({ params, damage, onChange = () => {} }) {
        this._params = params
        this._damage = damage
        this._onChange = onChange
    }

    /** A run starts on stock parts. (The jalopy roll, when it lands, fits over this.) */
    start () {
        for (const slot of Object.keys(SLOTS)) this._fit(stockPart(slot), null)
        this._onChange()
    }

    fitted (slot) { return runParts.fitted[slot] }

    /** The fitted part's condition as { trackId: c } — what it would carry off the truck. */
    condOf (slot) {
        return Object.fromEntries(SLOTS[slot].tracks.map(t => [t, this._damage.get(t)]))
    }

    /**
     * Bolt `id` on. `cond` is the incoming part's { trackId: c } (a used part from inventory); omitted
     * means new. Returns what came off as { id, cond }, or null for an unknown id.
     */
    fit (id, cond = null) {
        const part = PARTS[id]
        if (!part) return null
        const off = { id: runParts.fitted[part.slot], cond: this.condOf(part.slot) }
        this._fit(id, cond)
        this._onChange()
        return off
    }

    _fit (id, cond) {
        const part = PARTS[id]
        Object.assign(this._params, part.patch)
        runParts.fitted[part.slot] = id
        const dur = FAMILY_DURABILITY[part.family]
        for (const t of SLOTS[part.slot].tracks) {
            this._damage.setDurability(t, dur)
            this._damage.set(t, cond?.[t] ?? 1)
        }
        // A new tire is not a flat one: a puncture is state beside the condition (damage.js setAll).
        if (part.slot === 'tires') this._damage.flat.fill(false)
    }

    /** FEAT-112 upgrades for truckConfig(): each fitted part's load ratings, laid over the stock ones. */
    loadUpgrades () {
        return Object.values(runParts.fitted)
            .filter(id => PARTS[id].load)
            .map(id => ({ apply: c => ({ ...c, ...PARTS[id].load }) }))
    }

    /** Debug folder (the InventorySystem.addGui pattern): pick any part per slot and fit it new. */
    addGui (gui) {
        if (!gui) return null
        const f = gui.addFolder('Story · Parts (SM-3)')
        const self = this
        for (const slot of Object.keys(SLOTS)) {
            const ids = Object.keys(PARTS).filter(id => PARTS[id].slot === slot)
            // An accessor, so the dropdown follows fits made elsewhere (a run start, the shop).
            const ctl = { get part () { return runParts.fitted[slot] ?? stockPart(slot) }, set part (id) { self.fit(id) } }
            f.add(ctl, 'part', Object.fromEntries(ids.map(id => [PARTS[id].name, id])))
                .name(SLOTS[slot].name).listen()
        }
        f.close()
        return f
    }
}
