// test/day-clock.mjs — FEAT-47 day clock gate (SM-1).
//
// The day clock is the substrate every story-mode system will hang off (missions spend the day,
// wear reads time, the Night Owl reads tired hours), so the properties that must never quietly
// break are:
//
//   1. SM-INV-12 — the FLAG-GATE. Blinks/dozes are live-reactive, so with the flag off (the
//      default, and the only state headless code ever sees) attenuation() must be IDENTICALLY 1
//      and eyelidFactor() IDENTICALLY 0 across a whole simulated day. This is the check that keeps
//      every physics gate honest without any of them knowing day.js exists.
//   2. SM-INV-12 — runState advances at day/sleep boundaries only. This gate PINS a default
//      runState (day 1) exactly as the invariant prescribes, then asserts the only movers are the
//      midnight wrap and the sleep skip.
//   3. THE BAKE THROTTLE — setTimeOfDay is pushed on the dayLookQuantH ladder, not per tick.
//      A minute of 60 fps updates must push ~11 times, not ~3600 (each push re-bakes the sky
//      cubemap AND the prop impostor atlas).
//   4. The ratified arithmetic (2026-07-30, tank 18 → 16 h 2026-08-02 per run-shape.md): stage
//      ladder at 12/14/16 h awake (energy 4/2/0), coffee +5 now / −3 at wake (net positive),
//      r(vibe) with average = full-from-empty in 8 h and best = exactly 2× worst, the tired
//      signal blink firing exactly once per crossing.
//
// Pure node: DaySystem's deps adapter is a counting stub — no THREE, no worldgen, no DOM.
import { DaySystem, DAY_PARAMS, runState } from '../src/day.js'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// Pin the ratified defaults this gate asserts against (a debug-slider default drifting should fail
// loudly HERE, not silently re-tune the gate).
check('pinned: dayLengthSec 1440', DAY_PARAMS.dayLengthSec === 1440)
check('pinned: energy ladder 16/4/2', DAY_PARAMS.fullEnergyH === 16 && DAY_PARAMS.sleepyAtH === 4 && DAY_PARAMS.tiredAtH === 2)
check('pinned: coffee +5/−3', DAY_PARAMS.coffeeReliefH === 5 && DAY_PARAMS.coffeeDebtH === 3)
check('pinned: sleep rates 4/3 and 8/3 (mean 2.0, best exactly 2× worst)',
  DAY_PARAMS.sleepRateWorstH === 4 / 3 && DAY_PARAMS.sleepRateBestH === 8 / 3)

const mkDay = () => {
  const pushes = { n: 0, last: NaN }
  const sys = new DaySystem({ setTimeOfDay: (h) => { pushes.n++; pushes.last = h } })
  return { sys, pushes }
}

// ── 1. The bake throttle ────────────────────────────────────────────────────────────────────────
{
  DAY_PARAMS.dayLengthSec = 1440
  const { sys, pushes } = mkDay()
  sys.start()                                   // day 1, 07:00, one seeding push
  check('start() seeds one push at dayStartHour', pushes.n === 1 && pushes.last === DAY_PARAMS.dayStartHour)
  for (let i = 0; i < 3600; i++) sys.update(1 / 60)   // one real minute at 60 fps
  check('60 s real advances exactly 1.0 in-game h', Math.abs(sys.hour() - (DAY_PARAMS.dayStartHour + 1)) < 1e-9,
    `hour=${sys.hour()}`)
  check('pushes ride the quant ladder (~11), not per tick (~3601)', pushes.n >= 9 && pushes.n <= 13,
    `pushes=${pushes.n}`)
}

// ── 2. Midnight is a day boundary; energy drains 1:1 ────────────────────────────────────────────
{
  const { sys } = mkDay()
  sys.start()
  check('pinned runState: start() resets to day 1', runState.day === 1)
  DAY_PARAMS.dayLengthSec = 24                  // 1 s real = 1 in-game h, for cheap simulation
  sys.update(18)                                // 18 in-game hours in one bite
  check('midnight wrap increments runState.day', runState.day === 2 && sys.day() === 2)
  check('hour wraps 07+18 → 01', Math.abs(sys.hour() - 1) < 1e-9, `hour=${sys.hour()}`)
  check('18 h awake drains the 16 h tank to 0 (floored)', sys.energyH() === 0)
  check('energy floors at 0 (no deeper stage)', (sys.update(2), sys.energyH() === 0))
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 3. The stage ladder at 12/14/16 h awake ─────────────────────────────────────────────────────
{
  const { sys } = mkDay()
  sys.start()
  DAY_PARAMS.dayLengthSec = 24
  const firstAt = {}
  for (let t = 0; t < 20; t += 0.01) {          // 0.01 s = 0.01 in-game h steps
    sys.update(0.01)
    const s = sys.stage()
    if (!(s in firstAt)) firstAt[s] = DAY_PARAMS.fullEnergyH - sys.energyH()   // hours awake at first sighting
  }
  const near = (a, b) => Math.abs(a - b) < 0.02
  check('sleepy at 12 h awake', near(firstAt.sleepy, 12), `at ${firstAt.sleepy}`)
  check('tired at 14 h awake', near(firstAt.tired, 14), `at ${firstAt.tired}`)
  check('exhausted at 16 h awake', near(firstAt.exhausted, 16), `at ${firstAt.exhausted}`)
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 4. SM-INV-12 flag-gate: default-off is provably inert ───────────────────────────────────────
{
  const { sys } = mkDay()
  sys.start()                                   // blinks NOT enabled — the default
  DAY_PARAMS.dayLengthSec = 24
  let attenAlways1 = true, eyelidAlways0 = true
  for (let t = 0; t < 24; t += 0.005) {         // a full simulated day, well into exhaustion
    sys.update(0.005)
    if (sys.attenuation() !== 1) attenAlways1 = false
    if (sys.eyelidFactor() !== 0) eyelidAlways0 = false
  }
  check('flag off ⇒ attenuation() ≡ 1 across a full day', attenAlways1)
  check('flag off ⇒ eyelidFactor() ≡ 0 across a full day', eyelidAlways0)
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 5. The tired signal: exactly once per crossing, harmless; dozes attenuate ───────────────────
{
  const { sys } = mkDay()
  sys.start()
  sys.setBlinksEnabled(true)
  DAY_PARAMS.dayLengthSec = 24
  // Push the scheduler's Poisson gaps out of the test window so the ONLY blink that can begin in
  // tired is the once-per-crossing signal.
  const means = [DAY_PARAMS.blinkMeanSleepyH, DAY_PARAMS.blinkMeanTiredH, DAY_PARAMS.blinkMeanExhaustedH]
  DAY_PARAMS.blinkMeanSleepyH = DAY_PARAMS.blinkMeanTiredH = DAY_PARAMS.blinkMeanExhaustedH = 1e9

  const runUntil = (pred, budgetS) => {          // step real-time until pred() or budget spent
    for (let t = 0; t < budgetS; t += 0.004) { sys.update(0.004); if (pred()) return true }
    return false
  }
  let blinkStarts = 0, sawLossDuringSignal = false
  let wasOpen = true
  const watch = () => {
    const f = sys.eyelidFactor()
    if (wasOpen && f > 0) { blinkStarts++; if (sys.attenuation() !== 1) sawLossDuringSignal = true }
    if (f > 0 && sys.attenuation() === 0 && blinkStarts === 1) sawLossDuringSignal = true
    wasOpen = f === 0
    return false
  }
  runUntil(() => (watch(), sys.stage() === 'tired' && sys.eyelidFactor() === 0 && !sys._blink), 20)
  check('crossing into tired fires exactly one blink (the signal)', blinkStarts === 1, `starts=${blinkStarts}`)
  check('the signal blink never drops controls', !sawLossDuringSignal)

  sys.drinkCoffee()                              // back above the threshold — the signal re-arms
  check('coffee lifts back out of tired', sys.stage() !== 'tired')
  blinkStarts = 0
  runUntil(() => (watch(), sys.stage() === 'tired' && sys.eyelidFactor() === 0 && !sys._blink), 30)
  check('re-crossing after coffee fires the signal again', blinkStarts === 1, `starts=${blinkStarts}`)

  // A forced TIRED doze: eyelids reach full close, attenuation hits 0 during the hold only.
  let minAtten = 1, maxEyelid = 0
  sys.forceBlink()
  for (let t = 0; t < 3; t += 0.002) {
    sys.update(0.002)
    minAtten = Math.min(minAtten, sys.attenuation())
    maxEyelid = Math.max(maxEyelid, sys.eyelidFactor())
    if (!sys._blink) break
  }
  check('a tired doze closes the lids fully', maxEyelid === 1)
  check('a tired doze drops controls (attenuation 0 during hold)', minAtten === 0)
  ;[DAY_PARAMS.blinkMeanSleepyH, DAY_PARAMS.blinkMeanTiredH, DAY_PARAMS.blinkMeanExhaustedH] = means
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 6. Coffee arithmetic ────────────────────────────────────────────────────────────────────────
{
  const { sys } = mkDay()
  sys.start()
  DAY_PARAMS.dayLengthSec = 24
  sys.update(13)                                 // 13 h awake → 3 h left
  check('setup: 3 h left', Math.abs(sys.energyH() - 3) < 1e-9)
  sys.drinkCoffee()
  check('coffee: +5 now', Math.abs(sys.energyH() - 8) < 1e-9, `e=${sys.energyH()}`)
  check('coffee: +3 debt held for wake', sys.coffeeDebt() === 3)
  sys.drinkCoffee(); sys.drinkCoffee(); sys.drinkCoffee()
  check('coffee clamps at a full tank', sys.energyH() <= DAY_PARAMS.fullEnergyH)
  check('debt stacks per cup', sys.coffeeDebt() === 12)
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 7. Sleep: the ratified recovery arithmetic + the loan settled at wake ───────────────────────
{
  const { sys } = mkDay()
  sys.start()
  // 4/3 and 8/3 are not FP-exact, so the mean-rate checks carry an epsilon; the exact-2× ratio
  // check stays ===, which holds in FP because doubling is exact.
  check('r(0.5) = 2.0 h/h (average site: 8 h = full from empty)', Math.abs(sys.recoveryRate(0.5) - 2.0) < 1e-9)
  check('r(1) = 2 × r(0) (best site is exactly twice the worst)', sys.recoveryRate(1) === 2 * sys.recoveryRate(0))

  DAY_PARAMS.dayLengthSec = 24
  sys.update(18)                                 // empty (floored past 16), day 2, hour 01:00
  const dayBefore = runState.day
  sys.sleep(8, 0.5)                              // the ratified headline: average site, 8 h
  check('empty + 8 h at an average site = a full tank', Math.abs(sys.energyH() - DAY_PARAMS.fullEnergyH) < 1e-9,
    `e=${sys.energyH()}`)
  check('sleep advances the clock 8 h', Math.abs(sys.hour() - 9) < 1e-9, `hour=${sys.hour()}`)
  check('no midnight inside 01:00+8 h ⇒ day unchanged', runState.day === dayBefore)

  sys.update(14)                                 // 09:00 + 14 h = 23:00, ~2 h left
  sys.drinkCoffee()                              // ~7 h left, debt 3
  const d2 = runState.day
  sys.sleep(9, 0.5)                              // 23:00 + 9 h crosses midnight; recovery uncapped, THEN −debt
  check('a midnight inside the sleep increments the day', runState.day === d2 + 1)
  // settled = 7 + 2.0·9 − 3 = 22 → clamps to 16: sleeping in DID pay the loan off.
  check('the loan is settled before the clamp (sleep-in offsets it)', sys.energyH() === DAY_PARAMS.fullEnergyH)
  check('the loan is cleared at wake', sys.coffeeDebt() === 0)

  // Short sleep with a debt: charged once, exactly.
  sys.update(14)                                 // 2 h left
  sys.drinkCoffee()                              // 7 h left, debt 3
  sys.sleep(2, 0)                                // settled = 7 + (4/3)·2 − 3 = 6⅔
  check('short sleep charges the debt once, uncapped', Math.abs(sys.energyH() - 20 / 3) < 1e-9, `e=${sys.energyH()}`)
  check('debt does not survive the wake', sys.coffeeDebt() === 0)
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 8. advanceMinutes (the make-camp chore) ─────────────────────────────────────────────────────
{
  const { sys, pushes } = mkDay()
  sys.start()
  const h0 = sys.hour(), e0 = sys.energyH(), n0 = pushes.n
  sys.advanceMinutes(30)
  check('30 min chore advances the clock 0.5 h', Math.abs(sys.hour() - h0 - 0.5) < 1e-9)
  check('…and costs 0.5 h of energy (awake is awake)', Math.abs(e0 - sys.energyH() - 0.5) < 1e-9)
  check('…and pushes the sky exactly once (the skip is not lived through)', pushes.n === n0 + 1)
  check('no blink survives a skip', sys.eyelidFactor() === 0 && sys.attenuation() === 1)
}

console.log(fails === 0 ? '\nPASS day-clock' : `\nFAIL day-clock (${fails})`)
process.exit(fails === 0 ? 0 : 1)
