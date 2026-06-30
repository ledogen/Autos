// test/body-contact-energy.mjs — BUG-27 gate.
//
// A hard BODY (frame/bumper/undercarriage) slam into the ground must be strictly DISSIPATIVE:
// real frame members deform and absorb the impact — they do not store-and-release it like a spring,
// and they certainly do not spit energy BACK into the car. The Step 3b body-contact solver
// (sequential-impulse + Baumgarte) was under-damped: a fast slam picked up an oscillation that
// LAUNCHED the car. Three energy paths fed it, all addressed here:
//   (1) restitution: BODY_RESTITUTION=0.05 fired on FAST contacts (the REST_VEL_THRESHOLD gate only
//       killed bounce for SLOW/resting contacts) → bounce on exactly the hard hits that should be
//       the most inelastic. FIX: restitution 0 (fully plastic normal impulse).
//   (2) the velocity solver applied a FRESH un-accumulated impulse every Gauss-Seidel pass; across
//       the asymmetric coincident probes (front/rear undercarriage + bumpers span ~4 m in z) it did
//       NOT converge to the inelastic resting solution in 8 passes — it CREATED a phantom pitch
//       spin (ω_z ≈ −2 rad/s from a pure vertical drop) and net upward velocity. This was the
//       dominant launch term. FIX: accumulate each contact's impulse, clamp the total ≥ 0
//       (standard sequential-impulse / Box2D) → converges to the true stop-dead LCP solution.
//   (3) Baumgarte position correction injected PE with no velocity sink; a deep hit teleported the
//       body up. FIX: lower beta + clamp the per-step de-penetration.
//
// This gate drives the REAL stepPhysics with a flat-ground mock queryContacts that responds ONLY to
// body-sphere queries (wheel-radius queries return nothing), isolating Step 3b from the suspension.
// It checks three things, all expressed as energy statements:
//   (1) drop from REST: total mechanical energy (KE_trans + KE_rot + PE) never exceeds the release
//       energy — the canonical conservation invariant (gravity is conservative; contact only removes).
//   (2) hard downward SLAM at several speeds: effective coefficient of restitution ≈ 0 (negligible
//       rebound KE returned), the body does not launch above its gentle-settle rest height, and no
//       post-impact step exceeds the pre-impact mechanical energy.
//   (3) resting stability: a settled body stays quiet (no micro-jitter, no energy pumping) — the
//       reason the original tiny-restitution dead-stop logic existed in the first place.

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { getBodyContactPoints } from '../src/suspension.js'

const DT = 1 / 60
const G  = 9.81

// Per-step suspension scratch arrays (main.js pre-allocates these on params).
P._tireFz = [0, 0, 0, 0]
P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))

// Flat ground at y=0 that ONLY answers body-sphere queries (radius == bodyContactRadius). Wheel-radius
// queries return [] → wheels generate zero force → pure body-contact slam, isolating the Step 3b solver
// (the suspension cannot cushion the impact, so any rebound is the body solver's alone).
let groundY = 0
const queryContacts = (cx, cy, cz, r) => {
  if (Math.abs(r - P.bodyContactRadius) > 1e-9) return []   // ignore wheel queries
  const depth = groundY + r - cy
  if (depth <= 0) return []
  return [{ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, groundY, cz) }]
}
const queryVertexContacts = () => []

function mkState (py, vy) {
  return {
    position: new THREE.Vector3(0, py, 0),
    velocity: new THREE.Vector3(0, vy, 0),
    quaternion: new THREE.Quaternion(0, 0, 0, 1),   // upright → flat symmetric slam
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

// Total mechanical energy in the SIM's own model: translational KE + rotational KE (diagonal
// body-frame inertia applied to world-frame ω, matching the integrator) + gravitational PE.
function energy (vs) {
  const v = vs.velocity, w = vs.angularVelocity
  const keT = 0.5 * P.mass * (v.x * v.x + v.y * v.y + v.z * v.z)
  const keR = 0.5 * (P.inertiaRoll * w.x * w.x + P.inertiaYaw * w.y * w.y + P.inertiaPitch * w.z * w.z)
  const pe  = P.mass * G * vs.position.y
  return keT + keR + pe
}

// Max body-contact penetration depth this step (probe the same points the solver uses).
function maxBodyDepth (vs) {
  P._rotateVector = (vec) => new THREE.Vector3(vec.x, vec.y, vec.z).applyQuaternion(vs.quaternion)
  let d = 0
  for (const bp of getBodyContactPoints(vs, P)) {
    const depth = groundY + P.bodyContactRadius - bp.y
    if (depth > d) d = depth
  }
  return d
}

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

// ── (0) Free-fall energy drift — sizes the conservation tolerance ────────────────────────────────
// Drop without ever touching ground (ground far below) and watch how much E wobbles under the
// symplectic integrator. This is the honest "noise floor" for the energy assertions below.
let driftRel = 0
{
  groundY = -1e6
  const vs = mkState(2.0, 0)
  const e0 = energy(vs)
  let drift = 0
  for (let i = 0; i < 120; i++) {
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    drift = Math.max(drift, Math.abs(energy(vs) - e0))
  }
  driftRel = drift / Math.abs(e0)
  console.log(`(0) free-fall energy drift over 120 steps: ${drift.toFixed(2)} J (${(driftRel * 100).toFixed(3)}% of E0=${e0.toFixed(0)} J)`)
}
const E_TOL_REL = Math.max(driftRel * 1.5, 0.01)   // relative energy tolerance with headroom over drift

// Reference rest height from a gentle settle (used as the launch baseline below).
groundY = 0
let restHeight
{
  const vs = mkState(0.40, 0)
  for (let i = 0; i < 700; i++) stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
  restHeight = vs.position.y
}

// ── (1) Drop from REST: total mechanical energy never exceeds the release energy ─────────────────
console.log('\n(1) drop from rest — total mechanical energy must never exceed release energy:')
for (const H of [0.6, 1.2, 2.5]) {
  groundY = 0
  const vs = mkState(H, 0)
  const E0 = energy(vs)
  let maxE = -Infinity
  for (let i = 0; i < 700; i++) {
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    maxE = Math.max(maxE, energy(vs))
  }
  const gain = maxE - E0
  const tol = E_TOL_REL * Math.abs(E0)
  ok(maxE <= E0 + tol,
    `H=${H} m: peak E ${maxE.toFixed(0)} J ≤ release E ${E0.toFixed(0)} J (gain ${gain >= 0 ? '+' : ''}${gain.toFixed(0)} J ≤ tol ${tol.toFixed(0)} J)`)
}

// ── (2) Hard downward SLAM: inelastic, no launch, no energy gain across impact ───────────────────
// For each impact speed: measure the effective coefficient of restitution (peak rebound upward
// velocity / impact speed), the rebound apex height, and the pre-impact vs peak-post-impact energy.
console.log(`\n(2) hard slam (gentle-settle rest height = ${restHeight.toFixed(3)} m):`)
for (const v0 of [-5, -8, -12]) {
  groundY = 0
  const vs = mkState(0.42, v0)
  let impactVy = 0, peakReboundUp = -Infinity, apex = -Infinity
  let ePreImpact = energy(vs), peakPostE = -Infinity, contacted = false
  for (let i = 0; i < 400; i++) {
    const vyBefore = vs.velocity.y
    const depthBefore = maxBodyDepth(vs)
    if (depthBefore <= 1e-6 && !contacted) ePreImpact = energy(vs)   // last clean pre-contact energy
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    // Impact = first step where a fast downward approach flips toward rebound.
    if (!contacted && depthBefore > 1e-6 && vyBefore < -0.5) { impactVy = vyBefore; contacted = true }
    if (contacted) {
      peakReboundUp = Math.max(peakReboundUp, vs.velocity.y)
      apex = Math.max(apex, vs.position.y)
      peakPostE = Math.max(peakPostE, energy(vs))
    }
  }
  const eEff = peakReboundUp / Math.abs(impactVy)        // effective coefficient of restitution
  const energyReturn = eEff * eEff                        // fraction of impact KE returned (= e²)
  console.log(`  v0=${String(v0).padStart(4)} m/s: impactVy=${impactVy.toFixed(2)}  reboundUp=${peakReboundUp.toFixed(3)}  ` +
    `e_eff=${eEff.toFixed(3)} (KE return ${(energyReturn * 100).toFixed(2)}%)  apex=${apex.toFixed(3)} m  ` +
    `E_pre=${ePreImpact.toFixed(0)}→E_postPeak=${peakPostE.toFixed(0)} J`)
  ok(eEff <= 0.03,
    `v0=${v0}: effective restitution ≈ 0 (e_eff ${eEff.toFixed(3)} ≤ 0.03) — fully inelastic, no bounce`)
  ok(apex <= restHeight + 0.05,
    `v0=${v0}: no launch (rebound apex ${apex.toFixed(3)} m ≤ rest ${restHeight.toFixed(3)} + 0.05 m)`)
  ok(peakPostE <= ePreImpact + E_TOL_REL * Math.abs(ePreImpact),
    `v0=${v0}: no energy gain across impact (peak post ${peakPostE.toFixed(0)} ≤ pre-impact ${ePreImpact.toFixed(0)} J)`)
}

// ── (3) Resting stability: a settled body stays quiet (no micro-jitter, no energy pumping) ───────
console.log('\n(3) resting stability (gentle settle):')
groundY = 0
const vr = mkState(0.40, 0)
for (let i = 0; i < 600; i++) stepPhysics(vr, P, DT, queryContacts, queryVertexContacts)
const vyRest = Math.abs(vr.velocity.y)
const eA = energy(vr)
for (let i = 0; i < 120; i++) stepPhysics(vr, P, DT, queryContacts, queryVertexContacts)
const eB = energy(vr)
console.log(`  settled: |vy|=${vyRest.toFixed(5)} m/s, |ω|=${vr.angularVelocity.length().toFixed(5)} rad/s, ΔE/120steps=${(eB - eA).toFixed(3)} J`)
ok(vyRest < 0.05, `resting body is vertically quiet (|vy| ${vyRest.toFixed(4)} < 0.05 m/s — no micro-jitter)`)
ok(eB - eA <= E_TOL_REL * Math.abs(eA) + 5, `resting body does not pump energy (ΔE ${(eB - eA).toFixed(2)} J)`)

console.log('\n' + '═'.repeat(60))
if (fail) { console.log('BODY-CONTACT-ENERGY: FAIL'); process.exit(1) }
console.log('BODY-CONTACT-ENERGY: PASS — hard body slams are strictly dissipative, no launch, rest is stable ✓')
