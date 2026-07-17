// test/body-contact-energy.mjs — BUG-27 gate.
//
// A hard BODY (frame/bumper/undercarriage) slam into the ground must never CREATE energy: contact
// can only remove mechanical energy or hand back the fraction restitution asks for — never more.
// The Step 3b body-contact solver (sequential-impulse + Baumgarte) was under-damped: a fast slam
// picked up an oscillation that LAUNCHED the car. Three energy paths fed it:
//   (1) restitution AMPLIFICATION: the solver drove `dN = -(1+e)·vn` off the CURRENT vn every pass,
//       re-applying restitution across 8 Gauss-Seidel passes × 6 coincident probes — a nominal 0.05
//       landed at ~0.15 effective, on exactly the hard hits that should be most inelastic. The
//       BUG-27 fix pinned e=0 (the one value the buggy formulation handles right, since driving
//       vn → 0 is idempotent). REAL FIX (2026-07-16): sample each contact's approach velocity ONCE
//       and solve toward the fixed target −e·vnApproach, so e means what it says at any pass/probe
//       count. e is now a live parameter (params.bodyRestitution, default 0.15).
//   (2) the velocity solver applied a FRESH un-accumulated impulse every Gauss-Seidel pass; across
//       the asymmetric coincident probes (front/rear undercarriage + bumpers span ~4 m in z) it did
//       NOT converge in 8 passes — it CREATED a phantom pitch spin (ω_z ≈ −2 rad/s from a pure
//       vertical drop) and net upward velocity. This was the dominant launch term. FIX: accumulate
//       each contact's impulse, clamp the total ≥ 0 (standard sequential-impulse / Box2D).
//   (3) Baumgarte position correction injected PE with no velocity sink; a deep hit teleported the
//       body up. FIX: lower beta + clamp the per-step de-penetration.
//
// This gate drives the REAL stepPhysics with a flat-ground mock queryContacts that responds ONLY to
// body-sphere queries (wheel-radius queries return nothing), isolating Step 3b from the suspension.
// It checks three things, all expressed as energy statements:
//   (1) drop from REST: total mechanical energy (KE_trans + KE_rot + PE) never exceeds the release
//       energy — the canonical conservation invariant (gravity is conservative; contact only removes).
//   (2) hard downward SLAM, swept over restitution × impact speed. The effective coefficient of
//       restitution must MATCH params.bodyRestitution — an upper bound that is the direct BUG-27
//       amplification regression (e must not grow with probe/pass count), and a lower bound that the
//       requested bounce is actually delivered. e=0 in the sweep pins the old fully-plastic thud.
//       Rebound apex must stay within the ballistic height that e permits (no launch), and no
//       post-impact step may exceed the pre-impact mechanical energy.
//   (3) resting stability: a settled body stays quiet (no micro-jitter, no energy pumping) — the
//       reason restitution is gated to impacts above REST_VEL_THRESHOLD in the first place.

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

// ── (2) Hard downward SLAM: restitution honored (not amplified), no launch, no energy gain ───────
// Swept over restitution × impact speed. e_eff = peak rebound velocity / impact velocity.
//   • e_eff ≤ e + tol  is the BUG-27 amplification regression: the launch happened because a nominal
//     0.05 came out at ~0.15. If the solver ever re-applies restitution per pass/probe again, e_eff
//     climbs above the request and this fires — at ANY e, including the e=0 fully-plastic case.
//   • e_eff ≥ e − tol  proves the requested bounce is actually delivered (skipped at e=0, where
//     there is no rebound to measure).
//   • apex is bounded by the BALLISTIC height the rebound earns: h = (e·|v_impact|)² / 2g above the
//     contact height. Anything higher is energy from nowhere.
// Sweep 0 (the old fully-plastic thud) and the SHIPPED default, so retuning the param retunes the
// gate with it — the invariant is "e_eff tracks whatever e is", not any one hardcoded value.
const E_RESTORE = P.bodyRestitution
console.log(`\n(2) hard slam (gentle-settle rest height = ${restHeight.toFixed(3)} m):`)
for (const eReq of [0, E_RESTORE]) {
  P.bodyRestitution = eReq
  console.log(`  ── bodyRestitution = ${eReq.toFixed(2)} ${eReq === 0 ? '(fully plastic — the old BUG-27 thud)' : ''}`)
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
    // Ballistic apex the earned rebound permits, over the resting contact height.
    const apexAllowed = restHeight + (eReq * Math.abs(impactVy)) ** 2 / (2 * G) + 0.05
    console.log(`  v0=${String(v0).padStart(4)} m/s: impactVy=${impactVy.toFixed(2)}  reboundUp=${peakReboundUp.toFixed(3)}  ` +
      `e_eff=${eEff.toFixed(3)} (KE return ${(energyReturn * 100).toFixed(2)}%)  apex=${apex.toFixed(3)} m  ` +
      `E_pre=${ePreImpact.toFixed(0)}→E_postPeak=${peakPostE.toFixed(0)} J`)
    ok(eEff <= eReq + 0.03,
      `e=${eReq} v0=${v0}: restitution NOT amplified (e_eff ${eEff.toFixed(3)} ≤ ${(eReq + 0.03).toFixed(2)}) — BUG-27 regression`)
    if (eReq > 0) {
      ok(eEff >= eReq - 0.05,
        `e=${eReq} v0=${v0}: requested bounce delivered (e_eff ${eEff.toFixed(3)} ≥ ${(eReq - 0.05).toFixed(2)})`)
    }
    ok(apex <= apexAllowed,
      `e=${eReq} v0=${v0}: no launch (apex ${apex.toFixed(3)} m ≤ ballistic allowance ${apexAllowed.toFixed(3)} m)`)
    ok(peakPostE <= ePreImpact + E_TOL_REL * Math.abs(ePreImpact),
      `e=${eReq} v0=${v0}: no energy gain across impact (peak post ${peakPostE.toFixed(0)} ≤ pre-impact ${ePreImpact.toFixed(0)} J)`)
  }
}
P.bodyRestitution = E_RESTORE   // sweep mutates the shared params object — restore for section (3)

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
console.log('BODY-CONTACT-ENERGY: PASS — restitution honored not amplified, no launch, no energy gain, rest is stable ✓')
