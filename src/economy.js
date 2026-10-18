// ── FEAT-53: the story-mode economy spine — payout, wallet, mission points ────────────────
//
// Implements the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01):
//
//     ratio  = elapsed / par                    (par = referenceTime × PAR_SLACK — see par.js)
//     max    = k × par × payTier                the most a job can pay (payTier = dayTier × regionTier)
//     tip    = clamp((TIP_ZERO − ratio) / (TIP_ZERO − FULL_TIP_RATIO), 0, 1)     share of the tip pool
//     payout = max × (BASE_FRAC + (1 − BASE_FRAC) × tip)
//
// THE LINE, RE-CUT [owner, 2026-09-30 — SM-INV-4 amended; supersedes the 2026-08-16 anchors]:
//   • COMPLETION ALONE PAYS HALF THE MAX. `baseFrac` 0.5 — the guaranteed BASE PAY every offer card
//     quotes. A job can be failed on time (a D) and still settle it. There is no time limit.
//   • THE CLOCK EARNS THE OTHER HALF, AS A TIP. The whole tip at the day-1 S threshold (ratio 0.77,
//     `fullTipRatio`) and faster — the max is a hard ceiling, there is nothing above it. Half the
//     tip exactly at par (ratio 1.0, the C/D line), so a bare C pays base + 25 % of max = 75 %.
//     `tipZero` is SOLVED from that, never picked: (z − 1)/(z − fullTipRatio) = 0.5 ⇒
//     z = 2 − fullTipRatio = 1.23. Between par and z a near-miss D still earns a shrinking tip
//     (the payout stays continuous in ratio — no cliff at the pass line); past z a D is base only.
//   • k IS THE MAX RATE, anchored to the owner's day-1 numbers on the AVERAGE region-1 job:
//     completion $5, max $10. The average job is par 180 s = 3 game hours — MEASURED 2026-09-30
//     (303 anchored rolls through the real planner, seeds 6 + 90: mean 182 s, median 182 s), and
//     the owner ruled that length right: with the drive to the next giver and the odd stop for
//     food or parts, two such jobs fill the working day. So k = 10/180 $ per par-second. (The
//     run-shape "~5–7 h" figure was the plan; the measurement is the fact — re-measure before
//     moving k, never re-anchor k to a nominal length.)
//   • BREAK-EVEN IS A DAY, NOT A RATIO [owner, 2026-09-30]. A day's costs are 1.5 × the reference
//     job's base pay — $7.50 on day 1, scaling with dayTier. Two jobs driven poorly ($5 + $5) or
//     one driven very well ($10) make a good day; one at-par C ($7.50) is exactly level. Nothing
//     in this module charges that cost — it is the anchor SM-3's repair/upkeep prices are authored
//     against, and it REPLACES the old "$13-19 region-1 day" (two break-even jobs at the old k).
//     This retires "break-even is the B/C boundary" and "par loses money" (2026-08-16).
//   • A JOB never charges the player: the loss past the base is the day and the wear. Money leaves
//     the wallet only by spend() — fuel at the pump and the tow (FEAT-50), the first debits.
//
// WHAT SCALES AND WHAT DOES NOT. The DOLLARS scale, base and tip alike: both are shares of the
// same max, and the max rides dayTier × regionTier, so the tip is worth the same fraction of a
// day's costs on day 20 as on day 1 (owner, 2026-09-30: tips must not lose their value; the
// pressure to drive fast stays on for the whole run — gated). What does NOT move with the day is
// the pair of RATIOS the tip is earned between, even though the rank thresholds do. That is
// deliberate and required by SM-INV-4: payout is continuous in the ratio and rank is display only,
// so money must never be a function of the letter. Consequence to know: `fullTipRatio` is pinned
// to the DAY-1 S threshold, and S only tightens from there (0.77 → 0.75 by day 20), so an S earns
// the whole tip on every day; late in the run a drive at the top of the A band does too.
//
// SM-INV-2 — the difficulty ramp lives HERE (dayTier + rank thresholds), never in par. `day`
//   flows into dayTier() and rankThresholds() and NOTHING in this module can reach computePar.
//   Par is priced once, by geometry, and never moves.
// SM-INV-3 — this module computes numbers. Rank is display bucketing (par.js gradeRun), shown on
//   on the result card and, since FEAT-87, live on the rank-timer strip as boundary proximity
//   (never digits); nothing here renders, and no consumer may derive an ETA/countdown from these
//   values.
// SM-INV-14 — progress is MISSION POINTS: 1 at B or better, ½ at C, 0 at D. Run-layer, resets
//   with the run. Points buy access (region gating, SM-4); money buys parts (SM-3).
//
// Isolation discipline (the story.js / day.js rule): imports NOTHING. Day arrives through the
// deps adapter; thresholds flow OUT to par.js's gradeRun as an argument. Headless by nature.
//
// ECONOMY_PARAMS lives here, deliberately NOT in RANGER_PARAMS: an economy key landing in that
// object would re-route the whole world every time a payout tunable moved (the same reason
// DAY_PARAMS and POI_PARAMS stand apart).

/**
 * Tunables. ⚠ PROVISIONAL (FEAT-53, 2026-08-01) — the owner's balancing pass (Phase D) replaces
 * these; the SHAPE is ratified, the numbers are not.
 *
 * ⚠ THE PAYOUT LINE WAS RE-CUT 2026-09-30 (module header). The `k` / `breakEven` / `payoutZero`
 * bullets below are the HISTORY of the retired line — `breakEven` and the cap no longer exist, and
 * k is now the MAX rate (10/180 $ per par-second, header), not the break-even rate. They stay because they explain how the
 * rank bands and the tier table got their values, which the re-cut did not touch.
 *
 * Derivation notes:
 *   • k is a pure currency-scale choice (break-even is an identity under SM-INV-4 — one day's
 *     maintenance is DEFINED as k × the day's par-seconds at the break-even ratio, so any k
 *     balances). 0.30 $/s was derived 2026-08-02 against the mu-0.90 par scale.
 *     RE-DERIVED 2026-08-16 for the re-anchor: k_new = k_old × breakEven = 0.30 × 0.80 = 0.24.
 *     The derivation: a day spent driving at the break-even ratio b covers real time T, so its
 *     par-time is T/b; requiring k_new × (T/b) × m(b) = k_old × T with m(b) = 1 gives k_new =
 *     k_old × b. This holds the dollar VALUE of a break-even day fixed across the re-anchor, so
 *     the $130-190 region-1 day and SM-3's repair bills authored against it stay valid — even
 *     though par itself grew by PAR_SLACK and mu dropped 0.90 → 0.80.
 *     RE-DERIVED AGAIN 2026-09-07 by the SAME rule, for the v2 band re-cut (see par.js
 *     RANK_THRESHOLDS_DEFAULT): breakEven rode B from 0.80 to 0.85, so k ∝ b gives
 *     k = 0.024 × 0.85/0.80 = 0.0255. A break-even day is worth exactly the same dollars as before
 *     — 0.024 × T/0.80 === 0.0255 × T/0.85 === 0.03·T — which is the whole point of the rule: the
 *     letters moved, the wage did not.
 *   • dayTierTable steps PER DAY so the ratified "accept at 1 a.m., buy tomorrow's rate"
 *     seduction is live at EVERY midnight. Shipped ~×1.15 compounding through day 8 (2.66),
 *     then a soft approach to a ~5× asymptote (owner-picked ceiling, 2026-08-02):
 *     tier(d) = 5 − 2.34·e^((8−d)/7) for d 9..30, ~4.9 by day 30 — escalation stays live for
 *     the whole ratified 20-day run instead of dying on day 8 (run-shape.md "Code deltas").
 *   • payoutZero was re-solved alongside breakEven in the 2026-09-07 re-cut, from the SAME anchor
 *     that fixed it at 1.20 before: par (ratio 1.0) pays exactly half a unit. m(1) = 0.5 with
 *     b = 0.85 gives (z − 1)/(z − 0.85) = 0.5 ⇒ z = 1.15. Consequence worth knowing: the anchors
 *     now sit 0.30 of ratio apart instead of 0.40, so the payout LINE is ~33% steeper — margin is
 *     worth more per unit of ratio, while both anchor VALUES are unchanged. That steepening falls
 *     out of the band re-cut; it was not a separate decision.
 *   • rankDayLate tightens S/A/B by a flat −0.02 of ratio by day 20 — the brake on the rising tier.
 *     SOFTENED from the old ~7% [owner, 2026-08-16]: at 7% the S threshold outran the best drive
 *     anyone had ever recorded, so S was mathematically dead from roughly mid-run (0 of 20 corpus
 *     drives could reach day-20 S). The −0.02 was carried through the 2026-09-07 re-cut unchanged,
 *     so day-20 S is 0.75 and the best HONEST drive on record (0.740 in runs-v2/) still clears it —
 *     the same live-to-day-20 invariant, re-checked against the v2 corpus.
 *   • **C DOES NOT TIGHTEN. It is pinned at exactly 1.0 on every day.** Par is the pass line by
 *     definition; if C drifted below 1.0 a drive exactly at par would start failing and par would
 *     stop meaning the one thing the 2026-08-16 re-anchor exists to make it mean. The ramp
 *     squeezes S/A/B only. The economy gate pins C === 1.0 on every day — this REPLACES the old
 *     "B > 1.0" pin, which encoded the reversed arrangement.
 */
export const ECONOMY_PARAMS = {
    // THE MAX RATE [owner, 2026-09-30]: $ per second of par a job pays at its ceiling (an S drive),
    // before the day/region tier. Anchored to the day-1 AVERAGE job — par 180 s (measured), region
    // 1 — completing for $5 and maxing at $10. Pure currency scale: every ratio and relative price
    // is independent of it. (History: 0.30 → 0.24 → 0.024 → 0.0255 as the BREAK-EVEN rate of the
    // retired line; see the docblock above.)
    k:            10 / 180,

    // The payout line, as named anchors rather than magic numbers in the formula (module header).
    baseFrac:     0.5,    // completion alone: this share of the max is guaranteed — the card's "Base pay"
    fullTipRatio: 0.77,   // the whole tip at this ratio and faster — MUST equal rankDay1.S (gated)
    tipZero:      1.23,   // where the tip runs out — SOLVED: 2 − fullTipRatio, so par earns half (gated)

    // Rank thresholds (ratio = elapsed/par). rankDay1 MUST equal par.js RANK_THRESHOLDS_DEFAULT
    // (this module imports nothing, so it's a mirrored constant — the economy gate asserts the
    // equality). Linear interpolation day 1 → rankTightenDays, clamped flat on both sides.
    rankDay1:   { S: 0.77, A: 0.81, B: 0.87, C: 1.00 },   // B widened 0.85 → 0.87 (owner, 2026-10-01)
    rankDayLate:{ S: 0.75, A: 0.79, B: 0.85, C: 1.00 },   // C pinned — see the note above
    rankTightenDays: 20,

    // THE END-OF-RUN PAYOUT CEILING [measured 2026-08-17 at the then k 0.024 — RESOLVED by regionMult
    // below; the figures are that day's, and region-1 par now measures ~3 h]. The owner's stated targets are ~$5-15
    // per mission at the start and ~$500-1500 at the end — a ~100× spread. The economy cannot
    // deliver that, and k cannot fix it, because k scales BOTH ends equally. The whole spread comes
    // from two multipliers: the day tier (1.00 → 4.58 by day 20) and mission length (region 1 par
    // ~5-7 in-game h → region 6 ~12 h, and 1 in-game hour is 60 s real at dayLengthSec 1440). That
    // is 4.58 × 2 ≈ 9× total. Measured end-of-run mission at k 0.024: ~$85, not $500-1500.
    // Closing it needs a structural change, not a tuning one: raise the tier asymptote well past
    // its ratified ~5× ceiling, make late missions far longer, or add a per-region multiplier
    // (a new dial). All three are owner decisions — do not pick one here.
    //
    // ── PER-REGION PAYOUT MULTIPLIER [owner, 2026-08-17] ──────────────────────────────────────
    // 1-based by region index; region 7+ holds the last entry. THE reason to push into new country.
    //
    // Why this exists and dayTier does not cover it (owner's reasoning, recorded because it is the
    // whole point): dayTier rises to keep pace with escalating maintenance, so reward and cost climb
    // together and a run that merely survives longer nets nothing. Progression has to come from
    // somewhere the treadmill cannot follow — and that is the region. Moving to harder country is a
    // CHOICE the player earns with mission points, and the payout step is what makes it worth
    // making. (Region and day do correlate through the run schedule, but the step is earned, not
    // accrued.)
    //
    // Geometric, ×~1.64 per region, 1 → 12 across the ratified six. Solved from the owner's stated
    // end targets: a day-20 region-6 mission (par ~720 s, tier 4.58, a B drive) pays ~$1000 at
    // regionMult 12, against ~$9 for a day-1 region-1 job — the ~100× spread k alone could not
    // reach (see the ceiling note above, now resolved by this dial).
    //
    // ⚠ NOT YET FED A REAL INDEX. Multi-region progression is FEAT-28 / milestone SM-4 and does not
    // exist — story.js builds exactly ONE bounded region. `EconomySystem` takes the index through
    // its deps adapter (`getRegion`), which currently returns 1 everywhere, so this table is inert
    // until SM-4 lands. It is built now so the economy is not the thing blocking that milestone.
    regionMult: [1.0, 1.6, 2.7, 4.4, 7.3, 12.0],

    // Payout multiplier per run day, 1-based; day 31+ holds the last entry. tier(1) === 1 is the
    // anchor: day 1 pays the bare k rate, and the day's costs (header: 1.5 × a base pay) ride the same table. Days 1-8 are the shipped
    // ×1.15 compounding; days 9-30 ease toward the ~5× asymptote (derivation in the header note).
    dayTierTable: [
        1.00, 1.15, 1.32, 1.52, 1.75, 2.01, 2.31, 2.66,                    // 1-8   shipped curve
        2.97, 3.24, 3.48, 3.68, 3.85, 4.01, 4.14, 4.25, 4.35, 4.44,        // 9-18
        4.51, 4.58, 4.63, 4.68, 4.73, 4.76, 4.79, 4.82, 4.84, 4.87,        // 19-28
        4.88, 4.90,                                                        // 29-30
    ],

    // ── FEAT-50 THE TOW [owner, 2026-10-16] — USER-OWNED ─────────────────────────────────────
    // Out of fuel and parked, the Recovery chip offers a tow to the nearest place that sells fuel.
    // Price = (flat call-out + per-km) × dayTier, so it rides the same treadmill as everything else.
    // NEAR-PROHIBITIVE by design (DESIGN.md "Death & the tow decision"): $10 + $2/km makes a 2 km
    // tow $14 on day 1 — about two at-par jobs — and the hours are the other half of the bill.
    towFlat:       10,    // $ — call-out fee
    towPerKm:      2,     // $ per km of tow (straight line to the destination)
    towBaseHours:  1,     // game h — the wait for the truck
    towHoursPerKm: 0.5,   // game h per km — the haul itself
}

/** Rank colours, ratified: D·C·B·A·S = red·orange·yellow·white·blue (DESIGN.md). */
export const RANK_COLOR = { D: '#ff5a4e', C: '#ff9f43', B: '#ffdc3c', A: '#ffffff', S: '#5ab6ff' }

// ── Pure functions ─────────────────────────────────────────────────────────────────────────

/**
 * Payout multiplier for a REGION (1-based). Clamps both ends: region <1 reads as 1, past the table
 * holds the last entry. Pure step function, exactly like dayTier — the two multiply.
 */
export function regionTier (region) {
    const t = ECONOMY_PARAMS.regionMult
    const i = Math.min(Math.max(1, Math.floor(region || 1)), t.length) - 1
    return t[i]
}

/** Payout multiplier for a run day. Step function of the table; past the table's last day holds; day <1 clamps. */
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
 * The SM-INV-4 payout line [RE-CUT 2026-09-30 — module header]. Continuous in ratio — the rank
 * letter is a display skin over this curve, never an input to it. Returns 0 for any degenerate
 * input (par ≤ 0, non-finite ratio): a mispriced or broken route pays nothing rather than NaN-ing
 * the wallet.
 *
 * Bounded on both sides: never below the base (`baseFrac` of the max — completion alone), never
 * above the max (the whole tip, at `fullTipRatio` and faster). Both anchors are day-INDEPENDENT —
 * see the module header on why money must not follow the tightening letters.
 */
export function payoutFor(par, ratio, tier) {
    if (!isFinite(par) || par <= 0 || !isFinite(ratio) || !isFinite(tier)) return 0
    const P = ECONOMY_PARAMS
    const tip = Math.min(Math.max((P.tipZero - ratio) / (P.tipZero - P.fullTipRatio), 0), 1)
    return P.k * par * tier * (P.baseFrac + (1 - P.baseFrac) * tip)
}

/**
 * FEAT-67: the "Base pay" an offer card quotes — THE GUARANTEED AMOUNT [owner, 2026-09-29]:
 * `baseFrac` of the job's max under `payTier`, times the offer's cash multiplier (BONUS_PAY_MULT on
 * a bonus offer, else 1). It is what settle() pays for a drive slow enough that the tip has run
 * out, and every faster drive pays this plus a tip.
 *
 * Rounded to the cent exactly the way settle() rounds, so the offer card and the result card can
 * never disagree by a cent. Recomputed on every call from ECONOMY_PARAMS — never cached — because the
 * balancing pass retunes those tables and a quote frozen at roll time would lie.
 */
export function basePay (par, payTier, payMult = 1) {
    if (!isFinite(par) || par <= 0 || !isFinite(payTier)) return 0
    return _cents(ECONOMY_PARAMS.baseFrac * ECONOMY_PARAMS.k * par * payTier * payMult)
}

/**
 * The payout as the two cards state it [owner, 2026-09-29]: `base` is the guaranteed amount the
 * offer card quoted (basePay), `tip` is everything the line paid above it, `total` is what the
 * wallet receives. Rounded to the cent the way settle() rounds, and the split is exact to the
 * cent — base + tip === total in whole cents — so the result card's rows always sum to what was
 * paid. The subtraction runs in integer cents: in float dollars 7.33 − 5.17 is not 2.16. tip ≥ 0
 * by construction: the line never pays below its floor, and rounding is monotone.
 */
export function splitPayout (par, ratio, payTier, payMult = 1, tipMult = 1) {
    const lineC = Math.round(payoutFor(par, ratio, payTier) * payMult * 100)
    const baseC = Math.min(lineC, Math.round(basePay(par, payTier, payMult) * 100))   // min: a non-finite ratio pays 0 for both
    // FEAT-96: `tipMult` scales the tip ALONE (freight tips less — data/offers.js FREIGHT_TIP_MULT).
    const tipC  = Math.round((lineC - baseC) * tipMult)
    return { base: baseC / 100, tip: tipC / 100, total: (baseC + tipC) / 100 }
}

/**
 * FEAT-97: fragile pay is earned by CONDITION, not the clock (owner, 2026-10-14 / 10-15). Base pay is
 * GUARANTEED, as on every job (the 2026-09-29 ruling) — "an item at 25 % would not be worth carrying"
 * if condition cut it too. Condition drives the tip alone: the job's whole tip pool × the tip share,
 * all of it at 100 %, none at FRAGILE_TIP_ZERO or below, linear between. The pool is what the line
 * tips at its best (ratio 0). Destroyed (0) pays nothing — the job has failed. Integer cents, so
 * base + tip === total exactly, as splitPayout guarantees.
 */
export const FRAGILE_TIP_ZERO = 0.5
export function fragileTipShare (health) {
    return Math.min(1, Math.max(0, (health - FRAGILE_TIP_ZERO) / (1 - FRAGILE_TIP_ZERO)))
}
export function splitFragilePayout (par, health, payTier, payMult = 1) {
    const h = isFinite(health) ? Math.min(1, Math.max(0, health)) : 0
    const fullC = Math.round(payoutFor(par, 0, payTier) * payMult * 100)
    const poolBaseC = Math.min(fullC, Math.round(basePay(par, payTier, payMult) * 100))
    const baseC = h > 0 ? poolBaseC : 0
    const tipC  = Math.round((fullC - poolBaseC) * fragileTipShare(h))
    return { base: baseC / 100, tip: tipC / 100, total: (baseC + tipC) / 100 }
}

/** Rank letters, best first. Index order IS the "or better" order bonusEarned reads. */
export const RANKS = ['S', 'A', 'B', 'C', 'D']

/**
 * FEAT-67: is an offer's bonus earned by this letter? A gate of X is earned at X or better; 'S' is
 * S only; D never earns (D exists to tell you that you were slow), whatever the gate says.
 */
export function bonusEarned (letter, gate) {
    const i = RANKS.indexOf(letter), g = RANKS.indexOf(gate)
    if (i < 0 || g < 0 || letter === 'D' || gate === 'D') return false
    return i <= g
}

/**
 * Good deeds for a haul, by the share of the load delivered (owner, 2026-10-05): more than two
 * thirds → 1, a third to two thirds → ½, under a third → 0. Exactly 2/3 is the middle band.
 */
export function haulPointsFor(share) {
    return share > 2 / 3 ? 1 : share >= 1 / 3 ? 0.5 : 0
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
        // getRegion() — 1-based region index. Defaults to 1: multi-region progression is FEAT-28 /
        // SM-4 and unbuilt, so nothing supplies a real index yet. Wired now so the economy is ready.
        this._getRegion = deps.getRegion ?? (() => 1)
        this._read = null
        this._ctrls = []
    }

    /** Begin a story run: empty wallet, zero deeds. Called from onRegionLive beside daySystem.start(). */
    start () {
        runEconomy.money = 0
        runEconomy.halfPoints = 0
        runEconomy.missions = 0
    }

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
        const region = this._getRegion()
        const dt = dayTier(day), rt = regionTier(region)
        // payTier is the ONE number consumers should multiply by: the day treadmill and the earned
        // region step composed. Both components ride along for the result card and for debugging.
        // Frozen at accept with everything else — a job accepted in region 2 pays region 2's rate
        // even if it is settled after moving on, exactly as the day tier already worked.
        return Object.freeze({
            day, region, dayTier: dt, regionTier: rt, payTier: dt * rt,
            thresholds: Object.freeze(rankThresholds(day)),
        })
    }

    /**
     * Settle a finished POI job: price the result against its accepted terms, accrue, and report.
     * `result` is mission.js's result object ({elapsed, par, ratio, letter, ...}); `mission`
     * carries the terms stamped at accept (missing terms → day-1 defaults, the same fallback
     * gradeRun used to letter it).
     */
    settle (result, mission) {
        const t = mission?.terms ?? { payTier: dayTier(1) * regionTier(1) }
        // FEAT-67: a bonus offer pays `payMult` (BONUS_PAY_MULT) of the line — a multiplier on the
        // whole curve, so pay stays continuous in the ratio (SM-INV-4). Frozen on the mission at
        // accept with the rest of the terms; a job with no board offer behind it pays the full line.
        const mult = isFinite(mission?.payMult) ? mission.payMult : 1
        // Base + tip, as the cards state it (owner, 2026-09-29). `payout` stays the total.
        // FEAT-96: freight's contract terms — the tip reads the ratio ÷ its time slack (the same slack
        // its letters were loosened by at accept) and is then scaled by its tip multiplier.
        const slack = isFinite(mission?.timeSlack) ? mission.timeSlack : 1
        const tipMult = isFinite(mission?.tipMult) ? mission.tipMult : 1
        // FEAT-97: a fragile job (result.health set by main.js) is paid on condition instead.
        const tier = t.payTier ?? t.dayTier ?? 1
        const fragile = result.health != null
        const { base, tip, total: payout } = fragile
            ? splitFragilePayout(result.par, result.health, tier, mult)
            : splitPayout(result.par, result.ratio / slack, tier, mult, tipMult)
        // FEAT-88 (owner, 2026-10-05): a haul's good deeds are what you DELIVERED, not the letter —
        // a fast run with an empty bed is not a good deed. result.aboard/loaded come from main.js.
        // FEAT-97: a fragile job's follow what ARRIVED, the same bands on its condition.
        const points = fragile ? haulPointsFor(result.health)
            : result.loaded ? haulPointsFor(result.aboard / result.loaded) : pointsFor(result.letter)
        runEconomy.money = _cents(runEconomy.money + payout)
        runEconomy.halfPoints += points * 2
        runEconomy.missions += 1
        return { payout, base, tip, points, award: this._award(mission?.bonus, result.letter) }
    }

    /**
     * FEAT-67: the offer's bonus if the letter earned it — `{ rewardId, name, gate, letter }` for the
     * result card — or null. The grant is STUBBED: nothing is kept. Money is untouched either way:
     * the item and the cash are separate, and the cash side of a bonus offer is already priced by
     * `payMult`.
     */
    _award (bonus, letter) {
        if (!bonus || !bonusEarned(letter, bonus.gate)) return null
        return { rewardId: bonus.rewardId, name: bonus.name, gate: bonus.gate, letter }
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
    settleFlat (payout, letter, bonus = null) {
        const paid = _cents(Math.max(0, isFinite(payout) ? payout : 0))
        const points = pointsFor(letter)
        runEconomy.money = _cents(runEconomy.money + paid)
        runEconomy.halfPoints += points * 2
        runEconomy.missions += 1
        return { payout: paid, points, award: this._award(bonus, letter) }
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

    /**
     * FEAT-50: money OUT — the pump's sale, a tow. Refuses (returns false, charges nothing) rather
     * than going negative: every caller prices against the wallet first (the pump stops at what you
     * can pay), so a refusal is a caller bug, not a debt.
     */
    spend (amount) {
        const cost = _cents(Math.max(0, isFinite(amount) ? amount : 0))
        if (cost > runEconomy.money + 1e-9) return false
        runEconomy.money = _cents(runEconomy.money - cost)
        return true
    }

    money () { return runEconomy.money }

    /** The day tier today — what a price authored at day-1 rates is multiplied by (FEAT-50 tow). */
    tierNow () { return dayTier(this._getDay()) }

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
        f.add(ECONOMY_PARAMS, 'k', 0.005, 0.2, 0.0005).name('k (max $/par-sec)')
        f.add(ECONOMY_PARAMS, 'baseFrac', 0, 1, 0.05).name('base pay (× max)')
        f.add(ECONOMY_PARAMS, 'towFlat', 0, 50, 0.5).name('tow: call-out $')
        f.add(ECONOMY_PARAMS, 'towPerKm', 0, 20, 0.25).name('tow: $ per km')
        f.add(ECONOMY_PARAMS, 'towBaseHours', 0, 6, 0.25).name('tow: base hours')
        f.add(ECONOMY_PARAMS, 'towHoursPerKm', 0, 3, 0.05).name('tow: hours per km')
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
