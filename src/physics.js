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
import { computeNormalForce, getWheelPosition, getBodyContactPoints } from './suspension.js'

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

  // Handbrake: rear wheels only, ramped so it applies zero force at rest
  if (vehicleState.handbrake && isRear) {
    const scale = Math.min(Math.abs(longVel) / HB_RAMP, 1.0)
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
export function stepPhysics (vehicleState, params, dt, queryContacts) {
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

  // ── Step 3: Per-wheel force accumulation ──────────────────────────────────
  const totalForce  = new THREE.Vector3(0, -params.mass * 9.81, 0)
  const totalTorque = new THREE.Vector3()
  let totalGroundFn = 0  // accumulated normal force across all wheel contacts; gates rolling resistance

  for (let i = 0; i < 4; i++) {
    // Zero wheelDebug for this wheel before contacts — ensures no stale values when wheel is off-ground
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i] = { fn: 0, fy: 0, sa: 0, c: 0, omega: 0 }
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

      const Fn = computeNormalForce(i, vehicleState, params)
      if (Fn <= 0) continue
      totalGroundFn += Fn

      totalForce.addScaledVector(normal, Fn)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, normal.clone().multiplyScalar(Fn)))

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
        vehicleState.wheelDebug[i].fn = Fn
        vehicleState.wheelDebug[i].fy = Flat
        vehicleState.wheelDebug[i].sa = Math.hypot(sLongNew, sLatNew)
        vehicleState.wheelDebug[i].c  = params._compression
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
      // Commit the converged sLong (or, if airborne, just keep prev s relaxed by current step).
      vehicleState.slipLong[i] = sLongFinal

      // Clamp: braking cannot reverse spin direction (brake stops the wheel, doesn't push through zero).
      if (brakeTorque > 0 && Math.sign(omegaNew) !== spinSign) {
        vehicleState.wheelOmega[i] = 0
      } else {
        vehicleState.wheelOmega[i] = omegaNew
      }
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

  // ── Step 3b: Body contact points (normal force only — no tire forces) ──────
  // Stops the car body from clipping walls and ramp faces.
  const bodyPts = getBodyContactPoints(vehicleState, params)
  for (const bp of bodyPts) {
    const contacts = queryContacts(bp.x, bp.y, bp.z, params.bodyContactRadius)
    for (const { normal, depth, contactPoint } of contacts) {
      const rContact = new THREE.Vector3(
        contactPoint.x - vehicleState.position.x,
        contactPoint.y - vehicleState.position.y,
        contactPoint.z - vehicleState.position.z
      )
      const contactVel = vehicleState.velocity.clone().add(
        new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rContact)
      )
      const Fn = Math.max(0,
        params.bodyContactStiffness * depth + params.bodyContactDamping * (-contactVel.dot(normal))
      )
      if (Fn <= 0) continue
      totalForce.addScaledVector(normal, Fn)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, normal.clone().multiplyScalar(Fn)))
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
