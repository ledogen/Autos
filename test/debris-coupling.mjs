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
console.log('\n' + '═'.repeat(56))
if (fail) { console.log('DEBRIS-COUPLING: FAIL'); process.exit(1) }
console.log('DEBRIS-COUPLING: PASS — wheel↔debris coupling is two-way, stable, and honest ✓')
