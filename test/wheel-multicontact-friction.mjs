// test/wheel-multicontact-friction.mjs — BUG-38 gate.
//
// The Pacejka tire is a per-WHEEL model with ONE slip state. Its friction (lateral + longitudinal)
// must be evaluated ONCE per wheel against the support surface — NOT once per contact. Before BUG-38
// the physics wheel loop applied the full tire force inside a `for (contact of contacts)` loop, so a
// wheel that simultaneously touched the ground AND a hard obstacle (tunnel wall / prop / ramp face)
// got its cornering + drive/brake force applied once PER contact — roughly doubled when straddling two
// surfaces. The obstacle is meant to contribute only push-out (normal) force, which flows through
// _hubNormalXZ in stepSuspensionSubsteps; it must not re-apply grip.
//
// This gate drives the REAL stepPhysics from a settled 4-wheel rest state, gives the truck a lateral
// velocity, and steps two worlds forward in lockstep:
//   A) wheels touch GROUND only.
//   B) wheels touch ground PLUS a near-ZERO-depth vertical wall (horizontal normal).
// The wall's own penetration force is ~0 (depth ≈ 0 → tireStiffness·depth ≈ 0) and its normal is
// horizontal (projects ≈0 onto the strut axis), so it adds negligible support load and negligible
// push-out — it exists ONLY to present a second contact. With the fix, the tire friction is chosen
// against the ground (normal most aligned with world-up) and evaluated once, so A and B evolve
// essentially identically. Under the old per-contact application, B's lateral force ~doubles and the
// two worlds diverge hard — which is exactly what this gate pins.

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'

const DT = 1 / 60

// Per-step suspension scratch (main.js pre-allocates these on params).
P._tireFz = [0, 0, 0, 0]
P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))

const groundY = 0

// Wheel-query mock. Ground contact always; in "wall mode" also a near-zero-depth vertical wall. Its
// normal points in +z — ORTHOGONAL to the +x lateral velocity we measure — so any real push-out it
// produces lands in z and cannot contaminate the x-axis friction comparison. The double-count bug,
// by contrast, re-applies the tire's lateral (x) force per contact, so it DOES show up in x.
// Body queries (r == bodyContactRadius) return nothing → isolate the wheels.
const WALL_DEPTH = 1e-5   // ~0 → negligible push-out, but still a second contact the loop must handle
let wallMode = false
const mkQuery = () => (cx, cy, cz, r) => {
  if (Math.abs(r - P.wheelRadius) > 1e-9) return []   // ignore body-sphere queries
  const depth = groundY + r - cy
  const hits = []
  if (depth > 0) hits.push({ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, groundY, cz) })
  // Only present the wall once the wheel is genuinely on the ground (so both worlds start identical).
  if (wallMode && depth > 0) {
    hits.push({ normal: new THREE.Vector3(0, 0, 1), depth: WALL_DEPTH, contactPoint: new THREE.Vector3(cx, cy, cz + r) })
  }
  return hits
}
const queryContacts = mkQuery()
const queryVertexContacts = () => []

function mkState (py, vx) {
  return {
    position: new THREE.Vector3(0, py, 0),
    velocity: new THREE.Vector3(vx, 0, 0),
    quaternion: new THREE.Quaternion(0, 0, 0, 1),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    strutComp: [0.05, 0.05, 0.05, 0.05], strutCompVel: [0, 0, 0, 0],
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelOmega: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    handbrake: false,
  }
}

function cloneState (s) {
  return {
    position: s.position.clone(),
    velocity: s.velocity.clone(),
    quaternion: s.quaternion.clone(),
    angularVelocity: s.angularVelocity.clone(),
    steerAngle: s.steerAngle, throttle: s.throttle, brake: s.brake,
    smoothThrottle: s.smoothThrottle, smoothBrake: s.smoothBrake,
    wheelAngles: [...s.wheelAngles], wheelSteerAngles: [...s.wheelSteerAngles],
    strutComp: [...s.strutComp], strutCompVel: [...s.strutCompVel],
    slipLong: [...s.slipLong], slipLat: [...s.slipLat],
    wheelOmega: [...s.wheelOmega],
    wheelDebug: s.wheelDebug.map(d => ({ ...d })),
    handbrake: s.handbrake,
  }
}

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── Settle a 4-wheel rest state on flat ground (no wall) ─────────────────────────────────────────
wallMode = false
const settled = mkState(0.60, 0)
for (let i = 0; i < 800; i++) stepPhysics(settled, P, DT, queryContacts, queryVertexContacts)
console.log(`settled: y=${settled.position.y.toFixed(4)} m  |v|=${settled.velocity.length().toFixed(4)} m/s  ` +
  `strutComp=[${settled.strutComp.map(c => c.toFixed(3)).join(', ')}]`)

// ── Give both worlds a lateral velocity, step forward in lockstep ────────────────────────────────
const V_LAT = 3.0   // m/s sideways → builds lateral slip → lateral tire force
const N_STEP = 20   // stop short of full arrest — stay in the clean grip regime, before reversal/coupling

const vsA = cloneState(settled); vsA.velocity.set(V_LAT, 0, 0)
const vsB = cloneState(settled); vsB.velocity.set(V_LAT, 0, 0)
const vLat0 = V_LAT

wallMode = false
for (let i = 0; i < N_STEP; i++) stepPhysics(vsA, P, DT, queryContacts, queryVertexContacts)
wallMode = true
for (let i = 0; i < N_STEP; i++) stepPhysics(vsB, P, DT, queryContacts, queryVertexContacts)
wallMode = false

const vxA = vsA.velocity.x, vxB = vsB.velocity.x
const declA = vLat0 - vxA, declB = vLat0 - vxB   // lateral velocity killed by tire grip
console.log(`\nafter ${N_STEP} steps @ ${V_LAT} m/s lateral:`)
console.log(`  A (ground only)  : vx=${vxA.toFixed(4)}  lateral decel Δvx=${declA.toFixed(4)} m/s`)
console.log(`  B (ground+wall)  : vx=${vxB.toFixed(4)}  lateral decel Δvx=${declB.toFixed(4)} m/s`)

// Non-vacuous: the tire must actually be gripping (otherwise A==B trivially).
ok(declA > 0.3, `NON-VACUOUS: ground-only lateral grip is real (Δvx ${declA.toFixed(3)} > 0.3 m/s)`)

// The core BUG-38 assertion: a second (obstacle) contact must NOT amplify tire friction. The wall's
// push-out is ~0 (WALL_DEPTH ≈ 0), so any material extra lateral decel in B is double-counted grip.
// Old code roughly DOUBLED it (declB ≈ 2·declA); the fix keeps them within a hair.
const relDiff = Math.abs(declB - declA) / Math.max(declA, 1e-6)
ok(relDiff < 0.05,
  `friction NOT double-counted with a 2nd contact (Δvx match within ${(relDiff * 100).toFixed(2)}% < 5%)`)
// (No yaw assertion: the wall's +z push-out legitimately induces a small yaw torque — that is real
//  contact physics, not a friction artifact. The x-axis decel above is the clean double-count probe.)

console.log('\n' + '═'.repeat(60))
if (fail) { console.log('WHEEL-MULTICONTACT-FRICTION: FAIL'); process.exit(1) }
console.log('WHEEL-MULTICONTACT-FRICTION: PASS — tire grip evaluated once per wheel, a 2nd contact adds no phantom friction ✓')
