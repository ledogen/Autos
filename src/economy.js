// ── FEAT-53: the story-mode economy spine — payout, wallet, mission points ────────────────
//
// Implements the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01):
//
//     ratio  = elapsed / par
//     payout = parBase × dayTier × clamp((1.2 − ratio) / 0.2, 0, payoutCap)
//     parBase = k × par
//
// SM-INV-4 anchors, by construction: +20% over par pays ~nothing · a run AT par pays exactly one
// day-tier unit of maintenance (k·par·tier) · 20% under pays 2× · the cap (~3×) is insurance
// against an oracle-mispriced route. Payout floors at zero — a mission never charges the player;
// the loss is the day and the wear.
//
// SM-INV-2 — the difficulty ramp lives HERE (dayTier + rank thresholds), never in par. `day`
//   flows into dayTier() and rankThresholds() and NOTHING in this module can reach computePar.
//   Par is priced once, by geometry, and never moves.
// SM-INV-3 — this module computes numbers. Rank is display bucketing (par.js gradeRun), shown on
//   the result card only, never live; nothing here renders, and no consumer may derive an
//   ETA/countdown from these values.
// SM-INV-14 — progress is MISSION POINTS: 1 at B or better, ½ at C, 0 at D. Run-layer, resets
//   with the run. Points buy access (region gating, SM-4); money buys parts (SM-3).
//
// Isolation discipline (the story.js / day.js rule): imports NOTHING. Day arrives through the
// deps adapter; thresholds flow OUT to par.js's gradeRun as an argument. Headless by nature.
//
// ECONOMY_PARAMS lives here, deliberately NOT in RANGER_PARAMS: that object feeds routeCacheSig,
// and an economy key landing in it would re-key every baked route bundle for a payout tunable
// (the same reason DAY_PARAMS and POI_PARAMS stand apart).

/**
 * Tunables. ⚠ PROVISIONAL (FEAT-53, 2026-08-01) — the owner's balancing pass (Phase D) replaces
 * these; the SHAPE is ratified, the numbers are not. Derivation notes:
 *   • k is a pure currency-scale choice (break-even-at-par is an identity under SM-INV-4 — one
 *     day's maintenance is DEFINED as k × the day's par-seconds, so any k balances). 0.30 $/s
 *     was re-derived 2026-08-02 (Phase D item 1) against the FEAT-30-recalibrated par scale
 *     (PAR_REF mu 0.90, 041761b): 310 anchored POI rolls over three seed-6 region slices gave
 *     median par 210 s ⇒ median job at par $63, mean $68; a region-1 day of ~2 jobs ≈ $130-190
 *     (run-shape.md's 20-day allocation) — legible three-figure numbers for SM-3's repair bills
 *     to be authored against.
 *   • dayTierTable steps PER DAY so the ratified "accept at 1 a.m., buy tomorrow's rate"
 *     seduction is live at EVERY midnight. Shipped ~×1.15 compounding through day 8 (2.66),
 *     then a soft approach to a ~5× asymptote (owner-picked ceiling, 2026-08-02):
 *     tier(d) = 5 − 2.34·e^((8−d)/7) for d 9..30, ~4.9 by day 30 — escalation stays live for
 *     the whole ratified 20-day run instead of dying on day 8 (run-shape.md "Code deltas").
 *   • rankDayLate tightens S/A ~7% by day 20 (rankTightenDays tracks the ratified run length) —
 *     the brake on the rising tier (a day-1 A-drive is only a day-20 B). B stays ABOVE 1.0 on
 *     every day: par must land inside the B band for the whole run ("the rank that just meets
 *     the cost curve should be a B" — DESIGN.md). The economy gate pins B > 1.0, so a careless
 *     tuning edit here fails fast.
 */
export const ECONOMY_PARAMS = {
    k:          0.30,   // $ per second of par-driving — THE one economy tunable (SM-INV-4)
    payoutCap:  3.0,    // clamp ceiling; bites at ratio ≤ 0.60 (mispriced-route insurance)

    // Rank thresholds (ratio = elapsed/par). rankDay1 MUST equal par.js RANK_THRESHOLDS_DEFAULT
    // (this module imports nothing, so it's a mirrored constant — the economy gate asserts the
    // equality). Linear interpolation day 1 → rankTightenDays, clamped flat on both sides.
    rankDay1:   { S: 0.80, A: 0.92, B: 1.05, C: 1.25 },
    rankDayLate:{ S: 0.74, A: 0.88, B: 1.02, C: 1.15 },
    rankTightenDays: 20,

    // Payout multiplier per run day, 1-based; day 31+ holds the last entry. tier(1) === 1 is the
    // anchor "a day-1 run at par pays exactly one day's maintenance". Days 1-8 are the shipped
    // ×1.15 compounding; days 9-30 ease toward the ~5× asymptote (derivation in the header note).
    dayTierTable: [
        1.00, 1.15, 1.32, 1.52, 1.75, 2.01, 2.31, 2.66,                    // 1-8   shipped curve
        2.97, 3.24, 3.48, 3.68, 3.85, 4.01, 4.14, 4.25, 4.35, 4.44,        // 9-18
        4.51, 4.58, 4.63, 4.68, 4.73, 4.76, 4.79, 4.82, 4.84, 4.87,        // 19-28
        4.88, 4.90,                                                        // 29-30
    ],
}

/** Rank colours, ratified: D·C·B·A·S = red·orange·yellow·white·blue (DESIGN.md). */
export const RANK_COLOR = { D: '#ff5a4e', C: '#ff9f43', B: '#ffdc3c', A: '#ffffff', S: '#5ab6ff' }

// ── Pure functions ─────────────────────────────────────────────────────────────────────────

/** Payout multiplier for a run day. Step function of the table; day 9+ holds; day <1 clamps. */
export function dayTier(day) {
    const t = ECONOMY_PARAMS.dayTierTable
    const i = Math.min(Math.max(1, Math.floor(day)), t.length) - 1
    return t[i]
}

/**
 * Rank thresholds for a run day — the difficulty ramp (SM-INV-2 as amended: the ramp lives in
 * the letters, par never moves). Linear per-key interpolation rankDay1 → rankDayLate over days
 * 1..rankTightenDays, held flat past the end.
 */
export function rankThresholds(day) {
    const P = ECONOMY_PARAMS
    const t = Math.min(Math.max(0, (day - 1) / (P.rankTightenDays - 1)), 1)
    const out = {}
    for (const key of ['S', 'A', 'B', 'C'])
        out[key] = P.rankDay1[key] + (P.rankDayLate[key] - P.rankDay1[key]) * t
    return out
}

/**
 * The SM-INV-4 payout line. Continuous in ratio — the rank letter is a display skin over this
 * curve, never an input to it. Floors at 0 and returns 0 for any degenerate input (par ≤ 0,
 * non-finite ratio): a mispriced or broken route pays nothing rather than NaN-ing the wallet.
 */
export function payoutFor(par, ratio, tier) {
    if (!isFinite(par) || par <= 0 || !isFinite(ratio) || !isFinite(tier)) return 0
    const m = Math.min(Math.max((1.2 - ratio) / 0.2, 0), ECONOMY_PARAMS.payoutCap)
    return ECONOMY_PARAMS.k * par * tier * m
}

/** SM-INV-14: 1 point at B or better, ½ at C, 0 at D. Never a function of time taken. */
export function pointsFor(letter) {
    if (letter === 'S' || letter === 'A' || letter === 'B') return 1
    if (letter === 'C') return 0.5
    return 0
}

// ── Run-layer state ────────────────────────────────────────────────────────────────────────

/**
 * SM-INV-12 run-layer state — a SIBLING of day.js's `runState`, deliberately not a field on it.
 * runState's contract is "advances only at day/sleep boundaries"; the wallet moves at mission
 * settlement, which is not such a boundary, so putting money there would falsify that contract
 * (and the day-clock gate that pins it). Same layer, different clock. Resets on run reset.
 *
 * halfPoints is an INTEGER (points × 2): points accrue in halves (SM-INV-14), and summing 0.5
 * floats across a 20-mission run invites 4.999999 at a region gate that asks for 5.
 */
export const runEconomy = {
    money: 0,        // whole dollars; settle() rounds — display never shows cents
    halfPoints: 0,   // mission points × 2
    missions: 0,     // settled (paid) missions this run
}

export class EconomySystem {
    /**
     * @param {object} deps - adapter into main.js (keeps this module free of engine imports):
     *   getDay() — current 1-based run day (daySystem.day()); defaults to day 1 so headless
     *              gates and free roam get day-1 terms without constructing a DaySystem.
     */
    constructor (deps = {}) {
        this._getDay = deps.getDay ?? (() => 1)
        this._read = null
        this._ctrls = []
    }

    /** Begin a story run: empty wallet, zero deeds. Called from onRegionLive beside daySystem.start(). */
    start () {
        runEconomy.money = 0
        runEconomy.halfPoints = 0
        runEconomy.missions = 0
    }

    /** Leave story mode. The wallet keeps its value until the next start() — nothing reads it in free roam. */
    stop () {}

    /**
     * The terms of a job at the moment it is ACCEPTED — day tier AND rank thresholds, frozen.
     * mission.js stamps this onto the mission so settlement reads the contract you took, not the
     * day you finished on. The 1 a.m. accept buying tomorrow's rate is a RATIFIED FEATURE
     * (DESIGN.md: "Nobody authored it; do not 'fix' it"), and locking the thresholds with it is
     * the owner's 2026-08-01 ruling: finishing after midnight must not silently re-grade you on
     * a tighter table.
     */
    terms () {
        const day = this._getDay()
        return Object.freeze({ day, dayTier: dayTier(day), thresholds: Object.freeze(rankThresholds(day)) })
    }

    /**
     * Settle a finished POI job: price the result against its accepted terms, accrue, and report.
     * `result` is mission.js's result object ({elapsed, par, ratio, letter, ...}); `mission`
     * carries the terms stamped at accept (missing terms → day-1 defaults, the same fallback
     * gradeRun used to letter it).
     */
    settle (result, mission) {
        const t = mission?.terms ?? { dayTier: dayTier(1) }
        const payout = Math.round(payoutFor(result.par, result.ratio, t.dayTier))
        const points = pointsFor(result.letter)
        runEconomy.money += payout
        runEconomy.halfPoints += points * 2
        runEconomy.missions += 1
        return { payout, points }
    }

    /**
     * Settle a mission that PRICED ITSELF (FEAT-61, the paper route).
     *
     * Coverage/accuracy types do not run through payoutFor() — that is the SM-INV-4 margin line, and
     * it answers a question they are not asking (DESIGN.md: "not every mission type is scored on
     * margin… rank is computed per-axis"). They arrive with a payout and a letter already worked out
     * on their own axis.
     *
     * What they do NOT get to decide is the wallet: money, deeds and the mission count accrue here,
     * through the same three lines settle() uses, so there is exactly one place run money is made.
     * pointsFor() is shared deliberately — a letter is worth the same deeds whatever earned it.
     */
    settleFlat (payout, letter) {
        const paid = Math.max(0, Math.round(isFinite(payout) ? payout : 0))
        const points = pointsFor(letter)
        runEconomy.money += paid
        runEconomy.halfPoints += points * 2
        runEconomy.missions += 1
        return { payout: paid, points }
    }

    money () { return runEconomy.money }
    points () { return runEconomy.halfPoints / 2 }
    missionCount () { return runEconomy.missions }

    /** For the HUD paint — one object, no DOM knowledge here (SM-INV-3 lives in the renderer). */
    snapshot () {
        return { money: runEconomy.money, halfPoints: runEconomy.halfPoints, missions: runEconomy.missions }
    }

    /** Self-contained debug folder (the DaySystem.addGui pattern — no edit to debug.js). */
    addGui (gui) {
        if (!gui) return null
        const f = gui.addFolder('Story · Economy (FEAT-53)')
        const read = { money: '$0', deeds: '0', missions: 0, tier: '1.00' }
        this._ctrls.push(f.add(read, 'money').name('wallet').disable())
        this._ctrls.push(f.add(read, 'deeds').name('good deeds').disable())
        this._ctrls.push(f.add(read, 'missions').name('missions').disable())
        this._ctrls.push(f.add(read, 'tier').name('day tier').disable())
        this._read = read
        f.add(ECONOMY_PARAMS, 'k', 0.05, 2, 0.01).name('k ($/par-sec)')
        f.add(ECONOMY_PARAMS, 'payoutCap', 1, 6, 0.1).name('payout cap')
        f.close()
        return f
    }

    /** Refresh the GUI readouts (called from the frame loop's GUI tick, day.js pattern). */
    syncGui () {
        if (!this._read) return
        this._read.money = '$' + runEconomy.money.toLocaleString('en-US')
        this._read.deeds = formatDeeds(runEconomy.halfPoints)
        this._read.missions = runEconomy.missions
        this._read.tier = dayTier(this._getDay()).toFixed(2)
        for (const c of this._ctrls) c.updateDisplay()
    }
}

/**
 * Display helper: halfPoints → "3½" style copy. The half-point is a designed affordance
 * (SM-INV-14 — a C keeps a weak run moving), so it renders as the ½ glyph, never "3.5".
 */
export function formatDeeds(halfPoints) {
    const whole = Math.floor(halfPoints / 2)
    const half = halfPoints % 2 === 1
    if (whole === 0 && half) return '½'
    return `${whole}${half ? '½' : ''}`
}
