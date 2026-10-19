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
 * State lives on vehicleState.drivetrain = { engineRPM, gear, shiftTimer, activeGear }
 * (persists across steps for shift hysteresis + HUD). gear: 0 = reverse, 1..N = forward gear index.
 */

import { TRANSMISSIONS } from '../data/transmissions.js'

const RPM_PER_RAD = 60 / (2 * Math.PI)   // rad/s → rev/min

/**
 * Fit gearbox `key` (a data/transmissions.js entry) to the vehicle: its ratios spread over the params,
 * and a manual lands in N, clutch unlocked, no shift in flight (FEAT-126). The one path behind the
 * debug Transmission selector and the run setting (FEAT-41).
 */
export function fitTransmission (params, vehicleState, key) {
  Object.assign(params, TRANSMISSIONS[key])
  params.transmission = key
  const d = vehicleState?.drivetrain
  if (d) { d.mGear = 0; d.shiftT = 0; d.shifting = false; d.locked = false }
  params._drivenInertia = 0
}

// Input-routing threshold, shared with physics.js's brake routing: reverse engages only when clearly
// stopped/rolling back.
export const REV_THRESHOLD = 2 / 3.6     // +0.556 m/s — S drives reverse below this, brakes above it

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

// ── Engine losses (FEAT-50 fuel model's terms; FEAT-126 reads them as engine braking) ──────────────
export const P_ATM = 101.325   // kPa
/** m³ of swept volume → N·m per Pa of mean effective pressure (four-stroke: Vd / 4π). */
export const mepToNm = (engine) => engine.displacementL * 1e-3 / (4 * Math.PI)
/** Friction torque [N·m] — the Barnes-Moss friction MEP (a + b·N + c·N², N in krpm) over the swept volume. */
export const frictionNm = (engine, rpm) => { const Nk = rpm / 1000; return (engine.fmepA + engine.fmepB * Nk + engine.fmepC * Nk * Nk) * 1e3 * mepToNm(engine) }
/**
 * Closed-throttle engine DRAG [N·m]: friction + pumping against the idle vacuum (manifold at mapFloor)
 * + accessories — the losses the fuel map makes the fuel pay for, turned around into engine braking.
 * Only the manual gearbox reads it: the converter path has no engine braking.
 */
export const engineDragNm = (engine, rpm) =>
  frictionNm(engine, rpm) + engine.pumpingK * P_ATM * 1e3 * (1 - engine.mapFloor) * mepToNm(engine) + engine.accessoryNm

// Rear differential (FEAT-23): open = equal split, wheels free. LSD/locked add an internal coupling
// torque ∝ the rear wheels' speed difference that shuttles torque from the faster (spinning) wheel to
// the slower (gripping) one — clamped/viscous for LSD, stiff for locked. Total axle torque is preserved
// (couple is added to one wheel and subtracted from the other). Uses start-of-step wheel ω (operator-
// split, like the rest of stepDrivetrain). diffLockCoupling is kept ≤ ~36 so this explicit term is stable.
function splitRearAxle (T, axleTorque, vehicleState, params) {
  const perWheel = axleTorque / 2
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

  // FEAT-126: the manual gearbox is its own model (no converter, an analog clutch, engine inertia).
  // Everything above is shared and pure; branching here leaves the automatic path untouched.
  params._drivenInertia = 0   // only a locked manual clutch couples the engine's inertia to the wheels
  if (params.transmissionType === 'manual') { stepManual(vehicleState, params, dt, vForward, st, T, axleOmega, curve); return }

  // ── FEAT-33 ignition gate: OFF / CRANKING short-circuit before any combustion happens ───────────
  // vehicleState.ignition ABSENT ⇒ RUNNING. That default is load-bearing: every headless gate builds
  // a vehicleState by hand with no ignition field, so they keep seeing exactly today's drivetrain and
  // never have to crank the truck before driving it.
  const ignState = vehicleState.ignition ? vehicleState.ignition.state : 'running'
  if (ignState !== 'running') {
    let target
    if (ignState === 'cranking') {
      // Starter motor spins the engine at a fixed low speed. It makes NO drive torque — T stays all
      // zero — so cranking on a slope cannot creep the truck.
      target = params.ignitionCrankRPM ?? 250
    } else {
      // Ignition OFF. A dead engine in an automatic left in gear does NOT freewheel: above the
      // converter's coupling speed the turbine drags the impeller — and the whole engine — around, so
      // the truck coasts down on the engine's pumping and friction losses (MORE retardation than
      // idle engine braking, not less). Below that speed the fluid slips and the drag fades out,
      // which is why a key-off coast rolls freely once you are nearly stopped.
      // `couple` ∈ [0,1] is that fade; drag torque rises with the speed the dead engine is turned at.
      const couple = Math.min(1, turbineRPM / (params.engineOffCouplingRPM || 1100))
      target = (turbineRPM / couplingSR) * couple
      const dragNm = (params.engineOffDrag ?? 90) * (target / 1000) * couple
      const axleDrag = -Math.sign(axleOmega) * dragNm * totalRatio
      T[2] = axleDrag / 2
      T[3] = axleDrag / 2
    }
    // Own RPM lag, NOT engineRpmLag (which defaults to 0 = instant and would snap the tach needle
    // from idle to zero in one step). The starter picks the engine up fast; a dying engine coasts
    // down slowly on its own inertia, which is the whole sound and look of shutting a truck off.
    const tauOff = ignState === 'cranking' ? (params.ignitionCrankRpmLag ?? 0.12) : (params.engineOffRpmLag ?? 0.7)
    st.engineRPM += (target - st.engineRPM) * (1 - Math.exp(-dt / tauOff))
    if (st.engineRPM < 1) st.engineRPM = 0
    st.activeGear = reverse ? 0 : st.gear
    st.coupledRPM = turbineRPM / couplingSR
    st.fuelPowerW = 0   // no combustion while off or cranking: no fuel burned, no heat made
    return
  }

  // ── Engine RPM (quasi-static converter) ─────────────────────────────────────────────────────────
  // Idle-throttle floor lets the engine make a little torque for creep when engineIdleThrottle > 0
  // (default 0 = no creep, so BUG-20 static-slope hold is untouched at zero input).
  const pedalEff  = Math.max(pedal, params.engineIdleThrottle || 0)
  st.pedal = pedalEff   // FEAT-50: the load the fuel map reads (src/fuel.js) — the same number the torque uses
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
  // SM-3: engine wear/overheat/impact damage scales output torque at every rpm. Published by
  // src/damage.js as params._engineDamageScale; absent → 1. Kept apart from the engineTorqueScale
  // tuning slider (a param) because it is run state.
  const tune = params.engineTorqueScale ?? 1.0
  // Fuel ignores the limiter cut: a real limiter cuts fuel in brief bursts, so an engine bouncing off
  // it still burns near full throttle. Cutting heat here made a wheelspinning WOT climb — rpm pinned
  // at redline+200 — read as idle and never overheat (owner, 2026-10-17).
  const Tair = pedalEff * engineTorqueAt(engineRPM, curve) * tune
  // FEAT-50: the low-fuel sputter — a stumble takes torque for a fraction of a second (src/fuel.js
  // stepSputter publishes it; absent fuel state → 1, which every headless gate relies on).
  let Teng = pedalEff * engineTorqueAt(engineRPM, curve) * (tune * (params._engineDamageScale ?? 1.0)) * (vehicleState.fuel?.torqueScale ?? 1)
  if (engineRPM > redline) Teng *= Math.max(0, 1 - (engineRPM - redline) / 200)

  // FEAT-51: the power the FUEL is paying for [W] — the ENGINE HEAT signal (damage.js _stepTemp). The
  // fuel TANK does not read it: it burns off the rpm × pedal fuel map (src/fuel.js, FEAT-50), which
  // carries the friction, pumping and decel-cut-off terms this brake-power proxy cannot (owner
  // 2026-10-17: tank on the map, heat stays here as signed off). It is the torque the air charge supports, BEFORE damage: a worn or overheating engine burns
  // the same fuel for less work, so damage must not cool it (the fix for an overheat is lifting off).
  // engineIdlePowerW is the idle burn, which no throttle position can go below while running.
  st.fuelPowerW = Math.max(params.engineIdlePowerW ?? 7000, Tair * engineRPM / RPM_PER_RAD)

  // ── Converter output → gearbox → final drive → axle → rear wheels ───────────────────────────────
  splitRearAxle(T, dir * TR * Teng * totalRatio, vehicleState, params)

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
  // FEAT-124 (one schedule, no modes): BOTH shift points read a time-weighted throttle average, so a
  // light foot upshifts early, a floored one revs out exactly as before, and a keyboard driver
  // feathering W shifts like a pad held at the same average. The instantaneous pedal is read only for
  // KICKDOWN, and only once it has been held at the floor for kickdownDelay. A feathered W tap is
  // momentarily a floored pedal, and reading it raw kicked the box down on every tap, then the
  // release let it straight back up (2-3-2-3 hunting).
  const tauAvg = params.shiftThrottleTau ?? 1.5
  st.throttleAvg = st.throttleAvg === undefined ? throttle : st.throttleAvg + (throttle - st.throttleAvg) * (1 - Math.exp(-dt / tauAvg))
  st.floorTime = throttle >= 0.95 ? (st.floorTime || 0) + dt : 0
  if (!reverse && st.shiftTimer <= 0 && !spinLock) {
    const shiftUpWot    = params.shiftUpRPM || 4300
    const shiftUpLight  = params.shiftUpLightRPM ?? shiftUpWot
    const load          = st.throttleAvg ** (params.shiftThrottleCurve ?? 2)   // 0 light … 1 floored
    const shiftUp       = shiftUpLight + load * (shiftUpWot - shiftUpLight)
    const shiftDownBase = params.shiftDownRPM || 1300
    const kickdown      = params.kickdownRPM || 2200
    const downLoad      = st.floorTime >= (params.kickdownDelay ?? 0.4) ? 1 : st.throttleAvg
    const shiftDownEff  = shiftDownBase + downLoad * (kickdown - shiftDownBase)
    const holdTime      = params.shiftHoldTime || 0.6
    const hystWot       = params.shiftHysteresis ?? 800
    const hysteresis    = (params.shiftHysteresisLight ?? hystWot) + load * (hystWot - (params.shiftHysteresisLight ?? hystWot))
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
  st.coupledRPM = coupled   // the road-speed-in-gear proxy the shift schedule keys off (logged for tuning)
}

/**
 * FEAT-126 — the MANUAL gearbox: engine → clutch → sequential R-N-1..N box → final drive. No torque
 * converter, so the engine gets its own speed STATE (st.engineOmega, inertia params.engineInertia):
 * a slipping clutch, a dumped clutch and a stall all need the flywheel's stored energy.
 *
 * THE CLUTCH IS ANALOG HERE (owner, 2026-10-19). This model reads one number, vehicleState.clutch ∈
 * [0,1] (1 = fully engaged), and knows nothing about who sets it: a binary pad button today, an analog
 * axis later, the clutch assistant (src/clutch-assist.js) in between. Capacity Tcap = clutch ×
 * clutchMaxTorque.
 *   Slipping: the clutch passes Tcap in the slip direction; the engine integrates
 *             Je·dωe/dt = Teng − Tclutch. When the slip changes sign inside a step with enough
 *             capacity to hold the engine's torque, it LOCKS.
 *   Locked:   ωe = clutch-disc speed (quasi-static — the same simplification the converter path makes)
 *             and the engine's whole net torque goes through, until it exceeds Tcap or the clutch opens.
 * Engine net torque = pedal·WOT curve (net brake torque, as the fuel model has it) on the gas, and the
 * fuel model's own losses (engineDragNm) as ENGINE BRAKING as the throttle closes. An idle governor (an idle-air-valve stand-in) adds
 * air below idle, on top of the driver's, so the engine idles in neutral and recovers a dip.
 *
 * Shifts are synchro physics only: vehicleState.shiftRequest (±1, consumed here) is accepted while the
 * clutch is out (< clutchShiftMax), the box sits in N for manualShiftTime × _transShiftScale (a worn
 * box shifts slower — src/damage.js) and lands. With the clutch in it is REJECTED, flagged
 * st.missShift for the damage model (−2 % transmission). R only from N, at walking pace or below.
 * STALL: engaged in gear below stallRPM kills the engine (the fuel-empty kill pattern, src/fuel.js).
 *
 * st.mGear: −1 R, 0 N, 1..N. activeGear mirrors it (0 while a shift is in flight).
 */
function stepManual (vehicleState, params, dt, vForward, st, T, axleOmega, curve) {
  const gears      = params.gearRatios
  const nGears     = gears.length
  const finalDrive = params.finalDrive || 3.73
  const idle       = params.engineIdleRPM || 750
  const redline    = params.engineRedlineRPM || 5500
  const J          = params.engineInertia ?? 0.18
  const ign        = vehicleState.ignition
  const ignState   = ign ? ign.state : 'running'
  const clutch     = Math.max(0, Math.min(1, vehicleState.clutch ?? 1))
  if (st.mGear === undefined) st.mGear = 0
  if (st.engineOmega === undefined) st.engineOmega = (st.engineRPM ?? idle) / RPM_PER_RAD

  // ── Shifts (synchro): accept with the clutch out, sit in N for the shift time, land ───────────────
  const req = vehicleState.shiftRequest | 0
  vehicleState.shiftRequest = 0
  st.missShift = false
  st.stalled   = false
  if (req && !(st.shiftT > 0)) {
    const from   = st.mGear
    const target = Math.max(-1, Math.min(nGears, from + Math.sign(req)))
    if (target === from) { /* already at the end of the gate */ }
    else if (clutch > (params.clutchShiftMax ?? 0.15)) st.missShift = true          // clutch in: rejected
    else if (target === -1 && Math.abs(vForward) > REV_THRESHOLD) { /* R refused while moving */ }
    else {
      st.shiftTo = target
      st.shiftT  = (params.manualShiftTime ?? 0.25) * (params._transShiftScale ?? 1)
      st.mGear   = 0
    }
  }
  if (st.shiftT > 0) { st.shiftT -= dt; if (st.shiftT <= 0) { st.shiftT = 0; st.mGear = st.shiftTo } }
  st.shifting = st.shiftT > 0

  const g      = st.mGear
  const ratio  = g > 0 ? gears[Math.min(g, nGears) - 1] : g < 0 ? -(params.reverseRatio || 3.4) : 0
  const total  = ratio * finalDrive                 // signed: R turns the disc backwards
  const omegaC = axleOmega * total                  // clutch-disc (gearbox input) speed [rad/s]
  const inGear = g !== 0
  st.coupledRPM = Math.abs(omegaC) * RPM_PER_RAD
  st.activeGear = g

  // ── Engine off / cranking: no combustion ────────────────────────────────────────────────────────
  if (ignState !== 'running') {
    let wE = st.engineOmega
    if (ignState === 'cranking') {
      wE += ((params.ignitionCrankRPM ?? 250) / RPM_PER_RAD - wE) * (1 - Math.exp(-dt / (params.ignitionCrankRpmLag ?? 0.12)))
    } else if (inGear && clutch > 0.5) {
      // Dead engine in gear, clutch in: the wheels turn it over, and its compression and friction drag them.
      wE = Math.abs(omegaC)
      const drag = engineDragNm(params, wE * RPM_PER_RAD) * clutch
      splitRearAxle(T, -Math.sign(omegaC) * drag * total, vehicleState, params)
    } else {
      wE *= Math.exp(-dt / (params.engineOffRpmLag ?? 0.7))
    }
    st.engineOmega = wE < 1 / RPM_PER_RAD ? 0 : wE
    st.engineRPM   = st.engineOmega * RPM_PER_RAD
    st.locked      = false
    st.fuelPowerW  = 0
    st.pedal       = 0
    return
  }
  if (ign?.event === 'catch') st.engineOmega = Math.max(st.engineOmega, idle / RPM_PER_RAD)   // it caught: idling

  // ── Engine torque at the current speed ──────────────────────────────────────────────────────────
  let wE  = st.engineOmega
  const rpm = wE * RPM_PER_RAD
  const gov = Math.max(0, Math.min(1, (idle + 50 - rpm) / 200)) * (params.idleGovernorMax ?? 0.5)
  // The idle valve bypasses the throttle plate, so its air ADDS to the driver's: it also catches an rpm
  // dip under load (a lugging launch), not just a closed-throttle idle.
  const thr = Math.max(vehicleState.throttle || 0, params.engineIdleThrottle || 0)
  const pedalEff = thr + gov * (1 - thr)
  st.pedal = pedalEff
  const tune = params.engineTorqueScale ?? 1.0
  const Twot = engineTorqueAt(rpm, curve) * tune
  let Tdrive = pedalEff * Twot * (params._engineDamageScale ?? 1.0) * (vehicleState.fuel?.torqueScale ?? 1)
  if (rpm > redline) Tdrive *= Math.max(0, 1 - (rpm - redline) / 200)               // rev limiter
  // pedal × WOT is already NET brake torque (the fuel model's convention: its losses are paid out of
  // indicated torque). The losses show up on their own only as the throttle closes — engine braking —
  // faded in over the first engineBrakeFade of pedal so the torque has no step at zero.
  const Tnet = Tdrive - Math.max(0, 1 - pedalEff / (params.engineBrakeFade ?? 0.1)) * engineDragNm(params, rpm)
  st.fuelPowerW = Math.max(params.engineIdlePowerW ?? 7000, pedalEff * Twot * rpm / RPM_PER_RAD)

  // ── Clutch: slip or lock ────────────────────────────────────────────────────────────────────────
  const Tcap = inGear ? clutch * (params.clutchMaxTorque ?? 450) : 0
  let Tcl = 0
  if (st.locked && (Tcap <= 0 || Math.abs(Tnet) > Tcap)) st.locked = false
  if (st.locked) {
    wE  = omegaC
    Tcl = Tnet
  } else {
    const slip = wE - omegaC
    Tcl = Tcap > 0 ? Tcap * Math.sign(slip) : 0
    const wNext = wE + dt / J * (Tnet - Tcl)
    if (Tcap > 0 && Math.sign(wNext - omegaC) !== Math.sign(slip)) {
      // The slip crossed zero this step: the disc caught the flywheel.
      wE = omegaC
      if (Math.abs(Tnet) <= Tcap) { st.locked = true; Tcl = Tnet }
    } else wE = wNext
  }
  if (wE < 0) wE = 0                                  // an engine does not run backwards
  // Locked, the flywheel turns WITH the wheels: its inertia, reflected through the gearbox, joins the
  // rear wheels' in the wheel solver (src/physics.js). Without it a locked engine would follow every
  // tire-force jolt of a 1.22 kg·m² wheel — snapping rpm around, stalling on a launch.
  params._drivenInertia = st.locked ? J * total * total / 2 : 0
  st.engineOmega = wE
  st.engineRPM   = wE * RPM_PER_RAD

  // ── Stall: dragged below stallRPM with the clutch biting in gear ────────────────────────────────
  if (ign && inGear && clutch > 0.5 && st.engineRPM < (params.stallRPM ?? 450)) {
    ign.state = 'off'
    ign.event = 'shutoff'
    st.locked = false
    st.stalled = true
  }

  splitRearAxle(T, Tcl * total, vehicleState, params)
}
