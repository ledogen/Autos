// GATE (FEAT-48/FEAT-36): two-way wheel↔debris coupling through the translation layer.
//
// A barrel-sized dynamic hull lies in the truck's path on flat ground. The truck drives into
// it. Three things must be true, all through the REAL stepPhysics:
//   (1) the truck imparts motion — the barrel gets shoved (reaction force path);
//   (2) the truck feels it — the encounter disturbs the chassis (two-way, not a ghost);
//   (3) nothing explodes — no NaN, truck still drivable and upright after the hit,
//       and the barrel eventually comes to rest instead of jittering forever.
// Deterministic: no Math.random anywhere in the setup; the engine is single-threaded.
//
// Run: node test/debris-coupling.mjs

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'
import { GROUP_DEBRIS } from '../src/physics-engine.js'

const DT = 1 / 60
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  return P
}

// Static-equilibrium ride height (canonical formula from drivetrain-climb.mjs).
function eqOf (p) {
  const g = 9.81, strutComp = [0, 0, 0, 0], bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const f = i < 2; const cm = p.mass * (f ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const kS = f ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const LS = f ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    const spr = p.mass * (f ? p.weightFront : p.weightRear) / 2; strutComp[i] = spr * g / kS
    const tc = cm * g / p.tireStiffness; const hubY = p.wheelRadius - tc
    const bo = f ? (p.suspensionBodyOffsetFront || 0) : (p.suspensionBodyOffsetRear || 0)
    bodyYCorner[i] = hubY + (LS - strutComp[i]) + (p.cgHeight - p.wheelRadius) - bo
  }
  return { bodyY: (bodyYCorner[0] + bodyYCorner[1]) / 2, strutComp }
}

const P = freshParams()
const eq = eqOf(P)
const queryContacts = (cx, cy, cz, r) => {
  const gd = 0 + r - cy
  return gd > 0
    ? [{ normal: new THREE.Vector3(0, 1, 0), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }]
    : []
}
const queryVertexContacts = () => []

const vs = {
  position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -8),
  quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
  steerAngle: 0, throttle: 0.5, brake: 0, smoothThrottle: 0.5, smoothBrake: 0,
  wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
  wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
  wheelOmega: [0, 0, 0, 0].map(() => 8 / P.wheelRadius), slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
  strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
  drivetrain: { engineRPM: 1500, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
}

const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 256, cell: 4 })

// A barrel lying on its side in the truck's path, dead ahead of the LEFT front wheel
// (truck forward = −Z; left wheels sit at x ≈ −0.72). Cylinder hull, ~18 kg.
const barrel = ctx.engine.createBody({
  type: 'dynamic',
  position: { x: -0.7, y: 0.31, z: -12 },
  quaternion: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 },   // axis horizontal — lies flat
  userData: { kind: 'debris' },
})
ctx.engine.addCylinder(barrel, 0.9, 0.3, { density: 70, friction: 0.5, restitution: 0.3, group: GROUP_DEBRIS }, 0, 12)

const bp = { x: 0, y: 0, z: 0 }, bq = { x: 0, y: 0, z: 0, w: 1 }
const bv = { x: 0, y: 0, z: 0 }, bw = { x: 0, y: 0, z: 0 }

let barrelPeakSpeed = 0
let chassisDisturbance = 0        // peak |vy| of the chassis after contact begins — "the truck felt it"
let anyNaN = false
let contactStep = -1
for (let s = 1; s <= 600; s++) {
  vs.throttle = 0.5
  stepPhysics(vs, P, DT, queryContacts, queryVertexContacts, ctx)
  ctx.engine.getVelocity(barrel, bv, bw)
  const bSpeed = Math.hypot(bv.x, bv.y, bv.z)
  if (bSpeed > barrelPeakSpeed) barrelPeakSpeed = bSpeed
  if (contactStep < 0 && bSpeed > 1.0) contactStep = s   // > 1 m/s: the HIT, not the initial cm of settle
  if (contactStep > 0 && s < contactStep + 90) {
    chassisDisturbance = Math.max(chassisDisturbance, Math.abs(vs.velocity.y))
  }
  if (![vs.position.x, vs.position.y, vs.position.z, bv.x, bv.y, bv.z].every(Number.isFinite)) anyNaN = true
}

ctx.engine.getTransform(barrel, bp, bq)
ctx.engine.getVelocity(barrel, bv, bw)
const barrelRestSpeed = Math.hypot(bv.x, bv.y, bv.z)
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(vs.quaternion)

console.log(`contact at step ${contactStep}; barrel peak ${barrelPeakSpeed.toFixed(2)} m/s; ` +
  `final barrel pos (${bp.x.toFixed(1)}, ${bp.y.toFixed(2)}, ${bp.z.toFixed(1)}), |v| ${barrelRestSpeed.toFixed(3)}`)
console.log(`chassis: y=${vs.position.y.toFixed(2)}, up·Y=${up.y.toFixed(3)}, |v|=${vs.velocity.length().toFixed(1)}, peak |vy| near contact ${chassisDisturbance.toFixed(3)}`)

ok(contactStep > 0, `the truck reached and hit the barrel (first motion at step ${contactStep})`)
ok(barrelPeakSpeed > 1.0, `truck→barrel: the barrel was shoved (peak ${barrelPeakSpeed.toFixed(2)} m/s > 1.0)`)
ok(chassisDisturbance > 0.005, `barrel→truck: the chassis felt the encounter (peak |vy| ${chassisDisturbance.toFixed(3)} > 0.005 m/s)`)
ok(!anyNaN, 'no NaN anywhere in 10 s of simulation')
ok(up.y > 0.9, `truck still upright after the hit (up·Y ${up.y.toFixed(3)} > 0.9)`)
ok(barrelRestSpeed < 0.8, `barrel settles instead of jittering (final |v| ${barrelRestSpeed.toFixed(3)} < 0.8 m/s)`)

ctx.dispose()

// ── Fling regression (owner capture 1786690032648, 2026-08-14) ───────────────────────────────
// Coasting slowly over a SMALL rock used to feed a loop: the overlap depth spiked to ~0.15 m in
// one frame → ~10 kN tire Fz → the summed-Fz reaction flung the rock → the fleeing rock's
// velocity drove the relative-slip ω integrator to 60+ rad/s with ZERO throttle. Fixed by the
// DYN_CONTACT_DEPTH_CAP + contact-local reaction Fn (physics.js). This scenario locks it in:
// rolling over a rock at ~3 m/s coast must leave the rock nearby and slow, the wheels near
// rolling speed, and the tire loads bounded.
console.log('\nfling regression — coast over a small rock, no throttle:')
{
  const P2 = freshParams()
  const eq2 = eqOf(P2)
  const v0 = 3
  const vs2 = {
    position: new THREE.Vector3(0, eq2.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0].map(() => v0 / P2.wheelRadius), slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq2.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx2 = await makeEngineCtx(vs2, P2, { groundFn: () => 0, extent: 128, cell: 4 })
  // A ~50 kg cobble dead in the LEFT front wheel's track (x ≈ −0.72), 6 m ahead.
  const rock = ctx2.engine.createBody({ type: 'dynamic', position: { x: -0.72, y: 0.16, z: -6 }, userData: { kind: 'debris' } })
  ctx2.engine.addCylinder(rock, 0.24, 0.17, { density: 2500, friction: 0.7, restitution: 0.15, group: GROUP_DEBRIS }, 0, 8)

  const rv = { x: 0, y: 0, z: 0 }, rw = { x: 0, y: 0, z: 0 }
  let rockPeak = 0, omegaPeak = 0, fzPeak = 0
  for (let s = 1; s <= 480; s++) {
    vs2.throttle = 0
    stepPhysics(vs2, P2, DT, queryContacts, queryVertexContacts, ctx2)
    ctx2.engine.getVelocity(rock, rv, rw)
    rockPeak = Math.max(rockPeak, Math.hypot(rv.x, rv.y, rv.z))
    for (let i = 0; i < 4; i++) {
      omegaPeak = Math.max(omegaPeak, Math.abs(vs2.wheelOmega[i]))
      fzPeak = Math.max(fzPeak, P2._tireFz[i])
    }
  }
  const omega0 = v0 / P2.wheelRadius
  console.log(`  rock peak |v| ${rockPeak.toFixed(2)} m/s; wheel |ω| peak ${omegaPeak.toFixed(1)} rad/s (rolling ${omega0.toFixed(1)}); tire Fz peak ${fzPeak.toFixed(0)} N`)
  ok(rockPeak < 3.0, `rock is rolled over, not flung (peak ${rockPeak.toFixed(2)} m/s < 3.0 at a ${v0} m/s coast)`)
  ok(omegaPeak < 2.5 * omega0, `no phantom wheel spin-up (peak |ω| ${omegaPeak.toFixed(1)} < ${(2.5 * omega0).toFixed(1)} rad/s — was 60+ pre-fix)`)
  ok(fzPeak < 12000, `tire load bounded over the rock (peak Fz ${fzPeak.toFixed(0)} N < 12 kN — was spiking on full-radius depth)`)
  ctx2.dispose()
}

// ── Chassis-vs-tree rigid stop (owner-reported "squishy trees", 2026-08-15) ──────────────────
// Prop colliders used to be analytic-only (wheel path) — the engine chassis sailed through a
// trunk with nothing but suspension spring residue pushing back. With PropPhysics mirroring
// trunks as engine capsules, driving square into a tree is a HARD stop: big speed loss on
// impact, no pass-through, truck still upright.
console.log('\nchassis vs tree trunk — rigid stop, not a squish:')
{
  const P3 = freshParams()
  const eq3 = eqOf(P3)
  const v0 = 10
  const vs3 = {
    position: new THREE.Vector3(0, eq3.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0].map(() => v0 / P3.wheelRadius), slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq3.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const ctx3 = await makeEngineCtx(vs3, P3, { groundFn: () => 0, extent: 128, cell: 4 })
  // A stout trunk dead ahead on the centerline — exactly what PropPhysics builds for a tree.
  const tree = ctx3.engine.createBody({ type: 'static', userData: { kind: 'prop' } })
  ctx3.engine.addCapsule(tree, { x: 0, y: 0, z: -15 }, { x: 0, y: 6, z: -15 }, 0.28, { friction: 0.8 })

  let minZ = 0
  for (let s = 1; s <= 300; s++) {
    vs3.throttle = 0
    stepPhysics(vs3, P3, DT, queryContacts, queryVertexContacts, ctx3)
    minZ = Math.min(minZ, vs3.position.z)
  }
  const up3 = new THREE.Vector3(0, 1, 0).applyQuaternion(vs3.quaternion)
  const vEnd = vs3.velocity.length()
  console.log(`  deepest CG z ${minZ.toFixed(2)} (trunk at −15, nose reaches z ≈ CG − 2.13); final |v| ${vEnd.toFixed(2)}, up·Y ${up3.y.toFixed(3)}`)
  ok(minZ > -13.4, `truck STOPPED at the trunk, no pass-through (CG z ${minZ.toFixed(2)} > −13.4)`)
  ok(vEnd < 2.5, `impact killed the speed rigidly (final |v| ${vEnd.toFixed(2)} < 2.5 m/s from ${v0})`)
  ok(up3.y > 0.85, `truck still upright after the tree hit (up·Y ${up3.y.toFixed(3)})`)
  ctx3.dispose()
}

console.log('\n' + '═'.repeat(56))
if (fail) { console.log('DEBRIS-COUPLING: FAIL'); process.exit(1) }
console.log('DEBRIS-COUPLING: PASS — wheel↔debris coupling is two-way, stable, and honest ✓')
