// test/measure-vehicle-limits.mjs — FEAT-30: measure the stock truck's performance ENVELOPE,
// headlessly, with no AI driver.
//
// This exists to calibrate PAR_REF (src/par.js). Par is a point-mass friction-circle model that
// asks exactly one question — "what speed holds radius R?" — so the measurement has to answer that
// same question about the real truck, with weight transfer, the open diff and the Pacejka curve
// folded in.
//
// WHY THERE IS NO PATH-FOLLOWING DRIVER HERE (the obvious objection):
//   The cornering tests are OPEN-LOOP CONSTANT STEER, the same way a real constant-radius skidpad
//   test is run on a real vehicle. We do NOT command a radius and try to hold a line — we lock the
//   steering, hold a speed, and MEASURE whatever circle the truck settles into (R = v / yawRate).
//   There is no line to follow, so there is no line to follow badly. Understeer and oversteer are
//   not error to be corrected, they are the output: an understeering truck simply traces a larger
//   circle than its Ackermann geometry implies, and that shows up in R.
//   The only closed loop is longitudinal — a PI on speed to balance drag. It steers nothing.
//
// WHAT THIS CANNOT MEASURE: transitions. Turn-in, trail-braking, getting an open-diff RWD truck
//   back on the power at exit — that is where a human's lap time actually goes. No envelope test
//   captures it. That gap is what the testing lab (human in the seat) is for; this harness measures
//   the ceiling, not the fraction of it a driver realizes.
//
// SM-INV-2 NOTE: these numbers are for a HUMAN to read and then freeze into PAR_REF by hand, ONCE.
//   Nothing here may become a runtime input to par.js — the moment par reads a live vehicle
//   quantity, every upgrade hands back its own reward. test/par-oracle.mjs gates that.
//
// Contact model is the clean infinite plane used by drivetrain-climb.mjs / steep-rest.mjs, so this
// measures the VEHICLE, not terrain or road effects.
//
// Run: node test/measure-vehicle-limits.mjs [--quick]
// Not a gate — a measurement instrument. Prints a table and a suggested PAR_REF.

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PAR_REF } from '../src/par.js'

const DT = 1 / 60
const G = 9.81
const QUICK = process.argv.includes('--quick')

// ── harness ─────────────────────────────────────────────────────────────────────────────────────
function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]
  return P
}

function eqOf (p) {
  const strutComp = [0, 0, 0, 0], bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const f = i < 2
    const cm = p.mass * (f ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const kS = f ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const LS = f ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    strutComp[i] = (p.mass * (f ? p.weightFront : p.weightRear) / 2) * G / kS
    const hubY = p.wheelRadius - (cm * G / p.tireStiffness)
    const bo = f ? (p.suspensionBodyOffsetFront || 0) : (p.suspensionBodyOffsetRear || 0)
    bodyYCorner[i] = hubY + (LS - strutComp[i]) + (p.cgHeight - p.wheelRadius) - bo
  }
  return { bodyY: (bodyYCorner[0] + bodyYCorner[1]) / 2, strutComp }
}

const UP = new THREE.Vector3(0, 1, 0)
const queryContacts = (cx, cy, cz, r) => {
  const gd = r - cy
  return gd > 0 ? [{ normal: UP.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
}
const queryVertexContacts = (px, py) => (py < 0 ? [{ normal: UP.clone(), depth: -py }] : [])

// A vehicle state on the flat plane, optionally already rolling at v0 (body -Z is forward).
function makeVehicle (P, v0 = 0) {
  const eq = eqOf(P)
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0].map(() => v0 / P.wheelRadius),
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  return vs
}

// Ackermann + the SPEED-SCALED STEER LIMIT, verbatim from vehicle.js (M1-08 / T-03-01). The dynamic
// clamp matters: at speed the player physically cannot command a sharp angle, so measuring past it
// would report a capability the game never offers.
function applySteer (vs, P, phiCmd) {
  const speed = Math.hypot(vs.velocity.x, vs.velocity.z)
  const maxSteer = P.maxSteerAngle / (1 + speed / P.speedSteerRef)
  const phi = Math.max(-maxSteer, Math.min(maxSteer, phiCmd))
  vs.steerAngle = phi
  if (Math.abs(phi) < 1e-6) { vs.wheelSteerAngles = [0, 0, 0, 0]; return phi }
  const s = Math.sin(phi), c = Math.cos(phi), twoL = 2 * P.wheelbase
  vs.wheelSteerAngles = [
    Math.atan(twoL * s / (twoL * c - P.trackFront * s)),
    Math.atan(twoL * s / (twoL * c + P.trackFront * s)),
    0, 0,
  ]
  return phi
}

const fwdOf = (vs) => new THREE.Vector3(0, 0, -1).applyQuaternion(vs.quaternion)
const upOf = (vs) => new THREE.Vector3(0, 1, 0).applyQuaternion(vs.quaternion)

// ── A. straight-line acceleration ───────────────────────────────────────────────────────────────
function measureAccel () {
  const P = freshParams()
  const vs = makeVehicle(P, 0)
  const marks = { t100: null, d400: null, v400: null, vMax: 0 }
  let dist = 0, t = 0
  const steps = 90 * 60
  for (let s = 0; s < steps; s++) {
    vs.throttle = 1; vs.brake = 0
    applySteer(vs, P, 0)
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    t += DT
    const v = vs.velocity.dot(fwdOf(vs))
    dist += v * DT
    if (marks.t100 === null && v >= 100 / 3.6) marks.t100 = t
    if (marks.d400 === null && dist >= 400) { marks.d400 = t; marks.v400 = v }
    marks.vMax = Math.max(marks.vMax, v)
  }
  // The constant-accel equivalent par cares about: the accel that would cover 0→100 km/h in t100.
  marks.aEquiv100 = marks.t100 ? (100 / 3.6) / marks.t100 : null
  return marks
}

// ── B. braking ──────────────────────────────────────────────────────────────────────────────────
function measureBraking (fromKph = 100) {
  const P = freshParams()
  const v0 = fromKph / 3.6
  const vs = makeVehicle(P, v0)
  let dist = 0, t = 0
  for (let s = 0; s < 60 * 60; s++) {
    vs.throttle = 0; vs.brake = 1
    applySteer(vs, P, 0)
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    const v = vs.velocity.dot(fwdOf(vs))
    if (v <= 0.2) break
    dist += v * DT; t += DT
  }
  return { from: v0, dist, time: t, aMean: t > 0 ? v0 / t : 0, aFromDist: dist > 0 ? (v0 * v0) / (2 * dist) : 0 }
}

// ── C. constant-steer skidpad ───────────────────────────────────────────────────────────────────
// Lock the steer, hold the speed, measure the circle. Returns null when the trim never settles.
function skidpad (phiCmd, targetV, { hold = 14, settle = 6 } = {}) {
  const P = freshParams()
  const vs = makeVehicle(P, targetV)
  let integ = 0
  const steps = Math.round(hold / DT), settleSteps = Math.round(settle / DT)
  const win = []   // post-settle samples: {R, ay, v}

  for (let s = 0; s < steps; s++) {
    // Ramp the steer in over the first second so the entry transient doesn't spin it before trim.
    const ramp = Math.min(1, (s * DT) / 1.0)
    applySteer(vs, P, phiCmd * ramp)

    // Longitudinal PI only — holds target speed against drag/scrub. Steers nothing.
    const v = Math.hypot(vs.velocity.x, vs.velocity.z)
    const err = targetV - v
    integ = Math.max(-1, Math.min(1, integ + err * DT * 0.25))
    const u = Math.max(-1, Math.min(1, err * 0.35 + integ))
    vs.throttle = Math.max(0, u); vs.brake = Math.max(0, -u) * 0.5

    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)

    // Departure guards: rolled over, or launched.
    if (upOf(vs).y < 0.6) return { departed: 'rollover' }
    if (vs.position.y > 2.5) return { departed: 'airborne' }

    if (s >= settleSteps) {
      const yaw = Math.abs(vs.angularVelocity.y)
      const vv = Math.hypot(vs.velocity.x, vs.velocity.z)
      if (yaw < 1e-3) { win.push({ R: Infinity, ay: 0, v: vv }); continue }
      win.push({ R: vv / yaw, ay: vv * yaw, v: vv })
    }
  }
  if (!win.length) return { departed: 'no-window' }

  // Trim quality: the circle must be steady, and the speed must actually have been held.
  const Rs = win.map(w => w.R).filter(r => isFinite(r))
  if (Rs.length < win.length * 0.9) return { departed: 'not-turning' }
  const Rmean = Rs.reduce((a, b) => a + b, 0) / Rs.length
  const Rmin = Math.min(...Rs), Rmax = Math.max(...Rs)
  const drift = (Rmax - Rmin) / Rmean
  const vMean = win.reduce((a, w) => a + w.v, 0) / win.length
  const ayMean = win.reduce((a, w) => a + w.ay, 0) / win.length
  const speedHeld = Math.abs(vMean - targetV) / targetV

  if (drift > 0.12) return { departed: `unsteady (R drift ${(drift * 100).toFixed(0)}%)`, R: Rmean }
  if (speedHeld > 0.12) return { departed: `speed not held (${vMean.toFixed(1)} vs ${targetV.toFixed(1)})`, R: Rmean }
  return { stable: true, R: Rmean, ay: ayMean, v: vMean, mu: ayMean / G, drift }
}

// For one steer angle, walk the speed up until the trim breaks. The last stable trim is the limit.
function skidpadLimit (phiCmd) {
  let best = null
  const vs0 = QUICK ? [6, 9, 12, 15, 18, 21, 24, 27] : [5, 6.5, 8, 9.5, 11, 12.5, 14, 15.5, 17, 18.5, 20, 22, 24, 26, 28, 30]
  for (const v of vs0) {
    const r = skidpad(phiCmd, v)
    if (r.stable) best = r
    else if (best) break     // it held, then broke → that's the edge
  }
  return best
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────
console.log('FEAT-30 — stock-truck performance envelope (flat plane, no driver)\n')

const acc = measureAccel()
console.log('A. STRAIGHT-LINE ACCELERATION (full throttle from rest)')
console.log(`   0→100 km/h : ${acc.t100 ? acc.t100.toFixed(2) + ' s' : 'never reached'}`)
console.log(`   400 m      : ${acc.d400 ? acc.d400.toFixed(2) + ' s @ ' + (acc.v400 * 3.6).toFixed(0) + ' km/h' : 'n/a'}`)
console.log(`   vMax       : ${acc.vMax.toFixed(1)} m/s (${(acc.vMax * 3.6).toFixed(0)} km/h)`)
console.log(`   equivalent constant accel to 100 km/h : ${acc.aEquiv100 ? acc.aEquiv100.toFixed(2) : 'n/a'} m/s²\n`)

const brk = measureBraking(100)
console.log('B. BRAKING (100 km/h → stop)')
console.log(`   distance ${brk.dist.toFixed(1)} m in ${brk.time.toFixed(2)} s`)
console.log(`   mean decel ${brk.aMean.toFixed(2)} m/s²  (from distance: ${brk.aFromDist.toFixed(2)} m/s²)\n`)

console.log('C. CONSTANT-STEER SKIDPAD (open loop — radius is measured, not commanded)')
console.log('   steer°   radius m   speed km/h    lat g    mu_eff')
const STEERS = QUICK ? [4, 8, 16, 28] : [2, 3, 4, 6, 8, 11, 15, 20, 26, 32]
const rows = []
for (const deg of STEERS) {
  const r = skidpadLimit(deg * Math.PI / 180)
  if (!r) { console.log(`   ${String(deg).padStart(5)}    — no stable trim found`); continue }
  rows.push({ deg, ...r })
  console.log(`   ${String(deg).padStart(5)}   ${r.R.toFixed(1).padStart(8)}   ${(r.v * 3.6).toFixed(1).padStart(9)}`
    + `   ${(r.ay / G).toFixed(3).padStart(7)}   ${r.mu.toFixed(3).padStart(6)}`)
}

if (rows.length) {
  const mus = rows.map(r => r.mu)
  const muMax = Math.max(...mus), muMin = Math.min(...mus)
  const tight = rows.filter(r => r.R <= 60), wide = rows.filter(r => r.R > 60)
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null
  console.log(`\n   mu across radii: ${muMin.toFixed(3)} … ${muMax.toFixed(3)}`)
  if (tight.length) console.log(`   mu tight (R ≤ 60 m): ${mean(tight.map(r => r.mu)).toFixed(3)}`)
  if (wide.length)  console.log(`   mu wide  (R > 60 m): ${mean(wide.map(r => r.mu)).toFixed(3)}`)

  // Suggested PAR_REF: a fraction of measured capability. k is the DIFFICULTY DIAL — the fraction
  // of the envelope a committed human actually realizes through transitions. 0.85/0.90 are a
  // starting guess; the lab time-trials are what set them honestly.
  const kMu = 0.85, kAccel = 0.90, kBrake = 0.85, kVmax = 0.92
  const muRef = mean(mus) * kMu
  console.log('\nSUGGESTED PAR_REF (measured × difficulty factor — freeze by hand, never wire live):')
  console.log(`   mu:    ${muRef.toFixed(2)}      (mean measured ${mean(mus).toFixed(3)} × ${kMu})`)
  if (acc.aEquiv100) console.log(`   accel: ${(acc.aEquiv100 * kAccel).toFixed(2)}      (measured ${acc.aEquiv100.toFixed(2)} × ${kAccel})`)
  console.log(`   brake: ${(brk.aFromDist * kBrake).toFixed(2)}      (measured ${brk.aFromDist.toFixed(2)} × ${kBrake})`)
  console.log(`   vMax:  ${(acc.vMax * kVmax).toFixed(1)}      (measured ${acc.vMax.toFixed(1)} × ${kVmax})`)
  // Read the LIVE constants — a hardcoded copy here goes stale the moment PAR_REF is tuned, and
  // then this footer quietly reports the wrong baseline to the next person calibrating.
  console.log(`\n   Current PAR_REF: mu ${PAR_REF.mu} / accel ${PAR_REF.accel} / brake ${PAR_REF.brake} / vMax ${PAR_REF.vMax}`)
}
