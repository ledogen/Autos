/**
 * src/fuel-stop.js — FEAT-50: the pump visit. A renderer-agnostic state machine (the camp.js /
 * day.js pattern): main.js decides WHERE you are and owns the DOM and the audio; this owns what the
 * pump does, so a headless gate can drive a whole fill.
 *
 * The visit (owner, 2026-10-16):
 *   pull alongside the island, into a pump zone, and pull the handbrake  → open()
 *   HOLD F to pump — the whole time; let go and it pauses, press again and it resumes
 *   the handbrake down confirms the sale                                   → settle()
 * so a partial fill is the player's own call. A full 16.5 gal tank takes 10 s of held F
 * (fuelFillGalPerS). The counter can never run past the wallet: the pump stops at what you can pay,
 * the way a prepaid pump does, so settling can always charge exactly what it shows.
 *
 * States: 'idle' → 'open' (display up, nozzle in, not flowing) ⇄ 'pumping' → back to 'idle' on
 * settle. One-shot `event` per step for the audio/juice layer: 'open', 'start', 'stop', 'full'
 * (auto-shutoff: tank full or wallet reached), 'gallon' (the counter crossed a whole gallon — the
 * old pumps' bell), 'settle'. A step can raise only one; 'full' outranks 'gallon'.
 */

export class FuelStop {
    constructor () { this.reset() }

    reset () {
        this.state = 'idle'
        this.poiId = null
        this.gal = 0         // gallons on the counter this visit
        this.price = 0       // $/gal locked when the nozzle went in
        this.event = null
        this.receipt = null  // { gal, sale } of the last settled visit, for the display's hold
        this.cutoff = false  // the last stop was the pump's (full / wallet), not the driver's
    }

    /** The sale on the counter, $ — the dollar drum reads this. */
    get sale () { return this.gal * this.price }

    get isOpen () { return this.state !== 'idle' }

    /** Nozzle in. `price` is locked for the visit, so a mid-fill price change cannot move the counter. */
    open (poiId, price) {
        this.state = 'open'
        this.poiId = poiId
        this.gal = 0
        this.price = price
        this.cutoff = false
        this.event = 'open'
    }

    /**
     * One step. `held` is F; `fuel` is vehicleState.fuel (mutated: the tank fills as the counter
     * runs); `wallet` is the money there is to pay with (Infinity where nothing is charged).
     */
    step (dt, held, fuel, params, wallet) {
        this.event = null
        if (this.state === 'idle') return
        const space = Math.max(0, params.fuelTankGal - fuel.gal)
        const afford = this.price > 0 ? Math.max(0, wallet / this.price - this.gal) : Infinity
        const room = Math.min(space, afford)
        if (!held || room <= 1e-9) {
            if (this.state === 'pumping') {
                this.cutoff = held           // still held ⇒ the pump stopped, not the driver
                this.event = held ? 'full' : 'stop'
            }
            this.state = 'open'
            return
        }
        if (this.state === 'open') { this.state = 'pumping'; this.cutoff = false; this.event = 'start' }
        const before = this.gal
        const dg = Math.min(params.fuelFillGalPerS * dt, room)
        this.gal += dg
        fuel.gal = Math.min(params.fuelTankGal, fuel.gal + dg)
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
