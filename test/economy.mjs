// test/economy.mjs — FEAT-53 economy spine gate (SM-2).
//
// Pins the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01) — the
// SM-INV surface of the economy, all of it headless:
//
//   1. SM-INV-4 — the payout line's anchors, RE-ANCHORED 2026-08-16: break-even (the B/C boundary,
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
  ECONOMY_PARAMS, RANK_COLOR, dayTier, rankThresholds, payoutFor, pointsFor,
  runEconomy, EconomySystem, formatDeeds,
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
check('pinned: k 0.024, cap 3.0', ECONOMY_PARAMS.k === 0.024 && ECONOMY_PARAMS.payoutCap === 3.0)
check('pinned: tier table has 30 days, tier(1) === 1', ECONOMY_PARAMS.dayTierTable.length === 30 && dayTier(1) === 1)
check('pinned: break-even 0.80 (the day-1 B/C boundary), zero 1.20',
  ECONOMY_PARAMS.breakEven === 0.80 && ECONOMY_PARAMS.payoutZero === 1.20)
// The break-even ratio is not a free number: it IS the B/C threshold, so a rank refit must move it
// (and k with it) or the economy silently decouples from the letters.
check('break-even IS the day-1 B/C threshold, not an independent constant',
  ECONOMY_PARAMS.breakEven === ECONOMY_PARAMS.rankDay1.B)

// ── 1. SM-INV-4: the payout line's anchors [RE-ANCHORED 2026-08-16] ─────────────────────────────
// The anchors moved with the meaning of par. They used to read "0 at 1.2 · one unit AT PAR · 2× at
// 0.8", which encoded par-as-the-expected-drive. Par is now the C/D boundary — the slowest PASS —
// so the unit anchor moved down to the B/C boundary and par itself pays a fraction of a day.
{
  const par = 180, tier = 1.0
  const unit = ECONOMY_PARAMS.k * par * tier          // one day-tier unit of maintenance
  const atBreakEven = payoutFor(par, ECONOMY_PARAMS.breakEven, tier)
  check('break-even ratio 0.80 → exactly one day-tier unit (k·par·tier)',
    near(atBreakEven, unit), `got ${atBreakEven}`)
  check('ratio 1.20 → 0 (well past par, margin money is gone)', payoutFor(par, 1.20, tier) === 0)
  check('ratio 1.50 → still 0 (floored, never negative)', payoutFor(par, 1.50, tier) === 0)
  // The headline consequence of the re-anchor, pinned so it cannot quietly drift back: PAR LOSES
  // MONEY. If this ever reads 1.0 units again, the re-anchor has been undone somewhere upstream.
  check('par (ratio 1.0) pays HALF a unit — a bare pass does not cover the day',
    near(payoutFor(par, 1.0, tier), 0.5 * unit), `got ${(payoutFor(par, 1.0, tier) / unit).toFixed(3)} units`)
  check('par pays strictly less than break-even', payoutFor(par, 1.0, tier) < atBreakEven)
  check('ratio 0.72 (the S/A boundary) → 1.2 units', near(payoutFor(par, 0.72, tier), 1.2 * unit))
  // The cap is unreachable under this line (it would need ratio 0), so assert it still CLAMPS
  // rather than asserting a bite point that no longer exists.
  check('cap clamps degenerate fast ratios', near(payoutFor(par, -5, tier), ECONOMY_PARAMS.payoutCap * unit))
  check('tier multiplies linearly', near(payoutFor(par, 1.0, 2.66), 2.66 * payoutFor(par, 1.0, 1.0)))
}

// ── 2. Floors at zero, finite, never NaN ────────────────────────────────────────────────────────
{
  let ok = true
  for (let r = 1.2; r <= 10; r += 0.1) {
    const p = payoutFor(180, r, 1.5)
    if (!(p >= 0 && isFinite(p))) ok = false
  }
  check('payout ≥ 0 and finite over ratio 1.2..10', ok)
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
    const early = gradeRun(0.71 * 180, 180, rankThresholds(1))   // S on day 1 (S ≤ 0.72)
    const late = gradeRun(0.71 * 180, 180, rankThresholds(20))   // A on day 20 (S has tightened to 0.70)
    return early.letter === 'S' && late.letter === 'A' && near(early.ratio, late.ratio)
  })())
  // S MUST STILL BE REACHABLE ON THE LAST DAY. This is the regression that prompted the whole
  // 2026-08-16 re-anchor: the previous ramp tightened S to 0.74 by day 20, which was faster than
  // ANY of the 20 recorded drives in runs/, so S was mathematically dead for the back half of
  // every run and nobody had decided that. The best drive in the corpus sits at ratio 0.654; keep
  // day-20 S at or above it or the letter goes extinct again, silently.
  check('S survives day 20 (threshold ≥ the best recorded human drive, 0.654)',
    rankThresholds(20).S >= 0.654, `day-20 S = ${rankThresholds(20).S.toFixed(3)}`)
}

// ── 7. Points accrue as exact integer halves ────────────────────────────────────────────────────
{
  const eco = new EconomySystem({ getDay: () => 1 })
  eco.start()
  // ratio 0.95 IS a C under the re-anchored bands (B 0.90 < 0.95 ≤ C 1.00). It used to read 1.1,
  // which is now a D — the fixture would have been quietly self-contradictory.
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
  // ratio 0.78 IS a B under the re-anchored bands (A 0.76 < 0.78 ≤ B 0.80). It used to read 1.0,
  // which is now the C/D boundary — the fixture claimed a letter the ratio no longer earns.
  const r = eco.settle({ par: 180, ratio: 0.78, letter: 'B' }, { terms: eco.terms() })
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
  // Settle AT break-even so the expected payout is exactly one day-tier unit and the arithmetic
  // below stays readable. (At ratio 1.0 it would be half a unit — see the re-anchored payout line.)
  const settled = eco.settle({ par: 180, ratio: ECONOMY_PARAMS.breakEven, letter: 'B' }, { terms })
  check('terms lock: day-3 tier paid despite finishing on day 4',
    settled.payout === Math.round(ECONOMY_PARAMS.k * 180 * dayTier(3)) && dayTier(3) !== dayTier(4))
  check('terms carry day-3 thresholds (frozen)',
    terms.day === 3 && terms.thresholds.S === rankThresholds(3).S && Object.isFrozen(terms.thresholds))
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
