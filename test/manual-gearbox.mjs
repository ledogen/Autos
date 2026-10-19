// GATE (FEAT-126): the MANUAL gearbox — src/drivetrain.js stepManual, the M5OD-R1 behind the Vulcan.
//
// The sim reads ONE clutch number, vehicleState.clutch ∈ [0,1] (owner 2026-10-19: analog in the sim,
// commanded binarily by today's controls). This gate commands it directly, as an analog value — what
// the clutch assistant's OFF mode passes through — on a flat plane with the full physics (the
// drivetrain-climb harness):
//   1. a half-engaged clutch slips and passes exactly half its capacity;
//   2. a driver who feathers the clutch launches without stalling, and the clutch locks;
//   3. scripted clutch-out shifts 1→5 under throttle reach > 90 mph, burning fuel;
//   4. dropping the clutch in 1st at rest with no throttle STALLS the engine;
//   5. a shift with the clutch in is REJECTED (gear unchanged, missShift flagged);
//   6. R is refused while moving, accepted from N at rest, and backs the truck up;
//   7. a worn box (_transShiftScale 3) takes 3× as long in N;
//   8. engine braking: lifting in 3rd slows harder than coasting in N;
//   9. a clutch dumped at the rev limiter spins the rears.
//
// Run: node test/manual-gearbox.mjs   (self-checking; exits non-zero on failure)

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { makeIgnitionState, RUNNING } from '../src/ignition.js'
import { makeFuelState } from '../src/fuel.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { TRANSMISSIONS } from '../data/transmissions.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'
import { makeClutchAssist, stepClutchAssist } from '../src/clutch-assist.js'
import { DamageModel, TRACKS } from '../src/damage.js'

const DT = 1 / 60, MPH = 2.23694
const ctx = await makeEngineCtx({ position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, RANGER_PARAMS)
let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++ }

function fresh ({ gear = 0, v0 = 0 } = {}) {
  const P = { ...RANGER_PARAMS, ...TRANSMISSIONS.m5odr1 }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const w0 = v0 / P.wheelRadius
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0), quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [w0, w0, w0, w0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    ignition: makeIgnitionState(RUNNING), fuel: makeFuelState(P),
    clutch: 1, shiftRequest: 0,
    drivetrain: { engineRPM: P.engineIdleRPM, gear: 1, shiftTimer: 0, activeGear: 1, mGear: gear },
  }
  if (gear && v0) {   // already rolling in gear: start the flywheel on the disc
    const ratio = P.gearRatios[gear - 1] * P.finalDrive
    vs.drivetrain.engineOmega = w0 * ratio
  }
  return { P, vs }
}
const N = new THREE.Vector3(0, 1, 0)
const qc = (cx, cy, cz, r) => { const gd = r - cy; return gd > 0 ? [{ normal: N.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }] : [] }
const vf = (vs) => -vs.velocity.z
const step = (P, vs, n = 1, each) => { for (let i = 0; i < n; i++) { each?.(i); stepPhysics(vs, P, DT, qc, ctx) } }
const dt = (vs) => vs.drivetrain
// Clutch out, request, wait for the synchro, return the clutch along a ramp — what a driver (or the
// assistant) does for one shift.
function shift (P, vs, dir, { returnS = 0.3 } = {}) {
  vs.clutch = 0
  step(P, vs, 2)
  vs.shiftRequest = dir
  step(P, vs, 1)
  let n = 0
  while (dt(vs).shifting && n++ < 300) step(P, vs, 1)
  const k = Math.round(returnS / DT)
  step(P, vs, k, (i) => { vs.clutch = (i + 1) / k })
}

console.log('FEAT-126 manual gearbox (M5OD-R1, Vulcan 3.0)\n')

console.log('1. the clutch is analog')
{
  const { P, vs } = fresh({ gear: 1 })
  dt(vs).engineOmega = 3000 / 9.5493
  vs.clutch = 0.5; vs.throttle = 1
  stepDrivetrain(vs, P, DT, 0)   // wheels at rest, engine at 3000: slipping
  const axle = P._driveTorque[2] + P._driveTorque[3]
  const want = 0.5 * P.clutchMaxTorque * P.gearRatios[0] * P.finalDrive
  check(Math.abs(axle - want) < 1, `half-engaged and slipping: ${axle.toFixed(0)} N·m at the axle = ½ × ${P.clutchMaxTorque} × ${(P.gearRatios[0] * P.finalDrive).toFixed(2)} (${want.toFixed(0)})`)
  check(!dt(vs).locked, 'still slipping (not locked)')
}

console.log('\n2. a feathered launch: no stall, then the clutch locks')
{
  const { P, vs } = fresh()
  vs.clutch = 0; vs.shiftRequest = 1; step(P, vs, 30)
  check(dt(vs).mGear === 1, `N → 1st with the clutch out (gear ${dt(vs).mGear})`)
  let minRpm = Infinity
  step(P, vs, 120, (i) => { vs.throttle = 0.35; vs.clutch = Math.min(1, i / 90); minRpm = Math.min(minRpm, dt(vs).engineRPM) })
  check(vs.ignition.state === 'running' && dt(vs).locked && vf(vs) > 2,
    `running, locked, rolling at ${(vf(vs) * MPH).toFixed(1)} mph (engine never below ${minRpm.toFixed(0)} rpm)`)
}

console.log('\n3. clutch-out shifts 1→5 under throttle')
{
  const { P, vs } = fresh()
  vs.clutch = 0; vs.shiftRequest = 1; step(P, vs, 30)
  step(P, vs, 60, (i) => { vs.throttle = 0.6; vs.clutch = Math.min(1, i / 50) })
  const gal0 = vs.fuel.gal
  let rpmOk = true
  for (let t = 0; t < 70 * 60; t++) {
    vs.throttle = 1
    if (dt(vs).mGear < 5 && dt(vs).engineRPM > 5000) shift(P, vs, +1)
    step(P, vs, 1)
    if (!Number.isFinite(dt(vs).engineRPM)) rpmOk = false
  }
  check(dt(vs).mGear === 5 && vf(vs) * MPH > 90 && rpmOk, `5th gear at ${(vf(vs) * MPH).toFixed(0)} mph, ${dt(vs).engineRPM.toFixed(0)} rpm (> 90 mph, rpm finite)`)
  check(vs.fuel.gal < gal0, `burned ${(gal0 - vs.fuel.gal).toFixed(2)} gal`)
}

console.log('\n4. dropping the clutch at rest stalls')
{
  const { P, vs } = fresh({ gear: 1 })
  vs.clutch = 0; step(P, vs, 30)
  vs.clutch = 1; step(P, vs, 60)
  check(vs.ignition.state === 'off', `ignition ${vs.ignition.state} after a clutch dump at idle with no throttle`)
}

console.log('\n5. a shift with the clutch in is rejected')
{
  const { P, vs } = fresh({ gear: 2, v0: 10 })
  step(P, vs, 10, () => { vs.throttle = 0.2 })
  vs.clutch = 1; vs.shiftRequest = 1
  step(P, vs, 1)
  check(dt(vs).mGear === 2 && dt(vs).missShift === true, `still in 2nd, missShift flagged (gear ${dt(vs).mGear}, missShift ${dt(vs).missShift})`)
  step(P, vs, 1)
  check(dt(vs).missShift === false, 'missShift is a one-shot')
}

console.log('\n6. reverse')
{
  const { P, vs } = fresh({ v0: 8 })
  vs.clutch = 0; vs.shiftRequest = -1; step(P, vs, 30)
  check(dt(vs).mGear === 0, `N → R refused at ${(8 * MPH).toFixed(0)} mph (gear ${dt(vs).mGear})`)
  const b = fresh()
  b.vs.clutch = 0; b.vs.shiftRequest = -1; step(b.P, b.vs, 30)
  check(b.vs.drivetrain.mGear === -1, `N → R accepted at rest (gear ${b.vs.drivetrain.mGear})`)
  step(b.P, b.vs, 180, (i) => { b.vs.throttle = 0.4; b.vs.clutch = Math.min(1, i / 90) })
  check(vf(b.vs) < -1 && b.vs.ignition.state === 'running', `W in R backs up at ${(-vf(b.vs) * MPH).toFixed(1)} mph`)
}

console.log('\n7. a worn box shifts slower')
{
  const time = (scale) => {
    const { P, vs } = fresh({ gear: 1 })
    P._transShiftScale = scale
    vs.clutch = 0; vs.shiftRequest = 1; step(P, vs, 1)
    let n = 0; while (dt(vs).shifting) { step(P, vs, 1); n++ }
    return (n + 1) * DT
  }
  const t1 = time(1), t3 = time(3)
  check(Math.abs(t3 / t1 - 3) < 0.25, `synchro time ${t1.toFixed(2)} s new → ${t3.toFixed(2)} s at _transShiftScale 3`)
}

console.log('\n8. engine braking')
{
  const coast = (gear, clutch) => {
    const { P, vs } = fresh({ gear, v0: 20 })
    vs.clutch = clutch
    step(P, vs, 30)
    const v0 = vf(vs); step(P, vs, 180)
    return (v0 - vf(vs)) / 3
  }
  const inGear = coast(3, 1), neutral = coast(3, 0)
  check(inGear > neutral * 1.3, `lifting in 3rd at 45 mph: ${inGear.toFixed(2)} m/s² vs ${neutral.toFixed(2)} clutch out`)
}

console.log('\n9. a clutch dumped at the limiter spins the rears')
{
  const { P, vs } = fresh({ gear: 1 })
  vs.clutch = 0
  step(P, vs, 60, () => { vs.throttle = 1 })
  const rpm0 = dt(vs).engineRPM
  let spin = 0
  step(P, vs, 90, () => { vs.throttle = 1; vs.clutch = 1; spin = Math.max(spin, dt(vs).wheelspin ?? 0) })
  check(rpm0 > 5000 && spin > (P.wheelspinThreshold ?? 7.5), `revved to ${rpm0.toFixed(0)} rpm, dumped: peak wheelspin ${spin.toFixed(1)} m/s`)
}

// The assistant in front of the sim: what src/vehicle.js does each step.
function driveAssisted (P, vs, n, ctl) {
  const a = vs._assist || (vs._assist = makeClutchAssist())
  for (let i = 0; i < n; i++) {
    const c = ctl(i) || {}
    vs.throttle = c.throttle ?? 0; vs.brake = c.brake ?? 0
    const out = stepClutchAssist(a, { pedal: c.pedal ?? 0, shift: c.shift ?? 0, throttle: vs.throttle },
      { rpm: dt(vs).engineRPM, shifting: !!dt(vs).shifting }, P, DT)
    vs.clutch = out.clutch
    if (out.shiftRequest) vs.shiftRequest = out.shiftRequest
    stepPhysics(vs, P, DT, qc, ctx)
  }
}

console.log('\n10. the clutch assistant, ON')
{
  const { P, vs } = fresh()
  driveAssisted(P, vs, 60, (i) => ({ shift: i === 0 ? 1 : 0 }))
  driveAssisted(P, vs, 180, () => ({}))
  check(dt(vs).mGear === 1 && vs.ignition.state === 'running' && Math.abs(vf(vs)) < 0.5,
    `in 1st at idle, no pedal, no throttle: running and holding (${(vf(vs) * MPH).toFixed(1)} mph)`)
  driveAssisted(P, vs, 240, () => ({ throttle: 0.5 }))
  check(vs.ignition.state === 'running' && dt(vs).locked && vf(vs) * MPH > 10, `half throttle launches it: ${(vf(vs) * MPH).toFixed(1)} mph, clutch locked`)
  let misses = 0
  for (let t = 0; t < 60 * 60; t++) {
    const up = dt(vs).mGear < 5 && dt(vs).engineRPM > 5000 && !dt(vs).shifting && !vs._assist.pending
    driveAssisted(P, vs, 1, () => ({ throttle: 1, shift: up ? 1 : 0 }))
    if (dt(vs).missShift) misses++
  }
  check(dt(vs).mGear === 5 && vf(vs) * MPH > 90 && misses === 0, `no-pedal upshifts reach 5th at ${(vf(vs) * MPH).toFixed(0)} mph, ${misses} rejected`)
  driveAssisted(P, vs, 15 * 60, () => ({ brake: 1 }))
  check(vs.ignition.state === 'running' && Math.abs(vf(vs)) < 0.3, `braked to a stop in ${dt(vs).mGear}th: still running (${dt(vs).engineRPM.toFixed(0)} rpm)`)
  driveAssisted(P, vs, 5, () => ({ pedal: 1, throttle: 1 }))
  check(vs.clutch === 0, `pedal down overrides the assist (clutch ${vs.clutch})`)
}

console.log('\n11. the clutch assistant, OFF')
{
  const { P, vs } = fresh({ gear: 2, v0: 10 })
  P.clutchAssist = false
  driveAssisted(P, vs, 1, () => ({ throttle: 0.2, shift: 1 }))
  check(dt(vs).mGear === 2 && dt(vs).missShift, `no pedal: the request reaches the sim and is rejected (gear ${dt(vs).mGear})`)
  driveAssisted(P, vs, 3, () => ({ pedal: 1 }))
  driveAssisted(P, vs, 30, (i) => ({ pedal: 1, shift: i === 0 ? 1 : 0 }))
  check(dt(vs).mGear === 3, `pedal down: 2nd → 3rd goes through (gear ${dt(vs).mGear})`)
}

console.log('\n12. the transmission damage track')
{
  const { P, vs } = fresh({ gear: 2, v0: 10 })
  P.clutchAssist = false
  const dm = new DamageModel({ params: P })
  const c0 = dm.get('transmission')
  for (let k = 0; k < 3; k++) {
    driveAssisted(P, vs, 1, () => ({ throttle: 0.2, shift: 1 }))
    dm.step(vs, P, DT)
    driveAssisted(P, vs, 2, () => ({ throttle: 0.2 }))
    dm.step(vs, P, DT)
  }
  check(Math.abs((c0 - dm.get('transmission')) - 0.06) < 1e-9, `3 forced shifts cost ${((c0 - dm.get('transmission')) * 100).toFixed(2)} % (3 × 2 %)`)
  check(dm.manualBox === true && TRACKS.transmission.manualOnly, 'manualOnly track, and the model knows a manual is fitted')
  dm.set('transmission', 0); dm.publish(P)
  check(Math.abs(P._transShiftScale - 3) < 1e-9, `a dead box publishes _transShiftScale ${P._transShiftScale} (3×)`)
  dm.set('transmission', 1); dm.publish(P)
  check(P._transShiftScale === 1, 'a new box shifts at 1×')
}


console.log('\n13. a clutch dump at 2200 rpm (the capture\'s pedal) locks at once, no chatter')
{
  const { P, vs } = fresh()
  vs.clutch = 0; vs.shiftRequest = 1; step(P, vs, 30)
  dt(vs).engineOmega = 2200 / 9.5493
  let lockedAt = -1, flips = 0, prevSign = 0
  step(P, vs, 120, (i) => {
    vs.clutch = 1; vs.throttle = Math.min(0.85, 0.33 + i * DT * 1.5)   // the capture's pedal: 0.33 → 0.85 in ~0.35 s
    const w = vs.wheelOmega[2], sg = Math.sign(w)
    if (prevSign && sg && sg !== prevSign) flips++
    if (sg) prevSign = sg
    if (lockedAt < 0 && dt(vs).locked) lockedAt = i
  })
  check(lockedAt >= 0 && lockedAt <= 3, `locked ${lockedAt} step(s) after the bite`)
  check(flips === 0, `the rear wheels never reverse (${flips} sign flips — the chatter flipped every step)`)
  check(vs.ignition.state === 'running' && vf(vs) > 4, `still running, ${(vf(vs) * MPH).toFixed(1)} mph after 2 s`)
}
console.log(`\nMANUAL-GEARBOX GATE: ${failures ? `${failures} FAILURE(S)` : 'all checks passed ✓'}`)
process.exit(failures ? 1 : 0)
