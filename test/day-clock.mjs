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
//      signal blink firing exactly once per crossing, and SLEEP DEBT (owner 2026-08-02): energy
//      keeps falling past empty to a −8 floor, and the night that repays it must be longer —
//      0 h and −4 h are different nights. The stage ladder is untouched (negative = exhausted).
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
check('pinned: energy ladder 16/4/2, debt floor 8', DAY_PARAMS.fullEnergyH === 16 && DAY_PARAMS.sleepyAtH === 4
  && DAY_PARAMS.tiredAtH === 2 && DAY_PARAMS.sleepDebtMaxH === 8)
check('pinned: coffee +5/−2', DAY_PARAMS.coffeeReliefH === 5 && DAY_PARAMS.coffeeDebtH === 2)
check('pinned: sleep rates 4/3 and 8/3 (mean 2.0, best exactly 2× worst)',
  DAY_PARAMS.sleepRateWorstH === 4 / 3 && DAY_PARAMS.sleepRateBestH === 8 / 3)
check('pinned: hunger ×1.25 → ×1.5 over 4 h, a standard meal holds 8 h', DAY_PARAMS.hungryRate === 1.25
  && DAY_PARAMS.starvingRate === 1.5 && DAY_PARAMS.hungryRampH === 4 && DAY_PARAMS.mealHoldH === 8)
// Sections 1–9 pin the arithmetic of a FED driver; hunger (section 10) is a rate on top of it.
const HUNGER = { hungerOn: true, hungryRate: DAY_PARAMS.hungryRate, starvingRate: DAY_PARAMS.starvingRate }
DAY_PARAMS.hungryRate = DAY_PARAMS.starvingRate = 1

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
  check('18 h awake on a 16 h tank is 2 h of sleep debt', sys.energyH() === -2)
  check('energy floors at −8 (debt caps at one night)', (sys.update(10), sys.energyH() === -8))
  check('negative energy is plain exhausted (no deeper stage)', sys.stage() === 'exhausted')
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
  check('coffee: +2 debt held for wake', sys.coffeeDebt() === 2)
  sys.drinkCoffee(); sys.drinkCoffee(); sys.drinkCoffee()
  check('coffee clamps at a full tank', sys.energyH() <= DAY_PARAMS.fullEnergyH)
  check('debt stacks per cup', sys.coffeeDebt() === 8)
  DAY_PARAMS.dayLengthSec = 1440
}

// ── 6b. Energy drink and sleeping gear (owner, 2026-10-16/20) ─────────────────────────────────────
{
  const { sys } = mkDay()
  sys.start()
  DAY_PARAMS.dayLengthSec = 24
  sys.update(13)                                 // 3 h left
  sys.drinkEnergy()
  check('energy drink: +5 now, nothing owed at wake', Math.abs(sys.energyH() - 8) < 1e-9 && sys.coffeeDebt() === 0)
  sys.update(3.9)
  check('…no crash before 4 h', Math.abs(sys.energyH() - 4.1) < 1e-6, `e=${sys.energyH()}`)
  sys.update(0.2)
  check('…the crash lands at 4 h: −2.5 on top of the hours awake', Math.abs(sys.energyH() - 1.4) < 1e-6, `e=${sys.energyH()}`)
  sys.drinkEnergy(); sys.advanceMinutes(240)
  check('…a time skip lands it too', Math.abs(sys.energyH() - (1.4 + 5 - 4 - 2.5)) < 1e-6, `e=${sys.energyH()}`)
  sys.drinkEnergy()
  const wake = sys.previewWake(8, 0.5)
  sys.sleep(8, 0.5)
  sys.update(5)
  check('…a sleep before it sleeps it off: the night is the preview, and nothing lands after',
    Math.abs(sys.energyH() - (wake - 5)) < 1e-9, `e=${sys.energyH()} wake=${wake}`)
  check('sleeping gear: recovery ×(1 + rest) at a camp; the cab keeps its own rate',
    Math.abs(sys.recoveryRate(0.5, 0.15) - 2.0 * 1.15) < 1e-9 && sys.recoveryRate('truck', 0.15) === DAY_PARAMS.truckSleepRateH)
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
  check('truck = 1 h/h, below the worst campsite', sys.recoveryRate('truck') === 1 && sys.recoveryRate('truck') < sys.recoveryRate(0))

  const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

  DAY_PARAMS.dayLengthSec = 24
  sys.update(16)                                 // exactly empty, 23:00, still day 1
  check('16 h awake is exactly empty', sys.energyH() === 0)
  const d0 = runState.day
  sys.sleep(8, 0.5)                              // the ratified headline: average site, 8 h
  check('empty + 8 h at an average site = a full tank', near(sys.energyH(), DAY_PARAMS.fullEnergyH),
    `e=${sys.energyH()}`)
  check('sleep advances the clock 8 h (23:00 → 07:00)', near(sys.hour(), 7), `hour=${sys.hour()}`)
  check('a midnight inside the sleep increments the day', runState.day === d0 + 1)

  // Sleep debt (owner 2026-08-02): the same ratified night from −2 wakes you SHORT — 0 h and −2 h
  // are different nights now, which is the entire point of the floor moving off zero.
  sys.update(18)                                 // 07:00 + 18 h = 01:00 next day, energy −2
  check('staying up past empty accrues debt', near(sys.energyH(), -2), `e=${sys.energyH()}`)
  sys.sleep(8, 0.5)
  check('the debt comes off the night: −2 + 16 = 14, not full', near(sys.energyH(), 14), `e=${sys.energyH()}`)

  sys.update(12)                                 // 09:00 + 12 h = 21:00, 2 h left
  sys.drinkCoffee()                              // 7 h left, debt 2
  const d2 = runState.day
  sys.sleep(9, 0.5)                              // 21:00 + 9 h crosses midnight; recovery uncapped, THEN −debt
  check('a midnight inside the sleep increments the day (again)', runState.day === d2 + 1)
  // settled = 7 + 2.0·9 − 2 = 23 → clamps to 16: sleeping in DID pay the loan off.
  check('the loan is settled before the clamp (sleep-in offsets it)', sys.energyH() === DAY_PARAMS.fullEnergyH)
  check('the loan is cleared at wake', sys.coffeeDebt() === 0)

  // Short sleep with a debt: charged once, exactly.
  sys.update(14)                                 // 2 h left
  sys.drinkCoffee()                              // 7 h left, debt 2
  sys.sleep(2, 0)                                // settled = 7 + (4/3)·2 − 2 = 7⅔
  check('short sleep charges the debt once, uncapped', near(sys.energyH(), 23 / 3), `e=${sys.energyH()}`)
  check('debt does not survive the wake', sys.coffeeDebt() === 0)

  // Deep debt: a short night can wake you STILL exhausted — the debt is real, not cosmetic.
  sys.update(30)                                 // way past empty — floors at −8
  check('sleep-debt floor holds through a long binge', sys.energyH() === -DAY_PARAMS.sleepDebtMaxH)
  sys.sleep(4, 0)                                // −8 + (4/3)·4 = −8/3
  check('a short night from deep debt wakes you still exhausted',
    near(sys.energyH(), -8 / 3) && sys.stage() === 'exhausted', `e=${sys.energyH()}`)
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

// ── 9. FEAT-67: clockH — the absolute game clock the mission board runs on ───────────────────────
{
  const { sys } = mkDay()
  sys.start()
  let prev = sys.clockH(), mono = true, jumpOk = true
  for (let i = 0; i < 2000; i++) {           // ~33 in-game hours of 1 s ticks, across a midnight
    sys.update(1)
    const c = sys.clockH()
    if (!(c > prev) || c - prev > 1 / 60 + 1e-9) mono = false
    prev = c
  }
  check('clockH is continuous across midnight (never wraps, never jumps)', mono && runState.day >= 2)
  check('clockH === (day − 1)·24 + hour', Math.abs(sys.clockH() - ((sys.day() - 1) * 24 + sys.hour())) < 1e-9)
  const before = sys.clockH()
  sys.sleep(10, 0.5)
  jumpOk = Math.abs(sys.clockH() - before - 10) < 1e-9
  check('a 10 h sleep advances clockH by exactly 10', jumpOk, `${sys.clockH() - before}`)
}

// ── 10. FEAT-169: hunger — a rate on the drain past the meal's hold (items.md §1d) ─────────────────
// A run starts on a standard meal. Past its hold the drain runs ×1.25, ramping to ×1.5 over 4 h.
{
  Object.assign(DAY_PARAMS, HUNGER)
  const near = (a, b) => Math.abs(a - b) < 1e-6
  // Hours awake from a full tank to empty, eating `meals` ({ atH: hours awake, holdH }) on the way.
  const day = (meals = []) => {
    const { sys } = mkDay()
    sys.start()
    DAY_PARAMS.dayLengthSec = 24
    const step = 1 / 64   // exact in binary, so meal times land on a step
    let t = 0
    while (sys.energyH() > 0) {
      for (const m of meals) if (t === m.atH) sys.eat(m.holdH)
      sys.update(step); t += step
    }
    DAY_PARAMS.dayLengthSec = 1440
    return t
  }
  const fed = day([{ atH: 8, holdH: 8 }]), unfed = day(), dog = day([{ atH: 8, holdH: 10 }])
  // Unfed: 8 h at ×1, the 4 h ramp costs 5.5 h, the last 2.5 h at ×1.5 lasts 1⅔ h → 13⅔ h awake.
  console.log(`       a waking day: fed ${fed.toFixed(2)} h · unfed ${unfed.toFixed(2)} h (${(fed - unfed).toFixed(2)} h lost) · chili dog at 8 h ${dog.toFixed(2)} h`)
  check('fed on schedule (a second 8 h meal at 8 h awake), the day is today\'s 16 h', Math.abs(fed - 16) <= 1 / 64)
  check('unfed past the hold, the day is 2⅓ h shorter (×1.25 → ×1.5)', Math.abs(unfed - (12 + 5 / 3)) <= 1 / 64, `unfed=${unfed}`)
  check('a longer hold (the chili dog\'s 10 h) covers the whole day too', Math.abs(dog - 16) <= 1 / 64)

  // Every step below is a multiple of 1/64 h, so the clock lands EXACTLY on a hold's end.
  const { sys } = mkDay()
  sys.start()
  DAY_PARAMS.dayLengthSec = 24
  const tick = 1 / 64
  check('a run starts fed', !sys.hungry())
  sys.update(8)
  check('…and is hungry once the standard meal\'s 8 h are up', !sys.hungry() && (sys.update(tick), sys.hungry()))
  const e0 = sys.energyH()
  sys.eat(10)
  sys.update(10)
  check('eating resets the clock to the food\'s hold: 10 h at ×1, no longer', near(e0 - sys.energyH(), 10) && !sys.hungry()
    && (sys.update(tick), sys.hungry()))
  sys.eat(8); sys.eat(2)
  check('a snack after a meal never shortens its hold', (sys.update(7.875), !sys.hungry()))
  sys.setEnergy(8)   // 26 h awake had floored it at the debt floor
  const e1 = sys.energyH()
  sys.advanceMinutes(60)   // 0.125 h still fed, then 0.875 h on the ramp
  check('a time skip past the hold pays the same hunger as living it', near(e1 - sys.energyH(), 1 + 0.25 * 0.875 + 0.25 * 0.875 ** 2 / 8),
    `cost=${e1 - sys.energyH()}`)
  const snap = sys.snapshot(), back = mkDay().sys
  back.start(); back.restore(snap)
  check('the save carries the hunger clock', back.hungry() === sys.hungry() && near(back.snapshot().fedUntilH, snap.fedUntilH))
  // FEAT-173 (owner 11-06): sleep stops the hunger clock — what is left of the hold at bedtime is left at waking.
  const f0 = sys.snapshot().fedUntilH, c0 = sys.clockH()
  sys.sleep(8, 0.5)
  check('a hungry bedtime wakes as hungry: the night moves the hold\'s end with the clock', sys.hungry()
    && near(sys.clockH() - c0, 8) && near(sys.snapshot().fedUntilH - f0, 8))
  sys.eat(10); sys.update(3); sys.sleep(8, 0.5)
  check('a meal before bed is all there in the morning: 7 h of its 10 left after the night', !sys.hungry()
    && near(sys.snapshot().fedUntilH - sys.clockH(), 7))
  DAY_PARAMS.dayLengthSec = 1440
}

console.log(fails === 0 ? '\nPASS day-clock' : `\nFAIL day-clock (${fails})`)
process.exit(fails === 0 ? 0 : 1)
