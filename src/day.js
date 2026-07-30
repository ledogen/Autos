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
    }

    /** Begin a story run: dawn of day 1, and seat the sky at that hour immediately. */
    start () {
        this._running = true
        this._hour = DAY_PARAMS.dayStartHour
        runState.day = 1
        this._push(true)
    }

    /**
     * Leave story mode. Stop ticking and hand the sky back the free-roam noon look — free roam has
     * no clock, so whatever hour the run ended on must not persist into it.
     */
    stop () {
        this._running = false
        this._lastPushH = NaN
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
        this._hour += dtSec * perSec
        while (this._hour >= 24) { this._hour -= 24; runState.day++ }
        this._push(false)
    }

    /** Current hour of day, 0..24 continuous. */
    hour () { return this._hour }

    /** Current 1-based day index of the run (mirrors runState.day). */
    day () { return runState.day }

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
        const read = { day: runState.day, hour: '07:00' }
        this._ctrls.push(f.add(read, 'day').name('day').disable())
        this._ctrls.push(f.add(read, 'hour').name('hour').disable())
        this._read = read
        this._syncGui()

        f.add(DAY_PARAMS, 'dayLengthSec', 60, 2880, 10).name('day length (s)')
        f.add(DAY_PARAMS, 'dayLookQuantH', 0.02, 0.5, 0.01).name('sky push step (h)')
        return f
    }

    /** Refresh the folder's read-outs. Cheap; safe to call before addGui() has ever run. */
    _syncGui () {
        if (!this._read) return
        this._read.day = runState.day
        const h = Math.floor(this._hour), m = Math.floor((this._hour - h) * 60)
        this._read.hour = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        for (const c of this._ctrls) c.updateDisplay()
    }
}
