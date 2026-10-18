/**
 * src/fuel.js — FEAT-50: the fuel map and the tank. Pure maths: no Three.js, no engine types.
 *
 * buildFuelMap(engine) turns an engine's data (data/engines.js — read off the flat vehicle params,
 * which spread it) into a table of fuel flow over rpm × pedal, by the Willans line explained in that
 * file's header. The table is the product: it is honest gal/h at the crank, and anything that wants
 * to reason about economy — a future economy shift schedule, a controller, the debug readout — reads
 * the same grid the burn does. stepFuel() drains the tank from it once per physics step.
 *
 * THE PEDAL IS THE LOAD AXIS. drivetrain.js makes torque as pedal × WOT curve(rpm), so the pedal it
 * used (st.pedal — the ramped throttle, or the S-pedal in reverse) IS the fraction of full load.
 * Reading the burn off the same number means a light foot at low rpm sits in a cheap cell and a loaded
 * climb (more pedal at the same rpm) sits in a hot one, with nothing injected for either.
 *
 * fuelBurnScale is GAMEPLAY, not physics (owner, 2026-10-16: 7×). The honest table would make a
 * 16.5 gal tank last most of a run in a ~3 km region; the multiplier is applied in stepFuel, never
 * baked into the table, so the table's shape and its gal/h stay true.
 */

import { engineTorqueAt } from './drivetrain.js'

const P_ATM = 101.325          // kPa
const LHV_MJ_PER_KG = 42.6     // E10 gasoline lower heating value
const KG_PER_GAL = 2.82        // E10 gasoline, 0.745 kg/L
export const FUEL_RPM_STEP = 250, FUEL_RPM_MIN = 500, FUEL_RPM_MAX = 6000
export const FUEL_PEDAL_STEP = 0.05

// The fields the table is a function of. The cache below compares them every lookup (a few dozen
// numbers), so a slider, a vehicle switch or a patched engine entry rebuilds the table on its own.
const KEYS = ['displacementL', 'etaIndicated', 'fmepA', 'fmepB', 'fmepC', 'accessoryNm', 'pumpingK',
    'mapFloor', 'enrichFrom', 'enrichMax', 'dfcoRPM', 'engineTorqueScale']

/** Fuel flow [g/s] at one operating point, straight off the model (no table). */
export function fuelGramsPerS (engine, rpm, pedal) {
    if (pedal <= 0 && rpm > engine.dfcoRPM) return 0                    // decel fuel cut-off
    const k = engine.displacementL * 1e-3 / (4 * Math.PI)               // m³ → N·m per Pa of MEP
    const Nk = rpm / 1000
    const Twot = engineTorqueAt(rpm, engine.engineTorqueCurve) * (engine.engineTorqueScale ?? 1)
    const Tb = pedal * Twot
    const Tf = (engine.fmepA + engine.fmepB * Nk + engine.fmepC * Nk * Nk) * 1e3 * k
    const map = Math.max(engine.mapFloor, (Tb + Tf) / (Twot + Tf))
    const Tp = engine.pumpingK * P_ATM * 1e3 * (1 - map) * k
    const enrich = 1 + engine.enrichMax * Math.max(0, (pedal - engine.enrichFrom) / (1 - engine.enrichFrom))
    const indicatedW = (Tb + Tf + Tp + engine.accessoryNm) * rpm * Math.PI / 30
    return indicatedW / (engine.etaIndicated * LHV_MJ_PER_KG * 1e6) * enrich * 1000
}

/**
 * The table. `gph[i][j]` is gal/h at rpms[i], pedals[j]; `bsfc[i][j]` is g/kWh (NaN at zero
 * pedal, where there is no brake power to divide by).
 */
export function buildFuelMap (engine) {
    const rpms = [], pedals = []
    for (let r = FUEL_RPM_MIN; r <= FUEL_RPM_MAX; r += FUEL_RPM_STEP) rpms.push(r)
    for (let j = 0; j * FUEL_PEDAL_STEP <= 1 + 1e-9; j++) pedals.push(+(j * FUEL_PEDAL_STEP).toFixed(2))
    const gph = rpms.map(r => pedals.map(p => fuelGramsPerS(engine, r, p) * 3.6 / KG_PER_GAL))
    const bsfc = rpms.map(r => pedals.map(p => {
        const kW = p * engineTorqueAt(r, engine.engineTorqueCurve) * (engine.engineTorqueScale ?? 1) * r * Math.PI / 30 / 1000
        return kW > 0 ? fuelGramsPerS(engine, r, p) * 3600 / kW : NaN
    }))
    const fuelled = { ...engine, dfcoRPM: Infinity }
    const gph0 = rpms.map(r => fuelGramsPerS(fuelled, r, 0) * 3.6 / KG_PER_GAL)
    return { rpms, pedals, gph, gph0, bsfc, dfcoRPM: engine.dfcoRPM }
}

/** Bilinear lookup [gal/h], clamped to the table's edges. */
export function fuelRateGph (map, rpm, pedal) {
    const fi = Math.min(map.rpms.length - 1.000001, Math.max(0, (rpm - FUEL_RPM_MIN) / FUEL_RPM_STEP))
    const fj = Math.min(map.pedals.length - 1.000001, Math.max(0, pedal / FUEL_PEDAL_STEP))
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j
    if (pedal <= 0 && rpm > map.dfcoRPM) return 0      // DFCO is a step at exactly zero pedal
    const g = map.gph
    // The table's zero-pedal column holds the cut-off zeros; past the early return above every point
    // is FUELLED, so the first cell interpolates from the fuelled zero-pedal flow (gph0) instead —
    // else 1100 rpm at a lifted foot would read half a cut-off cell.
    const c0 = j === 0 ? map.gph0 : null
    const a = c0 ? c0[i] : g[i][j], b = c0 ? c0[i + 1] : g[i + 1][j]
    return (a * (1 - u) + b * u) * (1 - v) + (g[i][j + 1] * (1 - u) + g[i + 1][j + 1] * u) * v
}

let _cacheKey = null, _cacheMap = null
/** The table for these params, rebuilt only when an input changed. */
export function fuelMapFor (params) {
    const key = KEYS.map(k => params[k]).join(',') + '|' + params.engineTorqueCurve.join(';')
    if (key !== _cacheKey) {
        _cacheMap = buildFuelMap(params)
        _cacheKey = key
    }
    return _cacheMap
}

/** A fresh tank, `frac` full. */
export function makeFuelState (params, frac = 1) {
    return { gal: params.fuelTankGal * frac, floorGal: 0, dry: false }
}

/**
 * Drain the tank one physics step. Burns only while the engine RUNS (absent ignition = running, the
 * drivetrain's own rule). `floorGal` is the no-consequence floor free roam sets (FEAT-50: free roam
 * is unaffected) — the tank stops there and never runs dry. At a floor of 0 an empty tank kills the
 * engine; ignition.js catchTime then never lets it catch again until there is fuel.
 */
export function stepFuel (vehicleState, params, dt) {
    const f = vehicleState.fuel
    if (!f) return
    const ign = vehicleState.ignition
    if (ign && ign.state !== 'running') return
    const st = vehicleState.drivetrain
    const rpm = st?.engineRPM ?? params.engineIdleRPM
    const redline = params.engineRedlineRPM
    const cut = rpm > redline ? Math.max(0, 1 - (rpm - redline) / 200) : 1   // the limiter cuts fuel with torque
    const gph = fuelRateGph(fuelMapFor(params), rpm, st?.pedal ?? 0) * cut * (params.fuelBurnScale ?? 1)
    f.gal = Math.max(f.floorGal, f.gal - gph * dt / 3600)
    if (f.gal <= 0 && ign) {
        f.gal = 0
        f.dry = true
        ign.state = 'off'
        ign.event = 'shutoff'
    }
}
