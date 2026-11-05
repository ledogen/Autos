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
//   5. The terms lock — a job settles on the region tier/thresholds frozen at ACCEPT, not at finish.
//      FEAT-168: the day no longer moves pay (payTier = regionTier); dayTier is the COST curve.
//   6. SM-INV-12 — run-layer boundary: money lives in runEconomy, NOT on day.js's runState
//      (whose contract is day/sleep boundaries only).
//
// Pure node: no THREE, no worldgen, no DOM.
import {
  ECONOMY_PARAMS, RANK_COLOR, dayTier, regionTier, rankTable, payoutFor, pointsFor,
  runEconomy, EconomySystem, formatDeeds, basePay, payRange, splitPayout, bonusEarned, RANKS,
} from '../src/economy.js'
import { gradeRun, RANK_THRESHOLDS_DEFAULT, amountGrade } from '../src/par.js'
import { runState } from '../src/day.js'
import { readFileSync } from 'node:fs'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps
const cents = (v) => Math.round(v * 100) / 100
// base + tip === total in WHOLE CENTS — float dollars cannot promise exact equality (7.33 − 5.17)
const sumsTo = (base, tip, total) => Math.round((base + tip) * 100) === Math.round(total * 100)

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
check('fullTipRatio IS region 1\'s time S threshold, not an independent constant', P.fullTipRatio === P.RANK_TABLE.time[0].S)
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
  check('an S earns the WHOLE tip in every region (no region\'s S sits above fullTipRatio)', (() => {
    for (let rg = 1; rg <= 6; rg++) if (!near(payoutFor(par, rankTable('time', rg).S, tier), max)) return false
    return true
  })())
  check('tier multiplies linearly', near(payoutFor(par, 1.0, 2.66), 2.66 * payoutFor(par, 1.0, 1.0)))
  // THE TIP SCALES WITH THE BASE [owner, 2026-09-30: "it would not be fun for tips to lose their value
  // after the first couple days. We want to keep some pressure on to drive fast"]. Base and tip are
  // both shares of the same max, so an S tip is worth the base pay at every tier. (FEAT-168: the tier
  // is the region's alone now; the day's costs rise past it — pinned in section 1b.)
  check('the tip rides the tier exactly like the base: an S tip === the base pay, at every tier', (() => {
    for (const t of [...P.dayTierTable, ...P.regionMult]) {
      const b = P.baseFrac * P.k * par * t
      if (!near(payoutFor(par, 0.5, t) - b, b, 1e-9 * b + 1e-12)) return false        // whole tip === base
      if (!near(payoutFor(par, 1.0, t) - b, 0.5 * b, 1e-9 * b + 1e-12)) return false   // par: half of it
    }
    return true
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
  // answers base + tip, and they sum to the cent.
  check('basePay IS baseFrac × the max, rounded to the cent like settle', basePay(par, tier) === cents(base))
  check('splitPayout: base + tip === total at every ratio, tip ≥ 0, base === basePay', (() => {
    return [0.5, 0.77, 0.85, 1.0, 1.1, 1.23, 5].every(r => {
      const sp = splitPayout(par, r, tier)
      return sumsTo(sp.base, sp.tip, sp.total) && sp.tip >= 0 && sp.base === basePay(par, tier)
          && sp.total === cents(payoutFor(par, r, tier))
    })
  })())
  check('splitPayout on a bonus multiplier: base and total both carry payMult', (() => {
    const sp = splitPayout(par, 0.8, tier, 2)
    return sp.base === basePay(par, tier, 2) && sp.total === cents(2 * payoutFor(par, 0.8, tier))
  })())
  check('splitPayout on degenerate par: everything 0', (() => {
    const sp = splitPayout(0, 1, tier); return sp.base === 0 && sp.tip === 0 && sp.total === 0
  })())
}

// ── 1b. FEAT-168: pay is locked to the region; costs ride the day [owner, 2026-11-05] ─────────────
// "payment shouldnt scale with the day but item costs and fuel should... otherwise there is no
// incentive to hurry up and collect good deeds." The cost curve came down to 1.065^(d−1) with it, and
// the run lengthened to 10 deeds (~12 days).
{
  let day = 1
  const eco = new EconomySystem({ getDay: () => day, getRegion: () => 1 })
  const d1 = eco.terms(); day = 7
  const d7 = eco.terms()
  check('a day-7 job quotes the same base and max as day 1 (payTier === regionTier)',
    d1.payTier === d7.payTier && d7.payTier === regionTier(1)
      && payRange(180, d7.payTier).base === payRange(180, d1.payTier).base && payRange(180, d7.payTier).max === payRange(180, d1.payTier).max)
  check('…while costs read the day-7 tier (1.46×) through tierNow and terms().dayTier',
    eco.tierNow() === 1.46 && d7.dayTier === 1.46)
  check('the cost curve is 1.065^(d−1) to the cent: day 7 1.46, day 12 2.00, day 20 3.31',
    P.dayTierTable.every((t, i) => t === Math.round(1.065 ** i * 100) / 100)
      && dayTier(7) === 1.46 && dayTier(12) === 2 && dayTier(20) === 3.31)
  check('the camp opens at 10 good deeds (a ~12-day region-1 run)', P.campDeeds === 10)
  // The ticket's check on the curve: a day's costs are 1.5 base pays × dayTier; two average B jobs
  // (at the B line, ratio 0.87, flat pay) must still clear day 12's.
  const costs12 = 1.5 * basePay(180, 1) * dayTier(12), twoB = 2 * payoutFor(180, rankTable('time', 1).B, 1)
  check(`two B jobs ($${twoB.toFixed(2)}) clear day 12's costs ($${costs12.toFixed(2)})`, twoB > costs12)
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
    const th = rankTable('time', 1), tier = dayTier(day)
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
// This is the progression dial — since FEAT-168 the ONLY one on pay. dayTier rises with the costs and
// pay does not follow, so surviving longer loses ground; the region step is what makes pushing into
// harder country worth doing.
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
  const B_DRIVE = 0.83   // a B on region 1's time row (A 0.81 < 0.83 ≤ B 0.87) — the reference drive
  const pay = (par, region) => payoutFor(par, B_DRIVE, regionTier(region))
  const start = pay(180, 1), end = pay(360, 6)
  check('a region-1 job pays $5-15', start >= 5 && start <= 15, `got $${start.toFixed(2)}`)
  // FEAT-168 took the day out of pay, so the 2026-08-17 "$500-1500 day-20 region-6" end target (which
  // leaned on dayTier ~4.6) is no longer met by regionMult alone. Regions are post-alpha (FEAT-28 / SM-4):
  // re-cut regionMult there. Reported, not gated, until then.
  console.log(`       a region-6 job pays $${end.toFixed(0)} (the retired day × region target was $500-1500)`)
}

// ── 6. FEAT-138: the threshold table — by type and REGION, never by day ────────────────────────
// [RE-ANCHORED 2026-08-16] C sits exactly ON 1.0: par is the C/D boundary. [2026-10-21, FEAT-138] The
// day ramp retired; thresholds step by region (design-amendments-2026-10-21-mission-recut.md §11b).
{
  const T = P.RANK_TABLE
  const rows = [...T.time, ...T.haul.firewood, ...T.freight]
  check('time rows ordered S<A<B<C (lower is better)', T.time.every(t => t.S < t.A && t.A < t.B && t.B < t.C))
  check('count, kg and health rows ordered S>A>B>C (higher is better)',
    [...T.haul.firewood, ...T.freight, ...Object.values(T.fragile).flat()].every(t => t.S > t.A && t.A > t.B && t.B > t.C))
  check('C IS par (=== 1.0) in EVERY region — the pass line never moves', T.time.every(t => t.C === 1.0))
  check('region 1 time deep-equals par.js RANK_THRESHOLDS_DEFAULT',
    ['S', 'A', 'B', 'C'].every(k => rankTable('time', 1)[k] === RANK_THRESHOLDS_DEFAULT[k]))
  check('gradeRun default arg IS region 1 (3-arg === 2-arg)',
    gradeRun(170, 180).letter === gradeRun(170, 180, rankTable('time', 1)).letter)
  // Haul S is MEASURED (test/measure-haul-brim.mjs, 2026-10-22: a brimming stock bed = 25); A/B/C
  // are 85/70/55 % of it rounded UP (owner, 2026-10-21 §12.1).
  check('haul firewood: S 25 (measured), A/B/C = ceil(85/70/55 % of S) in every region',
    T.haul.firewood.every(t => t.S === 25 && t.A === Math.ceil(0.85 * t.S) && t.B === Math.ceil(0.70 * t.S) && t.C === Math.ceil(0.55 * t.S)),
    JSON.stringify(T.haul.firewood[0]))
  check('freight R1 (PROVISIONAL): 712 / 570 / 285 / 0 kg — S/A at 125/100 % of the 570 kg rating, B at half it, C at ZERO so every load earns at least ½ a deed (R-18)',
    ['S', 'A', 'B', 'C'].every((k, i) => rankTable('freight', 1)[k] === [712, 570, 285, 0][i]))
  check('the table lookup clamps like regionTier (region 0 → 1, region 9 → the last row)',
    rankTable('time', 0) === T.time[0] && rankTable('freight', 9) === T.freight[T.freight.length - 1]
      && rankTable('haul', 1.7, 'firewood') === T.haul.firewood[0])
  check('every row has all four letters, finite', rows.every(t => ['S', 'A', 'B', 'C'].every(k => isFinite(t[k]))))
  // NOTHING READS THE DAY FOR A LETTER: the same region accepted on day 1 and day 20 gets identical
  // thresholds. (The day still moves dayTier — that is the cost treadmill, not difficulty or pay.)
  let day = 1
  const eco = new EconomySystem({ getDay: () => day, getRegion: () => 1 })
  const early = eco.terms(); day = 20
  const late = eco.terms()
  check('terms(): day 1 and day 20 freeze the SAME thresholds in one region',
    ['S', 'A', 'B', 'C'].every(k => early.thresholds[k] === late.thresholds[k]) && early.dayTier !== late.dayTier)
  // S MUST STAY REACHABLE. The best HONEST drive in runs-v2/ is ratio 0.740 [2026-09-07; 0003, later
  // archived to runs-v2/pre-feat80-grip/; the best new-grip drive, 0019, is also 0.740]. A 0.668 run
  // skipped 471 m of its route and must not certify a threshold. Keep every region's S at or above it.
  check('S is reachable in every region (threshold ≥ the best HONEST recorded drive, 0.740)',
    T.time.every(t => t.S >= 0.740))
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
  check('start() opens the run on the last paycheck (R-01) with zero points/missions',
    runEconomy.money === ECONOMY_PARAMS.startCash && runEconomy.halfPoints === 0 && runEconomy.missions === 0)
  // ratio 0.83 IS a B under the re-cut bands (A 0.81 < 0.83 ≤ B 0.87). Kept in step with the bands
  // on purpose: the fixture asserts a letter, so a band move that leaves it behind would have it
  // claiming a letter the ratio no longer earns (it read 0.78 before 2026-09-07, now an A).
  const r = eco.settle({ par: 180, ratio: 0.83, letter: 'B' }, { terms: eco.terms() })
  check('settle accrues money + points + mission count',
    runEconomy.money === cents(ECONOMY_PARAMS.startCash + r.payout) && eco.points() === 1 && eco.missionCount() === 1)
  check('payout is to the cent', r.payout === cents(r.payout))
  check('payout keeps its cents (par 181 at par pays $7.54, not $8)', splitPayout(181, 1, dayTier(1) * regionTier(1)).total === 7.54)
  check('runState stays narrow — no money/points on the day-boundary object',
    !('money' in runState) && !('halfPoints' in runState) && !('points' in runState))
}

// ── 8b. Haul: pay × the share of the load aboard (FEAT-88) ─────────────────────────────────────
// main.js's onSettle hands the economy a mission whose payMult is already × aboard / loaded — the
// per-bundle rate × the pieces delivered. The economy must carry that factor straight through: the
// same job with 9 of 12 bundles pays 9/12 of the full load (to the cent's rounding), base AND tip
// alike (dumping half the load never pays more), and base + tip still sum to the total.
{
  const eco = new EconomySystem({ getDay: () => 1 })
  eco.start()
  const terms = eco.terms(), res = { par: 360, ratio: 0.9, letter: 'B' }
  const full = eco.settle(res, { terms, payMult: 12 / 8 })
  const part = eco.settle(res, { terms, payMult: (12 / 8) * (9 / 12) })
  const none = eco.settle(res, { terms, payMult: 0 })
  check('9 of 12 bundles aboard pays 9/12 of the full load', Math.abs(part.payout - full.payout * 9 / 12) <= 0.01,
    `${part.payout} vs ${full.payout} × 0.75`)
  check('…the tip scales with the load too, not just the base', Math.abs(part.tip - full.tip * 9 / 12) <= 0.01)
  check('base + tip === total on a partial load', sumsTo(part.base, part.tip, part.payout))
  check('an empty bed pays nothing (floor at zero, SM-INV-4)', none.payout === 0)
  // FEAT-138: good deeds read the letter on every type — the share bands retired.
  const deeds = (letter) => eco.settle({ ...res, letter, aboard: 3, loaded: 12 }, { terms }).points
  check('haul good deeds follow the letter (pointsFor), not a share band',
    deeds('S') === 1 && deeds('B') === 1 && deeds('C') === 0.5 && deeds('D') === 0)
}

// ── 8c. FEAT-138: haul letters on the COUNT delivered, freight on the KG ────────────────────────
{
  const H = rankTable('haul', 1, 'firewood'), F = rankTable('freight', 1)
  const h = (n) => amountGrade(n, H), f = (kg) => amountGrade(kg, F)
  check('haul: 25 → S, 22 → A, 18 → B, 14 → C, 13 → D (each floor is inclusive)',
    h(25) === 'S' && h(30) === 'S' && h(24) === 'A' && h(22) === 'A' && h(18) === 'B' && h(14) === 'C' && h(13) === 'D' && h(0) === 'D')
  check('freight: 712 → S, 570 → A, 285 → B, anything lighter → C (never D: a strapped load always arrives, R-18)',
    f(712) === 'S' && f(711.9) === 'A' && f(570) === 'A' && f(428) === 'B' && f(285) === 'B' && f(284) === 'C' && f(1) === 'C')
  check('the letter never improves as pieces are lost',
    Array.from({ length: 31 }, (_, i) => 'DCBAS'.indexOf(h(30 - i))).every((v, i, a) => i === 0 || v <= a[i - 1]))
}

// ── 9. The terms: the day rides along, the pay is the region's ─────────────────────────────────
{
  let day = 3
  const eco = new EconomySystem({ getDay: () => day })
  eco.start()
  const terms = eco.terms()          // accepted on day 3
  day = 4                            // midnight passes mid-drive
  // Settle AT the full-tip ratio so the expected payout is exactly the max (k·par·tier) and the arithmetic
  // below stays readable. (At ratio 1.0 it would be half a unit — see the re-anchored payout line.)
  const settled = eco.settle({ par: 180, ratio: ECONOMY_PARAMS.fullTipRatio, letter: 'S' }, { terms })
  check('settle pays the region tier, never the day\'s (day 3 accept, day 4 finish: $10)',
    settled.payout === cents(ECONOMY_PARAMS.k * 180 * regionTier(1)) && settled.payout === 10)
  check('terms carry the region\'s thresholds (frozen)',
    terms.day === 3 && terms.thresholds.S === rankTable('time', terms.region).S && Object.isFrozen(terms.thresholds))
  check('terms: payTier === regionTier, dayTier rides along for costs',
    terms.payTier === terms.regionTier && terms.dayTier === dayTier(3))
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
    settled.payout === cents(ECONOMY_PARAMS.k * 180 * dayTier(1) * regionTier(2)),
    `got ${settled.payout}`)
  check('region locks at ACCEPT, not at settle',
    settled.payout !== cents(ECONOMY_PARAMS.k * 180 * dayTier(1) * regionTier(5)))
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
    atPar.base === basePay(par, terms.payTier) && sumsTo(atPar.base, atPar.tip, atPar.payout)
      && atPar.payout === cents(0.75 * ECONOMY_PARAMS.k * par * terms.payTier))
  const k0 = ECONOMY_PARAMS.k
  const b1 = ECONOMY_PARAMS.baseFrac * k0 * par * terms.payTier
  ECONOMY_PARAMS.k = k0 * 2
  check('doubling k doubles basePay (recomputed from the tables, never cached)',
    basePay(par, terms.payTier) === cents(2 * b1))
  ECONOMY_PARAMS.k = k0

  // bonusEarned truth table: X earns at X or better, S is S only, D never earns.
  const want = { S: ['S'], A: ['S', 'A'], B: ['S', 'A', 'B'], C: ['S', 'A', 'B', 'C'] }
  let tt = true
  for (const gate of RANKS) for (const letter of RANKS) {
    const exp = gate !== 'D' && (want[gate] || []).includes(letter)
    if (bonusEarned(letter, gate) !== exp) tt = false
  }
  check('bonusEarned: X or better, S only, D never earns (full 5×5 truth table)', tt)

  // R-04 (game-feel review 2026-10-23): on a bonus offer THE ITEM IS THE TIP — the base is the full
  // line's base and the cash tip is zero, whatever the ratio. payMult still scales the whole line.
  runEconomy.money = 0
  const plain = eco.settle({ par, ratio: 0.8, letter: 'A' }, { terms })
  const withRec = eco.settle({ par, ratio: 0.8, letter: 'A' }, { terms, bonus: { rewardId: 'x', name: 'X', gate: 'B' } })
  const halved = eco.settle({ par, ratio: 0.8, letter: 'A' },
                            { terms, bonus: { rewardId: 'x', name: 'X', gate: 'B' }, payMult: 0.5 })
  check('a bonus job pays the plain job\'s base and no cash tip (the item is the tip)',
    withRec.base === plain.base && withRec.tip === 0 && withRec.payout === plain.base)
  check('payMult still scales a bonus job\'s (base-only) line', halved.payout === basePay(par, terms.payTier, 0.5))
  check('an earned bonus is recorded as an award', withRec.award?.rewardId === 'x')
  const pr = payRange(par, terms.payTier)
  check('payRange: base is basePay, max is the whole line at ratio 0 (R-03)',
    pr.base === basePay(par, terms.payTier) && pr.max === cents(payoutFor(par, 0, terms.payTier)))
  check('payRange honours the tip multiplier', payRange(par, terms.payTier, 1, 0.5).max === cents(pr.base + (pr.max - pr.base) * 0.5))
  const missed = eco.settle({ par, ratio: 1.1, letter: 'D' }, { terms, bonus: { rewardId: 'y', name: 'Y', gate: 'C' } })
  check('a D earns no award, whatever the gate', missed.award === null)
  check('…but a D still settles its base pay (failed on time, not unpaid)', missed.payout >= basePay(par, terms.payTier))
}

// ── 10. Purity ──────────────────────────────────────────────────────────────────────────────────
{
  let stable = true
  const a = payoutFor(233.7, 0.87, 1.52), b = rankTable('time', 2), c = dayTier(6)
  for (let i = 0; i < 1000; i++) {
    if (payoutFor(233.7, 0.87, 1.52) !== a) stable = false
    const t = rankTable('time', 2)
    if (t.S !== b.S || t.C !== b.C) stable = false
    if (dayTier(6) !== c) stable = false
  }
  check('pure functions referentially transparent over 1000 calls', stable)
  const src = readFileSync(new URL('../src/economy.js', import.meta.url), 'utf8')
  check('economy.js imports nothing (day can never reach computePar)', !/^\s*import\b/m.test(src))
  check('RANK_COLOR covers all five letters', ['D', 'C', 'B', 'A', 'S'].every(k => /^#[0-9a-f]{6}$/i.test(RANK_COLOR[k])))
}

console.log(fails === 0 ? '\neconomy gate: ALL OK' : `\neconomy gate: ${fails} FAILURE(S)`)

// ── FEAT-142: the deed traits — Off the books earns none, The right thing to do adds ½ at C or better
{
    const deedsOf = (letter, deeds) => {
        const before = runEconomy.halfPoints
        new EconomySystem().settle({ par: 300, ratio: 1, letter }, { terms: { payTier: 1 }, deeds })
        return (runEconomy.halfPoints - before) / 2
    }
    check('FEAT-142: Off the books earns no good deed, even at S', deedsOf('S', 'none') === 0)
    check('FEAT-142: The right thing to do adds ½ at C or better (B → 1½, C → 1)', deedsOf('B', 'extraHalf') === 1.5 && deedsOf('C', 'extraHalf') === 1)
    check('FEAT-142: …and nothing at D', deedsOf('D', 'extraHalf') === 0)
}
// FEAT-142: Impatient / Patient scale a courier's TIME thresholds at accept, frozen with the terms.
{
    const { MissionSystem } = await import('../src/mission.js')
    const termsAt = (scale) => {
        const ms = new MissionSystem({ getRoad: () => null, getCar: () => ({ x: 0, z: 0 }), teleport () {}, setMapOpen () {}, onChange () {},
                                       getTerms: () => ({ payTier: 1, thresholds: { ...RANK_THRESHOLDS_DEFAULT } }) })
        ms.state = 'offer'
        ms.mission = { fromPoi: 'p', startZone: { x: 0, z: 0, r: 10 }, start: { x: 0, z: 0, heading: 0 }, end: { x: 0, z: 0 }, thresholdScale: scale }
        ms.accept()
        return ms.mission.terms.thresholds
    }
    check('FEAT-142: Impatient tightens a courier\'s time thresholds at accept (S 0.77 → 0.693)', Math.abs(termsAt(0.9).S - 0.77 * 0.9) < 1e-12)
    check('FEAT-142: …Patient loosens them, and a job with no trait keeps the region\'s own', Math.abs(termsAt(1.1).C - 1.1) < 1e-12 && termsAt(1).B === RANK_THRESHOLDS_DEFAULT.B)
}
process.exit(fails === 0 ? 0 : 1)
