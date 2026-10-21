// ── SM-3: the fitted parts — what is bolted onto the truck this run ─────────────────────────────
//
// The catalog is data/parts.js. This owns which part sits in each socket and what fitting one does:
//   • the part's `patch` is laid over params (the fitTransmission pattern), and a tire's `grip` is
//     published per wheel as params._tireGrip, so physics reads plain numbers and never knows a
//     parts system exists;
//   • the socket's damage track takes the incoming part's condition (1 = new) and its family's
//     durability (damage.js setDurability — the SM-3 parts lever);
//   • the outgoing part comes back as { id, cond, flat } — its track's condition, and for a tire
//     whether it was punctured — for the caller to sell or stow (owner, 2026-10-20).
// FEAT-112's load ratings come from loadUpgrades(), folded by truckConfig().
//
// Run-layer state is a plain module object (the runEconomy / runInventory pattern). Imports only the
// catalog, so the headless gate runs it in pure node; damage arrives as a constructor dependency.

import { PARTS, SLOTS, FAMILY_DURABILITY, stockPart, takes, socketsFor } from '../data/parts.js'
import { TIRE_IDS } from './damage.js'

// Load rating → every socket a part carrying it can sit in: { tires: [4 corners], springs: [front, rear], … }
const RATED = {}
for (const s of Object.keys(SLOTS)) {
    for (const k of new Set(Object.values(PARTS).filter(p => p.slot === takes(s)).flatMap(p => Object.keys(p.load ?? {})))) {
        (RATED[k] ??= []).push(s)
    }
}

export const runParts = {
    fitted: {},     // socket → part id
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
        for (const socket of Object.keys(SLOTS)) this._fit(stockPart(socket), socket, 1)
        this._onChange()
    }

    fitted (socket) { return runParts.fitted[socket] }

    /** The fitted part's condition (1 for a socket the damage model doesn't track). */
    condOf (socket) {
        const t = SLOTS[socket].tracks[0]
        return t ? this._damage.get(t) : 1
    }

    /**
     * Bolt `id` into `socket` (a part with one socket needs none named; a tire needs its corner).
     * `cond` is the incoming part's condition (a used part from inventory); omitted means new.
     * Returns what came off as { id, cond, flat }, or null if `id` doesn't fit there.
     */
    fit (id, cond = null, socket = PARTS[id]?.slot) {
        if (!socketsFor(id).includes(socket)) return null
        const wheel = TIRE_IDS.indexOf(socket)
        const off = { id: runParts.fitted[socket], cond: this.condOf(socket), flat: wheel >= 0 && this._damage.flat[wheel] }
        this._fit(id, socket, cond ?? 1)
        this._onChange()
        return off
    }

    _fit (id, socket, cond) {
        const part = PARTS[id]
        Object.assign(this._params, part.patch)
        runParts.fitted[socket] = id
        for (const t of SLOTS[socket].tracks) {
            this._damage.setDurability(t, FAMILY_DURABILITY[part.family])
            this._damage.set(t, cond)
        }
        const wheel = TIRE_IDS.indexOf(socket)
        if (wheel >= 0) {
            // A tire going on holds air: a puncture is state beside the condition (damage.js setAll).
            this._damage.flat[wheel] = false
            ;(this._params._tireGrip ??= [1, 1, 1, 1])[wheel] = part.grip
        }
    }

    /**
     * FEAT-112 upgrades for truckConfig(). A rating counts only when EVERY socket that carries it
     * has a part rated for it — the weakest spring, shock or tire sets the limit (§3f), so one
     * heavy-duty axle or three load-range tires move nothing. Field-wise minimum over the sockets.
     */
    loadUpgrades () {
        return Object.entries(RATED).flatMap(([k, sockets]) => {
            const rs = sockets.map(s => PARTS[runParts.fitted[s]]?.load?.[k])
            if (!rs.every(Boolean)) return []
            const min = Object.fromEntries(Object.keys(rs[0]).map(f => [f, Math.min(...rs.map(r => r[f]))]))
            return [{ apply: c => ({ ...c, [k]: min }) }]
        })
    }

    /** Debug folder (the InventorySystem.addGui pattern): pick any part per socket and fit it new. */
    addGui (gui) {
        if (!gui) return null
        const f = gui.addFolder('Story · Parts (SM-3)')
        const self = this
        for (const socket of Object.keys(SLOTS)) {
            const ids = Object.keys(PARTS).filter(id => socketsFor(id).includes(socket))
            // An accessor, so the dropdown follows fits made elsewhere (a run start, the shop).
            const ctl = { get part () { return runParts.fitted[socket] ?? stockPart(socket) }, set part (id) { self.fit(id, null, socket) } }
            f.add(ctl, 'part', Object.fromEntries(ids.map(id => [PARTS[id].name, id])))
                .name(SLOTS[socket].name).listen()
        }
        f.close()
        return f
    }
}
