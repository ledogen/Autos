// test/calibrate-wear.mjs — SM-3 wear-rate calibration. NOT a gate; a rainy-day script.
//
// The owner set the tire and brake wear rates in hours (2026-08-19):
//
//     tires   70 h of hard driving takes 100% → 80%
//     brakes  120 h of hard driving takes 100% → 80%
//
// But the model integrates slip velocity and brake torque, not hours. So "hard driving" has to be
// stated as a DUTY CYCLE before either constant can be solved. This script does exactly that:
//
//   1. measures what the honest signals actually read in each driving state, from the real physics
//   2. mixes them by a stated duty cycle (the assumption — argue with THIS, not with a magic number)
//   3. solves the durability constant that puts the owner's hours on the owner's condition
//
// Re-run it after any change to the tire model, the brake torques, or the duty cycle, and paste the
// printed constants into DAMAGE_PARAMS.

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { DAMAGE_PARAMS as D } from '../src/damage.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const H = 3600

// ── The assumption, stated out loud ───────────────────────────────────────────────────────────────
// "Hard driving" is not all-out driving — it is a hard hour on a mountain road, which is mostly
// committed cornering with real slip, punctuated by braking, over a base of ordinary rolling.
const DUTY = {
  tireLimit:   0.25,   // fraction of the hour spent cornering at/near the grip limit
  tireCruise:  0.75,   // ...the rest just rolling
  brakePedal:  0.60,   // representative pedal fraction when on the brakes
  brakeTime:   0.15,   // fraction of the hour with the brakes applied
}

const ctx = await makeEngineCtx({ position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, P)
P._tireFz = [0, 0, 0, 0]
P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
P._tireMuScale = [1, 1, 1, 1]

const groundY = 0
const queryContacts = (cx, cy, cz, r) => {
  if (Math.abs(r - P.wheelRadius) > 1e-9) return []
  const depth = groundY + r - cy
  return depth > 0
    ? [{ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, groundY, cz) }]
    : []
}

const mkState = (py) => ({
  position: new THREE.Vector3(0, py, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  quaternion: new THREE.Quaternion(0, 0, 0, 1),
  angularVelocity: new THREE.Vector3(0, 0, 0),
  steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
  wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
  strutComp: [0.05, 0.05, 0.05, 0.05], strutCompVel: [0, 0, 0, 0],
  slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0], wheelOmega: [0, 0, 0, 0],
  wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
  handbrake: false,
  slipVel: [0, 0, 0, 0], tireFlat: [0, 0, 0, 0], bumpForce: [0, 0, 0, 0], brakeTorque: [0, 0, 0, 0],
})

const clone = (s) => ({
  ...s,
  position: s.position.clone(), velocity: s.velocity.clone(),
  quaternion: s.quaternion.clone(), angularVelocity: s.angularVelocity.clone(),
  wheelAngles: [...s.wheelAngles], wheelSteerAngles: [...s.wheelSteerAngles],
  strutComp: [...s.strutComp], strutCompVel: [...s.strutCompVel],
  slipLong: [...s.slipLong], slipLat: [...s.slipLat], wheelOmega: [...s.wheelOmega],
  wheelDebug: s.wheelDebug.map(d => ({ ...d })),
  slipVel: [...s.slipVel], tireFlat: [...s.tireFlat],
  bumpForce: [...s.bumpForce], brakeTorque: [...s.brakeTorque],
})

const settled = mkState(0.60)
for (let i = 0; i < 800; i++) stepPhysics(settled, P, DT, queryContacts, ctx)
const FWD_Z = -1   // front wheels sit at negative z

/**
 * Run a scenario and return the MEAN per-step tire insult and brake-torque sums, in exactly the
 * units src/damage.js integrates. `hold` is re-applied every step so the state does not decay away
 * from the driving condition we are trying to characterise.
 */
function measure (label, hold, steps) {
  const vs = clone(settled)
  hold(vs, 0)
  let tire = [0, 0, 0, 0], brkF = 0, brkR = 0, slip = 0, flat = 0
  for (let i = 0; i < steps; i++) {
    hold(vs, i)
    stepPhysics(vs, P, DT, queryContacts, ctx)
    for (let k = 0; k < 4; k++) {
      const v = Math.max(0, vs.slipVel[k] - D.tireSlipFloor)
      tire[k] += v + D.tireWCorner * Math.abs(vs.tireFlat[k])
      slip += vs.slipVel[k] / 4
      flat += Math.abs(vs.tireFlat[k]) / 4
    }
    brkF += Math.abs(vs.brakeTorque[0]) + Math.abs(vs.brakeTorque[1])
    brkR += Math.abs(vs.brakeTorque[2]) + Math.abs(vs.brakeTorque[3])
  }
  const r = {
    tire: Math.max(...tire) / steps,          // worst corner — the one that decides the set
    brkF: brkF / steps, brkR: brkR / steps,
    slip: slip / steps, flat: flat / steps,
  }
  console.log(`  ${label.padEnd(22)} slipVel ${r.slip.toFixed(3)} m/s · |Flat| ${r.flat.toFixed(0)} N ` +
              `→ tire insult ${r.tire.toFixed(4)}/s · brake ΣF ${r.brkF.toFixed(0)} ΣR ${r.brkR.toFixed(0)} N·m`)
  return r
}

console.log('measured driving states (real stepPhysics):')

// Limit cornering. A steady lateral velocity re-imposed each step IS a sustained cornering slip —
// the tire sits at its saturated slip velocity, which is the state that eats rubber.
const LIMIT_LAT = 2.5, LIMIT_FWD = 18
const limit = measure('limit cornering', (vs) => {
  vs.velocity.set(LIMIT_LAT, vs.velocity.y, FWD_Z * LIMIT_FWD)
  for (let k = 0; k < 4; k++) vs.wheelOmega[k] = LIMIT_FWD / P.wheelRadius
}, 240)

// Ordinary rolling — the free-rolling baseline. Real tires still wear here, just barely.
const cruise = measure('cruising', (vs) => {
  vs.velocity.set(0, vs.velocity.y, FWD_Z * LIMIT_FWD)
  for (let k = 0; k < 4; k++) vs.wheelOmega[k] = LIMIT_FWD / P.wheelRadius
}, 240)

// One-wheel peel — the owner's re-anchor (2026-08-20). The truck barely moves while one rear wheel
// spins at speed, so the whole contact-patch surface speed IS slip. It is the harshest sustained
// abrasion the sim can produce, which makes it a far better anchor than a duty-cycle assumption:
// there is nothing to argue about in "hold it flat and the tire is gone in five minutes".
// Open diff, so ONE rear wheel takes it all — that is what a peel is.
const BURNOUT_SURFACE = 28   // m/s of tread speed at the patch (redline in a low gear)
const burnout = measure('one-wheel peel', (vs) => {
  vs.velocity.set(0, vs.velocity.y, FWD_Z * 1.0)          // creeping forward, as a real peel does
  vs.wheelOmega[0] = vs.wheelOmega[1] = 1.0 / P.wheelRadius
  vs.wheelOmega[2] = BURNOUT_SURFACE / P.wheelRadius      // RL lit up
  vs.wheelOmega[3] = 1.0 / P.wheelRadius
  vs.throttle = 1; vs.smoothThrottle = 1
}, 240)

// Braking at the representative pedal fraction.
const braking = measure('braking @ 60% pedal', (vs) => {
  vs.velocity.set(0, vs.velocity.y, FWD_Z * LIMIT_FWD)
  for (let k = 0; k < 4; k++) vs.wheelOmega[k] = LIMIT_FWD / P.wheelRadius
  vs.brake = DUTY.brakePedal; vs.smoothBrake = DUTY.brakePedal
}, 240)

// ── Solve ─────────────────────────────────────────────────────────────────────────────────────────
// condition falls by insult/durability, so:  durability = meanRate · seconds / conditionLost
const solve = (rate, hours, lost) => rate * hours * H / lost

// Tires are anchored on the PEEL now (owner, 2026-08-20), not on the duty cycle. The old anchor —
// 70 h of hard driving costs 20% — put a tire set at 400 minutes of continuous burnout, which the
// owner rejected as absurd: it should be about five. The duty-cycle mix is still computed below,
// but only to REPORT what the peel anchor implies for ordinary driving, which is the number with
// the economy consequences.
const PEEL_MINUTES = 5
const durTire  = burnout.tire * PEEL_MINUTES * 60 / 1.0     // full tire, from new to gone
const tireRate = DUTY.tireLimit * limit.tire + DUTY.tireCruise * cruise.tire

const brkRateF = DUTY.brakeTime * braking.brkF
const brkRateR = DUTY.brakeTime * braking.brkR
const durBrake = solve(brkRateF, 120, 0.20)     // fit to the FRONT axle: it works hardest, so it is
                                                // the axle the owner's number is really about

console.log(`\nduty cycle (the assumption): ${DUTY.tireLimit * 100}% at the limit, ` +
            `${DUTY.brakeTime * 100}% on the brakes at ${DUTY.brakePedal * 100}% pedal`)
console.log(`\n  peel insult        ${burnout.tire.toFixed(3)} /s   → ${PEEL_MINUTES} min kills a tire  ⇒  durTire  = ${durTire.toPrecision(3)}`)
console.log(`  mean tire insult   ${tireRate.toFixed(4)} /s   (hard-driving duty cycle, for the readout below)`)
console.log(`  mean brake front   ${brkRateF.toFixed(1)} N·m   → 120 h costs 20%  ⇒  durBrake = ${durBrake.toPrecision(3)}`)
console.log(`  mean brake rear    ${brkRateR.toFixed(1)} N·m   (rear axle reaches 20% at ` +
            `${(solve(brkRateR, 120, 0.20) === 0 ? Infinity : durBrake * 0.20 / brkRateR / H).toFixed(0)} h — ` +
            `fronts wear faster, which is how brakes actually behave)`)

console.log(`\ncurrent DAMAGE_PARAMS:  durTire = ${D.durTire.toPrecision(3)}  durBrake = ${D.durBrake.toPrecision(3)}`)
console.log(`paste:                  durTire: ${Number(durTire.toPrecision(3))},  durBrake: ${Number(durBrake.toPrecision(3))},`)

// Sanity: what the fitted constants imply for a 20-day run (SM-INV-14: 16 waking hours a day).
const runH = 20 * 16
const tireHardH = durTire / tireRate / H            // hours of "hard driving" to destroy a tire
console.log(`\nwhat the peel anchor implies for ORDINARY driving — the number with economy consequences:`)
console.log(`  ${tireHardH.toFixed(1)} h of hard driving destroys a tire (${(tireHardH * 60).toFixed(0)} min)`)
console.log(`  a 20-day run is ${runH} waking hours, so that is ~${(runH / tireHardH).toFixed(0)} tire sets if every hour were hard`)
console.log(`\nimplied over a full 20-day run (${runH} h) if EVERY hour were "hard":`)
console.log(`  tires  ${Math.max(0, 100 - runH / tireHardH * 100).toFixed(0)}% condition · brakes ${(100 - runH / 120 * 20).toFixed(0)}%`)
