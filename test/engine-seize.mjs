// test/engine-seize.mjs — FEAT-162 P1b: an engine at exactly 0 SEIZES (owner approved 2026-11-06, "all four
// as proposed"; it reverses 2026-10-22's "always starts", now that the tow and recovery give it a game).
//
//   1. What gets it there: a dead radiator under full load, from a new engine — the time is reported.
//   2. The ignition: a running engine that seizes dies on the spot; cranking it never catches.
//   3. The automatic: the seized engine doesn't turn (tach 0), cranking or rolling.
//   4. The manual: a clutch biting in gear slips against the locked flywheel at its capacity, so it
//      brakes the rear axle that hard; with the clutch down it frees; stopped, it holds without chatter.
//
// Pure node: no THREE, no DOM.
import { DamageModel } from '../src/damage.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { stepIgnition, makeIgnitionState, catchTime, RUNNING, OFF } from '../src/ignition.js'
import { RANGER_PARAMS } from '../data/ranger.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const P = (extra = {}) => ({ ...RANGER_PARAMS, ...extra })
const DT = 1 / 60

console.log('§1 a dead radiator under full load seizes a new engine')
{
  const d = new DamageModel({ params: {} })
  d.set('radiator', 0); d.engineTempC = 100
  const p = P(), vs = { drivetrain: { fuelPowerW: p.radiatorRatedW, engineRPM: 5200 }, throttle: 1 }
  let t = 0
  while (d.get('engine') > 0 && t < 600) { d.step(vs, p, DT); t += DT }
  console.log(`     ${t.toFixed(0)} s of flat-out driving on a dead radiator (it holds ${d.engineTempC.toFixed(0)} °C)`)
  ok(vs.engineHealth === 0 && t > 30 && t < 180, 'the engine track reaches 0 in under three minutes, and publishes it')
}

console.log('§2 the ignition: it dies, and it never catches again')
{
  const p = P(), vs = { engineHealth: 0, ignition: makeIgnitionState(RUNNING) }
  stepIgnition(vs, p, DT, false)
  ok(vs.ignition.state === OFF && vs.ignition.event === 'shutoff', 'a running engine that seizes shuts off on the spot')
  let caught = false
  for (let t = 0; t < 10; t += DT) if (stepIgnition(vs, p, DT, true) === 'catch') caught = true
  ok(!caught && catchTime(vs, p) === Infinity, 'ten seconds of cranking never catch it')
  ok(Number.isFinite(catchTime({ engineHealth: 0.001 }, p)), 'at 0.1 % it is worn, not seized: it still starts')
}

/** One drivetrain step rolling at `om` rad/s on the rear wheels; returns [T rear-left, T rear-right, rpm]. */
function roll (p, vs, om) {
  vs.wheelOmega = [om, om, om, om]
  stepDrivetrain(vs, p, DT, om * p.wheelRadius)
  return [p._driveTorque?.[2] ?? 0, p._driveTorque?.[3] ?? 0, vs.drivetrain.engineRPM]
}

console.log('§3 the automatic: a seized engine does not turn')
{
  const p = P()
  const crank = { engineHealth: 0, throttle: 0, brake: 0, ignition: { state: 'cranking' } }
  for (let i = 0; i < 60; i++) roll(p, crank, 0)
  ok(crank.drivetrain.engineRPM === 0, 'the starter can\'t turn it: 0 rpm after a second of cranking')
  const coast = { engineHealth: 0, throttle: 0, brake: 0, ignition: { state: 'off' } }
  let r
  for (let i = 0; i < 60; i++) r = roll(p, coast, 30)
  ok(r[2] === 0, 'rolling at 40 km/h in drive, the tach reads 0')
}

console.log('§4 the manual: the clutch slips against the locked flywheel')
{
  const p = P({ transmissionType: 'manual' })
  const total = p.gearRatios[1] * p.finalDrive
  const run = (clutch, om) => {
    const vs = { engineHealth: 0, throttle: 0, brake: 0, clutch, ignition: { state: 'off' }, drivetrain: { mGear: 2, engineOmega: 0 } }
    return roll(p, vs, om)
  }
  const [l, rr, rpm] = run(1, 20)
  const want = -p.clutchMaxTorque * total
  console.log(`     2nd gear, clutch out, 26 km/h: ${(l + rr).toFixed(0)} N·m on the rear axle (capacity × ratio ${want.toFixed(0)})`)
  ok(Math.abs(l + rr - want) < 1 && rpm === 0, 'it brakes the axle at the clutch\'s full capacity, and the engine stays at 0 rpm')
  const [l0, r0] = run(0, 20)
  ok(l0 === 0 && r0 === 0, 'clutch down: the axle rolls free')
  const [ls, rs] = run(1, 0)
  ok(ls === 0 && rs === 0, 'stopped in gear: no torque to chatter on (it holds by the slip regularisation)')
}

console.log(fail ? '\nFAIL — the engine seize has drifted' : '\nPASS — a written-off engine seizes: it dies, never catches, and a biting clutch brakes against it')
process.exit(fail)
