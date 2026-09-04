// GATE (FEAT-33): the ignition switch + starter — the key state machine and the drivetrain gating
// it drives. Pure math, no world: stepIgnition is a state machine and stepDrivetrain is called
// directly with a hand-built vehicleState, so this runs in milliseconds.
//
// What it locks down:
//   1. Hold-to-crank catches after ignitionCatchTime, and NOT before.
//   2. Releasing early aborts and DISCARDS the crank progress (the whole "crank it again" feel).
//   3. Catch time scales with engineHealth — the seam the SM-3 wear model plugs into.
//   4. A tap while RUNNING kills the engine, and HOLDING the key through that shutoff does not
//      immediately restart it (entering CRANKING needs a fresh press, not a held key).
//   5. Drivetrain gating: OFF/CRANKING make no drive torque, a killed engine in gear DRAGS
//      (retarding torque opposing the wheels) and that drag fades out toward a stop.
//   6. THE DEFAULT: a vehicleState with NO ignition field behaves exactly like today's drivetrain.
//      Every other headless gate relies on this, so it is asserted here rather than assumed.
//
// Run: node test/ignition-starter.mjs        (self-checking; exits non-zero on failure)

import { stepIgnition, keyPosition, makeIgnitionState, OFF, CRANKING, RUNNING } from '../src/ignition.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const DT = 1 / 60
let failures = 0
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++ }
const pass = (msg) => { console.log(`  ✓ ${msg}`) }
const check = (cond, msg) => (cond ? pass(msg) : fail(msg))

const P = { ...RANGER_PARAMS }

/** Hold the key for `secs` from a fresh state; returns the state and how long it took to catch. */
function crankFor (secs, health = 1) {
  const vs = { ignition: makeIgnitionState(OFF), engineHealth: health }
  let caught = null
  for (let t = 0; t < secs - 1e-9; t += DT) {
    stepIgnition(vs, P, DT, true)
    if (vs.ignition.event === 'catch' && caught === null) caught = t + DT
  }
  return { vs, caught }
}

console.log('\n── 1. hold-to-crank catches at ignitionCatchTime ─────────────────────────────')
{
  const nominal = P.ignitionCatchTime
  const short = crankFor(nominal * 0.6)
  check(short.caught === null && short.vs.ignition.state === CRANKING,
    `still cranking at ${(nominal * 0.6).toFixed(2)}s (< catch time ${nominal}s), state=${short.vs.ignition.state}`)

  const full = crankFor(nominal + 4 * DT)
  check(full.vs.ignition.state === RUNNING, 'engine RUNNING after a full crank')
  // Tolerance is 2 steps: one for the fixed-step quantisation of the catch threshold itself, one
  // for this loop's own float drift accumulating t += DT. Not slack in the model.
  const err = Math.abs(full.caught - nominal)
  check(err <= 2 * DT + 1e-9, `caught at ${full.caught.toFixed(3)}s vs nominal ${nominal}s (within two steps)`)
}

console.log('\n── 2. releasing early aborts and discards the crank ──────────────────────────')
{
  const vs = { ignition: makeIgnitionState(OFF) }
  const almost = P.ignitionCatchTime * 0.9
  for (let t = 0; t < almost; t += DT) stepIgnition(vs, P, DT, true)
  stepIgnition(vs, P, DT, false)                       // let go one beat short
  check(vs.ignition.state === OFF && vs.ignition.event === 'abort', 'released early → OFF with an abort event')
  check(vs.ignition.crank === 0, 'crank progress discarded on release')
  // Crank again for the same not-quite-enough time: if progress had carried over it would fire.
  for (let t = 0; t < almost; t += DT) stepIgnition(vs, P, DT, true)
  check(vs.ignition.state === CRANKING, 'a second partial crank does NOT inherit the first one and start the engine')
}

console.log('\n── 3. catch time scales with engine health (the SM-3 wear seam) ──────────────')
{
  const worn = crankFor(P.ignitionCatchTimeWorn + 4 * DT, 0)
  check(worn.vs.ignition.state === RUNNING, 'a zero-health engine does eventually catch')
  check(Math.abs(worn.caught - P.ignitionCatchTimeWorn) <= 2 * DT + 1e-9,
    `health 0 catches at ${worn.caught.toFixed(2)}s ≈ ignitionCatchTimeWorn ${P.ignitionCatchTimeWorn}s`)
  const half = crankFor(P.ignitionCatchTimeWorn + 4 * DT, 0.5)
  const mid = 0.5 * (P.ignitionCatchTime + P.ignitionCatchTimeWorn)
  check(Math.abs(half.caught - mid) <= 2 * DT + 1e-9, `health 0.5 catches at ${half.caught.toFixed(2)}s ≈ midpoint ${mid.toFixed(2)}s`)
  const missing = crankFor(P.ignitionCatchTime + 4 * DT, undefined)
  check(Math.abs(missing.caught - P.ignitionCatchTime) <= 2 * DT + 1e-9, 'ABSENT engineHealth reads as 1 (nominal catch time)')
}

console.log('\n── 4. tap kills it; holding through the shutoff does not restart it ──────────')
{
  const vs = { ignition: makeIgnitionState(RUNNING) }
  stepIgnition(vs, P, DT, true)
  check(vs.ignition.state === OFF && vs.ignition.event === 'shutoff', 'tap while RUNNING → OFF (shutoff event)')
  // Keep the finger DOWN for far longer than any catch time.
  for (let t = 0; t < P.ignitionCatchTimeWorn * 2; t += DT) stepIgnition(vs, P, DT, true)
  check(vs.ignition.state === OFF, 'still OFF after holding the key down past every catch time — no accidental restart')
  stepIgnition(vs, P, DT, false)                        // release
  const re = crankFor(P.ignitionCatchTime + 4 * DT)     // fresh press restarts normally
  check(re.vs.ignition.state === RUNNING, 'a fresh press after releasing cranks and catches normally')
}

console.log('\n── 5. key position: OFF 10 o’clock, ON 12, START 2 (held past the catch) ─────')
{
  check(keyPosition(makeIgnitionState(OFF)) === 'off', 'OFF ⇒ off detent')
  check(keyPosition(makeIgnitionState(RUNNING)) === 'on', 'RUNNING ⇒ on detent')
  check(keyPosition(undefined) === 'on', 'absent ignition ⇒ on detent (the RUNNING default)')
  const vs = { ignition: makeIgnitionState(OFF) }
  stepIgnition(vs, P, DT, true)
  check(keyPosition(vs.ignition) === 'start', 'cranking ⇒ start detent')
  for (let t = 0; t < P.ignitionCatchTime + 4 * DT; t += DT) stepIgnition(vs, P, DT, true)
  check(vs.ignition.state === RUNNING && keyPosition(vs.ignition) === 'start',
    'caught but still held ⇒ key STAYS at start until released')
  stepIgnition(vs, P, DT, false)
  check(keyPosition(vs.ignition) === 'on', 'released after the catch ⇒ key springs back to on')
}

console.log('\n── 6. drivetrain gating ──────────────────────────────────────────────────────')
{
  // Rolling at ~20 m/s in top gear, foot flat — the case that must differ most between states.
  const omega = 20 / (P.wheelRadius || 0.368)
  const mkState = (ignition) => ({
    throttle: 1, brake: 0, wheelOmega: [omega, omega, omega, omega],
    drivetrain: { engineRPM: 2000, gear: 4, shiftTimer: 0, activeGear: 4, SR: 0, TR: 1 },
    ...(ignition ? { ignition: makeIgnitionState(ignition) } : {}),
  })
  const run = (vs, params) => { stepDrivetrain(vs, params, DT, 20); return params._driveTorque.slice() }

  const pRun = { ...P }; const tRun = run(mkState(RUNNING), pRun)
  const pNone = { ...P }; const tNone = run(mkState(null), pNone)
  check(tRun.every((v, i) => v === tNone[i]),
    `a vehicleState with NO ignition field == RUNNING (rear torque ${tNone[2].toFixed(1)} N·m) — the headless-gate default`)
  check(tRun[2] > 0, 'RUNNING at full throttle makes positive drive torque')

  const pCrank = { ...P }; const vsCrank = mkState(CRANKING)
  const tCrank = run(vsCrank, pCrank)
  check(tCrank.every(v => v === 0), 'CRANKING makes NO drive torque at any wheel')
  check(Math.abs(vsCrank.drivetrain.engineRPM - P.ignitionCrankRPM) < 1900 && vsCrank.drivetrain.engineRPM < 2000,
    `CRANKING pulls engine RPM toward ignitionCrankRPM (${vsCrank.drivetrain.engineRPM.toFixed(0)} rpm, falling from 2000)`)

  const pOff = { ...P }; const vsOff = mkState(OFF)
  const tOff = run(vsOff, pOff)
  check(tOff[2] < 0 && tOff[3] < 0, `OFF in gear DRAGS the wheels (${tOff[2].toFixed(1)} N·m per rear wheel, opposing +ω)`)
  check(tOff[0] === 0 && tOff[1] === 0, 'the drag lands on the driven axle only')

  // …and that drag fades out as the converter decouples near a stop.
  const slow = 1.2                                     // m/s — barely rolling
  const wSlow = slow / (P.wheelRadius || 0.368)
  const pSlow = { ...P }
  const vsSlow = { ...mkState(OFF), wheelOmega: [wSlow, wSlow, wSlow, wSlow] }
  stepDrivetrain(vsSlow, pSlow, DT, slow)
  check(Math.abs(pSlow._driveTorque[2]) < Math.abs(tOff[2]) * 0.2,
    `key-off drag fades toward a stop (${Math.abs(pSlow._driveTorque[2]).toFixed(2)} N·m at ${slow} m/s vs ${Math.abs(tOff[2]).toFixed(1)} at 20 m/s)`)

  // Reversed rotation ⇒ reversed drag. A retarding torque must always oppose the wheels, or a
  // key-off roll backwards down a hill would be ACCELERATED by the dead engine.
  const pRev = { ...P }
  const vsRev = { ...mkState(OFF), wheelOmega: [-omega, -omega, -omega, -omega] }
  stepDrivetrain(vsRev, pRev, DT, -20)
  check(pRev._driveTorque[2] > 0, `rolling backwards, the drag flips sign (${pRev._driveTorque[2].toFixed(1)} N·m) — always retarding`)
}

console.log(`\n${'═'.repeat(64)}`)
if (failures) { console.log(`IGNITION GATE: ${failures} FAILURE(S)`); process.exit(1) }
console.log('IGNITION GATE: all checks passed ✓')
