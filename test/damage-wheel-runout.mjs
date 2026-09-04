// test/damage-wheel-runout.mjs — SM-3 gate: wheel condition becomes REAL out-of-round.
//
// The ratified wheel effect is not a handling penalty invented for damage. A bent wheel is
// out-of-round, and out-of-round already exists in the sim as params.wheelRunout — the radius the
// contact query uses is modulated once per revolution, so the tire hops at wheel frequency and the
// hop grows with speed. Wheel condition simply drives that number, capped at the ratified 0.04 m
// peak-to-peak at zero condition.
//
// What this pins:
//   · the cap, and that it is LINEAR in condition (a full-health wheel is perfectly round)
//   · that the wheels are INDEPENDENT — a bent front-left must not shake the other three
//   · that the manual slider still works on its own, which is what makes it usable with damage off
//   · that the effect actually reaches the radius, over a real revolution, at the right amplitude
//   · that a stock truck short-circuits the whole path (this runs 4× per substep, 250 Hz)

import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'
import { effectiveWheelRadius, wheelRunoutOf, RUNOUT_HARMONIC } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
const mkParams = () => ({ ...RANGER_PARAMS })

console.log('§1 condition → runout, linear to the ratified cap')
{
  const p = mkParams(); p.wheelRunout = 0
  const d = new DamageModel({ params: p })
  d.setAll(1); d.publish(p)
  ok(p._wheelRunout.every(r => r === 0), 'a full-health wheel is perfectly round')
  d.setAll(0); d.publish(p)
  ok(p._wheelRunout.every(r => near(r, D.wheelRunoutAtZero)), `a dead wheel carries the full ${D.wheelRunoutAtZero} m peak-to-peak`)
  d.setAll(0.5); d.publish(p)
  ok(p._wheelRunout.every(r => near(r, 0.5 * D.wheelRunoutAtZero)), '...and half-worn is half of it — linear, no curve')
}

console.log('\n§2 the wheels are independent')
{
  const p = mkParams(); p.wheelRunout = 0
  const d = new DamageModel({ params: p })
  d.set('wheelFL', 0); d.publish(p)
  ok(near(p._wheelRunout[0], D.wheelRunoutAtZero), 'bending the front-left bends the front-left')
  ok(p._wheelRunout.slice(1).every(r => r === 0), '...and leaves the other three perfectly round')
}

console.log('\n§3 the manual slider survives — it is the standalone test tool')
{
  const p = mkParams(); p.wheelRunout = 0.02
  ok(near(wheelRunoutOf(0, p), 0.02), 'with no damage model running, the slider alone applies')
  const d = new DamageModel({ params: p })
  d.setAll(1); d.publish(p)
  ok(near(wheelRunoutOf(0, p), 0.02), '...and a healthy truck does not cancel it')
  d.setAll(0); d.publish(p)
  ok(near(wheelRunoutOf(0, p), 0.02 + D.wheelRunoutAtZero), '...damage adds on top rather than replacing it')
}

console.log('\n§4 it reaches the radius, at the right amplitude, once per revolution')
{
  const p = mkParams(); p.wheelRunout = 0
  const d = new DamageModel({ params: p })
  d.setAll(0); d.publish(p)
  const state = { wheelPhase: [0, 0, 0, 0] }
  let lo = Infinity, hi = -Infinity
  const N = 720
  for (let k = 0; k < N; k++) {
    state.wheelPhase[0] = 2 * Math.PI * k / N
    const r = effectiveWheelRadius(0, state, p)
    if (r < lo) lo = r
    if (r > hi) hi = r
  }
  ok(near(hi - lo, D.wheelRunoutAtZero, 1e-4), `one revolution sweeps the full ${D.wheelRunoutAtZero} m peak-to-peak`)
  ok(near(0.5 * (hi + lo), p.wheelRadius, 1e-4), '...centred on the nominal radius — runout is not a size change')

  // How many high spots go round the carcass IS the character of the defect, so it is pinned —
  // but pinned against RUNOUT_HARMONIC, not a hardcoded number, because that constant is the one
  // knob that switches the model (1 = eccentric/bent rim, 2 = OVAL, which is what ships).
  // n high spots ⇒ 2n crossings of the mean over a full revolution.
  let crossings = 0, prev = effectiveWheelRadius(0, { wheelPhase: [0, 0, 0, 0] }, p) - p.wheelRadius
  for (let k = 1; k <= N; k++) {
    state.wheelPhase[0] = 2 * Math.PI * k / N
    const cur = effectiveWheelRadius(0, state, p) - p.wheelRadius
    if ((prev < 0) !== (cur < 0)) crossings++
    prev = cur
  }
  ok(crossings === 2 * RUNOUT_HARMONIC,
    `and it carries ${RUNOUT_HARMONIC} high spot(s) per revolution (${crossings} mean crossings) — `
    + `${RUNOUT_HARMONIC === 2 ? 'OVAL, so it shakes at twice wheel frequency' : 'eccentric, at wheel frequency'}`)
}

console.log('\n§5 a stock truck pays nothing')
{
  const p = mkParams(); p.wheelRunout = 0
  ok(effectiveWheelRadius(0, { wheelPhase: [1.234, 0, 0, 0] }, p) === p.wheelRadius,
    'with no runout the radius is returned unchanged — the path short-circuits before any trig')
  const d = new DamageModel({ params: p })
  d.setAll(1); d.publish(p)
  ok(effectiveWheelRadius(0, { wheelPhase: [1.234, 0, 0, 0] }, p) === p.wheelRadius,
    '...and a healthy damaged-model truck is the same stock truck, exactly')
}

console.log(fail ? '\nFAIL — wheel condition no longer drives honest out-of-round' : '\nPASS — wheel condition drives real out-of-round, per wheel, to the ratified cap')
process.exit(fail)
