// GATE (FEAT-23): the automatic-transmission + torque-converter drivetrain climbs steep grades without
// the old stall / drive-brake oscillation, and acceleration tapers with speed instead of pulling flat.
//
// Uses the game's EXACT contact model on a clean infinite plane (verbatim from src/main.js queryContacts,
// same as test/steep-rest.mjs) so this measures the DRIVETRAIN, not terrain/road effects. Full throttle
// is held from a standstill; we check climb speed, drive-torque sign (never flips to reverse/brake under
// throttle), gear progression + no shift-hunting, and high-speed accel taper.
//
// Run: node test/drivetrain-climb.mjs        (self-checking; exits non-zero on failure)

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const DT = 1 / 60
let failures = 0
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++ }
const pass = (msg) => { console.log(`  ✓ ${msg}`) }

// Fresh params per scenario (avoid cross-test scratch bleed); scratch arrays the substep expects.
function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]
  return P
}

// Static equilibrium ride height (verbatim from steep-rest.mjs / main.js computeStaticEquilibrium).
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

// Plane sloping so that the vehicle's forward direction (body -Z) points UPHILL: surfaceY = -tan(theta)·z.
// gradePct = rise/run = tan(theta). Contact model verbatim from main.js Sierra branch.
function runScenario (gradePct, steps, label, opts = {}) {
  const P = freshParams()
  const theta = Math.atan(gradePct)
  const tanT = Math.tan(theta)
  const surfaceY = (x, z) => -tanT * z
  const N = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta))
  const queryContacts = (cx, cy, cz, r) => {
    const h = surfaceY(cx, cz); const gd = h + r - cy
    return gd > 0 ? [{ normal: N.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) }] : []
  }
  const queryVertexContacts = (px, py, pz) => {
    const h = surfaceY(px, pz)
    return py < h ? [{ normal: N.clone(), depth: h - py }] : []
  }

  const eq = eqOf(P)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N)
  const cg0 = new THREE.Vector3(0, surfaceY(0, 0), 0).addScaledVector(N, eq.bodyY)
  const vs = {
    position: cg0.clone(), velocity: new THREE.Vector3(),
    quaternion: quat.clone(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 1, brake: 0, smoothThrottle: 1, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)   // uphill unit direction

  // Optional: start already at speed in a given gear (reproduces "cruising in top gear, hit a slope").
  if (opts.initVfwd) {
    vs.velocity.copy(fwd).multiplyScalar(opts.initVfwd)
    const w0 = opts.initVfwd / P.wheelRadius
    vs.wheelOmega = [w0, w0, w0, w0]
  }
  if (opts.initGear) { vs.drivetrain.gear = opts.initGear; vs.drivetrain.activeGear = opts.initGear }

  const samples = []   // {t, vfwd, gear, rpm, driveT, accel}
  let prevV = 0
  let minDriveT = Infinity
  const gearChanges = []
  let prevGear = 1
  for (let s = 1; s <= steps; s++) {
    vs.throttle = 1; vs.brake = 0        // hold full throttle every step (no input ramp in harness)
    stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
    const vfwd = vs.velocity.dot(fwd)
    const accel = (vfwd - prevV) / DT; prevV = vfwd
    const driveT = P._driveTorque ? P._driveTorque[2] : 0
    if (s > 3) minDriveT = Math.min(minDriveT, driveT)   // skip first ticks (RPM settling)
    if (vs.drivetrain.activeGear !== prevGear) { gearChanges.push({ t: s * DT, from: prevGear, to: vs.drivetrain.activeGear }); prevGear = vs.drivetrain.activeGear }
    samples.push({ t: s * DT, vfwd, gear: vs.drivetrain.activeGear, rpm: vs.drivetrain.engineRPM, driveT, accel })
  }
  return { P, vs, samples, minDriveT, gearChanges, fwd }
}

const accelNear = (samples, targetV) => {
  let best = null, bestErr = Infinity
  for (const s of samples) { const e = Math.abs(s.vfwd - targetV); if (e < bestErr && s.vfwd > 0.5) { bestErr = e; best = s } }
  return best
}

console.log('FEAT-23 drivetrain — climb + taper gate\n')

// ── Scenario 1: FLAT — accel taper + gear progression + terminal speed ─────────────────────────────
{
  console.log('Scenario 1: FLAT (0% grade), full throttle 40 s')
  const { samples, gearChanges } = runScenario(0, 40 * 60, 'flat')
  const vTerminal = samples[samples.length - 1].vfwd
  const aLow = accelNear(samples, 5)
  const aHigh = accelNear(samples, 30)
  const maxGear = Math.max(...samples.map(s => s.gear))
  console.log(`  terminal ${vTerminal.toFixed(1)} m/s (${(vTerminal * 3.6).toFixed(0)} km/h), reached gear ${maxGear}, ${gearChanges.length} shifts`)
  console.log(`  accel @5 m/s = ${aLow ? aLow.accel.toFixed(2) : 'n/a'} m/s²,  @30 m/s = ${aHigh ? aHigh.accel.toFixed(2) : 'n/a'} m/s²`)

  if (aLow && aHigh && aHigh.accel < aLow.accel * 0.6) pass('acceleration tapers with speed (@30 < 0.6×@5)')
  else fail(`acceleration does NOT taper enough (@5=${aLow?.accel.toFixed(2)}, @30=${aHigh?.accel.toFixed(2)})`)

  if (maxGear >= 3) pass(`upshifts through the gearbox (reached gear ${maxGear})`)
  else fail(`did not upshift enough (max gear ${maxGear})`)

  if (vTerminal > 35 && vTerminal < 62) pass(`believable terminal speed (${(vTerminal * 3.6).toFixed(0)} km/h)`)
  else fail(`terminal speed unrealistic (${(vTerminal * 3.6).toFixed(0)} km/h) — expect ~130–210 km/h`)

  // No shift hunting: no gear visited, left, and re-entered within 1.5 s (dwell + hysteresis should prevent).
  let hunts = 0
  for (let i = 2; i < gearChanges.length; i++) {
    if (gearChanges[i].to === gearChanges[i - 2].to && (gearChanges[i].t - gearChanges[i - 2].t) < 1.5) hunts++
  }
  if (hunts === 0) pass('no shift hunting (no gear re-entered within 1.5 s)')
  else fail(`shift hunting detected (${hunts} rapid gear re-entries)`)
}

// ── Scenario 2: 20% grade — climbs from a stop, no drive/brake oscillation ─────────────────────────
{
  console.log('\nScenario 2: 20% grade, full throttle 20 s')
  const { samples, minDriveT } = runScenario(0.20, 20 * 60, '20%')
  const vFinal = samples.slice(-60).reduce((a, s) => a + s.vfwd, 0) / 60   // avg last 1 s
  const vMax = Math.max(...samples.map(s => s.vfwd))
  console.log(`  steady climb speed ${vFinal.toFixed(1)} m/s (${(vFinal * 3.6).toFixed(0)} km/h), peak ${vMax.toFixed(1)} m/s, min rear drive torque ${minDriveT.toFixed(0)} N·m`)
  if (vFinal > 5) pass(`climbs the 20% grade and holds a real speed (${(vFinal * 3.6).toFixed(0)} km/h)`)
  else fail(`fails to climb 20% grade (steady ${vFinal.toFixed(2)} m/s)`)
  if (minDriveT >= 0) pass('drive torque never flips negative under throttle (no drive/brake oscillation)')
  else fail(`drive torque went negative (${minDriveT.toFixed(0)} N·m) — oscillation not cured`)
}

// ── Scenario 3: 30% grade — still climbs (or at worst creeps), never oscillates ────────────────────
{
  console.log('\nScenario 3: 30% grade, full throttle 20 s')
  const { samples, minDriveT } = runScenario(0.30, 20 * 60, '30%')
  const vFinal = samples.slice(-60).reduce((a, s) => a + s.vfwd, 0) / 60
  console.log(`  steady climb speed ${vFinal.toFixed(2)} m/s (${(vFinal * 3.6).toFixed(0)} km/h), min rear drive torque ${minDriveT.toFixed(0)} N·m`)
  if (vFinal > 0) pass(`makes forward progress up the 30% grade (${vFinal.toFixed(2)} m/s)`)
  else fail(`slides backward on 30% grade (steady ${vFinal.toFixed(2)} m/s)`)
  if (minDriveT >= 0) pass('drive torque stays forward under throttle (no oscillation) on 30% grade')
  else fail(`drive torque went negative (${minDriveT.toFixed(0)} N·m) on 30% grade`)
}

// ── Scenario 4: cruising in 4th, then an 18% grade — must KICK DOWN, not lug the converter ─────────
// This is the reported bug: with shift decisions keyed on the converter-slipping engineRPM (floored at
// the stall speed), the box stayed in 4th and let the converter slip instead of downshifting on a climb.
{
  console.log('\nScenario 4: cruise at 22 m/s in 4th, then an 18% grade, full throttle (kickdown test)')
  const { samples, gearChanges } = runScenario(0.18, 20 * 60, '18%-from-4th', { initVfwd: 22, initGear: 4 })
  const minGear = Math.min(...samples.slice(15).map(s => s.gear))   // skip first ¼ s of settling
  const vFinal = samples.slice(-60).reduce((a, s) => a + s.vfwd, 0) / 60
  const settledShifts = gearChanges.filter(g => g.t > 4).length      // shifts after the first 4 s (settled)
  console.log(`  started gear 4, kicked down to gear ${minGear}, steady climb ${vFinal.toFixed(1)} m/s (${(vFinal * 3.6).toFixed(0)} km/h), ${settledShifts} shifts after settling`)
  if (minGear < 4) pass(`kicks down out of 4th on the grade (to gear ${minGear})`)
  else fail('stayed in 4th and lugged the converter — never downshifted on the climb')
  if (vFinal > 3) pass(`holds a real climbing speed after kickdown (${(vFinal * 3.6).toFixed(0)} km/h)`)
  else fail(`bogs down after the grade (${vFinal.toFixed(2)} m/s)`)
  if (settledShifts <= 1) pass('gear stays settled on the sustained grade (no hunting)')
  else fail(`gear hunts on the grade (${settledShifts} shifts after settling — hysteresis too weak)`)
}

// ── Scenario 5: grade sweep — a limit-cycle hunt guard across many grades ───────────────────────────
// For each grade, accelerate from a stop for 25 s, then measure how many shifts happen in the LAST 10 s
// (fully settled). A well-damped box holds a gear; a hunting one toggles up/down around a shift boundary.
{
  console.log('\nScenario 5: grade sweep, shifts in the settled last 10 s (hunt guard)')
  let worst = 0, worstGrade = 0
  for (const g of [0.06, 0.09, 0.12, 0.15, 0.18, 0.22]) {
    const { gearChanges, samples } = runScenario(g, 25 * 60, `sweep-${g}`)
    const tailShifts = gearChanges.filter(c => c.t > 15).length
    const gear = samples[samples.length - 1].gear
    console.log(`  grade ${(g * 100).toFixed(0)}%: settled gear ${gear}, ${tailShifts} shifts in last 10 s`)
    if (tailShifts > worst) { worst = tailShifts; worstGrade = g }
  }
  if (worst <= 1) pass(`no grade hunts once settled (worst = ${worst} shifts @ ${(worstGrade * 100).toFixed(0)}%)`)
  else fail(`hunting on a sustained grade (${worst} shifts in 10 s @ ${(worstGrade * 100).toFixed(0)}% — hysteresis too weak)`)
}

// ── Scenario 6: wheelspin shift-lock — a burnout must NOT upshift on spin-inflated coupled RPM ─────
// Reproduces the open-diff burnout from the user's log: rear ω rockets the coupled RPM past the upshift
// point while the truck barely moves. The wheelspin monitor must hold the gear; a matched (gripping)
// axle at the same coupled RPM must still upshift, proving it locks only genuine spin.
{
  console.log('\nScenario 6: open-diff burnout — wheelspin holds the gear, grip still shifts')
  const R = RANGER_PARAMS.wheelRadius
  // (a) Wheelspin: rear spinning at ~200 rad/s (73 m/s surface), fronts rolling at ~10 rad/s (3.7 m/s).
  {
    const P = freshParams()
    const vs = { throttle: 1, brake: 0, wheelOmega: [10, 10, 200, 200], drivetrain: { engineRPM: 5000, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 } }
    stepDrivetrain(vs, P, DT, 10 * R)   // vForward ≈ front surface speed (~3.7 m/s)
    console.log(`  wheelspin ${vs.drivetrain.wheelspin.toFixed(1)} m/s → gear ${vs.drivetrain.gear} (started 1)`)
    if (vs.drivetrain.gear === 1) pass('holds the gear during wheelspin (no spin-inflated upshift)')
    else fail(`upshifted during a burnout (to gear ${vs.drivetrain.gear}) — wheelspin lock failed`)
  }
  // (b) Grip: all four wheels matched at high speed, coupled RPM well past the upshift → must upshift.
  {
    const P = freshParams()
    const w = 60   // rad/s ≈ 22 m/s, coupled RPM far above shiftUp in 1st
    const vs = { throttle: 1, brake: 0, wheelOmega: [w, w, w, w], drivetrain: { engineRPM: 5000, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 } }
    stepDrivetrain(vs, P, DT, w * R)
    console.log(`  grip (matched wheels) wheelspin ${vs.drivetrain.wheelspin.toFixed(1)} m/s → gear ${vs.drivetrain.gear} (started 1)`)
    if (vs.drivetrain.gear === 2) pass('still upshifts under grip (lock does not block normal shifts)')
    else fail(`failed to upshift under grip (gear ${vs.drivetrain.gear}) — lock too aggressive`)
  }
}

// ── Scenario 7: rear differential modes — open splits equally, LSD/locked transfer to the slow wheel ─
{
  console.log('\nScenario 7: rear differential (open / limited-slip / locked)')
  const R = RANGER_PARAMS.wheelRadius
  // RL (idx 2) spinning at 60 rad/s, RR (idx 3) gripping at 20 rad/s → dΩ = +40.
  const mkState = () => ({ throttle: 1, brake: 0, wheelOmega: [40, 40, 60, 20], drivetrain: { engineRPM: 4000, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 1 } })
  const runDiff = (mode) => { const P = freshParams(); P.rearDiffMode = mode; stepDrivetrain(mkState(), P, DT, 40 * R); return { rl: P._driveTorque[2], rr: P._driveTorque[3] } }
  const open = runDiff('open'), lsd = runDiff('lsd'), lock = runDiff('locked')
  const xfer = d => (d.rr - d.rl) / 2   // torque shifted from the fast (RL) to the slow (RR) wheel
  console.log(`  open  RL=${open.rl.toFixed(0)} RR=${open.rr.toFixed(0)} (transfer ${xfer(open).toFixed(0)})`)
  console.log(`  lsd   RL=${lsd.rl.toFixed(0)} RR=${lsd.rr.toFixed(0)} (transfer ${xfer(lsd).toFixed(0)}, clamp ${RANGER_PARAMS.diffLsdMaxTorque})`)
  console.log(`  lock  RL=${lock.rl.toFixed(0)} RR=${lock.rr.toFixed(0)} (transfer ${xfer(lock).toFixed(0)})`)
  if (Math.abs(xfer(open)) < 1) pass('open diff splits torque equally (no transfer)')
  else fail(`open diff transferred torque (${xfer(open).toFixed(0)} N·m)`)
  if (xfer(lsd) > 1 && Math.abs(xfer(lsd) - RANGER_PARAMS.diffLsdMaxTorque) < 1) pass('LSD transfers to the slower wheel, clamped at the bias cap')
  else fail(`LSD transfer wrong (${xfer(lsd).toFixed(0)}, expected ${RANGER_PARAMS.diffLsdMaxTorque})`)
  if (xfer(lock) > xfer(lsd)) pass('locked diff transfers more than LSD (stiffer coupling)')
  else fail(`locked diff did not transfer more than LSD (${xfer(lock).toFixed(0)} vs ${xfer(lsd).toFixed(0)})`)
}

console.log(failures === 0 ? '\n✅ drivetrain-climb: PASS' : `\n❌ drivetrain-climb: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
