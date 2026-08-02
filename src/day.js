// ── FEAT-47: the story-mode day clock ──────────────────────────────────────────────────────
//
// A story run is played in DAYS. This module owns the one authoritative in-game clock: a 24-hour
// hour-of-day float that wheels round in `dayLengthSec` of real time (RATIFIED: 24 minutes), and the
// day counter it rolls over into. It drives the sky, and later phases hang energy/blinks/doze and
// the sleep boundary off the same clock.
//
// Story-only lifecycle: main.js's story deps call start() when the region goes live and stop() when
// it exits, so free roam never ticks this and pays nothing. update() is a hard no-op until start().
//
// Isolation discipline (the story.js / poi.js rule): this module imports NOTHING from the engine. It
// reaches the sky exclusively through the `deps` adapter main.js hands it, which keeps the clock
// headless-testable and keeps sky internals out of story-layer code.
//
// DAY_PARAMS lives here, deliberately NOT in RANGER_PARAMS: that object feeds routeCacheSig, and a
// day* key landing in it would re-key every baked route bundle for a clock tunable (the same reason
// POI_PARAMS stands apart — see the comment above the PoiSystem construction in main.js).

/** Tunables. Clock only — none of this may ever enter routeCacheSig. */
export const DAY_PARAMS = {
    dayLengthSec:  1440,   // s of real time per in-game day (RATIFIED: 24 minutes)
    dayStartHour:  7,      // hour a run's first day opens at
    dayLookQuantH: 0.1,    // in-game hours between sky pushes — see THE BAKE COST below

    // ── Energy (hours-equivalent; see THE ENERGY LADDER below) ────────────────────────────────
    fullEnergyH:   16,     // h of waking a full night buys; awake drains 1 h per in-game hour
                           //   (18 → 16, run-shape.md 2026-08-02: 16 + 8 h sleep closes the 24 h
                           //   day; at 18 dawn drifted 2 h per night)
    sleepyAtH:     4,      // energy remaining at/below which the driver is SLEEPY  (12 h awake)
    tiredAtH:      2,      // …TIRED      (14 h awake)
    // EXHAUSTED is energy <= 0 (16 h awake). Energy floors at 0; exhaustion has no deeper stage.
    // The ladder reads energy REMAINING (4/2/0), so the 2026-08-02 tank shrink moved the stages'
    // hours-awake onsets from 14/16/18 to 12/14/16 — the "last 4 h risky, last 2 dangerous" shape
    // is the ratified constant, per the owner's Phase-D ruling.

    // Coffee: relief now, debt against the NEXT wake-up. Deliberately net positive (+5 vs −3).
    coffeeReliefH: 5,
    coffeeDebtH:   3,

    // ── Sleep recovery (FEAT-45 Phase D) — hours of energy bought per hour slept ───────────────
    // THE ARITHMETIC (ratified 2026-07-30; rescaled 2026-08-02 with the 16 h tank).
    // r(vibe) = lerp(worst, best, vibe), so:
    //   • an AVERAGE site (vibe 0.5) gives r = (4/3 + 8/3)/2 = 2.0 h/h ⇒ 8 h × 2.0 = 16 h = FULL
    //     from empty. Eight hours at a decent site is the whole night, exactly as ratified.
    //   • the BEST site is exactly 2× the worst (8/3 / 4/3), so full-from-empty runs 6 h at best
    //     and 12 h at worst — unchanged by the rescale.
    // Change these two together or the "average = full in 8 h" contract quietly breaks.
    sleepRateWorstH: 4 / 3,
    sleepRateBestH:  8 / 3,
    sleepMinH:       1,    // slider bounds for the sleep timer
    sleepMaxH:       14,
    sleepDefaultH:   8,

    // Blink cadence — MEAN IN-GAME HOURS BETWEEN BLINKS, per stage (Poisson ⇒ exponential gaps).
    // Ratified default is "on average once per in-game hour" in every blinking stage; kept as three
    // separate knobs so the escalation can be tuned by feel without touching the stage thresholds.
    blinkMeanSleepyH:    1,
    blinkMeanTiredH:     1,
    blinkMeanExhaustedH: 1,

    // Blink shapes, REAL milliseconds (a blink is a real-time event, not a game-time one).
    sleepyBlinkMs:  250,   // total close→open envelope of the harmless sleepy blink
    signalBlinkMs:  800,   // the one long "it's about to get worse" blink on entering TIRED
    lidTravelMs:    90,    // lid close (and open) time either side of a doze hold
    tiredMinMs:     200,   // doze hold range, TIRED      — control loss lasts exactly the hold
    tiredMaxMs:     600,
    exhaustedMinMs: 400,   // doze hold range, EXHAUSTED
    exhaustedMaxMs: 1000,
}

/**
 * SM-INV-12 RUN-LAYER STATE. This is THE run-scoped state object: the things that belong to a story
 * run rather than to the world. The invariant it exists to keep is a timing one — run state advances
 * only at DAY / SLEEP BOUNDARIES, never per frame, so nothing downstream of it can become a function
 * of how long you idled. Worldgen stays pure f(seed, params) and never reads this.
 *
 * It resets on run reset (start()), and headless gates pin a default `runState` rather than letting
 * a test drift the day. Keep it minimal — a field earns its place here only if a run boundary is the
 * only thing that may move it.
 */
export const runState = {
    day: 1,   // 1-based day index of the current run; increments at each midnight crossed
}

export class DaySystem {
    /**
     * @param {object} deps - adapter into main.js (keeps this module free of engine imports):
     *   setTimeOfDay(hour) — push an hour-of-day (0..24) to the sky
     */
    constructor (deps) {
        this._deps = deps
        this._running = false
        this._hour = DAY_PARAMS.dayStartHour
        this._lastPushH = NaN   // hour of the last sky push; NaN = nothing pushed yet
        this._ctrls = []

        // ── Energy / blinks ───────────────────────────────────────────────────────────────────
        this._energyH   = DAY_PARAMS.fullEnergyH
        this._coffeeDebt = 0
        // SM-INV-12 FLAG-GATE. Blinks and dozes are live-reactive, so they are OFF at construction
        // and stay off until main.js turns them on for a live story region. Headless gates never
        // construct this system at all, and even if they did, attenuation() is identically 1 and
        // eyelidFactor() identically 0 while disabled.
        this._blinksEnabled = false
        this._blink     = null    // active envelope: {closeMs, holdMs, openMs, loss, t}
        this._nextBlinkH = Infinity   // in-game hours remaining until the next scheduled blink
        this._signalArmed = true      // the once-per-entry TIRED signal blink; re-arms above tiredAtH
    }

    /** Begin a story run: dawn of day 1, full tank of energy, and seat the sky at that hour. */
    start () {
        this._running = true
        this._hour = DAY_PARAMS.dayStartHour
        runState.day = 1
        this._energyH = DAY_PARAMS.fullEnergyH
        this._coffeeDebt = 0
        this._blink = null
        this._signalArmed = true
        this._nextBlinkH = Infinity
        this._push(true)
    }

    /**
     * Leave story mode. Stop ticking and hand the sky back the free-roam noon look — free roam has
     * no clock, so whatever hour the run ended on must not persist into it.
     */
    stop () {
        this._running = false
        this._lastPushH = NaN
        this._blink = null   // never leave an eyelid half-shut behind in free roam
        this._deps.setTimeOfDay(12)
    }

    /**
     * Advance the clock by `dtSec` of real time. No-op outside story mode.
     *
     * MIDNIGHT IS A DAY BOUNDARY: the wrap past 24 is exactly the run boundary SM-INV-12 permits
     * runState to advance on, so incrementing `day` here is the invariant, not a violation of it.
     */
    update (dtSec) {
        if (!this._running || !(dtSec > 0)) return
        const perSec = 24 / DAY_PARAMS.dayLengthSec
        const dHour = dtSec * perSec
        this._hour += dHour
        while (this._hour >= 24) { this._hour -= 24; runState.day++ }
        // BEING AWAKE COSTS AN HOUR PER HOUR — energy is denominated in hours of waking left, so the
        // drain is the hour advance itself. Floors at 0: exhaustion deepens in consequence, not in
        // number. (Sleep, which is the only thing that puts hours back, arrives in Phase D.)
        this._energyH = Math.max(0, this._energyH - dHour)
        this._updateBlinks(dHour, dtSec)
        this._push(false)
    }

    /** Current hour of day, 0..24 continuous. */
    hour () { return this._hour }

    /** Current 1-based day index of the run (mirrors runState.day). */
    day () { return runState.day }

    // ── Energy, stages, coffee ────────────────────────────────────────────────────────────────
    //
    // THE ENERGY LADDER (ratified 2026-07-30; tank 18 → 16 h 2026-08-02, run-shape.md). Energy is
    // hours-of-waking remaining, full = 16 h, draining 1:1 with the in-game clock. The stages read
    // the REMAINDER, not elapsed time, so a coffee genuinely walks the driver back down the ladder:
    //   rested    > 4 h left            — nothing happens
    //   sleepy   <= 4 h  (12 h awake)   — eyelid animation only, NO control loss. A warning you feel.
    //   tired    <= 2 h  (14 h awake)   — one long signal blink on entry, then 200–600 ms DOZES
    //   exhausted <= 0   (16 h awake)   — 400–1000 ms dozes
    // SM-INV-1: a doze drops the inputs and lets the physics decide. It is never a fail state and
    // never forces a crash — on a straight you coast, on a mountain switchback you had better have
    // stopped for coffee.

    /** Energy remaining, in hours of waking. */
    energyH () { return this._energyH }

    /** A full tank, in hours — the denominator of the sleep dialogue's energy meter. */
    fullEnergyH () { return DAY_PARAMS.fullEnergyH }

    /** @returns {'rested'|'sleepy'|'tired'|'exhausted'} */
    stage () {
        const e = this._energyH
        if (e <= 0)                   return 'exhausted'
        if (e <= DAY_PARAMS.tiredAtH) return 'tired'
        if (e <= DAY_PARAMS.sleepyAtH) return 'sleepy'
        return 'rested'
    }

    /** Hours of energy the NEXT wake-up will be docked for coffee already drunk. */
    coffeeDebt () { return this._coffeeDebt }

    /**
     * A cup of coffee: hours back now, a smaller number of hours off the next wake-up.
     * NET POSITIVE BY DESIGN (+5 now vs −3 tomorrow) — coffee is a real tool, not a trap; the cost
     * is that tomorrow's day is shorter, which is a scheduling problem, not a punishment.
     * The debt is only HELD here in Phase B; Phase D's sleep flow is what charges and clears it.
     */
    drinkCoffee () {
        this._energyH = Math.min(DAY_PARAMS.fullEnergyH, this._energyH + DAY_PARAMS.coffeeReliefH)
        this._coffeeDebt += DAY_PARAMS.coffeeDebtH
        this._syncGui()
    }

    // ── Time skips: making camp, and sleeping (FEAT-45 Phase D) ───────────────────────────────
    //
    // Both are the same shape — the clock jumps, the screen is black across the jump, and NO BLINK
    // MAY FIRE INSIDE IT. A skip is not lived through, so an eyelid envelope started before it must
    // not be advanced by it and the scheduler must not deliver the blinks the skipped hours would
    // have bought. `_endSkip` is what enforces that, and both entry points go through it.

    /**
     * Advance the clock by `m` in-game MINUTES with no blinks — the make-camp chore (30 min).
     * Energy drains through exactly the same 1:1 path update() uses: time passed, and being awake
     * for it cost what being awake always costs.
     */
    advanceMinutes (m) {
        const dH = Math.max(0, m) / 60
        this._advanceHours(dH)
        this._energyH = Math.max(0, this._energyH - dH)
        this._endSkip()
    }

    /**
     * A night's sleep: `hours` on the clock, `r(vibe)` hours of energy per hour slept, then the
     * coffee loan comes due at the moment of waking.
     *
     * THE COFFEE LOAN IS CHARGED ONCE, AT WAKE, AND CLEARED. Order matters, and this exact order is
     * what makes the owner's rule ("sleeping can offset the loan — sleep in a bit more") true: the
     * night's recovery and the debt are settled UNCAPPED, and only the result is clamped to a full
     * tank. Clamping to full before charging the debt would price every extra hour at zero once the
     * tank filled, so no amount of sleeping in could ever pay a cup off. Floors at 0 — a debt can
     * leave you short of a full day, never below empty.
     *
     * @param {number} hours integer hours from the sleep timer
     * @param {number} vibe  0..1 campsite score (mom's house passes a fixed 0.5)
     */
    sleep (hours, vibe) {
        const h = Math.max(0, hours)
        this._advanceHours(h)
        // ONE CODE PATH with the sleep dialogue's live preview: previewWake IS this arithmetic, and
        // sleep() is previewWake plus the two mutations (clock already advanced, debt cleared). They
        // cannot drift because there is only one of them.
        this._energyH = this.previewWake(h, vibe)
        this._coffeeDebt = 0
        this._endSkip()
    }

    /**
     * What energy sleeping `hours` at a site of `vibe` would leave you with — the settled-then-clamp
     * arithmetic of sleep(), WITHOUT touching the clock, the energy or the coffee debt.
     *
     * This is what the sleep slider previews, so the player can just drag until the meter looks full
     * and commit; it is the same function sleep() applies, so the preview is the outcome and not a
     * second model of it. See sleep()'s note on why the debt is settled before the clamp.
     *
     * @param {number} hours
     * @param {number} vibe 0..1
     * @returns {number} energy in hours at wake, in [0, fullEnergyH]
     */
    previewWake (hours, vibe) {
        const settled = this._energyH + this.recoveryRate(vibe) * Math.max(0, hours) - this._coffeeDebt
        return Math.max(0, Math.min(DAY_PARAMS.fullEnergyH, settled))
    }

    /** Hour-of-day (0..24) the clock would read after sleeping `hours`. Pure — the slider's readout. */
    previewWakeHour (hours) {
        const h = (this._hour + Math.max(0, hours)) % 24
        return h < 0 ? h + 24 : h
    }

    /** Hours of energy one hour of sleep buys at this campsite. See the arithmetic in DAY_PARAMS. */
    recoveryRate (vibe) {
        const v = Math.max(0, Math.min(1, vibe ?? 0.5))
        return DAY_PARAMS.sleepRateWorstH + (DAY_PARAMS.sleepRateBestH - DAY_PARAMS.sleepRateWorstH) * v
    }

    /** Clock-only jump, sharing update()'s midnight rule (the run boundary SM-INV-12 permits). */
    _advanceHours (dH) {
        this._hour += dH
        while (this._hour >= 24) { this._hour -= 24; runState.day++ }
    }

    /** Close a time skip: no blink survives it, no blink is owed for it, and the sky jumps at once. */
    _endSkip () {
        this._blink = null
        this._nextBlinkH = Infinity   // re-drawn against the stage the skip left us in
        this._signalArmed = this._energyH > DAY_PARAMS.tiredAtH
        this._push(true)
    }

    // ── Blinks and dozes ──────────────────────────────────────────────────────────────────────

    /** SM-INV-12 flag-gate. main.js turns this on for a live story region and off on exit. */
    setBlinksEnabled (on) {
        this._blinksEnabled = !!on
        if (!on) this._blink = null
        this._nextBlinkH = Infinity   // re-drawn on the next update against the current stage
    }

    /** Eyelid closure 0..1 (1 = fully shut). Identically 0 when disabled or between blinks. */
    eyelidFactor () {
        const b = this._blink
        if (!b) return 0
        if (b.t < b.closeMs)             return b.t / b.closeMs
        if (b.t < b.closeMs + b.holdMs)  return 1
        return Math.max(0, 1 - (b.t - b.closeMs - b.holdMs) / b.openMs)
    }

    /**
     * Driver-input factor for vehicle.js: 0 while dozing, 1 otherwise. IDENTICALLY 1 whenever blinks
     * are disabled, no blink is running, or the running blink is a no-loss one (sleepy / the tired
     * signal) — so the flag-off path is provably inert.
     */
    attenuation () {
        const b = this._blink
        if (!b || !b.loss) return 1
        return (b.t >= b.closeMs && b.t < b.closeMs + b.holdMs) ? 0 : 1
    }

    /**
     * Fire a blink of the CURRENT stage's flavour immediately (debug button; also the path the
     * scheduler takes). No-op when the stage doesn't blink.
     */
    forceBlink () {
        const s = this.stage()
        if (s === 'sleepy')    return this._beginBlink(DAY_PARAMS.sleepyBlinkMs / 2, 0, DAY_PARAMS.sleepyBlinkMs / 2, false)
        if (s === 'tired')     return this._beginBlink(DAY_PARAMS.lidTravelMs, this._drawHold(DAY_PARAMS.tiredMinMs, DAY_PARAMS.tiredMaxMs), DAY_PARAMS.lidTravelMs, true)
        if (s === 'exhausted') return this._beginBlink(DAY_PARAMS.lidTravelMs, this._drawHold(DAY_PARAMS.exhaustedMinMs, DAY_PARAMS.exhaustedMaxMs), DAY_PARAMS.lidTravelMs, true)
    }

    /**
     * The scheduler. Two clocks meet here on purpose: blink CADENCE is measured in in-game hours
     * (dHour) so the escalation tracks the day however fast the day is set to run, while the blink
     * ENVELOPE is advanced by real dtSec — a 400 ms doze must last 400 ms of the player's time no
     * matter what dayLengthSec is.
     *
     * RNG: plain Math.random. Run-layer randomness is unconstrained by SM-INV-12 — that invariant
     * governs WORLDGEN purity (pure f(seed, params), window-invariant); nothing here feeds worldgen.
     */
    _updateBlinks (dHour, dtSec) {
        // Advance any running envelope first, so a blink already in flight finishes cleanly even if
        // the flag flips or the stage changes underneath it.
        if (this._blink) {
            this._blink.t += dtSec * 1000
            if (this._blink.t >= this._blink.closeMs + this._blink.holdMs + this._blink.openMs) this._blink = null
        }
        if (!this._blinksEnabled) { this._blink = null; return }

        const stage = this.stage()

        // The TIRED SIGNAL: exactly one long, harmless blink the moment the driver crosses into
        // tired — the tell that the next blinks will take the wheel with them. Re-arms whenever
        // energy climbs back above the threshold (coffee), so it fires again on the next crossing.
        if (this._energyH > DAY_PARAMS.tiredAtH) this._signalArmed = true
        else if (this._signalArmed) {
            this._signalArmed = false
            const q = DAY_PARAMS.signalBlinkMs / 4
            this._beginBlink(q, DAY_PARAMS.signalBlinkMs / 2, q, false)
            this._nextBlinkH = this._drawGapH(stage)
            return
        }

        if (stage === 'rested') { this._nextBlinkH = Infinity; return }
        if (!(this._nextBlinkH < Infinity)) this._nextBlinkH = this._drawGapH(stage)

        this._nextBlinkH -= dHour
        if (this._nextBlinkH > 0) return
        this._nextBlinkH = this._drawGapH(stage)
        if (!this._blink) this.forceBlink()   // never stack blinks
    }

    /** Exponential gap (Poisson process) around the current stage's mean, in in-game hours. */
    _drawGapH (stage) {
        const mean = stage === 'tired'     ? DAY_PARAMS.blinkMeanTiredH
                   : stage === 'exhausted' ? DAY_PARAMS.blinkMeanExhaustedH
                   :                         DAY_PARAMS.blinkMeanSleepyH
        return Math.max(1e-4, mean) * -Math.log(1 - Math.random())
    }

    /** Uniform doze duration in ms. */
    _drawHold (minMs, maxMs) { return minMs + Math.random() * Math.max(0, maxMs - minMs) }

    _beginBlink (closeMs, holdMs, openMs, loss) {
        this._blink = { closeMs: Math.max(1, closeMs), holdMs: Math.max(0, holdMs), openMs: Math.max(1, openMs), loss, t: 0 }
    }

    /**
     * THE BAKE COST — why the sky is pushed on a quantized ladder rather than every frame.
     * SkySystem.setTimeOfDay() blends the bracketing looks and calls apply(), which re-renders the
     * sky CUBEMAP (_bakeSky) on every single call; main.js additionally hooks onLookApplied to
     * re-bake the prop impostor atlas. That is far too much work to do per frame for a look that
     * changes imperceptibly between frames. So the clock runs continuously and only pushes once the
     * hour has moved a full `dayLookQuantH` (default 0.1 h ≈ one push per 6 s real at a 24-min day).
     * SKY_CYCLE.playing stays FALSE throughout — this system is the sole driver of the story sky;
     * letting sky.js self-advance too would double-drive it and re-bake per frame.
     */
    _push (force) {
        const q = Math.max(1e-4, DAY_PARAMS.dayLookQuantH)
        if (!force && Math.abs(this._hour - this._lastPushH) < q) return
        this._lastPushH = this._hour
        this._deps.setTimeOfDay(this._hour)
        this._syncGui()   // the read-outs ride the same ladder — no per-frame GUI work
    }

    /**
     * Self-contained debug folder (the SkySystem.addGui / addPropGui pattern — attaches to the
     * existing panel, no edit to debug.js). Hidden in story mode by the existing setDebugLockout,
     * which hides the whole panel.
     */
    addGui (gui) {
        if (!gui) return null
        const f = gui.addFolder('Story · Day (FEAT-47)')

        // Read-outs: lil-gui has no live binding, so these are plain controllers refreshed from the
        // frame loop's GUI tick via updateDisplay() (the same trick sky.js uses for its hour slider).
        const read = { day: runState.day, hour: '07:00', energy: '16.0 h', stage: 'rested', coffeeDebt: '0 h' }
        this._ctrls.push(f.add(read, 'day').name('day').disable())
        this._ctrls.push(f.add(read, 'hour').name('hour').disable())
        this._ctrls.push(f.add(read, 'energy').name('energy').disable())
        this._ctrls.push(f.add(read, 'stage').name('stage').disable())
        this._ctrls.push(f.add(read, 'coffeeDebt').name('coffee debt').disable())
        this._read = read
        this._syncGui()

        f.add(DAY_PARAMS, 'dayLengthSec', 60, 2880, 10).name('day length (s)')
        f.add(DAY_PARAMS, 'dayLookQuantH', 0.02, 0.5, 0.01).name('sky push step (h)')

        // Energy / blink tunables (SM-INV-3: none of this ever reaches the driving HUD — the
        // eyelids ARE the readout in play; these numbers exist for tuning only).
        f.add(DAY_PARAMS, 'fullEnergyH', 4, 24, 0.5).name('full energy (h)')
        f.add(DAY_PARAMS, 'sleepyAtH', 0, 8, 0.5).name('sleepy at (h left)')
        f.add(DAY_PARAMS, 'tiredAtH', 0, 6, 0.5).name('tired at (h left)')
        f.add(DAY_PARAMS, 'coffeeReliefH', 0, 10, 0.5).name('coffee relief (h)')
        f.add(DAY_PARAMS, 'coffeeDebtH', 0, 10, 0.5).name('coffee debt (h)')
        f.add(DAY_PARAMS, 'sleepRateWorstH', 0.5, 6, 0.05).name('sleep rate worst (h/h)')
        f.add(DAY_PARAMS, 'sleepRateBestH', 0.5, 6, 0.05).name('sleep rate best (h/h)')
        f.add(DAY_PARAMS, 'blinkMeanSleepyH', 0.1, 4, 0.05).name('sleepy gap (h)')
        f.add(DAY_PARAMS, 'blinkMeanTiredH', 0.1, 4, 0.05).name('tired gap (h)')
        f.add(DAY_PARAMS, 'blinkMeanExhaustedH', 0.1, 4, 0.05).name('exhausted gap (h)')
        f.add(DAY_PARAMS, 'sleepyBlinkMs', 80, 800, 10).name('sleepy blink (ms)')
        f.add(DAY_PARAMS, 'signalBlinkMs', 200, 2000, 10).name('signal blink (ms)')
        f.add(DAY_PARAMS, 'lidTravelMs', 20, 300, 5).name('lid travel (ms)')
        f.add(DAY_PARAMS, 'tiredMinMs', 50, 2000, 10).name('tired doze min (ms)')
        f.add(DAY_PARAMS, 'tiredMaxMs', 50, 2000, 10).name('tired doze max (ms)')
        f.add(DAY_PARAMS, 'exhaustedMinMs', 50, 3000, 10).name('exhausted doze min (ms)')
        f.add(DAY_PARAMS, 'exhaustedMaxMs', 50, 3000, 10).name('exhausted doze max (ms)')

        const acts = {
            coffee: () => this.drinkCoffee(),
            blink:  () => this.forceBlink(),
            blinksEnabled: this._blinksEnabled,
        }
        f.add(acts, 'coffee').name('drink coffee')
        f.add(acts, 'blink').name('force blink')
        f.add(acts, 'blinksEnabled').name('blinks enabled')
            .onChange(v => this.setBlinksEnabled(v))
        return f
    }

    /** Refresh the folder's read-outs. Cheap; safe to call before addGui() has ever run. */
    _syncGui () {
        if (!this._read) return
        this._read.day = runState.day
        const h = Math.floor(this._hour), m = Math.floor((this._hour - h) * 60)
        this._read.hour = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        this._read.energy = `${this._energyH.toFixed(1)} h`
        this._read.stage = this.stage()
        this._read.coffeeDebt = `${this._coffeeDebt.toFixed(1)} h`
        for (const c of this._ctrls) c.updateDisplay()
    }
}
