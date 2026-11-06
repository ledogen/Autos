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
import { computeStaticEquilibrium } from '../src/suspension.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const ctx = await makeEngineCtx({ position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, RANGER_PARAMS)  // FEAT-48: collider-free world — wheels ride the analytic mock; the engine supplies gravity + integration
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

  const eq = computeStaticEquilibrium(P)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N)
  const cg0 = new THREE.Vector3(0, surfaceY(0, 0), 0).addScaledVector(N, eq.bodyY)
  const vs = {
    position: cg0.clone(), velocity: new THREE.Vector3(),
    quaternion: quat.clone(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 1, brake: 0, smoothThrottle: 1, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
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
  let prevGear = opts.initGear ?? 1, lastCoupled = 0
  for (let s = 1; s <= steps; s++) {
    vs.throttle = opts.throttleAt ? opts.throttleAt(s * DT, prevV) : 1; vs.brake = 0   // full throttle unless a pedal is given (t, road speed)
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const vfwd = vs.velocity.dot(fwd)
    const accel = (vfwd - prevV) / DT; prevV = vfwd
    const driveT = P._driveTorque ? P._driveTorque[2] : 0
    if (s > 3) minDriveT = Math.min(minDriveT, driveT)   // skip first ticks (RPM settling)
    if (vs.drivetrain.activeGear !== prevGear) { gearChanges.push({ t: s * DT, from: prevGear, to: vs.drivetrain.activeGear, rpm: lastCoupled }); prevGear = vs.drivetrain.activeGear }
    lastCoupled = vs.drivetrain.coupledRPM
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

// ── Scenario 8 (FEAT-150): the box leaves 1st at its own schedule point, and kicks down with headroom ──
// Owner 2026-10-25: "really struggles to get out of first" — the anti-hunt band, judged on the 1→2 landing
// rpm alone, held 1st to ~3800 rpm at half pedal on the flat (the schedule says ~2850). And "prefers to lug
// 3rd instead of downshifting to 2nd at full throttle even if there is rpm headroom".
{
  console.log('\nScenario 8: half-pedal launch on the flat; floored in 3rd with headroom in 2nd')
  const P = freshParams(), th = 0.5
  const sched = P.shiftUpLightRPM + th ** (P.shiftThrottleCurve ?? 2) * (P.shiftUpRPM - P.shiftUpLightRPM)
  const { gearChanges } = runScenario(0, 15 * 60, 'half', { throttleAt: () => th })
  const up = gearChanges.find(g => g.from === 1 && g.to === 2)
  console.log(`  50 % pedal: 1→2 at ${up ? up.rpm.toFixed(0) : '—'} rpm coupled (schedule ${sched.toFixed(0)})`)
  if (up && Math.abs(up.rpm - sched) < 0.05 * sched) pass('leaves 1st at its schedule point (within 5 %), not held by the band')
  else fail(`held in 1st past the schedule (${up ? up.rpm.toFixed(0) : 'never'} vs ${sched.toFixed(0)} rpm)`)
  // 3rd at 2600 coupled: 2nd would turn 2600 × 1.47 ≈ 3820, ≥ 1500 rpm under the floored upshift point
  const r = P.gearRatios, v3 = 2600 / (r[2] * P.finalDrive * 60 / (2 * Math.PI) / P.wheelRadius)
  const kd = runScenario(0, 3 * 60, 'kick3', { initVfwd: v3, initGear: 3, throttleAt: () => 1 })
  const down = kd.gearChanges.find(g => g.from === 3 && g.to === 2)
  console.log(`  floored in 3rd at 2600 coupled (2nd would turn ${(2600 * r[1] / r[2]).toFixed(0)}): ${down ? `kicked down at ${down.t.toFixed(2)} s` : 'lugged 3rd'}`)
  if (down) pass('kicks down to 2nd when 2nd has the headroom')
  else fail('lugs 3rd with 1500+ rpm of headroom in 2nd')
}

// ── Scenario 9 (FEAT-150, owner 2026-11-06: "we want a kickdown but we also want overdrive at partial
// throttle"): a driver holding a speed on the flat (a cruise control from rest) settles without a shift
// after 40 s at every speed, and in overdrive (4th) at part throttle from 80 km/h; cruising in 4th, a
// floored pedal kicks down within half a second. Measured 2026-11-06: 50 / 60 / 70 km/h hold 3rd (1570 /
// 1879 / 2189 rpm, 17–21 % pedal), 80 / 100 hold 4th (1734 / 2165 rpm, 35 / 44 %); floored from 4th at
// 65 / 80 / 100 km/h, 4→3 after 0.32 / 0.40 / 0.40 s. A deep stab short of the floor waits on the throttle
// average: 85 % → 1.10 s, 70 % → 1.65 s.
{
  console.log('\nScenario 9: holding a speed on the flat; a floored pedal from a 4th-gear cruise')
  for (const kmh of [50, 60, 70, 80, 100]) {
    const cc = (t, v) => Math.max(0, Math.min(1, 0.15 + 0.25 * (kmh / 3.6 - v)))
    const { gearChanges, samples } = runScenario(0, 60 * 60, 'cruise', { throttleAt: cc })
    const late = gearChanges.filter(g => g.t > 40), end = samples.at(-1)
    const pedal = samples.slice(-600).reduce((a, x) => a + cc(0, x.vfwd), 0) / 600
    console.log(`  ${kmh} km/h: ${end.gear === 4 ? 'overdrive' : `gear ${end.gear}`} at ${(end.vfwd * 3.6).toFixed(1)} km/h, ~${(pedal * 100).toFixed(0)} % pedal; ${late.length} shift(s) after 40 s`)
    if (late.length) fail(`holding ${kmh} km/h hunts: ${late.map(g => g.from + '→' + g.to).join(' ')}`)
    if (kmh >= 80 && !(end.gear === 4 && pedal < 0.6)) fail(`holding ${kmh} km/h is not overdrive at part throttle (gear ${end.gear}, ${(pedal * 100).toFixed(0)} %)`)
  }
  for (const kmh of [65, 80, 100]) {
    const { gearChanges } = runScenario(0, 8 * 60, 'kick', { initVfwd: kmh / 3.6, initGear: 4, throttleAt: (t) => t < 5 ? 0.25 : 1 })
    const held = !gearChanges.some(g => g.t < 5), down = gearChanges.find(g => g.t >= 5 && g.from === 4 && g.to === 3)
    console.log(`  ${kmh} km/h in 4th at 25 %${held ? '' : ' (did not hold 4th)'}, floored: ${down ? `4→3 after ${(down.t - 5).toFixed(2)} s` : 'no kickdown'}`)
    if (!held) fail(`a 25 % cruise at ${kmh} km/h left overdrive`)
    if (!down || down.t - 5 > 0.5) fail(`floored at ${kmh} km/h in 4th: ${down ? `kicked down only after ${(down.t - 5).toFixed(2)} s` : 'no kickdown'}`)
  }
  pass('holding a speed never hunts; overdrive from 80 km/h at part throttle; a floored pedal kicks down within 0.5 s')
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
