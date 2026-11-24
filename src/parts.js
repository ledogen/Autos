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
import { TIRE_IDS, WHEEL_IDS } from './damage.js'
import { ENGINES } from '../data/engines.js'
import { engineTorqueAt } from './drivetrain.js'

// Load rating → every socket a part carrying it can sit in: { tires: [4 corners], springs: [front, rear], … }
const RATED = {}
for (const s of Object.keys(SLOTS)) {
    for (const k of new Set(Object.values(PARTS).filter(p => p.slot === takes(s)).flatMap(p => Object.keys(p.load ?? {})))) {
        (RATED[k] ??= []).push(s)
    }
}

const PATCH_KEYS = [...new Set(Object.values(PARTS).flatMap(p => Object.keys(p.patch)))]

export const runParts = {
    fitted: {},     // socket → part id
}

/** FEAT-204: the bolt-on models a fitted set shows (.glb stems) — each fitted part's `model`, or its `modelWith`
 *  alternative when that socket holds a part with a model too (DEC-340: the light bar on the rack). Pure. */
export const modModels = (fitted) => Object.values(fitted).map(id => PARTS[id]).filter(p => p?.model)
    .map(p => Object.entries(p.modelWith ?? {}).find(([s]) => PARTS[fitted[s]]?.model)?.[1] ?? p.model)

/** The rpm grid a modded curve is sampled on, on top of the engine's own points (so the stock curve is exact). */
const CURVE_STEP_RPM = 250

/**
 * FEAT-325: the engine params a fitted set makes — the engine part's data/engines.js entry, its curve scaled by its
 * `torqueX` (the I4's detune) and by (1 + gain) of every fitted power mod's `torque` curve at each rpm, its inertia
 * by every mod's `inertiaX`. Pure; null when the engine socket holds no engine entry.
 */
export function engineFor (fitted) {
    const e = PARTS[fitted.engine]
    const base = e && ENGINES[e.engine]
    if (!base) return null
    const mods = Object.values(fitted).map(id => PARTS[id]).filter(p => p?.torque || p?.inertiaX)
    const c = base.engineTorqueCurve, lo = c[0][0], hi = c.at(-1)[0]
    const rpms = [...new Set([...c.map(([r]) => r), ...Array.from({ length: Math.floor((hi - lo) / CURVE_STEP_RPM) }, (_, i) => lo + (i + 1) * CURVE_STEP_RPM)])]
        .filter(r => r <= hi).sort((a, b) => a - b)
    const gain = (r) => mods.reduce((x, m) => x * (1 + (m.torque ? engineTorqueAt(r, m.torque) : 0)), e.torqueX ?? 1)
    return {
        ...base,
        engine: e.engine,
        engineTorqueCurve: rpms.map(r => [r, engineTorqueAt(r, c) * gain(r)]),
        engineInertia: mods.reduce((J, m) => J * (m.inertiaX ?? 1), base.engineInertia),
    }
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

    /**
     * Put a MOUNTED pair on `corner` (0=FL … 3=RR), tire and wheel: `m` is a spare's inventory entry,
     * { tire?, cond?, wheel?, wheelCond? }, and what it doesn't name is a new spare (data/parts.js
     * `mounted`). Returns the pair that came off in the same shape, still mounted, with its puncture.
     * The roadside spare and the service center's swap both come through here.
     */
    fitMounted (m, corner) {
        const def = PARTS.spareTire.mounted
        const tire = this.fit(m.tire ?? def.tire, m.cond, TIRE_IDS[corner])
        const wheel = this.fit(m.wheel ?? def.wheel, m.wheelCond, WHEEL_IDS[corner])
        return { tire: tire.id, cond: tire.cond, flat: tire.flat, wheel: wheel.id, wheelCond: wheel.cond }
    }

    /**
     * Everything a fit can touch, for the shop's live preview to put back EXACTLY (owner, 2026-10-22):
     * every param any part patches, the per-wheel grip, the fitted map, each track's condition and
     * durability, the flats. restore() hands it back and re-runs onChange.
     */
    snapshot () {
        const d = this._damage
        return {
            params: Object.fromEntries(PATCH_KEYS.map(k => [k, this._params[k]])),
            grip: this._params._tireGrip?.slice(),
            fitted: { ...runParts.fitted },
            condition: { ...d.condition },
            durability: { ...d._durabilityScale },
            flat: d.flat.slice(),
        }
    }

    restore (s) {
        const d = this._damage
        Object.assign(this._params, s.params)
        if (s.grip) this._params._tireGrip.splice(0, 4, ...s.grip)
        runParts.fitted = { ...runParts.fitted, ...s.fitted }   // a socket the save predates (FEAT-204) keeps the start()'s stock
        this._engine()   // FEAT-325: the engine and its mods are derived from the fitted map, never saved as params
        for (const id in d.condition) d.condition[id] = s.condition[id] ?? 1   // a track the save predates is new (FEAT-202: the oil)
        for (const k of Object.keys(d._durabilityScale)) if (!(k in s.durability)) delete d._durabilityScale[k]
        Object.assign(d._durabilityScale, s.durability)
        d.flat.splice(0, 4, ...s.flat)
        this._onChange()
    }

    _fit (id, socket, cond) {
        const part = PARTS[id]
        // FEAT-176: a part that fits either axle names both axles' keys; this socket takes only its own.
        const other = { Front: 'Rear', Rear: 'Front' }[/(Front|Rear)$/.exec(socket)?.[1]]
        for (const [k, v] of Object.entries(part.patch)) if (!other || !k.endsWith(other)) this._params[k] = v
        runParts.fitted[socket] = id
        this._rideHeight()
        if (socket === 'engine' || SLOTS[socket].mod) this._engine()
        // FEAT-204: the bull bar hardens the track it guards (the front panel) by its `armor`; its stock "none" puts 1 back.
        if (SLOTS[socket].guards) this._damage.setDurability(SLOTS[socket].guards, part.armor ?? 1)
        for (const t of SLOTS[socket].tracks) {
            this._damage.setDurability(t, part.durability ?? FAMILY_DURABILITY[part.family])   // a part's own wins (the sport tire)
            this._damage.set(t, cond)
        }
        const wheel = TIRE_IDS.indexOf(socket)
        if (wheel >= 0) {
            // A tire going on holds air: a puncture is state beside the condition (damage.js setAll).
            this._damage.flat[wheel] = false
            ;(this._params._tireGrip ??= [1, 1, 1, 1])[wheel] = part.grip
        }
    }

    /** The lift owns the strut's length and bump travel; a lowering spring (`drop`) takes its drop off
     *  both, so the lift and the springs stack instead of one patch overwriting the other. */
    _rideHeight () {
        const lift = PARTS[runParts.fitted.lift]?.patch
        if (!lift) return
        for (const ax of ['Front', 'Rear']) {
            const drop = PARTS[runParts.fitted['springs' + ax]]?.drop?.[ax] ?? 0
            this._params['suspensionRestLength' + ax] = lift['suspensionRestLength' + ax] - drop
            this._params['suspensionTravel' + ax] = lift['suspensionTravel' + ax] - drop
        }
    }

    /** FEAT-325: the fitted engine and power mods onto params (engineFor). Only on an engine or mod fit, so the debug
     *  panel's engine sliders survive every other fit. */
    _engine () {
        const e = engineFor(runParts.fitted)
        if (e) Object.assign(this._params, e)
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

    /** FEAT-204: inventory slots the fitted bolt-ons add (the roof rack's 4, DEC-129), on top of params.inventorySlots. */
    extraSlots () { return Object.values(runParts.fitted).reduce((n, id) => n + (PARTS[id]?.slots ?? 0), 0) }
    /** FEAT-204 (DEC-373): the fitted bolt-ons' mass, kg — main.js puts it on the chassis as params.fittedKg. Only the
     *  bolt-ons: every other part's stock mass is already inside params.mass (a swap's few kg are not modelled). */
    boltOnKg () { return Object.entries(runParts.fitted).reduce((kg, [s, id]) => kg + (SLOTS[s]?.bolton ? PARTS[id]?.massKg ?? 0 : 0), 0) }

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
        // FEAT-325: every power-mod number and the I4's detune, by feel. A change re-derives the fitted engine.
        const t = f.addFolder('Engine & power mods (FEAT-325)')
        const re = () => this._engine()
        t.add(PARTS.engineI4, 'torqueX', 0.5, 1.2, 0.01).name('I4 torque × (detune)').onChange(re)
        t.add(PARTS.engineStock, 'torqueX', 0.5, 1.2, 0.01).name('V6 torque ×').onChange(re)
        t.add(PARTS.intakeMod.torque[1], 1, 0, 0.3, 0.005).name('Intake gain at 4500+ rpm').onChange(re)
        t.add(PARTS.exhaustMod.torque[0], 1, 0, 0.3, 0.005).name('Exhaust gain').onChange(re)
        t.add(PARTS.flywheelLight, 'inertiaX', 0.2, 1, 0.05).name('Light flywheel inertia ×').onChange(re)
        t.add(PARTS.camsMod.torque[1], 1, 0, 0.3, 0.005).name('Cams gain at 4000+ rpm').onChange(re)
        t.add(PARTS.camsMod.torque[0], 1, -0.2, 0, 0.005).name('Cams gain under 2500 rpm').onChange(re)
        t.add(PARTS.chipTune.torque[0], 1, 0, 0.3, 0.005).name('Chip tune gain').onChange(re)
        t.add(PARTS.turbo.torque[1], 1, 0, 0.6, 0.01).name('Turbo gain at 3000+ rpm').onChange(re)
        t.add(PARTS.supercharger.torque[0], 1, 0, 0.6, 0.01).name('Supercharger gain').onChange(re)
        t.close()
        f.close()
        return f
    }
}
