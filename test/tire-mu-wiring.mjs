// test/tire-mu-wiring.mjs — SM-3 gate: per-tire friction is wired to the RIGHT tire.
//
// Tire wear scales each corner's friction coefficient independently (params._tireMuScale[i],
// published by src/damage.js, multiplied into μ by src/tire.js). If the index-to-corner map is ever
// wrong — damage.js thinking 2 is RL while physics.js treats it as FR — NOTHING fails loudly. The
// truck still drives, the wear still accumulates, and every conclusion drawn about tire wear after
// that point is quietly garbage. This gate is the alarm.
//
// It checks two different things, because either one alone can be fooled:
//
//   §1 SELF-CONSISTENCY — dropping μ on corner k reduces the cornering force reported for corner k
//      and leaves the other three alone. This pins the plumbing: the multiplier reaches the tire
//      force computed under the same index.
//
//   §2 PHYSICAL PLACEMENT — dropping μ on corner k moves the truck's YAW response in the direction
//      that corner's actual position predicts. The expectation is derived from getWheelPosition(),
//      not hardcoded, so the test asks the geometry where the wheel is rather than assuming.
//        · a LATERAL slide separates FRONT from REAR (yaw moment arm is the longitudinal offset)
//        · a BRAKING run separates LEFT from RIGHT (yaw moment arm is the lateral offset)
//      Together they pin all four corners. §2's lateral leg pins an ABSOLUTE sign (derived below),
//      so a 180° rotation of the whole index map — which a pure symmetry check would wave through —
//      fails here.
//
// Wheel index convention under test: 0=FL, 1=FR, 2=RL, 3=RR (GLOSSARY.md §Wheel Index).

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { getWheelPosition } from '../src/suspension.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const NAMES = ['FL', 'FR', 'RL', 'RR']
const MU_CUT = 0.25          // drop the probed corner to a quarter of its grip
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

function mkState (py) {
  return {
    position: new THREE.Vector3(0, py, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(0, 0, 0, 1),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    strutComp: [0.05, 0.05, 0.05, 0.05], strutCompVel: [0, 0, 0, 0],
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelOmega: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    handbrake: false,
    // SM-3 signal arrays — the whole point of §1 is reading tireFlat back out.
    slipVel: [0, 0, 0, 0], tireFlat: [0, 0, 0, 0], bumpForce: [0, 0, 0, 0], brakeTorque: [0, 0, 0, 0],
  }
}

function cloneState (s) {
  return {
    ...s,
    position: s.position.clone(), velocity: s.velocity.clone(),
    quaternion: s.quaternion.clone(), angularVelocity: s.angularVelocity.clone(),
    wheelAngles: [...s.wheelAngles], wheelSteerAngles: [...s.wheelSteerAngles],
    strutComp: [...s.strutComp], strutCompVel: [...s.strutCompVel],
    slipLong: [...s.slipLong], slipLat: [...s.slipLat], wheelOmega: [...s.wheelOmega],
    wheelDebug: s.wheelDebug.map(d => ({ ...d })),
    slipVel: [...s.slipVel], tireFlat: [...s.tireFlat],
    bumpForce: [...s.bumpForce], brakeTorque: [...s.brakeTorque],
  }
}

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── Settle at rest ────────────────────────────────────────────────────────────────────────────────
const settled = mkState(0.60)
for (let i = 0; i < 800; i++) stepPhysics(settled, P, DT, queryContacts, ctx)
console.log(`settled: y=${settled.position.y.toFixed(4)} m  strutComp=[${settled.strutComp.map(c => c.toFixed(3)).join(', ')}]`)

// Body-frame wheel offsets, straight from the geometry the physics itself uses. At rest at the origin
// with an identity quaternion, world position minus body position IS the body-frame offset.
const OFFSET = [0, 1, 2, 3].map(i => {
  const w = getWheelPosition(i, settled, P)
  return { x: w.x - settled.position.x, z: w.z - settled.position.z }
})
console.log('wheel offsets (body frame):')
for (let i = 0; i < 4; i++) console.log(`  ${NAMES[i]}  x=${OFFSET[i].x.toFixed(3)}  z=${OFFSET[i].z.toFixed(3)}`)

// Sanity on the geometry itself — if this trips, the rest of the gate is meaningless.
ok(Math.sign(OFFSET[0].z) === Math.sign(OFFSET[1].z) && Math.sign(OFFSET[2].z) === Math.sign(OFFSET[3].z)
   && Math.sign(OFFSET[0].z) !== Math.sign(OFFSET[2].z),
  'GEOMETRY: 0/1 share a longitudinal end, 2/3 share the other')
ok(Math.sign(OFFSET[0].x) === Math.sign(OFFSET[2].x) && Math.sign(OFFSET[1].x) === Math.sign(OFFSET[3].x)
   && Math.sign(OFFSET[0].x) !== Math.sign(OFFSET[1].x),
  'GEOMETRY: 0/2 share a side, 1/3 share the other')

// ── Probe runner ──────────────────────────────────────────────────────────────────────────────────
// Runs one scenario with μ cut on `probe` (-1 = baseline, all four at full grip) and returns the
// yaw rate reached plus the per-corner cornering forces at the last step.
function run (probe, setup, steps) {
  const vs = cloneState(settled)
  setup(vs)
  for (let i = 0; i < 4; i++) P._tireMuScale[i] = (i === probe ? MU_CUT : 1)
  for (let i = 0; i < steps; i++) stepPhysics(vs, P, DT, queryContacts, ctx)
  P._tireMuScale[0] = P._tireMuScale[1] = P._tireMuScale[2] = P._tireMuScale[3] = 1
  return { yaw: vs.angularVelocity.y, flat: [...vs.tireFlat], vel: vs.velocity.clone() }
}

// ── §1 Self-consistency: the multiplier reaches the tire it names ─────────────────────────────────
console.log('\n§1 per-corner cornering force responds only at the probed corner')
// SHORT probe (2 steps): at 8 steps the slide has transferred load hard onto the outer corners, and
// cutting one corner's grip changes every other corner's normal load — real coupled physics, but it
// swamps the signal this section is trying to isolate. Two steps is enough slip to build real force
// and too little time for the body to have moved.
const LAT_V = 3.0, LAT_STEPS = 8, LAT_STEPS_SHORT = 2
const latSetup = (vs) => { vs.velocity.set(LAT_V, 0, 0) }
const base = run(-1, latSetup, LAT_STEPS_SHORT)
console.log(`  baseline |Flat| = [${base.flat.map(f => f.toFixed(0)).join(', ')}] N`)
ok(base.flat.every(f => f > 500), `NON-VACUOUS: every corner is generating real cornering force (min ${Math.min(...base.flat).toFixed(0)} N > 500)`)

for (let k = 0; k < 4; k++) {
  const r = run(k, latSetup, LAT_STEPS_SHORT)
  const dropK = (base.flat[k] - r.flat[k]) / base.flat[k]
  const others = [0, 1, 2, 3].filter(j => j !== k)
  const maxOther = Math.max(...others.map(j => Math.abs(r.flat[j] - base.flat[j]) / base.flat[j]))
  console.log(`  cut ${NAMES[k]}: |Flat| = [${r.flat.map(f => f.toFixed(0)).join(', ')}] N  ` +
              `→ ${NAMES[k]} −${(dropK * 100).toFixed(1)}%, worst other ${(maxOther * 100).toFixed(1)}%`)
  ok(dropK > 0.30, `  ${NAMES[k]}: probed corner loses grip (−${(dropK * 100).toFixed(1)}% > 30%)`)
  // The other three shift a little — load transfers onto them as the truck's motion changes. That is
  // real coupled physics, not crosstalk. The probed corner must dominate by a wide margin.
  ok(dropK > maxOther * 3, `  ${NAMES[k]}: probed corner dominates the response (${(dropK * 100).toFixed(1)}% vs ${(maxOther * 100).toFixed(1)}%)`)
}

// ── §2a Lateral slide: FRONT vs REAR ──────────────────────────────────────────────────────────────
// The truck slides toward +x, so every tire's lateral force points −x. A wheel at body-frame
// longitudinal offset r_z contributes yaw moment M_y = r_z·F_x = r_z·(−F). Cutting μ there removes
// δ of that force, changing the moment by +r_z·δ — so the yaw rate must move in the sign of r_z.
// This is an ABSOLUTE prediction, which is what rules out a rotated index map.
console.log('\n§2a lateral slide separates front from rear (absolute sign from r_z)')
for (let k = 0; k < 4; k++) {
  const r = run(k, latSetup, LAT_STEPS)
  const dYaw = r.yaw - base.yaw
  const want = Math.sign(OFFSET[k].z)
  console.log(`  cut ${NAMES[k]}: Δyaw = ${dYaw.toExponential(2)} rad/s   (r_z ${OFFSET[k].z.toFixed(3)} → expect sign ${want})`)
  ok(Math.abs(dYaw) > 1e-4, `  ${NAMES[k]}: yaw response is measurable (|Δyaw| ${Math.abs(dYaw).toExponential(2)} > 1e-4)`)
  ok(Math.sign(dYaw) === want, `  ${NAMES[k]}: yaw moves the way its LONGITUDINAL position predicts`)
}

// ── §2b Braking run: LEFT vs RIGHT ────────────────────────────────────────────────────────────────
// Under straight-line braking every tire pushes backward along the same axis, so the yaw moment arm
// is the LATERAL offset r_x. Cutting μ at one corner brakes that side less and the truck yaws away
// from it. The absolute sign depends on which way the truck is pointing, so it is derived once from
// the measured data (`s`) and then required to hold for all four corners — a swapped left/right pair
// breaks that consistency immediately.
console.log('\n§2b braking run separates left from right (sign consistency across all four)')
const BRK_V = 12.0, BRK_STEPS = 14
// CAREFUL: vehicleState.brake is the S key — service brake when rolling FORWARD, reverse pedal when
// not (see getBrakeTorque's REV_THRESHOLD guard, and BUG-20). The front wheels sit at negative z, so
// forward is -z; pointing the truck the other way makes S drive it in reverse instead of braking it.
const FWD_Z = Math.sign(OFFSET[0].z)      // -1: front is at negative z
const brkSetup = (vs) => {
  vs.velocity.set(0, 0, FWD_Z * BRK_V)
  for (let i = 0; i < 4; i++) vs.wheelOmega[i] = BRK_V / P.wheelRadius
  vs.brake = 1; vs.smoothBrake = 1
}
const brkBase = run(-1, brkSetup, BRK_STEPS)
console.log(`  baseline: v=${brkBase.vel.length().toFixed(3)} m/s  yaw=${brkBase.yaw.toExponential(2)}`)
ok(brkBase.vel.length() < BRK_V - 1.0, `NON-VACUOUS: the brakes are actually slowing the truck (${BRK_V} → ${brkBase.vel.length().toFixed(2)} m/s)`)

const dYawBrk = []
for (let k = 0; k < 4; k++) {
  const r = run(k, brkSetup, BRK_STEPS)
  dYawBrk[k] = r.yaw - brkBase.yaw
  console.log(`  cut ${NAMES[k]}: Δyaw = ${dYawBrk[k].toExponential(2)} rad/s   (r_x ${OFFSET[k].x.toFixed(3)})`)
}
// s = the sign relating a corner's lateral offset to the yaw it induces, read off the corner with the
// largest response so noise cannot pick it.
const kMax = dYawBrk.map(Math.abs).indexOf(Math.max(...dYawBrk.map(Math.abs)))
const s = Math.sign(dYawBrk[kMax]) * Math.sign(OFFSET[kMax].x)
for (let k = 0; k < 4; k++) {
  ok(Math.abs(dYawBrk[k]) > 1e-4, `  ${NAMES[k]}: braking yaw response is measurable (|Δyaw| ${Math.abs(dYawBrk[k]).toExponential(2)} > 1e-4)`)
  ok(Math.sign(dYawBrk[k]) === s * Math.sign(OFFSET[k].x),
    `  ${NAMES[k]}: yaw moves the way its LATERAL position predicts`)
}

console.log(fail ? '\nFAIL — per-tire friction is NOT wired to the corner it names' : '\nPASS — all four corners verified')
process.exit(fail)
