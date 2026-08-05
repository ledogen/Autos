// FEAT-61 — the paper route's economy.
//
// THE SCORING CORE ONLY. The mission state machine (offer → briefing → running → done) and the
// tour/par construction are the next sitting's work; everything here is pure and headless, which is
// deliberate — this is the part that has to be RIGHT, and it is the part a gate can actually pin.
//
// Why this mission prices itself instead of going through payoutFor():
//
// payoutFor() is the SM-INV-4 margin line — continuous in the par ratio, bare completion pays
// ~nothing. That is the correct shape for a point-to-point errand and the wrong shape for this.
// DESIGN.md already blesses the divergence ("not every mission type is scored on margin… rank is
// computed per-axis") and missions.md §3b/3c already price fragile and freight at a flat rate. So
// the paper route is scored on COVERAGE × ACCURACY, with time entering only as a bonus, and
// SM-INV-4 is left untouched rather than bent.
//
// The consequence that matters: this is the income floor (missions.md, ratified 2026-08-05). Papers
// you delivered are money you keep. There is no completion multiplier anywhere in here, because a
// floor that pays nothing for a half-finished route is not a floor.

import { ECONOMY_PARAMS } from './economy.js'

export const PAPER_PARAMS = {
    // The route ends at par × this. Soft by construction: under flat rate the bell only stops you
    // earning more, so it costs the papers still in the truck and nothing already banked.
    tolerance:   1.2,

    // The ladder Larry walks you up, one rung per PERFECT route (owner, 2026-08-05). Run-layer, so
    // it is re-earned every run like everything else.
    tiers:       [4, 9, 12, 15],
    // Spares as a fraction of the customer count, per tier: generous on the first route, thin on the
    // last (owner). A beginner's four-house round tolerates four fluffed throws; the fifteen-house
    // round tolerates four and a half, which is the difficulty curve stated as inventory.
    sparesFrac:  [1.00, 0.75, 0.50, 0.30],

    // FLAT is anchored to par so the floor survives the 20-day cost ramp instead of decaying into
    // irrelevance by day 15. paperW is how much poorer than the margin line a perfect route at par
    // is: 0.6 = "reliably poor", which is what an income floor is supposed to feel like.
    paperW:      0.60,

    // The expediency bonus — the ONLY place time enters the payout. Gated on a completed route:
    // you cannot finish early without finishing.
    expediteOn:  0.90,   // ratio at which the bonus starts paying (10% inside par)
    expediteFull:0.70,   // …and where it maxes out
    bonusMax:    0.40,

    // Per-axis rank thresholds on coverage × accuracy — NOT the par ratio. One delivery out of nine
    // scores 0.11 and letters D, which is the owner's stated case, and it still pays for that one.
    rank:        { C: 0.50, B: 0.75, A: 0.90, S: 0.98 },
}

/**
 * RUN-LAYER state (SM-INV-12) — a sibling of economy.js's runEconomy for exactly the same reason:
 * the tier moves when a route is settled, which is not a day/sleep boundary, so it cannot live on
 * day.js's runState without falsifying that object's contract.
 *
 * `tier` is a 0-based index into PAPER_PARAMS.tiers. Resets to the first rung on every new run —
 * Larry does not remember last run, because last run did not happen.
 */
export const runPaper = {
    tier: 0,
    routesRun: 0,       // settled routes this run; the result card's "your Nth round"
}

export function resetPaperRun () {
    runPaper.tier = 0
    runPaper.routesRun = 0
}

/** How many customers this tier's route visits. */
export function customersForTier (tier = runPaper.tier) {
    const t = PAPER_PARAMS.tiers
    return t[Math.min(Math.max(0, tier | 0), t.length - 1)]
}

/**
 * How many papers you are handed: the customers, plus spares. Rounded UP — a fractional spare is
 * a spare, and rounding down would silently make the hardest route unwinnable by one throw.
 */
export function stockForTier (tier = runPaper.tier) {
    const i = Math.min(Math.max(0, tier | 0), PAPER_PARAMS.tiers.length - 1)
    const n = customersForTier(i)
    return n + Math.ceil(n * PAPER_PARAMS.sparesFrac[i])
}

/** The deadline for a route, in the same units as par. */
export function deadlineFor (par, P = PAPER_PARAMS) { return par * P.tolerance }

/** Per-axis rank. Scores the ROUTE (coverage × accuracy), never the clock. */
export function letterFor (score, P = PAPER_PARAMS) {
    const r = P.rank
    if (!(score > 0)) return 'D'
    if (score >= r.S) return 'S'
    if (score >= r.A) return 'A'
    if (score >= r.B) return 'B'
    if (score >= r.C) return 'C'
    return 'D'
}

/**
 * Price a finished route.
 *
 * @param {number[]} accuracies  one q value per DELIVERED paper (throw.js accuracyScore, all > 0).
 *                               Misses are simply absent — a spent paper that hit nothing is not a
 *                               delivery with a score of zero, it is not a delivery.
 * @param {number}   customers   how many people were on the route
 * @param {number}   elapsed     seconds taken
 * @param {number}   par         seconds the tour is worth (computePar over the whole tour — ONE par)
 * @param {number}   dayTier     economy.js dayTier(day), frozen at accept with the rest of the terms
 * @returns {{coverage,meanAccuracy,effDeliveries,score,letter,flat,expedite,payout,complete}}
 */
export function scoreRoute (accuracies, customers, elapsed, par, dayTier = 1, P = PAPER_PARAMS) {
    const n = Math.max(0, customers | 0)
    const delivered = accuracies?.length ?? 0
    // effDeliveries is the payout's unit: "how many papers' worth did you actually place". A
    // dead-centre throw contributes a whole one, the worst legal throw 0.30 of one.
    let eff = 0
    for (const q of (accuracies ?? [])) eff += (q > 0 && isFinite(q)) ? q : 0

    const coverage     = n > 0 ? Math.min(1, delivered / n) : 0
    const meanAccuracy = delivered > 0 ? eff / delivered : 0
    const score        = coverage * meanAccuracy
    const letter       = letterFor(score, P)
    const complete     = n > 0 && delivered >= n

    // FLAT is per delivery, and it is derived rather than authored so the route tracks the same
    // economy everything else does. Degenerate par (a broken tour) pays zero rather than NaN-ing
    // the wallet — the same guard payoutFor() carries.
    const flat = (isFinite(par) && par > 0 && n > 0)
        ? ECONOMY_PARAMS.k * par * dayTier * P.paperW / n
        : 0

    // The bonus needs a real elapsed time AND a completed route. An unfinished route has no ratio
    // worth reading: you did not finish, so you cannot have finished early.
    let expedite = 0
    if (complete && isFinite(elapsed) && elapsed >= 0 && isFinite(par) && par > 0) {
        const ratio = elapsed / par
        const span  = P.expediteOn - P.expediteFull
        const f     = span > 0 ? (P.expediteOn - ratio) / span : 0
        expedite    = P.bonusMax * Math.min(1, Math.max(0, f))
    }

    const payout = Math.max(0, flat * eff * (1 + expedite))
    return { coverage, meanAccuracy, effDeliveries: eff, score, letter, flat, expedite, payout, complete }
}

/**
 * Did this route earn the next rung? Only a PERFECT one does: every customer got a paper inside
 * their circle before the bell. Accuracy does not enter it — Larry is judging whether you can
 * finish the round, not how pretty it was.
 */
export function advancesTier (result, customers) {
    return !!result?.complete && customers > 0 && result.coverage >= 1
}
