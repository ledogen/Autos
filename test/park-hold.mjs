// test/park-hold.mjs — BUG-167 gate: a parked truck does not creep. The real stepPhysics on an analytic plane of `deg`,
// handbrake on: 15 s to settle (on 17° nose-down the rear-only handbrake first slides ~2 m at the grip limit), then 60 s at 60 Hz. Before the fix the carcass relaxation's 0.05 m/s floor bled the
// tire's stored deflection at rest and it crept (≈ 10 mm/s nose-down on 17°); without the floor and without the
// carcass damper it rocked (up to 0.4 mm per step). Pins: creep < 1 mm over 60 s, every step after settling < 1e-6 m.
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { createPhysicsEngine } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
const DT = 1 / 60
async function park (deg, { settle = 900, steps = 4500, yaw = 0 } = {}) {
  const P = { ...RANGER_PARAMS, ...JSON.parse(process.env.PX || '{}') }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const th = deg * Math.PI / 180, n = new THREE.Vector3(0, Math.cos(th), -Math.sin(th))
  const engine = await createPhysicsEngine()
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 0)
  vs.strutComp = [...eq.strutComp]
  // the plane through the origin with normal n; tilt the truck onto it, then yaw it on the slope
  vs.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
  vs.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), th)
  const chassis = createVehicleChassis(engine, vs, P, {})
  const c = new THREE.Vector3()
  const road = (cx, cy, cz, r) => {
    c.set(cx, cy, cz); const d = c.dot(n), depth = r - d
    return depth > 0 ? [{ normal: n.clone(), depth, contactPoint: c.clone().addScaledVector(n, -d) }] : []
  }
  vs.handbrake = true
  let p0 = null, maxStep = 0, prev = new THREE.Vector3()
  for (let i = 0; i < steps; i++) {
    prev.copy(vs.position)
    stepPhysics(vs, P, DT, road, { engine, chassis })
    if (i === settle) p0 = vs.position.clone()
    if (i > settle) maxStep = Math.max(maxStep, vs.position.distanceTo(prev))
  }
  const creep = vs.position.distanceTo(p0)
  engine.dispose()
  return { creepMm: creep * 1000, maxStepM: maxStep }
}
let fail = 0
for (const [deg, yaw, what] of [[2, 0, 'nose down'], [17, 0, 'nose down'], [17, Math.PI, 'nose up']]) {
  const r = await park(deg, { yaw })
  const ok = r.creepMm < 1 && r.maxStepM < 1e-6
  if (!ok) fail = 1
  console.log(`  ${ok ? '✓' : '✗'} ${deg}° ${what}: ${r.creepMm.toFixed(3)} mm in 60 s (< 1), largest step ${r.maxStepM.toExponential(1)} m (< 1e-6)`)
}
console.log(fail ? '\nPARK-HOLD: FAIL — a parked truck creeps or rocks' : '\nPARK-HOLD: PASS — a parked truck holds still on 2° and 17°')
process.exit(fail)
