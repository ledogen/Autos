// test/economy.mjs — FEAT-53 economy spine gate (SM-2).
//
// Pins the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01) — the
// SM-INV surface of the economy, all of it headless:
//
//   1. SM-INV-4 — the payout line's anchors. [RE-CUT 2026-09-30 — see section 1: base = half the
//      max, the tip the other half, break-even is a DAY.] As written 2026-08-16: break-even (the B/C boundary,
//      0.80) = k·par·tier exactly · par (1.0) = HALF that, because par is the failing line now ·
//      zero at 1.20 · the cap, and the zero floor over degenerate inputs.
//   2. parBase ∝ par — the anti-farming property: doubling the road doubles the base, so a loop
//      of tiny jobs never beats one honest haul.
//   3. SM-INV-14 — points are 1/½/0 at B+/C/D, accrue as INTEGER halves, and neither payout nor
//      points may ever increase with time taken.
//   4. SM-INV-2 (as amended) — the difficulty ramp lives in dayTier + rank thresholds; day 1
//      deep-equals par.js's RANK_THRESHOLDS_DEFAULT, C IS par (C === 1.0) on EVERY day and never
//      tightens, S stays reachable at day 20, and economy.js imports nothing (so `day` cannot
//      reach computePar even by accident).
//   5. The terms lock — a job settles on the tier/thresholds frozen at ACCEPT, not at finish.
//      The 1 a.m. accept buying tomorrow's rate is a ratified feature: do not "fix" it.
//   6. SM-INV-12 — run-layer boundary: money lives in runEconomy, NOT on day.js's runState
//      (whose contract is day/sleep boundaries only).
//
// Pure node: no THREE, no worldgen, no DOM.
import {
  ECONOMY_PARAMS, RANK_COLOR, dayTier, regionTier, rankThresholds, payoutFor, pointsFor,
  runEconomy, EconomySystem, formatDeeds, basePay, splitPayout, bonusEarned, RANKS,
} from '../src/economy.js'
import { gradeRun, RANK_THRESHOLDS_DEFAULT } from '../src/par.js'
import { runState } from '../src/day.js'
import { readFileSync } from 'node:fs'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

// Pin the provisional defaults this gate asserts against (a debug-slider default drifting should
// fail loudly HERE, not silently re-tune the gate).
const P = ECONOMY_PARAMS
check('pinned: tier table has 30 days, tier(1) === 1', P.dayTierTable.length === 30 && dayTier(1) === 1)
check('pinned: baseFrac 0.5, fullTipRatio 0.77, tipZero 1.23',
  P.baseFrac === 0.5 && P.fullTipRatio === 0.77 && P.tipZero === 1.23)
// [RE-CUT 2026-09-30, owner] The retired line's anchors are GONE, not parked: break-even is a DAY
// now (1.5 base pays), not a ratio, and the max is a hard ceiling so there is no cap to insure.
check('the retired anchors are deleted (breakEven, payoutZero, payoutCap, payoutFloor)',
  P.breakEven === undefined && P.payoutZero === undefined && P.payoutCap === undefined && P.payoutFloor === undefined)
// Neither ratio anchor is a free number. The whole tip lands ON the day-1 S threshold, so a rank
// refit must move it; and tipZero is solved from "par earns exactly half the tip", so it must move
// with fullTipRatio. Assert the identities, so a band re-cut that forgets either fails here.
check('fullTipRatio IS the day-1 S threshold, not an independent constant', P.fullTipRatio === P.rankDay1.S)
check('tipZero is solved from tip(1.0) === 0.5, not picked', near(P.tipZero, 2 * 1.0 - P.fullTipRatio))

// ── 1. SM-INV-4: the payout line's anchors [RE-CUT 2026-09-30, owner] ───────────────────────────
// "You get 50% of the possible max value for a mission from completion alone; going quickly and
// getting S rank gives you the other 50%, C rank 25%." Base is half the max, the tip is the other
// half, and the line between is continuous in the ratio — the letters name points on it, they do
// not price it.
{
  const par = 180, tier = 1.0
  const max = P.k * par * tier, base = P.baseFrac * max
  check('the max is k·par·tier, paid at the S threshold', near(payoutFor(par, P.fullTipRatio, tier), max))
  check('…and it is a CEILING: a faster drive pays no more (ratio 0.5, 0, −5)',
    near(payoutFor(par, 0.5, tier), max) && near(payoutFor(par, 0, tier), max) && near(payoutFor(par, -5, tier), max))
  check('completion alone pays HALF the max (ratio 1.23, 1.5, 10)',
    near(payoutFor(par, P.tipZero, tier), base) && near(payoutFor(par, 1.5, tier), base) && near(payoutFor(par, 10, tier), base))
  check('par (ratio 1.0, a bare C) pays base + 25% of max = 75%', near(payoutFor(par, 1.0, tier), 0.75 * max),
    `got ${(payoutFor(par, 1.0, tier) / max).toFixed(3)} of max`)
  check('a near-miss D still earns a shrinking tip — no cliff at the pass line',
    payoutFor(par, 1.1, tier) > base + 1e-9 && payoutFor(par, 1.1, tier) < 0.75 * max
      && Math.abs(payoutFor(par, 1.0001, tier) - payoutFor(par, 0.9999, tier)) < 1e-3 * max)
  check('the tip is LINEAR in ratio between the anchors (one straight line, S threshold → tipZero)', (() => {
    const slope = (r0, r1) => (payoutFor(par, r1, tier) - payoutFor(par, r0, tier)) / (r1 - r0)
    return near(slope(0.8, 0.9), slope(1.0, 1.2), 1e-9 * max + 1e-9)
  })())
  // The letters, read off the line on day 1 — what the owner's ladder comes out as.
  const frac = (r) => payoutFor(par, r, tier) / max
  check('day-1 ladder: every S pays 100%, every C 75–91%, a slow D 50%',
    frac(0.77) === 1 && frac(0.70) === 1 && frac(1.0) >= 0.75 - 1e-12 && frac(0.851) < 0.92 && frac(2) === 0.5,
    `S ${frac(0.77).toFixed(3)} · B/C ${frac(0.85).toFixed(3)} · par ${frac(1).toFixed(3)} · D ${frac(2).toFixed(3)}`)
  check('an S earns the WHOLE tip on every day (S only tightens below fullTipRatio)', (() => {
    for (let d = 1; d <= 30; d++) if (!near(payoutFor(par, rankThresholds(d).S, tier), max)) return false
    return true
  })())
  check('tier multiplies linearly', near(payoutFor(par, 1.0, 2.66), 2.66 * payoutFor(par, 1.0, 1.0)))
  // THE TIP SCALES WITH EVERYTHING ELSE [owner, 2026-09-30: "it would not be fun for tips to lose
  // their value after the first couple days. We want to keep some pressure on to drive fast"].
  // Base and tip are both shares of the same max, and the max rides dayTier × regionTier — so the
  // tip is worth the same fraction of a day's costs on day 20 as on day 1. Pinned, because a tip
  // priced off a flat table would pass every other check here and quietly stop mattering.
  check('the tip rides the tier exactly like the base: an S tip === the base pay, every day and region', (() => {
    for (let d = 1; d <= 30; d++) for (const rg of [1, 3, 6]) {
      const t = dayTier(d) * regionTier(rg)
      const b = P.baseFrac * P.k * par * t
      if (!near(payoutFor(par, 0.5, t) - b, b, 1e-9 * b + 1e-12)) return false        // whole tip === base
      if (!near(payoutFor(par, 1.0, t) - b, 0.5 * b, 1e-9 * b + 1e-12)) return false   // par: half of it
    }
    return true
  })())
  check('the tip keeps its value against the day\'s costs (1.5 base pays): same share on day 1 and day 20', (() => {
    const share = (d) => { const t = dayTier(d), b = P.baseFrac * P.k * par * t; return (payoutFor(par, 0.5, t) - b) / (1.5 * b) }
    return near(share(1), share(20)) && near(share(1), 2 / 3)
  })())

  // THE OWNER'S DAY-1 NUMBERS, on the AVERAGE region-1 job — par 180 s, MEASURED 2026-09-30 (mean
  // 182 s over 303 planner rolls; owner: that length is right once the commute and stops are
  // counted). These are the anchor k is set from; if any of them moves, the currency scale has
  // been retuned and DESIGN.md is stale. Re-measure the average before touching REF.
  const REF = 180, t1 = dayTier(1) * regionTier(1)
  check('day 1: a D completion pays $5', near(payoutFor(REF, 2, t1), 5, 1e-9) && basePay(REF, t1) === 5)
  check('day 1: the max (an S) pays $10', near(payoutFor(REF, 0.77, t1), 10, 1e-9))
  check('day 1: a bare C at par pays $7.50 — exactly the day\'s break-even on one job', near(payoutFor(REF, 1, t1), 7.5, 1e-9))
  check('day 1 break-even ($7.50 = 1.5 base pays): two poor jobs OR one excellent job clear it, one poor job does not',
    2 * payoutFor(REF, 2, t1) > 7.5 && payoutFor(REF, 0.77, t1) > 7.5 && payoutFor(REF, 2, t1) < 7.5)

  // Base + tip, as the two cards state it (owner, 2026-09-29): the offer quotes base, the result
  // answers base + tip, and they sum to the dollar.
  check('basePay IS baseFrac × the max, rounded like settle', basePay(par, tier) === Math.round(base))
  check('splitPayout: base + tip === total at every ratio, tip ≥ 0, base === basePay', (() => {
    return [0.5, 0.77, 0.85, 1.0, 1.1, 1.23, 5].every(r => {
      const sp = splitPayout(par, r, tier)
      return sp.base + sp.tip === sp.total && sp.tip >= 0 && sp.base === basePay(par, tier)
          && sp.total === Math.round(payoutFor(par, r, tier))
    })
  })())
  check('splitPayout on a bonus multiplier: base and total both carry payMult', (() => {
    const sp = splitPayout(par, 0.8, tier, 2)
    return sp.base === basePay(par, tier, 2) && sp.total === Math.round(2 * payoutFor(par, 0.8, tier))
  })())
  check('splitPayout on degenerate par: everything 0', (() => {
    const sp = splitPayout(0, 1, tier); return sp.base === 0 && sp.tip === 0 && sp.total === 0
  })())
}

// ── 2. Floors at the base, finite, never NaN ────────────────────────────────────────────────────
{
  let ok = true
  const base = ECONOMY_PARAMS.baseFrac * ECONOMY_PARAMS.k * 180 * 1.5
  for (let r = 1.3; r <= 10; r += 0.1) {
    const p = payoutFor(180, r, 1.5)
    if (!(near(p, base) && isFinite(p))) ok = false
  }
  check('payout === the base pay and finite over ratio 1.3..10 (a slow job never pays less)', ok)
  check('degenerate inputs pay 0, never NaN',
    payoutFor(0, 1.0, 1) === 0 && payoutFor(180, Infinity, 1) === 0 &&
    payoutFor(180, NaN, 1) === 0 && payoutFor(NaN, 1.0, 1) === 0 && payoutFor(180, 1.0, NaN) === 0)
}

// ── 3. parBase ∝ par: the anti-tiny-job-farming property ────────────────────────────────────────
{
  let ok = true
  for (const r of [0.7, 0.9, 1.0, 1.1]) {
    if (!near(payoutFor(360, r, 1.3), 2 * payoutFor(180, r, 1.3))) ok = false
  }
  check('doubling par at fixed ratio doubles payout (no tiny-job farming)', ok)
}

// ── 4. SM-INV-14: monotonicity — progress never increases with time taken ──────────────────────
{
  let payOk = true, ptsOk = true
  for (let day = 1; day <= 12; day++) {
    const th = rankThresholds(day), tier = dayTier(day)
    let prevPay = Infinity, prevPts = Infinity
    for (let ratio = 0.5; ratio <= 2.0; ratio += 0.01) {
      const pay = payoutFor(180, ratio, tier)
      const pts = pointsFor(gradeRun(ratio * 180, 180, th).letter)
      if (pay > prevPay + 1e-9) payOk = false
      if (pts > prevPts) ptsOk = false
      prevPay = pay; prevPts = pts
    }
  }
  check('payout non-increasing in elapsed, days 1..12', payOk)
  check('points non-increasing in elapsed, days 1..12', ptsOk)
  check('pointsFor: S/A/B → 1, C → ½, D → 0',
    pointsFor('S') === 1 && pointsFor('A') === 1 && pointsFor('B') === 1 &&
    pointsFor('C') === 0.5 && pointsFor('D') === 0)
}

// ── 5. dayTier: non-decreasing steps, clamped past the table ────────────────────────────────────
{
  let mono = true
  for (let d = 1; d < 20; d++) if (dayTier(d + 1) < dayTier(d)) mono = false
  check('dayTier non-decreasing in day', mono)
  check('dayTier clamps flat past the table (day 50 === day 30)', dayTier(50) === dayTier(30))
  check('dayTier clamps below (day 0/−3 === day 1)', dayTier(0) === dayTier(1) && dayTier(-3) === dayTier(1))
}

// ── 5b. regionTier: the per-region payout multiplier [owner, 2026-08-17] ───────────────────────
// This is the progression dial. dayTier rises to track escalating maintenance, so reward and cost
// move together and surviving longer nets nothing on its own; the region step is the part the
// treadmill cannot follow, and it is what makes pushing into harder country worth doing.
{
  let mono = true
  for (let r = 1; r < ECONOMY_PARAMS.regionMult.length; r++) {
    if (regionTier(r + 1) <= regionTier(r)) mono = false
  }
  check('regionTier strictly increasing across the six regions', mono)
  check('regionTier(1) === 1 — region 1 is the anchor, like day 1', regionTier(1) === 1)
  check('regionTier clamps both ends (0/−2 → region 1; past the table holds)',
    regionTier(0) === 1 && regionTier(-2) === 1 &&
    regionTier(99) === ECONOMY_PARAMS.regionMult[ECONOMY_PARAMS.regionMult.length - 1])
  check('six regions, matching the ratified run shape', ECONOMY_PARAMS.regionMult.length === 6)
  // The end-of-run pay target this dial exists to reach: a day-20 region-6 mission should land in
  // the owner's $500-1500 band while a day-1 region-1 job stays in $5-15. Both ends pinned, because
  // a well-meaning tweak to either table silently breaks the progression curve. Job lengths are
  // the MEASURED region-1 average (180 s, 2026-09-30) and the ratified 2× for region 6 (the ladder
  // is mission length, run-shape.md) — not the old nominal 360/720.
  const B_DRIVE = 0.83   // a B under rankDay1 (A 0.81 < 0.83 ≤ B 0.87) — the reference drive
  const pay = (par, day, region) => payoutFor(par, B_DRIVE, dayTier(day) * regionTier(region))
  const start = pay(180, 1, 1), end = pay(360, 20, 6)
  check('a day-1 region-1 job pays $5-15', start >= 5 && start <= 15, `got $${start.toFixed(2)}`)
  check('a day-20 region-6 job pays $500-1500', end >= 500 && end <= 1500, `got $${end.toFixed(0)}`)
}

// ── 6. rankThresholds: ordered, tightening, C IS par on every day, day 1 === par.js default ─────
// [RE-ANCHORED 2026-08-16] The old pin here was `A < 1.0 < B` — "B is the band containing par".
// Par is now the C/D boundary, so the pin inverts: C sits exactly ON 1.0, and it must NOT tighten
// with the day. If C ever drifted below 1.0, a drive exactly at par would start failing on later
// days and par would stop meaning "the slowest passing drive" — which is the entire point of the
// re-anchor. The ramp is allowed to squeeze S/A/B and nothing else.
{
  let ordered = true, cIsPar = true, tightening = true, sTightens = false
  let prev = null
  for (let d = 1; d <= 30; d++) {
    const t = rankThresholds(d)
    if (!(t.S < t.A && t.A < t.B && t.B < t.C)) ordered = false
    if (Math.abs(t.C - 1.0) > 1e-12) cIsPar = false        // par IS the C/D boundary, every day
    if (prev) for (const k of ['S', 'A', 'B', 'C']) if (t[k] > prev[k] + 1e-12) tightening = false
    if (prev && t.S < prev.S - 1e-12) sTightens = true
    prev = t
  }
  check('thresholds ordered S<A<B<C, days 1..30', ordered)
  check('C IS par (=== 1.0) on EVERY day — the ramp never moves the pass line', cIsPar)
  check('the ramp still bites: S tightens across the run', sTightens)
  check('thresholds non-increasing in day (tighten, never loosen)', tightening)
  const d1 = rankThresholds(1)
  check('day 1 deep-equals par.js RANK_THRESHOLDS_DEFAULT',
    ['S', 'A', 'B', 'C'].every(k => d1[k] === RANK_THRESHOLDS_DEFAULT[k]))
  check('gradeRun default arg IS day 1 (3-arg === 2-arg at day 1)',
    gradeRun(170, 180).letter === gradeRun(170, 180, rankThresholds(1)).letter)
  check('day ramp changes the letter, never the ratio', (() => {
    const early = gradeRun(0.76 * 180, 180, rankThresholds(1))   // S on day 1 (S ≤ 0.77)
    const late = gradeRun(0.76 * 180, 180, rankThresholds(20))   // A on day 20 (S has tightened to 0.75)
    return early.letter === 'S' && late.letter === 'A' && near(early.ratio, late.ratio)
  })())
  // S MUST STILL BE REACHABLE ON THE LAST DAY. This is the regression that prompted the whole
  // 2026-08-16 re-anchor: the previous ramp tightened S to 0.74 by day 20, which was faster than
  // ANY of the 20 recorded drives in runs/, so S was mathematically dead for the back half of
  // every run and nobody had decided that. The best drive in the corpus sits at ratio 0.654; keep
  // day-20 S at or above it or the letter goes extinct again, silently.
  //
  // The bar is now the best HONEST drive in runs-v2/, ratio 0.740 [2026-09-07; that drive, 0003, was
  // archived to runs-v2/pre-feat80-grip/ on 2026-09-10 — the best new-grip drive, 0019, is also 0.740]. The corpus also
  // holds a 0.668, but that run skipped 471 m of its 2762 m route (17%, peaking 210 m off the
  // centerline) — it was never a driving result and must not be allowed to certify a threshold.
  // The v1 figure this replaced was 0.654, measured on roads the router no longer builds.
  check('S survives day 20 (threshold ≥ the best HONEST recorded drive, 0.740)',
    rankThresholds(20).S >= 0.740, `day-20 S = ${rankThresholds(20).S.toFixed(3)}`)
}

// ── 7. Points accrue as exact integer halves ────────────────────────────────────────────────────
{
  const eco = new EconomySystem({ getDay: () => 1 })
  eco.start()
  // ratio 0.95 IS a C under the re-cut bands (B 0.87 < 0.95 ≤ C 1.00). It used to read 1.1, which
  // is now a D — the fixture would have been quietly self-contradictory.
  for (let i = 0; i < 20; i++) eco.settle({ par: 180, ratio: 0.95, letter: 'C' }, { terms: eco.terms() })
  check('20 C-grades === exactly 10.0 points (integer halves, no float drift)', eco.points() === 10.0)
  check('formatDeeds renders halves as a decimal, not the ½ glyph (owner, 2026-08-09 — the fraction was a smudge at HUD size)',
    formatDeeds(7) === '3.5' && formatDeeds(1) === '0.5' && formatDeeds(4) === '2')
}

// ── 8. Run-layer boundary (SM-INV-12) ───────────────────────────────────────────────────────────
{
  const eco = new EconomySystem({ getDay: () => 3 })
  runEconomy.money = 999; runEconomy.halfPoints = 9; runEconomy.missions = 4
  eco.start()
  check('start() zeroes the run wallet/points/missions',
    runEconomy.money === 0 && runEconomy.halfPoints === 0 && runEconomy.missions === 0)
  // ratio 0.83 IS a B under the re-cut bands (A 0.81 < 0.83 ≤ B 0.87). Kept in step with the bands
  // on purpose: the fixture asserts a letter, so a band move that leaves it behind would have it
  // claiming a letter the ratio no longer earns (it read 0.78 before 2026-09-07, now an A).
  const r = eco.settle({ par: 180, ratio: 0.83, letter: 'B' }, { terms: eco.terms() })
  check('settle accrues money + points + mission count',
    runEconomy.money === r.payout && eco.points() === 1 && eco.missionCount() === 1)
  check('payout is whole dollars', Number.isInteger(r.payout))
  check('runState stays narrow — no money/points on the day-boundary object',
    !('money' in runState) && !('halfPoints' in runState) && !('points' in runState))
}

// ── 9. The terms lock: settle on the ACCEPTED day, not the finished day ─────────────────────────
{
  let day = 3
  const eco = new EconomySystem({ getDay: () => day })
  eco.start()
  const terms = eco.terms()          // accepted on day 3
  day = 4                            // midnight passes mid-drive
  // Settle AT the full-tip ratio so the expected payout is exactly the max (k·par·tier) and the arithmetic
  // below stays readable. (At ratio 1.0 it would be half a unit — see the re-anchored payout line.)
  const settled = eco.settle({ par: 180, ratio: ECONOMY_PARAMS.fullTipRatio, letter: 'S' }, { terms })
  check('terms lock: day-3 tier paid despite finishing on day 4',
    settled.payout === Math.round(ECONOMY_PARAMS.k * 180 * dayTier(3)) && dayTier(3) !== dayTier(4))
  check('terms carry day-3 thresholds (frozen)',
    terms.day === 3 && terms.thresholds.S === rankThresholds(3).S && Object.isFrozen(terms.thresholds))
  check('terms compose payTier = dayTier × regionTier',
    near(terms.payTier, terms.dayTier * terms.regionTier))
}

// ── 9b. The region multiplier reaches the payout, and locks at accept like the day tier ─────────
{
  let region = 2
  const eco = new EconomySystem({ getDay: () => 1, getRegion: () => region })
  eco.start()
  const terms = eco.terms()                 // accepted in region 2
  check('terms carry the region and its tier', terms.region === 2 && terms.regionTier === regionTier(2))
  region = 5                                // player drives on into region 5 before settling
  const settled = eco.settle({ par: 180, ratio: ECONOMY_PARAMS.fullTipRatio, letter: 'S' }, { terms })
  check('region tier reaches the payout (region 2 pays 1.6× region 1)',
    settled.payout === Math.round(ECONOMY_PARAMS.k * 180 * dayTier(1) * regionTier(2)),
    `got ${settled.payout}`)
  check('region locks at ACCEPT, not at settle — same rule as the day tier',
    settled.payout !== Math.round(ECONOMY_PARAMS.k * 180 * dayTier(1) * regionTier(5)))
}

// ── 9c. FEAT-67: the board's base-pay quote, bonus gates, and the bonus cash multiplier ─────────
{
  const eco = new EconomySystem({ getDay: () => 5 })
  eco.start()
  const terms = eco.terms()
  const par = 312.4
  // [2026-09-29] basePay is the GUARANTEED amount — what settle pays for a drive slow enough to
  // have run the tip out — and every settlement reports base + tip === payout. The offer card
  // quotes base; the result card answers with base and tip in the same words.
  const atPar = eco.settle({ par, ratio: 1, letter: 'C' }, { terms })
  const slow  = eco.settle({ par, ratio: 3, letter: 'D' }, { terms })
  check('basePay === what settle pays for a job FAILED on time (the card never lies)',
    basePay(par, terms.payTier) === slow.payout && slow.tip === 0 && slow.base === slow.payout,
    `${basePay(par, terms.payTier)} vs ${slow.payout}`)
  check('an at-par drive settles base + half the tip pool (75% of the max)',
    atPar.base === basePay(par, terms.payTier) && atPar.base + atPar.tip === atPar.payout
      && atPar.payout === Math.round(0.75 * ECONOMY_PARAMS.k * par * terms.payTier))
  const k0 = ECONOMY_PARAMS.k
  const b1 = ECONOMY_PARAMS.baseFrac * k0 * par * terms.payTier
  ECONOMY_PARAMS.k = k0 * 2
  check('doubling k doubles basePay (recomputed from the tables, never cached)',
    basePay(par, terms.payTier) === Math.round(2 * b1))
  ECONOMY_PARAMS.k = k0

  // bonusEarned truth table: X earns at X or better, S is S only, D never earns.
  const want = { S: ['S'], A: ['S', 'A'], B: ['S', 'A', 'B'], C: ['S', 'A', 'B', 'C'] }
  let tt = true
  for (const gate of RANKS) for (const letter of RANKS) {
    const exp = gate !== 'D' && (want[gate] || []).includes(letter)
    if (bonusEarned(letter, gate) !== exp) tt = false
  }
  check('bonusEarned: X or better, S only, D never earns (full 5×5 truth table)', tt)

  // Money is IDENTICAL with and without a bonus record, apart from BONUS_PAY_MULT.
  runEconomy.money = 0
  const plain = eco.settle({ par, ratio: 0.8, letter: 'A' }, { terms })
  const withRec = eco.settle({ par, ratio: 0.8, letter: 'A' }, { terms, bonus: { rewardId: 'x', name: 'X', gate: 'B' } })
  const halved = eco.settle({ par, ratio: 0.8, letter: 'A' },
                            { terms, bonus: { rewardId: 'x', name: 'X', gate: 'B' }, payMult: 0.5 })
  check('a bonus record alone never changes the money', plain.payout === withRec.payout)
  check('the cash cut is payMult on the whole line (continuous in ratio)',
    halved.payout === Math.round(payoutFor(par, 0.8, terms.payTier) * 0.5))
  check('an earned bonus is recorded as an award', withRec.award?.rewardId === 'x' && runEconomy.awards.length >= 1)
  const missed = eco.settle({ par, ratio: 1.1, letter: 'D' }, { terms, bonus: { rewardId: 'y', name: 'Y', gate: 'C' } })
  check('a D earns no award, whatever the gate', missed.award === null)
  check('…but a D still settles its base pay (failed on time, not unpaid)', missed.payout >= basePay(par, terms.payTier))
  eco.start()
  check('start() clears the run\'s awards', runEconomy.awards.length === 0)
}

// ── 10. Purity ──────────────────────────────────────────────────────────────────────────────────
{
  let stable = true
  const a = payoutFor(233.7, 0.87, 1.52), b = rankThresholds(5), c = dayTier(6)
  for (let i = 0; i < 1000; i++) {
    if (payoutFor(233.7, 0.87, 1.52) !== a) stable = false
    const t = rankThresholds(5)
    if (t.S !== b.S || t.C !== b.C) stable = false
    if (dayTier(6) !== c) stable = false
  }
  check('pure functions referentially transparent over 1000 calls', stable)
  const src = readFileSync(new URL('../src/economy.js', import.meta.url), 'utf8')
  check('economy.js imports nothing (day can never reach computePar)', !/^\s*import\b/m.test(src))
  check('RANK_COLOR covers all five letters', ['D', 'C', 'B', 'A', 'S'].every(k => /^#[0-9a-f]{6}$/i.test(RANK_COLOR[k])))
}

console.log(fails === 0 ? '\neconomy gate: ALL OK' : `\neconomy gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
