/**
 * src/physics.js — Physics integrator for RangerSim.
 *
 * 6DOF rigid body step using quaternion orientation (see GLOSSARY.md §Quaternion Integration Convention).
 * Imports computeTireForces (combined-slip Pacejka) from tire.js and
 * computeNormalForce/getWheelPosition/getBodyContactPoints from suspension.js.
 *
 * Contact model: each wheel is a sphere (hub center + wheelRadius). The caller supplies
 * queryContacts(cx, cy, cz, r) → Array<{normal, depth, contactPoint}> which returns every
 * surface the sphere overlaps. Forces are applied independently per contact, enabling
 * slopes, walls, and multiple simultaneous contacts.
 *
 * Body contact points (bumper corners) use the same queryContacts path but generate
 * normal-only force — no tire lateral/longitudinal forces.
 *
 * Exports:
 *   stepPhysics(vehicleState, params, dt, queryContacts) — mutates vehicleState in-place
 *   getDriveTorque(wheelIndex, vehicleState, params) — Phase 1 RWD flat torque stub (M1-14)
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden: body rotation must always use THREE.Quaternion, never bodyMesh.rotation
 */

import * as THREE from 'three'
import { computeTireForces } from './tire.js'
import { computeNormalForce, getWheelPosition, getBodyContactPoints, stepSuspensionSubsteps } from './suspension.js'

// Speed thresholds for input routing (rule-based, no dead-zone oscillation)
const FWD_THRESHOLD = -2 / 3.6   // -0.556 m/s: W drives above this, brakes only when clearly rolling back (mirrors REV deadband)
const REV_THRESHOLD =  2 / 3.6   //  0.556 m/s: S switches from braking to reverse above this
const HB_RAMP       =  0.3       // m/s: handbrake ramps from 0 at rest to full at this speed

/**
 * Compute drive torque for a single wheel (positive = accelerate forward spin).
 * Handles W (forward drive) and S (reverse) only — braking is in getBrakeTorque.
 *
 * W above FWD_THRESHOLD (-2 km/h): drive rear wheels forward.
 * S below REV_THRESHOLD (+2 km/h): drive rear wheels backward.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - Full vehicleState; uses .throttle and .brake.
 * @param {object} params - RANGER_PARAMS augmented with params._longitudinalVelocity [m/s].
 * @returns {number} Torque [N·m]. Positive = drive forward.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  // W: forward drive when speed is above -5 km/h
  if (vehicleState.throttle > 0 && longVel >= FWD_THRESHOLD) {
    return isRear ? vehicleState.throttle * params.maxDriveTorque : 0
  }

  // S: reverse drive when speed is below +2 km/h
  if (vehicleState.brake > 0 && longVel <= REV_THRESHOLD) {
    return isRear ? -vehicleState.brake * params.maxReverseTorque : 0
  }

  return 0
}

/**
 * Compute resistive brake torque for a single wheel (always >= 0, subtracted in integrator).
 * Handles W-braking when going backward fast, S-braking when going forward, and handbrake.
 * Module-private — not exported.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index.
 * @param {object} vehicleState - Full vehicleState; uses .throttle, .brake, .handbrake.
 * @param {object} params - RANGER_PARAMS; uses .maxBrakeTorque, .maxHandbrakeTorque.
 * @returns {number} Brake torque [N·m]. Positive = resists current wheel spin direction.
 */
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  // W below FWD_THRESHOLD (-2 km/h): brake all wheels to slow backward motion
  if (vehicleState.throttle > 0 && longVel < FWD_THRESHOLD) {
    return vehicleState.throttle * params.maxBrakeTorque
  }

  // S above REV_THRESHOLD: brake all wheels to slow forward motion
  if (vehicleState.brake > 0 && longVel > REV_THRESHOLD) {
    return vehicleState.brake * params.maxBrakeTorque
  }

  // Handbrake: rear wheels only. Ramps from 0 to full over HB_RAMP m/s to avoid impulse
  // artifacts at launch, but applies full torque at rest so the car can be held on a slope.
  if (vehicleState.handbrake && isRear) {
    const absVel = Math.abs(longVel)
    const scale  = absVel === 0 ? 1.0 : Math.min(absVel / HB_RAMP, 1.0)
    return params.maxHandbrakeTorque * scale
  }

  return 0
}

/**
 * Advance vehicle physics state by one fixed timestep.
 *
 * @param {object} vehicleState - Mutable vehicleState (mutated in-place).
 * @param {object} params - RANGER_PARAMS (may be augmented with debug-slider values).
 * @param {number} dt - Fixed timestep in seconds.
 * @param {function} queryContacts - (cx,cy,cz,r) → Array<{normal,depth,contactPoint}>.
 *   Caller (main.js) implements this against all solid geometry. Replaces the old terrain(x,z)
 *   single-contact interface to support walls, slopes, and multiple contacts per wheel.
 * @returns {void}
 */
const BODY_RESTITUTION  = 0.05  // near-zero = dead stop; slight bounce prevents micro-jitter at rest
const BODY_FRICTION_MU  = 0.6   // Coulomb friction coefficient for body contact surfaces

export function stepPhysics (vehicleState, params, dt, queryContacts, queryVertexContacts) {
  // ── Step 0: Rotation helper ────────────────────────────────────────────────
  params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)

  // ── Step 1: Catastrophic penetration failsafe ──────────────────────────────
  // Fires only for tunnelling (>0.3 m embed). Normal contact handled by spring in Step 3.
  {
    let maxEmbed = 0
    for (let i = 0; i < 4; i++) {
      const hub   = getWheelPosition(i, vehicleState, params)
      const embed = params.wheelRadius - hub.y   // positive when hub is below wheelRadius height
      if (embed > maxEmbed) maxEmbed = embed
    }
    if (maxEmbed > 0.3) {
      vehicleState.position.y += maxEmbed
      vehicleState.velocity.y  = 0
    }
  }

  // ── Step 2: Body-space axes ────────────────────────────────────────────────
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleState.quaternion)
  const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleState.quaternion)

  // ── Step 2.5: Suspension substep loop (Phase 4.1) ──────────────────────────────────────────
  // Integrates strutComp/strutCompVel at dt/N substeps. Writes:
  //   params._tireFz[i]         — strut-axis tire-spring Fz per corner (fed to Pacejka per D-06b)
  //   params._suspForceAccum[i] — averaged suspension force on body per corner (applied along body_up below)
  //   params._hubNormalXZ[i]    — X/Z residual contact normal force per corner (applied in Step 2.6 below)
  // Must run BEFORE Step 3 so Pacejka reads the post-substep tire Fz (D-08).
  stepSuspensionSubsteps(vehicleState, params, dt, queryContacts)

  // ── Step 2.6: Apply XZ contact normal forces to body (Phase 4.1 D-06a) ─────────────────────
  // _hubNormalXZ[i] is the X/Z residual of tire contact normal force — the component of contact
  // normal that is NOT along the strut axis. On flat ground (body upright) this is exactly (0,0,0).
  // On a slope, this residual pushes the body horizontally, causing the car to slide downhill.
  // Applied AFTER substep loop but BEFORE the Pacejka Step 3 loop.
  //
  // Phase 4.1 D-06 architecture:
  //   - Strut-axis component of contact normal → spring pathway (_suspForceAccum) → body via Step 3
  //   - X/Z residual → _hubNormalXZ → direct body force + torque here
  //   On flat ground: _hubNormalXZ[i] = (0,0,0) exactly — legacy m4-02/04/05/06 assertions unaffected.
  //
  // NOTE: torque arm uses hub world position as approximation for contact patch (D-06a resolution).
  // The ~0.37 m offset along the contact normal (hub to actual contact patch) contributes a small
  // torque-arm error acceptable for body forces; a future phase may add _hubContactPoint accumulator
  // for higher accuracy.
  {
    // totalForce and totalTorque are declared below in Step 3; we apply here before the per-wheel loop.
    // Use a temporary accumulator then add after Step 3 declaration — or better, declare early.
    // Solution: the Step 2.6 XZ forces are accumulated into their own temp vectors and added to the
    // Step 3 totalForce/totalTorque after those are declared. See the _xzForce/_xzTorque application below.
  }
  // Pre-compute Step 2.6 XZ contributions so they can be added after totalForce/totalTorque are declared.
  const _xzForceX = [0, 0, 0, 0]
  const _xzForceY = [0, 0, 0, 0]
  const _xzForceZ = [0, 0, 0, 0]
  const _xzTorqueX = [0, 0, 0, 0]
  const _xzTorqueY = [0, 0, 0, 0]
  const _xzTorqueZ = [0, 0, 0, 0]
  if (params._hubNormalXZ) {
    for (let i = 0; i < 4; i++) {
      const xz = params._hubNormalXZ[i]
      if (!xz || (xz.x === 0 && xz.y === 0 && xz.z === 0)) continue
      // Hub world position for torque arm (approximation per D-06a)
      const hub_i  = getWheelPosition(i, vehicleState, params)
      const rHubX  = hub_i.x - vehicleState.position.x
      const rHubY  = hub_i.y - vehicleState.position.y
      const rHubZ  = hub_i.z - vehicleState.position.z
      // Cross product rHub × F_xz for torque
      _xzForceX[i]  = xz.x
      _xzForceY[i]  = xz.y
      _xzForceZ[i]  = xz.z
      _xzTorqueX[i] = rHubY * xz.z - rHubZ * xz.y
      _xzTorqueY[i] = rHubZ * xz.x - rHubX * xz.z
      _xzTorqueZ[i] = rHubX * xz.y - rHubY * xz.x
    }
  }

  // ── Step 3: Per-wheel force accumulation ──────────────────────────────────
  const totalForce  = new THREE.Vector3(0, -params.mass * 9.81, 0)
  const totalTorque = new THREE.Vector3()
  let totalGroundFn = 0  // accumulated normal force across all wheel contacts; gates rolling resistance

  // Apply Step 2.6 pre-computed XZ contact normal forces (D-06a)
  for (let i = 0; i < 4; i++) {
    if (_xzForceX[i] !== 0 || _xzForceY[i] !== 0 || _xzForceZ[i] !== 0) {
      totalForce.x  += _xzForceX[i]
      totalForce.y  += _xzForceY[i]
      totalForce.z  += _xzForceZ[i]
      totalTorque.x += _xzTorqueX[i]
      totalTorque.y += _xzTorqueY[i]
      totalTorque.z += _xzTorqueZ[i]
    }
  }

  for (let i = 0; i < 4; i++) {
    // Phase 4: write per-wheel fz from substep result FIRST (D-12), then airborne check (D-14).
    // Zero wheelDebug for this wheel before contacts — ensures no stale values when wheel is off-ground.
    // The fz field is written from _tireFz (computed by stepSuspensionSubsteps above).
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: params._tireFz[i] || 0, strutComp: vehicleState.strutComp?.[i] ?? 0 }
    }

    // Phase 4: airborne check (D-14). If tire-spring force is zero or negative, this wheel is
    // airborne. Pacejka contacts loop is skipped for airborne wheels. The omega integrator
    // (below, outside the contacts loop) still runs for airborne wheels so drive torque can
    // rev the wheel while airborne — lastFn=0 causes Newton to converge trivially with no road
    // reaction (this was already the behavior via the `if (lastFn <= 0) break` Newton guard).
    const isAirborne = (params._tireFz[i] || 0) <= 0

    // Phase 4: compute rMount (rotated body mount point offset) for suspension body force torque.
    // Must match the local offset used in stepSuspensionSubsteps for consistency.
    const isFrontW = i < 2
    const isLeftW  = i === 0 || i === 2
    const mLocalX = isLeftW
      ? -(isFrontW ? params.trackFront : params.trackRear) / 2
      :  (isFrontW ? params.trackFront : params.trackRear) / 2
    const mLocalZ = isFrontW
      ? -(params.wheelbase * params.weightRear)
      :  (params.wheelbase * params.weightFront)
    const mLocalY = -(params.cgHeight - params.wheelRadius)
    const rMount = params._rotateVector({ x: mLocalX, y: mLocalY, z: mLocalZ })

    // Phase 4.1: apply suspension spring force to body along strut axis (body_up direction).
    // Replaces the Phase 4 world-Y force vector — on a pitched body, the strut axis is NOT world-Y.
    // Applied regardless of airborne state: suspension spring still acts on body even when wheel lifts.
    // (When airborne, suspForce may be small/negative but damping still contributes, per D-15.)
    const suspBodyForce = up.clone().multiplyScalar(params._suspForceAccum[i])
    totalForce.add(suspBodyForce)
    totalTorque.add(new THREE.Vector3().crossVectors(rMount, suspBodyForce))

    // Airborne skip (D-14): skip Pacejka contacts loop for this wheel.
    // Omega integrator below still runs (lastFn=0 causes Newton to converge with no road reaction).
    if (isAirborne) {
      // Update omega debug for airborne wheels (CR-03: all wheels log omega every step)
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega?.[i] || 0
      // Fall through to omega integrator below — do NOT `continue` past it
      // (but we still need to run the integrator, so restructure to skip only the contacts loop)
      // Use lastFn=0 to signal airborne to the omega Newton loop.
      const wheelInertia_a = params.wheelInertia || 1.22
      const driveTorque_a  = getDriveTorque(i, vehicleState, params)
      const brakeTorque_a  = getBrakeTorque(i, vehicleState, params)
      const omega0_a       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign_a     = omega0_a >= 0 ? 1 : -1
      const brakeSigned_a  = brakeTorque_a * spinSign_a
      // Airborne: no road reaction, direct Euler step (Newton trivially converges with Flong=0)
      const omegaNew_a = omega0_a + (dt / wheelInertia_a) * (driveTorque_a - brakeSigned_a)
      if (brakeTorque_a > 0 && Math.sign(omegaNew_a) !== spinSign_a) {
        vehicleState.wheelOmega[i] = 0
      } else {
        vehicleState.wheelOmega[i] = omegaNew_a
      }
      if (vehicleState.wheelDebug) vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
      continue  // skip the full Pacejka contacts loop + Newton omega below
    }

    // Hub world position (sphere center for contact queries)
    const hub  = getWheelPosition(i, vehicleState, params)
    const rHub = new THREE.Vector3(
      hub.x - vehicleState.position.x,
      hub.y - vehicleState.position.y,
      hub.z - vehicleState.position.z
    )

    // Hub velocity — used for tire slip angles
    const hubVel = vehicleState.velocity.clone().add(
      new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rHub)
    )

    // Wheel-frame axes (steered for front wheels)
    const steer = (i < 2 && vehicleState.wheelSteerAngles)
      ? vehicleState.wheelSteerAngles[i]
      : (i < 2 ? vehicleState.steerAngle : 0)
    const steerQ     = new THREE.Quaternion().setFromAxisAngle(up, steer)
    const wheelFwd   = forward.clone().applyQuaternion(steerQ)
    const wheelRight = right.clone().applyQuaternion(steerQ)

    params._lateralVelocity      = hubVel.dot(wheelRight)
    params._longitudinalVelocity = hubVel.dot(wheelFwd)

    // Slip-velocity tire model with relaxation length (see tire.js header).
    // Per-tire state: vehicleState.slipLong[i], slipLat[i] — the "filtered" slip
    // displacements (m), evolved per-step via implicit Euler on ds/dt = v_slip − s·|v|/L.
    // Lazy-init so existing vehicleState shapes still work; arrays are tiny (4 floats each).
    if (!vehicleState.slipLong) vehicleState.slipLong = [0, 0, 0, 0]
    if (!vehicleState.slipLat)  vehicleState.slipLat  = [0, 0, 0, 0]

    const SLIP_EPSILON = 0.1  // m/s — floor on contact velocity for relaxation rate

    // Per-step bookkeeping for the ω integrator (Newton-iterated implicit Euler below).
    // Zero / null when airborne so road reaction = 0.
    let lastFn          = 0
    let lastSLongPrev   = 0   // sLong_old at this step's start (for Newton re-eval of s)
    let lastSLatNew     = 0   // sLat already committed (lateral doesn't iterate with ω)
    let lastLongVelCur  = 0
    let lastRelaxDen    = 1

    // Query every surface this wheel sphere overlaps
    const contacts = queryContacts(hub.x, hub.y, hub.z, params.wheelRadius)

    for (const { normal, depth, contactPoint } of contacts) {
      const rContact = new THREE.Vector3(
        contactPoint.x - vehicleState.position.x,
        contactPoint.y - vehicleState.position.y,
        contactPoint.z - vehicleState.position.z
      )
      const contactVel = vehicleState.velocity.clone().add(
        new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
      )

      params._compression         = depth
      params._compressionVelocity = -contactVel.dot(normal)

      // Phase 4: Fn for Pacejka comes from params._tireFz[i] (computed by stepSuspensionSubsteps,
      // per D-03). computeNormalForce is now a shim that reads _tireFz[i].
      // Phase 4: body normal (vertical) force is applied via suspBodyForce above, NOT here.
      // We still track totalGroundFn for rolling resistance gating.
      const Fn = computeNormalForce(i, vehicleState, params)
      if (Fn <= 0) continue
      totalGroundFn += Fn

      // Phase 4.1 NOTE (D-06): do NOT add Fn*normal to totalForce here.
      // The strut-axis component of the contact normal flows through _suspForceAccum (spring pathway),
      // applied above via suspBodyForce = up * _suspForceAccum[i] along body_up.
      // The X/Z residual (off-axis component) flows through _hubNormalXZ, applied in Step 2.6 above.
      // This clean split ensures: on flat ground _hubNormalXZ[i] = (0,0,0) exactly →
      // existing m4-02/04/05/06 assertions remain unaffected by the Phase 4.1 changes.

      // Tire forces — slip-velocity Pacejka with relaxation length per tire.
      // The relaxation length L models tire carcass viscoelastic dynamics: the carcass
      // takes a characteristic distance L of vehicle travel to build up to its target
      // force. Implicit Euler on  ds/dt = v_slip − s·|v|/L  is unconditionally stable
      // and reduces effective stiffness dF/dω to the point where Newton-iterated implicit
      // Euler on the ω integrator (below) converges in 1-3 iterations at 60Hz.
      //
      // sLat is finalized here (depends on body lateral velocity, not on ω_new).
      // sLong is computed here at the current ω (for body-force application this step) but
      // re-evaluated and re-committed inside the ω Newton loop using the converged ω_new
      // — this is operator splitting: body force lags ω by one step, acceptable trade for
      // a clean Newton on ω alone.
      const longVelCur = params._longitudinalVelocity || 0
      const latVelCur  = params._lateralVelocity      || 0
      const omegaCur   = (vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius
      const vCon       = Math.max(Math.abs(omegaCur), Math.abs(longVelCur), SLIP_EPSILON)
      const L          = params.tireRelaxationLength || 0.3
      const relaxDen   = 1 + dt * vCon / L
      const sLongPrev  = vehicleState.slipLong[i]
      const sLatNew    = (vehicleState.slipLat[i] + dt * latVelCur) / relaxDen
      const sLongCur   = (sLongPrev + dt * (omegaCur - longVelCur)) / relaxDen
      vehicleState.slipLat[i] = sLatNew

      const { Flong, Flat } = computeTireForces(sLongCur, sLatNew, Fn, params)

      // Save state for Newton iteration in ω integrator (re-evaluates sLong and F at ω_new).
      lastFn         = Fn
      lastSLongPrev  = sLongPrev
      lastSLatNew    = sLatNew
      lastLongVelCur = longVelCur
      lastRelaxDen   = relaxDen

      const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
      // WR-02: lateral grip opposes lateral hub velocity (resists the slide), so positive Flat
      // from computeTireForces(positive slipVy) must be applied along -wheelRight.
      wheelForce.addScaledVector(wheelRight, -Flat)
      totalForce.add(wheelForce)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, wheelForce))

      // Write debug data for logger — last contact wins (most steps have exactly one contact).
      // NOTE: `sa` field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad).
      // Field name kept for log format stability; semantics document in GLOSSARY.
      if (vehicleState.wheelDebug) {
        vehicleState.wheelDebug[i].fn    = Fn
        vehicleState.wheelDebug[i].fy    = Flat
        vehicleState.wheelDebug[i].sa    = Math.hypot(sLongCur, sLatNew)
        vehicleState.wheelDebug[i].c     = params._compression
        vehicleState.wheelDebug[i].vLong = longVelCur
        vehicleState.wheelDebug[i].vLat  = latVelCur
      }
    }

    // Omega integrator — Newton-iterated implicit Euler. Runs once per wheel per step,
    // OUTSIDE the contacts loop (CR-03). Re-evaluates sLong(ω) and F_long(sLong) at each
    // Newton iteration so the iteration captures Pacejka saturation past peak — critical
    // for clean launch from rest, where a single linearized step would overshoot.
    //
    // The implicit equation we're solving for ω_new:
    //   ω_new = ω + dt/I · (T_drive − F_long(sLong_new(ω_new))·r − T_brake_signed)
    // where sLong_new(ω) = (sLong_old + dt·(ω·r − v_long)) / (1 + dt·|v_contact|/L)
    //
    // Newton converges in 1-3 iterations at 60Hz; the loop caps at 4 with a tight residual
    // tolerance. Airborne: lastFn = 0 ⇒ tireForce returns zero ⇒ ω evolves under drive/brake.
    {
      const wheelInertia = params.wheelInertia || 1.22
      const driveTorque  = getDriveTorque(i, vehicleState, params)
      const brakeTorque  = getBrakeTorque(i, vehicleState, params)
      const dsdo         = dt * params.wheelRadius / lastRelaxDen  // ∂sLong_new/∂ω_new
      const omega0       = vehicleState.wheelOmega?.[i] ?? 0
      const spinSign     = omega0 >= 0 ? 1 : -1
      const brakeSigned  = brakeTorque * spinSign

      let omegaNew = omega0
      let sLongFinal = lastSLongPrev
      for (let iter = 0; iter < 4; iter++) {
        const omegaR    = omegaNew * params.wheelRadius
        const sLongIter = (lastSLongPrev + dt * (omegaR - lastLongVelCur)) / lastRelaxDen
        sLongFinal = sLongIter
        if (lastFn <= 0) break  // airborne: no road reaction; Newton trivially converged
        const { Flong, dFmagDs } = computeTireForces(sLongIter, lastSLatNew, lastFn, params)
        const g  = omegaNew - omega0 - dt / wheelInertia * (driveTorque - Flong * params.wheelRadius - brakeSigned)
        // g'(ω) = 1 + dt·r/I · dF/dω,  with dF/dω = dFmagDs · dsdo
        const gp = 1 + dt * params.wheelRadius * dFmagDs * dsdo / wheelInertia
        const delta = g / gp
        omegaNew -= delta
        if (Math.abs(delta) < 1e-4) break
      }
      // Clamp: braking cannot reverse spin direction (brake stops the wheel, doesn't push through zero).
      // Must happen BEFORE committing sLong — if omega is clamped to 0 the Newton loop may have
      // diverged to a large unphysical omegaNew (wrong sign), so sLongFinal would be based on that
      // wrong omega. Re-evaluate sLong at the ACTUAL committed omega (0 when clamped) so the
      // slip state stays consistent with the wheel speed. Inconsistent sLong would generate a force
      // in the wrong direction on the next step (accelerating backward instead of braking).
      if (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign) {
        vehicleState.wheelOmega[i] = 0
        // Recompute sLong at omega=0 so slip state matches actual wheel speed.
        sLongFinal = (lastSLongPrev + dt * (0 - lastLongVelCur)) / lastRelaxDen
      } else {
        vehicleState.wheelOmega[i] = omegaNew
      }

      // Commit sLong after clamp so the stored value is consistent with the actual committed omega.
      vehicleState.slipLong[i] = sLongFinal
    }

    // Update omega debug field — airborne wheels still log their evolving omega (CR-03)
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
    }
  }

  // ── Step 3a: Rolling resistance — horizontal velocity-aligned drag scaled by ground load ──
  // Standard tire model: F_drag = -Cr · Σ Fn · v̂_horizontal. Vertical (Fn) carries the load,
  // so scaling by Σ Fn means the drag vanishes when airborne and matches static weight on flat ground.
  // 0.05 m/s deadband prevents creep oscillation at standstill.
  {
    const Cr = params.rollingResistanceCoeff || 0
    if (Cr > 0 && totalGroundFn > 0) {
      const vx = vehicleState.velocity.x
      const vz = vehicleState.velocity.z
      const vHoriz = Math.sqrt(vx * vx + vz * vz)
      if (vHoriz > 0.05) {
        const dragMag = Cr * totalGroundFn
        totalForce.x -= dragMag * vx / vHoriz
        totalForce.z -= dragMag * vz / vHoriz
      }
    }
  }

  // ── Step 3b: Body contact — sphere probes + impulse solver ──────────────────
  // Sphere probes at bumper corners (same geometry as before). Contact normal comes from
  // sphere-center-to-closest-triangle-point (queryContacts). Force replaced with impulse:
  // instantaneous velocity change sized to resolve the contact this step, eliminating the
  // spring-damper asymmetry bug. Baumgarte correction bleeds out residual penetration.
  {
    const BAUMGARTE_BETA = 0.25
    const SLOP = 0.005

    const bodyPts = getBodyContactPoints(vehicleState, params)
    for (const bp of bodyPts) {
      const contacts = queryContacts(bp.x, bp.y, bp.z, params.bodyContactRadius)
      for (const { normal, depth, contactPoint } of contacts) {
        const rContact = new THREE.Vector3(
          contactPoint.x - vehicleState.position.x,
          contactPoint.y - vehicleState.position.y,
          contactPoint.z - vehicleState.position.z
        )

        const vertVel = vehicleState.velocity.clone().add(
          new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
        )
        const vn = vertVel.dot(normal)

        if (vn < 0) {
          const rCrossN = new THREE.Vector3().crossVectors(rContact, normal)
          const iInvRCrossN = new THREE.Vector3(
            rCrossN.x / params.inertiaRoll,
            rCrossN.y / params.inertiaYaw,
            rCrossN.z / params.inertiaPitch
          )
          const invEffMass = 1 / params.mass + rCrossN.dot(iInvRCrossN)
          const j = -(1 + BODY_RESTITUTION) * vn / invEffMass

          vehicleState.velocity.addScaledVector(normal, j / params.mass)
          vehicleState.angularVelocity.x += iInvRCrossN.x * j
          vehicleState.angularVelocity.y += iInvRCrossN.y * j
          vehicleState.angularVelocity.z += iInvRCrossN.z * j

          // Coulomb friction — tangential impulse capped at mu * normal impulse
          const vt    = vertVel.clone().addScaledVector(normal, -vn)  // tangential velocity
          const vtMag = vt.length()
          if (vtMag > 1e-4) {
            const tDir      = vt.clone().multiplyScalar(-1 / vtMag)   // oppose sliding
            const rCrossT   = new THREE.Vector3().crossVectors(rContact, tDir)
            const iInvRCrossT = new THREE.Vector3(
              rCrossT.x / params.inertiaRoll,
              rCrossT.y / params.inertiaYaw,
              rCrossT.z / params.inertiaPitch
            )
            const invEffMassT = 1 / params.mass + rCrossT.dot(iInvRCrossT)
            const jf = Math.min(vtMag / invEffMassT, BODY_FRICTION_MU * j)

            vehicleState.velocity.addScaledVector(tDir, jf / params.mass)
            vehicleState.angularVelocity.x += iInvRCrossT.x * jf
            vehicleState.angularVelocity.y += iInvRCrossT.y * jf
            vehicleState.angularVelocity.z += iInvRCrossT.z * jf
          }
        }

        const correction = Math.max(0, depth - SLOP) * BAUMGARTE_BETA
        if (correction > 0) {
          vehicleState.position.x += normal.x * correction
          vehicleState.position.y += normal.y * correction
          vehicleState.position.z += normal.z * correction
        }
      }
    }
  }

  // ── Step 4: Integrate linear velocity and position ─────────────────────────
  vehicleState.velocity.addScaledVector(totalForce, dt / params.mass)
  vehicleState.position.addScaledVector(vehicleState.velocity, dt)

  // ── Step 5: Integrate angular velocity and quaternion orientation ──────────
  vehicleState.angularVelocity.x += totalTorque.x / params.inertiaRoll  * dt
  vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  vehicleState.angularVelocity.z += totalTorque.z / params.inertiaPitch * dt

  const omega    = vehicleState.angularVelocity
  const angSpeed = omega.length()
  if (angSpeed > 1e-10) {
    const axis = omega.clone().normalize()
    const dq   = new THREE.Quaternion().setFromAxisAngle(axis, angSpeed * dt)
    vehicleState.quaternion.premultiply(dq).normalize()
  }
}
