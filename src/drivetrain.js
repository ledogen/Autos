/**
 * src/drivetrain.js — FEAT-23 Phase 1: engine → torque-converter → automatic gearbox → final drive.
 *
 * Replaces the flat-torque stub (throttle × maxDriveTorque) that could not climb steep grades
 * (only ~2170 N tractive vs ~2610 N needed at 20%) and pulled unrealistically hard at speed.
 * A gear reduction multiplies engine torque by gearRatio × finalDrive (≈9–15× in 1st) for real
 * hill-climbing grunt, while high gears drop wheel torque as road speed rises so acceleration
 * tapers realistically. The torque converter multiplies torque at low speed ratio and lets the
 * engine hold RPM while the wheels are nearly stopped — curing the stall-and-roll-back oscillation.
 *
 * SIMPLIFIED / quasi-static converter (no separate engine-inertia integration or K-factor table):
 *   engineRPM = max(idle, stallRPM(pedal), turbineRPM / couplingSR)
 * so at low wheel speed the engine sits at its pedal-dependent stall speed (high slip → high torque
 * ratio), and once the turbine outruns the stall speed the engine is coupled to it (SR → couplingSR,
 * TR → 1). Rock-solid stable, cheap, and tunable — matches the project's hand-rolled-physics constraint.
 *
 * RWD open diff (Phase 1): axle torque splits equally across the two rear wheels (indices 2,3).
 * Later FEAT-23 phases add LSD/locked diffs, 4WD, and a manual transmission.
 *
 * Pure math — no Three.js import (matches module conventions). Called once per physics step from
 * stepPhysics BEFORE the per-wheel loop; writes params._driveTorque[4] which getDriveTorque reads.
 *
 * State lives on vehicleState.drivetrain = { engineRPM, gear, shiftTimer } (persists across steps
 * for shift hysteresis + HUD). gear: 0 = reverse, 1..N = forward gear index.
 */

const RPM_PER_RAD = 60 / (2 * Math.PI)   // rad/s → rev/min

// Input-routing thresholds (mirror physics.js): reverse engages only when clearly stopped/rolling back.
const REV_THRESHOLD = 2 / 3.6            // +0.556 m/s — S drives reverse below this, brakes above it

/**
 * Interpolate the engine torque curve (piecewise-linear lookup) at a given RPM.
 * curve is an ascending array of [rpm, torqueNm] control points; clamps outside the table range.
 * @returns {number} engine torque [N·m] at wide-open throttle before scale/limiter.
 */
export function engineTorqueAt (rpm, curve) {
  const n = curve.length
  if (n === 0) return 0
  if (rpm <= curve[0][0]) return curve[0][1]
  if (rpm >= curve[n - 1][0]) return curve[n - 1][1]
  for (let i = 1; i < n; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, t0] = curve[i - 1]
      const [r1, t1] = curve[i]
      const f = (rpm - r0) / (r1 - r0)
      return t0 + f * (t1 - t0)
    }
  }
  return curve[n - 1][1]
}

/**
 * Step the drivetrain one fixed timestep and write per-wheel drive torque into params._driveTorque.
 *
 * @param {object} vehicleState - uses .throttle, .brake (reverse pedal), .wheelOmega[2,3], .drivetrain.
 * @param {object} params - RANGER_PARAMS (drivetrain fields below); mutates params._driveTorque[4].
 * @param {number} dt - fixed timestep [s].
 * @param {number} vForward - vehicle CG longitudinal speed [m/s] (velocity · forward); signed.
 */
export function stepDrivetrain (vehicleState, params, dt, vForward) {
  // Ensure scratch + state exist.
  const T = params._driveTorque || (params._driveTorque = [0, 0, 0, 0])
  T[0] = 0; T[1] = 0; T[2] = 0; T[3] = 0
  const st = vehicleState.drivetrain || (vehicleState.drivetrain = { engineRPM: params.engineIdleRPM || 750, gear: 1, shiftTimer: 0 })

  const gears      = params.gearRatios || [2.47, 1.47, 1.0, 0.71]
  const nGears     = gears.length
  const finalDrive = params.finalDrive || 3.73
  const idle       = params.engineIdleRPM || 750
  const redline    = params.engineRedlineRPM || 5500
  const couplingSR = params.converterCouplingSR || 0.86
  const stallTR    = params.converterStallTorqueRatio || 2.0
  const stallRPMwot = params.converterStallRPM || 2400
  const curve      = params.engineTorqueCurve || [[800, 160], [3750, 250], [5800, 150]]
  const scale      = params.engineTorqueScale ?? 1.0

  const throttle = vehicleState.throttle || 0
  const brake    = vehicleState.brake || 0

  // ── Mode: reverse only when the S-pedal is down, no throttle, and stopped/rolling back ──────────
  const reverse = throttle <= 0 && brake > 0 && vForward <= REV_THRESHOLD
  st.shiftTimer = Math.max(0, (st.shiftTimer || 0) - dt)

  // Clamp forward gear index into range.
  if (st.gear < 1) st.gear = 1
  if (st.gear > nGears) st.gear = nGears

  const dir   = reverse ? -1 : 1
  const ratio = reverse ? (params.reverseRatio || 2.47) : gears[st.gear - 1]
  const pedal = reverse ? brake : throttle              // S is the reverse throttle
  const totalRatio = ratio * finalDrive

  // ── Turbine speed from the driven (rear) axle through the rigid gearbox ─────────────────────────
  const axleOmega  = 0.5 * ((vehicleState.wheelOmega?.[2] ?? 0) + (vehicleState.wheelOmega?.[3] ?? 0))
  const turbineRPM = Math.abs(axleOmega * totalRatio) * RPM_PER_RAD

  // ── Wheelspin monitor (FEAT-23): driven-axle surface speed vs actual ground speed ───────────────
  // On an open-diff RWD burnout the rear wheels spin far faster than the truck moves, so the coupled RPM
  // (derived from rear ω) rockets past the upshift point and the box hunts through gears mid-slide. We
  // compare the driven (rear) surface speed to a ground-speed reference — the undriven FRONT wheels (a
  // wheel-speed sensor a real system would read), floored by the CG longitudinal speed so a lifted or
  // locked front axle can't fake a low reference. The excess is wheelspin. Deliberately just a signal +
  // a shift-lock; a fuller traction-control pass can later consume st.wheelspin. The threshold sits ABOVE
  // the normal slip of hard grip (measured p90 ~6.7 m/s) but below burnout slip (~10–20 m/s), so it locks
  // shifts only during genuine wheelspin — NOT during a hard, gripping corner exit.
  const wheelR    = params.wheelRadius || 0.368
  const frontSurf = 0.5 * (Math.abs(vehicleState.wheelOmega?.[0] ?? 0) + Math.abs(vehicleState.wheelOmega?.[1] ?? 0)) * wheelR
  const rearSurf  = Math.abs(axleOmega) * wheelR
  const wheelspin = rearSurf - Math.max(frontSurf, Math.abs(vForward))
  st.wheelspin = wheelspin
  const spinLock = params.wheelspinShiftLock !== false && wheelspin > (params.wheelspinThreshold ?? 7.5)

  // ── Engine RPM (quasi-static converter) ─────────────────────────────────────────────────────────
  // Idle-throttle floor lets the engine make a little torque for creep when engineIdleThrottle > 0
  // (default 0 = no creep, so BUG-20 static-slope hold is untouched at zero input).
  const pedalEff  = Math.max(pedal, params.engineIdleThrottle || 0)
  const stallRPM  = idle + pedalEff * (stallRPMwot - idle)
  const coupled   = turbineRPM / couplingSR
  let engineTarget = Math.max(idle, stallRPM, coupled)
  if (engineTarget > redline + 200) engineTarget = redline + 200   // rev-limiter ceiling

  const tau = params.engineRpmLag || 0
  st.engineRPM = tau > 0
    ? st.engineRPM + (engineTarget - st.engineRPM) * Math.min(1, dt / tau)
    : engineTarget
  if (st.engineRPM < idle) st.engineRPM = idle
  const engineRPM = st.engineRPM

  // ── Torque converter: speed ratio → torque ratio (stall multiplication → 1:1 coupling) ──────────
  const SR = engineRPM > 1 ? Math.min(1, turbineRPM / engineRPM) : 0
  const TR = 1 + (stallTR - 1) * Math.max(0, 1 - SR / couplingSR)

  // ── Engine torque (curve × throttle × scale), with a rev-limiter cut above redline ──────────────
  let Teng = pedalEff * engineTorqueAt(engineRPM, curve) * scale
  if (engineRPM > redline) Teng *= Math.max(0, 1 - (engineRPM - redline) / 200)

  // ── Converter output → gearbox → final drive → axle → rear wheels ───────────────────────────────
  const axleTorque = dir * TR * Teng * totalRatio
  const perWheel   = axleTorque / 2

  // Rear differential (FEAT-23): open = equal split, wheels free. LSD/locked add an internal coupling
  // torque ∝ the rear wheels' speed difference that shuttles torque from the faster (spinning) wheel to
  // the slower (gripping) one — clamped/viscous for LSD, stiff for locked. Total axle torque is preserved
  // (couple is added to one wheel and subtracted from the other). Uses start-of-step wheel ω (operator-
  // split, like the rest of stepDrivetrain). diffLockCoupling is kept ≤ ~36 so this explicit term is stable.
  const mode = params.rearDiffMode || 'open'
  let couple = 0
  if (mode !== 'open') {
    const dOm = (vehicleState.wheelOmega?.[2] ?? 0) - (vehicleState.wheelOmega?.[3] ?? 0)
    if (mode === 'locked') {
      couple = (params.diffLockCoupling ?? 30) * dOm
    } else { // limited-slip
      const cap = params.diffLsdMaxTorque ?? 400
      couple = Math.max(-cap, Math.min(cap, (params.diffLsdCoupling ?? 25) * dOm))
    }
  }
  T[2] = perWheel - couple   // faster rear wheel (higher ω) sheds torque to the slower one
  T[3] = perWheel + couple

  // ── Automatic shift schedule (forward only), keyed on the ROAD-SPEED proxy `coupled` ─────────────
  // CRITICAL: shifts key off `coupled` (= turbineRPM / couplingSR, the locked/no-slip engine speed for
  // this gear = a pure function of road speed), NOT the actual engineRPM. Under throttle the converter
  // FLOORS engineRPM at the stall speed (converterStallRPM ~2400), which sits ABOVE the downshift point —
  // so keying downshifts off engineRPM let the box lug in top gear on a climb (the converter just slipped
  // instead of kicking down). `coupled` tracks how slow the wheels really are, so a grade that bogs the
  // truck now triggers a real downshift. shiftDownEff scales the downshift point UP with throttle
  // (kickdown): a light-throttle cruise downshifts late (shiftDownRPM), but flooring it raises the point
  // toward kickdownRPM so the box drops a gear into the power band instead of lugging the converter.
  // spinLock: hold the gear while the driven wheels are spinning (see wheelspin monitor above) — a
  // wheelspin-inflated coupled RPM is not real road speed, so shifting on it just hunts mid-slide.
  if (!reverse && st.shiftTimer <= 0 && !spinLock) {
    const shiftUp       = params.shiftUpRPM || 4300
    const shiftDownBase = params.shiftDownRPM || 1300
    const kickdown      = params.kickdownRPM || 2200
    const shiftDownEff  = shiftDownBase + pedalEff * (kickdown - shiftDownBase)
    const holdTime      = params.shiftHoldTime || 0.6
    const hysteresis    = params.shiftHysteresis ?? 800
    if (st.gear < nGears && coupled > shiftUp) {
      // Anti-hunt (the key hysteresis lever): only upshift if the next gear's coupled RPM would land a
      // full `shiftHysteresis` band ABOVE the current downshift point — i.e. the higher gear has real
      // headroom to hold. On a grade the truck can't push the next gear's coupled RPM that high, so the
      // upshift is BLOCKED and it stays in the lower gear instead of upshift→bog→downshift limit-cycling.
      // On the flat it accelerates right through, so this only bites where a higher gear is unsustainable.
      const nextRatio   = gears[st.gear] * finalDrive
      const nextCoupled = Math.abs(axleOmega * nextRatio) * RPM_PER_RAD / couplingSR
      if (nextCoupled > shiftDownEff + hysteresis) { st.gear++; st.shiftTimer = holdTime }
    } else if (st.gear > 1 && coupled < shiftDownEff) {
      st.gear--
      st.shiftTimer = holdTime
    }
  }

  // Expose the gear the model is actually delivering (0 = reverse) for HUD/log without losing the
  // persisted forward gear (st.gear stays the forward index so we resume in-gear after reversing).
  st.activeGear = reverse ? 0 : st.gear
  st.SR = SR
  st.TR = TR
  st.coupledRPM = coupled   // the road-speed-in-gear proxy the shift schedule keys off (logged for tuning)
}
