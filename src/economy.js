// ── FEAT-53: the story-mode economy spine — payout, wallet, mission points ────────────────
//
// Implements the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01):
//
//     ratio  = elapsed / par                    (par = referenceTime × PAR_SLACK — see par.js)
//     payout = parBase × dayTier × clamp((PAYOUT_ZERO − ratio) / (PAYOUT_ZERO − BREAK_EVEN), 0, cap)
//     parBase = k × par
//
// SM-INV-4 anchors [RE-ANCHORED 2026-08-16, owner], by construction:
//   • BREAK-EVEN IS THE B/C BOUNDARY (ratio 0.80), not par. A B/C drive covers the day's rising
//     maintenance and keeps the player going; it does NOT fund upgrades. Upgrades need real B's.
//     It tracks the B/C threshold, so refitting the rank bands moves this and `k` with them.
//   • PAR NOW LOSES MONEY. Ratio 1.0 is the C/D boundary — the slowest passing drive — and pays
//     half a day's maintenance (m = 0.5). Scraping past the standard is survival, not a living.
//     `payoutZero` is chosen to hold that half-a-unit property: z = 2·breakEven − ... in practice,
//     pick z so (z−1)/(z−breakEven) == 0.5, which for breakEven 0.80 gives z = 1.20.
//   • Zero at ratio 1.20: a drive well past par earns nothing from margin.
//   • The cap (~3×) is unchanged insurance against an oracle-mispriced route. With this line it is
//     unreachable in practice (it would need ratio 0.0) — insurance, not a dial.
// Payout floors at zero — a mission never charges the player; the loss is the day and the wear.
//
// The payout line does NOT move with the day, even though the rank thresholds do. That is
// deliberate and required by SM-INV-4: payout is continuous in the ratio and rank is display only,
// so money must never be a function of the letter. Consequence to know: past day 1 the tightening
// B/C boundary drifts slightly off the fixed break-even point, and the rising dayTier is what
// compensates. Letters get harder; the money line stays put.
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
 *   • k is a pure currency-scale choice (break-even is an identity under SM-INV-4 — one day's
 *     maintenance is DEFINED as k × the day's par-seconds at the break-even ratio, so any k
 *     balances). 0.30 $/s was derived 2026-08-02 against the mu-0.90 par scale.
 *     RE-DERIVED 2026-08-16 for the re-anchor: k_new = k_old × breakEven = 0.30 × 0.80 = 0.24.
 *     The derivation: a day spent driving at the break-even ratio b covers real time T, so its
 *     par-time is T/b; requiring k_new × (T/b) × m(b) = k_old × T with m(b) = 1 gives k_new =
 *     k_old × b. This holds the dollar VALUE of a break-even day fixed across the re-anchor, so
 *     the $130-190 region-1 day and SM-3's repair bills authored against it stay valid — even
 *     though par itself grew by PAR_SLACK and mu dropped 0.90 → 0.80.
 *   • dayTierTable steps PER DAY so the ratified "accept at 1 a.m., buy tomorrow's rate"
 *     seduction is live at EVERY midnight. Shipped ~×1.15 compounding through day 8 (2.66),
 *     then a soft approach to a ~5× asymptote (owner-picked ceiling, 2026-08-02):
 *     tier(d) = 5 − 2.34·e^((8−d)/7) for d 9..30, ~4.9 by day 30 — escalation stays live for
 *     the whole ratified 20-day run instead of dying on day 8 (run-shape.md "Code deltas").
 *   • rankDayLate tightens S/A/B ~3% by day 20 — the brake on the rising tier. SOFTENED from the
 *     old ~7% [owner, 2026-08-16]: at 7% the S threshold outran the best drive anyone had ever
 *     recorded, so S was mathematically dead from roughly mid-run (0 of 20 corpus drives could
 *     reach day-20 S). At 3% the best drive still clears it and S stays a live goal to day 20.
 *   • **C DOES NOT TIGHTEN. It is pinned at exactly 1.0 on every day.** Par is the pass line by
 *     definition; if C drifted below 1.0 a drive exactly at par would start failing and par would
 *     stop meaning the one thing the 2026-08-16 re-anchor exists to make it mean. The ramp
 *     squeezes S/A/B only. The economy gate pins C === 1.0 on every day — this REPLACES the old
 *     "B > 1.0" pin, which encoded the reversed arrangement.
 */
export const ECONOMY_PARAMS = {
    // 0.24 → 0.024 [owner, 2026-08-17]: a flat ×0.1 currency rescale. The SHAPE of the economy is
    // untouched — k is a pure scale factor, so every ratio, letter and relative price is identical;
    // only the denomination changes. Target was "~$5-15 a mission at the start". Measured after the
    // cut: a day-1 region-1 job (par ~360 s, tier 1, a B-grade drive) pays ~$9. ✓
    // ⚠ The matching end-of-run target ("~$500-1500") is NOT reached by this cut and cannot be
    //   reached by k at all — see the note under dayTierTable.
    k:          0.024,  // $ per second of par-driving — THE one economy tunable (SM-INV-4)
    payoutCap:  3.0,    // clamp ceiling; unreachable in practice now (mispriced-route insurance)

    // The payout line, as two named anchors rather than magic numbers in the formula.
    breakEven:  0.80,   // ratio paying exactly one day-tier unit — the day-1 B/C boundary
    payoutZero: 1.20,   // ratio where margin money runs out (keeps par at exactly m = 0.5)

    // Rank thresholds (ratio = elapsed/par). rankDay1 MUST equal par.js RANK_THRESHOLDS_DEFAULT
    // (this module imports nothing, so it's a mirrored constant — the economy gate asserts the
    // equality). Linear interpolation day 1 → rankTightenDays, clamped flat on both sides.
    rankDay1:   { S: 0.72, A: 0.76, B: 0.80, C: 1.00 },
    rankDayLate:{ S: 0.70, A: 0.74, B: 0.78, C: 1.00 },   // C pinned — see the note above
    rankTightenDays: 20,

    // ⚠ THE END-OF-RUN PAYOUT CEILING [measured 2026-08-17]. The owner's stated targets are ~$5-15
    // per mission at the start and ~$500-1500 at the end — a ~100× spread. The economy cannot
    // deliver that, and k cannot fix it, because k scales BOTH ends equally. The whole spread comes
    // from two multipliers: the day tier (1.00 → 4.58 by day 20) and mission length (region 1 par
    // ~5-7 in-game h → region 6 ~12 h, and 1 in-game hour is 60 s real at dayLengthSec 1440). That
    // is 4.58 × 2 ≈ 9× total. Measured end-of-run mission at k 0.024: ~$85, not $500-1500.
    // Closing it needs a structural change, not a tuning one: raise the tier asymptote well past
    // its ratified ~5× ceiling, make late missions far longer, or add a per-region multiplier
    // (a new dial). All three are owner decisions — do not pick one here.
    //
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
 *
 * The line is fixed by two anchors: m = 1 at `breakEven` (one day-tier unit of maintenance) and
 * m = 0 at `payoutZero`. Both are day-INDEPENDENT — see the module header on why money must not
 * follow the tightening letters.
 */
export function payoutFor(par, ratio, tier) {
    if (!isFinite(par) || par <= 0 || !isFinite(ratio) || !isFinite(tier)) return 0
    const P = ECONOMY_PARAMS
    const m = Math.min(Math.max((P.payoutZero - ratio) / (P.payoutZero - P.breakEven), 0), P.payoutCap)
    return P.k * par * tier * m
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
    money: 0,        // dollars, to the CENT. Every mutation rounds to 2 dp so a run's worth of
                     // additions cannot drift into 20.700000000000003 — see addSpot()
    halfPoints: 0,   // mission points × 2
    missions: 0,     // settled (paid) missions this run
}

/** Round to whole cents. Money is added a paper at a time now, so drift is a real hazard. */
const _cents = (v) => Math.round(v * 100) / 100

/**
 * Money as the player reads it (owner, 2026-08-15): cents below $100, whole dollars at or above.
 * Small change matters when a single paper is worth $5.17 and the wallet is the score; by three
 * figures the cents are noise on a number you are reading at a glance.
 */
export function formatMoney (v) {
    const n = isFinite(v) ? v : 0
    return n < 100
        ? n.toFixed(2)
        : Math.round(n).toLocaleString('en-US')
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
        runEconomy.money = _cents(runEconomy.money + payout)
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
        const paid = _cents(Math.max(0, isFinite(payout) ? payout : 0))
        const points = pointsFor(letter)
        runEconomy.money = _cents(runEconomy.money + paid)
        runEconomy.halfPoints += points * 2
        runEconomy.missions += 1
        return { payout: paid, points }
    }

    /**
     * Money earned MID-MISSION and banked on the spot (FEAT-61, owner 2026-08-15) — the paper
     * route's accuracy bonus, paid as each paper lands rather than at the bell.
     *
     * Deliberately NOT settleFlat: this accrues no points and does not count a mission, because it
     * is not a settlement. It is the same wallet through the same module, which is the part that
     * matters — there is still exactly one place run money is made.
     */
    addSpot (amount) {
        const paid = _cents(Math.max(0, isFinite(amount) ? amount : 0))
        runEconomy.money = _cents(runEconomy.money + paid)
        return paid
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
        this._read.money = '$' + formatMoney(runEconomy.money)
        this._read.deeds = formatDeeds(runEconomy.halfPoints)
        this._read.missions = runEconomy.missions
        this._read.tier = dayTier(this._getDay()).toFixed(2)
        for (const c of this._ctrls) c.updateDisplay()
    }
}

/**
 * Display helper: halfPoints → "3.5" style copy.
 *
 * DECIMAL, NOT THE ½ GLYPH (owner, 2026-08-09). The vulgar fraction was chosen to say "this is a
 * designed half, not a rounding artifact" (SM-INV-14 — a C keeps a weak run moving), but at the
 * HUD's font size it renders as a smudge. A number has to be legible before it can be expressive.
 */
export function formatDeeds(halfPoints) {
    const whole = Math.floor(halfPoints / 2)
    return `${whole}${halfPoints % 2 === 1 ? '.5' : ''}`
}
