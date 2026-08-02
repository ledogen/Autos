// test/economy.mjs — FEAT-53 economy spine gate (SM-2).
//
// Pins the RATIFIED performance model (DESIGN.md "The performance model", 2026-08-01) — the
// SM-INV surface of the economy, all of it headless:
//
//   1. SM-INV-4 — the payout line's three anchors (+20% over ≈ 0 · par = k·par·tier exactly ·
//      −20% under = 2×), the cap, and the zero floor over degenerate inputs.
//   2. parBase ∝ par — the anti-farming property: doubling the road doubles the base, so a loop
//      of tiny jobs never beats one honest haul.
//   3. SM-INV-14 — points are 1/½/0 at B+/C/D, accrue as INTEGER halves, and neither payout nor
//      points may ever increase with time taken.
//   4. SM-INV-2 (as amended) — the difficulty ramp lives in dayTier + rank thresholds; day 1
//      deep-equals par.js's RANK_THRESHOLDS_DEFAULT, B contains par (B > 1.0) on EVERY day, and
//      economy.js imports nothing (so `day` cannot reach computePar even by accident).
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
check('pinned: k 0.30, cap 3.0', ECONOMY_PARAMS.k === 0.30 && ECONOMY_PARAMS.payoutCap === 3.0)
check('pinned: tier table has 8 days, tier(1) === 1', ECONOMY_PARAMS.dayTierTable.length === 8 && dayTier(1) === 1)

// ── 1. SM-INV-4: the payout line's anchors ──────────────────────────────────────────────────────
{
  const par = 180, tier = 1.0
  const atPar = payoutFor(par, 1.0, tier)
  check('ratio 1.2 → 0 (bare completion pays ~nothing)', payoutFor(par, 1.2, tier) === 0)
  check('ratio 1.0 → k·par·tier exactly', near(atPar, ECONOMY_PARAMS.k * par * tier), `got ${atPar}`)
  check('ratio 0.8 → exactly 2× par pay', near(payoutFor(par, 0.8, tier), 2 * atPar))
  check('cap bites at ratio 0.60 and below', near(payoutFor(par, 0.6, tier), ECONOMY_PARAMS.payoutCap * atPar)
    && near(payoutFor(par, 0.1, tier), ECONOMY_PARAMS.payoutCap * atPar))
  check('tier multiplies linearly', near(payoutFor(par, 1.0, 2.66), 2.66 * atPar))
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
  check('dayTier clamps flat past the table (day 50 === day 8)', dayTier(50) === dayTier(8))
  check('dayTier clamps below (day 0/−3 === day 1)', dayTier(0) === dayTier(1) && dayTier(-3) === dayTier(1))
}

// ── 6. rankThresholds: ordered, tightening, B always contains par, day 1 === par.js default ─────
{
  let ordered = true, contains = true, tightening = true
  let prev = null
  for (let d = 1; d <= 20; d++) {
    const t = rankThresholds(d)
    if (!(t.S < t.A && t.A < t.B && t.B < t.C)) ordered = false
    if (!(t.A < 1.0 && 1.0 < t.B)) contains = false        // B is the band containing par
    if (prev) for (const k of ['S', 'A', 'B', 'C']) if (t[k] > prev[k] + 1e-12) tightening = false
    prev = t
  }
  check('thresholds ordered S<A<B<C, days 1..20', ordered)
  check('B contains par (A < 1.0 < B) on EVERY day', contains)
  check('thresholds non-increasing in day (tighten, never loosen)', tightening)
  const d1 = rankThresholds(1)
  check('day 1 deep-equals par.js RANK_THRESHOLDS_DEFAULT',
    ['S', 'A', 'B', 'C'].every(k => d1[k] === RANK_THRESHOLDS_DEFAULT[k]))
  check('gradeRun default arg IS day 1 (3-arg === 2-arg at day 1)',
    gradeRun(170, 180).letter === gradeRun(170, 180, rankThresholds(1)).letter)
  check('day ramp changes the letter, never the ratio', (() => {
    const early = gradeRun(0.79 * 180, 180, rankThresholds(1))   // S on day 1
    const late = gradeRun(0.79 * 180, 180, rankThresholds(8))    // A on day 8
    return early.letter === 'S' && late.letter === 'A' && near(early.ratio, late.ratio)
  })())
}

// ── 7. Points accrue as exact integer halves ────────────────────────────────────────────────────
{
  const eco = new EconomySystem({ getDay: () => 1 })
  eco.start()
  for (let i = 0; i < 20; i++) eco.settle({ par: 180, ratio: 1.1, letter: 'C' }, { terms: eco.terms() })
  check('20 C-grades === exactly 10.0 points (integer halves, no float drift)', eco.points() === 10.0)
  check('formatDeeds renders the ½ glyph', formatDeeds(7) === '3½' && formatDeeds(1) === '½' && formatDeeds(4) === '2')
}

// ── 8. Run-layer boundary (SM-INV-12) ───────────────────────────────────────────────────────────
{
  const eco = new EconomySystem({ getDay: () => 3 })
  runEconomy.money = 999; runEconomy.halfPoints = 9; runEconomy.missions = 4
  eco.start()
  check('start() zeroes the run wallet/points/missions',
    runEconomy.money === 0 && runEconomy.halfPoints === 0 && runEconomy.missions === 0)
  const r = eco.settle({ par: 180, ratio: 1.0, letter: 'B' }, { terms: eco.terms() })
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
  const settled = eco.settle({ par: 180, ratio: 1.0, letter: 'B' }, { terms })
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
