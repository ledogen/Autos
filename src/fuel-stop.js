/**
 * src/fuel-stop.js — FEAT-50: the pump visit. A renderer-agnostic state machine (the camp.js /
 * day.js pattern): main.js decides WHERE you are and owns the DOM and the audio; this owns what the
 * pump does, so a headless gate can drive a whole fill.
 *
 * The visit (owner, 2026-10-16):
 *   pull alongside the island, into a pump zone, and pull the handbrake  → open()
 *   HOLD F to pump — the whole time; let go and it pauses, press again and it resumes
 *   the handbrake down confirms the sale                                   → settle()
 * so a partial fill is the player's own call. Once the tank is full the nozzle goes on into the jerry
 * cans aboard, in order, on the same counter (owner, 2026-10-21: refill at any pump for the fuel price). A full 16.5 gal tank takes 10 s of held F
 * (fuelFillGalPerS). The counter can never run past the wallet: the pump stops at what you can pay,
 * the way a prepaid pump does, so settling can always charge exactly what it shows.
 *
 * States: 'idle' → 'open' (display up, nozzle in, not flowing) ⇄ 'pumping' → back to 'idle' on
 * settle. One-shot `event` per step for the audio/juice layer: 'open', 'start', 'stop', 'full'
 * (auto-shutoff: tank full or wallet reached), 'gallon' (the counter crossed a whole gallon — the
 * old pumps' bell), 'settle'. A step can raise only one; 'full' outranks 'gallon'.
 */

import { mulberry32, seedFor, hash32 } from './seed.js'

/**
 * FEAT-209: a station's price relative to the day's (owner, 2026-11-13: ±5 %, "so one station is
 * always offering the best deal", eye candy). A pure function of the world seed, the station's POI id
 * and the run day, so it is the same every look and nothing goes in the save. [DEFAULT] re-drawn each
 * day, so the best deal moves; drop `day` from the seed to fix it per run.
 */
export function stationPriceFactor (worldSeed, poiId, day) {
    return 0.95 + 0.1 * mulberry32(seedFor(worldSeed, 'fuelPrice', hash32(String(poiId)), day))()
}

export class FuelStop {
    constructor () { this.reset() }

    reset () {
        this.state = 'idle'
        this.poiId = null
        this.gal = 0         // gallons on the counter this visit
        this.price = 0       // $/gal locked when the nozzle went in
        this.event = null
        this.receipt = null  // { gal, sale } of the last settled visit, for the display's hold
        this.cutoff = false  // the pump shut itself off (full / wallet) and stays off until F is released
        this.cans = []       // fill views { gal, cap } of the jerry cans aboard (InventorySystem.cans)
    }

    /** The sale on the counter, $ — the dollar drum reads this. */
    get sale () { return this.gal * this.price }

    get isOpen () { return this.state !== 'idle' }

    /** Nozzle in. `price` is locked for the visit, so a mid-fill price change cannot move the counter. */
    open (poiId, price, cans = []) {
        this.state = 'open'
        this.poiId = poiId
        this.gal = 0
        this.price = price
        this.cutoff = false
        this.cans = cans
        this.event = 'open'
    }

    /**
     * One step. `held` is F; `fuel` is vehicleState.fuel (mutated: the tank fills as the counter
     * runs); `wallet` is the money there is to pay with (Infinity where nothing is charged).
     */
    step (dt, held, fuel, params, wallet) {
        this.event = null
        if (this.state === 'idle') return
        const tank = Math.max(0, params.fuelTankGal - fuel.gal)
        const space = tank + this.cans.reduce((g, c) => g + c.cap - c.gal, 0)
        const afford = this.price > 0 ? Math.max(0, wallet / this.price - this.gal) : Infinity
        const room = Math.min(space, afford)
        // The shutoff LATCHES while F stays held: an idling engine burns a sliver below full, and
        // without the latch the pump restarted every step — a click-flow-click loop.
        if (!held || room <= 1e-9 || this.cutoff) {
            if (this.state === 'pumping') this.event = held ? 'full' : 'stop'
            this.cutoff = held && (this.cutoff || this.state === 'pumping')
            this.state = 'open'
            return
        }
        if (this.state === 'open') { this.state = 'pumping'; this.event = 'start' }
        const before = this.gal
        const dg = Math.min(params.fuelFillGalPerS * dt, room)
        this.gal += dg
        fuel.gal += Math.min(dg, tank)
        let over = dg - Math.min(dg, tank)
        for (const c of this.cans) { const a = Math.min(over, c.cap - c.gal); c.gal += a; over -= a }
        if (fuel.gal > 0) fuel.dry = false
        if (dg >= room - 1e-9) { this.state = 'open'; this.cutoff = true; this.event = 'full' }
        else if (Math.floor(this.gal) > Math.floor(before) && this.event === null) this.event = 'gallon'
    }

    /** Handbrake down: the sale is final. Returns { gal, sale } (sale rounded to the cent) and closes. */
    settle () {
        const r = { gal: this.gal, sale: Math.round(this.sale * 100) / 100 }
        this.state = 'idle'
        this.poiId = null
        this.receipt = r
        this.event = 'settle'
        return r
    }
}

/**
 * The pump's counters are MECHANICAL DRUMS, odometer-style: where each of `n` drums (most significant first) stands
 * showing `value` with `dp` decimals, as a position 0..10 (10 = the wrap back to 0). The lowest drum turns continuously
 * with the counter; every drum above it holds its digit and only rolls over during the last tenth of the drum below
 * it — the carry a real register makes. So 4.99 → 5.00 is three drums turning together, not a jump. The 2D pump
 * display (main.js) and the 3D pump face (FEAT-233, pump-face.js) both read it.
 */
export function drumPositions (value, n, dp) {
    const x = Math.max(0, value) * 10 ** dp   // in units of the lowest drum
    const out = new Array(n)
    let below = x % 10                         // the lowest drum's continuous position
    out[n - 1] = below
    for (let i = n - 2; i >= 0; i--) {
        below = out[i] = Math.floor(x / 10 ** (n - 1 - i)) % 10 + Math.max(0, below - 9)   // roll only while the drum below goes 9 → 0
    }
    return out
}

/**
 * FEAT-50: what a tow to fuel costs (owner, 2026-10-16): a flat call-out fee plus a per-kilometre
 * fee, both scaled by the day tier the rest of the run's prices ride on.
 */
export function towPrice (km, dayTier, params) {
    return Math.round((params.towFlat + params.towPerKm * km) * dayTier * 100) / 100
}

/** Hours on the clock a tow of `km` costs. */
export function towHours (km, params) {
    return params.towBaseHours + params.towHoursPerKm * km
}
