/**
 * src/physics.js — Physics integrator for RangerSim.
 *
 * 6DOF rigid body step using quaternion orientation (see GLOSSARY.md §Quaternion Integration Convention).
 * Imports computeLateralForce/computeLongitudinalForce from tire.js and
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
import { computeLateralForce, computeLongitudinalForce } from './tire.js'
import { computeNormalForce, getWheelPosition, getBodyContactPoints } from './suspension.js'

const DRIVE_DEAD_ZONE = 0.5  // m/s

/**
 * Compute drive/brake torque for a single wheel.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - Full vehicleState; uses .throttle and .brake.
 * @param {object} params - RANGER_PARAMS augmented with params._longitudinalVelocity [m/s].
 * @returns {number} Torque [N·m]. Positive = drive forward.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  if (vehicleState.throttle > 0) {
    if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxBrakeTorque : 0
    return isRear ? vehicleState.throttle * params.maxDriveTorque : 0
  }
  if (vehicleState.brake > 0) {
    if (longVel > DRIVE_DEAD_ZONE) return -vehicleState.brake * params.maxBrakeTorque
    return isRear ? -vehicleState.brake * params.maxReverseTorque : 0
  }
  return 0
}

/**
 * Compute brake torque for a single wheel.
 * Rear wheels receive handbrake torque when handbrake is active.
 * All four wheels receive proportional braking when brake > 0.
 * Module-private — not exported.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index.
 * @param {object} vehicleState - Full vehicleState; uses .handbrake and .brake.
 * @param {object} params - RANGER_PARAMS; uses .maxHandbrakeTorque and .maxBrakeTorque.
 * @returns {number} Brake torque [N·m]. Positive = resists forward motion.
 */
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  if (vehicleState.handbrake && isRear) return params.maxHandbrakeTorque
  if (vehicleState.brake > 0) return vehicleState.brake * params.maxBrakeTorque
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

    // Slip ratio — computed per wheel using omega integrator state (D-02, M3-02)
    const SLIP_EPSILON = 0.1  // m/s — prevents 0/0 at rest (T-03-04)
    const omegaR = (vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius
    const vx = params._longitudinalVelocity
    const slipRatio = (omegaR - vx) / Math.max(Math.abs(omegaR), Math.abs(vx), SLIP_EPSILON)

    const driveForce = getDriveTorque(i, vehicleState, params) / params.wheelRadius
    params._driveForce = driveForce

    // lastScaledFlong: friction-circle-scaled Flong from the last processed contact.
    // Zero when airborne — road reaction is 0 so drive/brake torque spin the wheel freely (CR-03).
    let lastScaledFlong = 0

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

      totalForce.addScaledVector(normal, Fn)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, normal.clone().multiplyScalar(Fn)))

      // Tire forces applied in the contact plane
      const latVel  = params._lateralVelocity  || 0
      const longVelAbs = Math.abs(params._longitudinalVelocity || 0)
      const slipAngle = Math.atan2(latVel, longVelAbs + 0.01)
      let Flat  = computeLateralForce(slipAngle, Fn, params)
      let Flong = computeLongitudinalForce(slipRatio, Fn, params)

      // Friction circle — scales Flat and Flong so combined force stays within friction budget (M3-05)
      const frictionBudget = (params.frictionCoeff || 0.9) * Fn
      const combinedForce = Math.sqrt(Flat * Flat + Flong * Flong)
      if (combinedForce > frictionBudget && combinedForce > 0) {
        const scale = frictionBudget / combinedForce
        Flat  *= scale
        Flong *= scale
      }

      // Record scaled Flong for omega integrator (must be AFTER friction-circle scaling — constraint #5/Pitfall 2)
      lastScaledFlong = Flong

      const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
      // WR-02: lateral grip opposes lateral hub velocity (resists the slide), so positive Flat from
      // computeLateralForce(positive slipAngle) must be applied along -wheelRight.
      wheelForce.addScaledVector(wheelRight, -Flat)
      totalForce.add(wheelForce)
      totalTorque.add(new THREE.Vector3().crossVectors(rContact, wheelForce))

      // Write debug data for logger — last contact wins (most steps have exactly one contact)
      if (vehicleState.wheelDebug) {
        vehicleState.wheelDebug[i].fn = Fn
        vehicleState.wheelDebug[i].fy = Flat
        vehicleState.wheelDebug[i].sa = Math.atan2(params._lateralVelocity, Math.abs(params._longitudinalVelocity || 1e-6))
        vehicleState.wheelDebug[i].c  = params._compression
      }
    }

    // Omega integrator — runs once per wheel per step, OUTSIDE the contacts loop (CR-03).
    // Uses friction-circle-SCALED lastScaledFlong as road reaction (Pitfall 2 / constraint #5).
    // Airborne: lastScaledFlong=0 → road reaction=0 → drive/brake torque spin wheel freely.
    // T-03-03: OMEGA_EPSILON prevents explicit-Euler oscillation at low combined speed.
    {
      const OMEGA_EPSILON = 0.05  // m/s combined-speed threshold — must be < SLIP_EPSILON (0.1) to avoid locking out drive torque at low speed
      const wheelInertia = params.wheelInertia || 1.22
      const driveTorque = getDriveTorque(i, vehicleState, params)
      const brakeTorque = getBrakeTorque(i, vehicleState, params)
      const roadReactionTorque = lastScaledFlong * params.wheelRadius
      const vehicleSpd = Math.abs(params._longitudinalVelocity || 0)
      const wheelSurfaceSpd = Math.abs((vehicleState.wheelOmega?.[i] ?? 0) * params.wheelRadius)
      if (vehicleSpd + wheelSurfaceSpd < OMEGA_EPSILON && contacts.length > 0) {
        // Free-rolling clamp — prevent stiffness at rest (Pattern 2, grounded only)
        vehicleState.wheelOmega[i] = (params._longitudinalVelocity || 0) / params.wheelRadius
      } else {
        vehicleState.wheelOmega[i] = (vehicleState.wheelOmega?.[i] ?? 0) +
          (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
      }
    }

    // Update omega debug field — airborne wheels still log their evolving omega (CR-03)
    if (vehicleState.wheelDebug) {
      vehicleState.wheelDebug[i].omega = vehicleState.wheelOmega[i]
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
