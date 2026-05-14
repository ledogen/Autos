/**
 * src/physics.js — Physics integrator for RangerSim.
 *
 * 6DOF rigid body step using quaternion orientation (see GLOSSARY.md §Quaternion Integration Convention).
 * Imports computeLateralForce/computeLongitudinalForce from tire.js and
 * computeNormalForce/getWheelPosition from suspension.js.
 * Call sites must not change when Phase 3/4 replace those bodies.
 *
 * Exports:
 *   stepPhysics(vehicleState, params, dt) — mutates vehicleState in-place each fixed step
 *   getDriveTorque(wheelIndex, vehicleState, params) — Phase 1 RWD flat torque stub (M1-14)
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden: body rotation must always use THREE.Quaternion, never bodyMesh.rotation or axis angles
 * stored as scalars (CLAUDE.md §What NOT to Use — gimbal lock prevention)
 */

import * as THREE from 'three'
import { computeLateralForce, computeLongitudinalForce } from './tire.js'
import { computeNormalForce, getWheelPosition } from './suspension.js'

/**
 * Compute drive/brake torque for a single wheel.
 *
 * Phase 1 stub — returns flat torque values from RANGER_PARAMS constants.
 * Phase 2+ replaces this with a real drivetrain model (torque curves, differential, gear ratios).
 * Signature is locked per D-06/M1-14 — Phase 2 replaces body only, call sites do not change.
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - Full vehicleState; uses .throttle [0,1] and .brake [0,1] fields.
 * @param {object} params - RANGER_PARAMS; uses .maxDriveTorque [N·m] and .maxBrakeTorque [N·m].
 * @returns {number} Torque [N·m] to apply at this wheel. Positive = drive forward.
 *   Phase 1: rear wheels only (RWD — indices 2 and 3) receive drive torque.
 *   All 4 wheels receive brake torque (negative, opposes forward motion).
 *   Phase 2+ replaces this with a real drivetrain model.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  const driveTorque = isRear ? vehicleState.throttle * params.maxDriveTorque : 0
  // S key: reverse uses maxReverseTorque (symmetric to forward), not maxBrakeTorque (Bug 4 fix)
  // Rear wheels receive reverse torque; front wheels brake only.
  const brakeTorque = isRear
    ? -vehicleState.brake * params.maxReverseTorque
    : -vehicleState.brake * params.maxBrakeTorque
  return driveTorque + brakeTorque
}

/**
 * Advance vehicle physics state by one fixed timestep.
 *
 * Performs 6DOF integration: force/torque accumulation from 4 tire contact patches,
 * velocity/position integration, quaternion orientation integration,
 * and ground constraint enforcement.
 *
 * @param {object} vehicleState - Mutable vehicleState object (mutated in-place each step).
 *   Shape: { position: THREE.Vector3, velocity: THREE.Vector3, quaternion: THREE.Quaternion,
 *            angularVelocity: THREE.Vector3, steerAngle: number, throttle: number,
 *            brake: number, wheelAngles: number[4], wheelSteerAngles?: number[4] }
 * @param {object} params - RANGER_PARAMS (may be augmented with debug-slider values).
 *   NOTE: This function temporarily mutates params with _lateralVelocity, _longitudinalVelocity,
 *   _driveForce, and _rotateVector fields for the Phase 1 tire/suspension stubs. These fields
 *   are intentional (T-02-02) and are removed/replaced each step. Phase 3 removes them.
 * @param {number} dt - Fixed timestep in seconds (1/60 from game loop).
 * @returns {void} — Mutates vehicleState in-place.
 */
export function stepPhysics (vehicleState, params, dt) {
  // ── Step 1: Body-space axes from quaternion ────────────────────────────────
  // NEVER use bodyMesh.rotation for body orientation (CLAUDE.md §What NOT to Use, GLOSSARY.md).
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleState.quaternion)
  const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleState.quaternion)

  // ── Step 2: Per-wheel force accumulation ──────────────────────────────────
  // Inject the rotation helper for suspension.js (keeps suspension.js Three.js-free).
  // physics.js is the only module allowed to use Three.js for rotation math.
  params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)

  const totalForce  = new THREE.Vector3()
  const totalTorque = new THREE.Vector3()

  // ── Gravity: applied once per step outside the wheel loop ─────────────────
  totalForce.y -= params.mass * 9.81  // gravity [N] — applied once per step

  for (let i = 0; i < 4; i++) {
    // a. Contact patch world position from suspension
    const contactPt  = getWheelPosition(i, vehicleState, params)
    const contactVec = new THREE.Vector3(contactPt.x, contactPt.y, contactPt.z)

    // rVec must be computed BEFORE the penetration block so it is available for
    // angular impulse (Bug 3 fix) and Fn torque (Bug 2 fix) inside the if-block.
    const rVec = contactVec.clone().sub(vehicleState.position)

    // Rigid ground contact at y=0.
    // contactPt.y is the wheel contact patch world Y (wheel center Y minus wheelRadius
    // from getWheelPosition, which returns the contact patch center, i.e., already
    // at the bottom of the tire per suspension.js comments).
    const penetrationDepth = Math.max(0, -contactPt.y)
    let Fn = 0
    if (penetrationDepth > 0) {
      // 1. Position correction: push wheel above ground.
      vehicleState.position.y += penetrationDepth

      // 2. Angular impulse — correct both linear and angular velocity at contact point (Bug 3 fix).
      //    Contact velocity in world Y at the contact point:
      //    vContactY = velocity.y + (angVel.x * rVec.z − angVel.z * rVec.x)
      const vContactY = vehicleState.velocity.y +
        (vehicleState.angularVelocity.x * rVec.z - vehicleState.angularVelocity.z * rVec.x)
      if (vContactY < 0) {
        // Effective mass accounts for rotational inertia at contact point.
        const mEff = 1 / (1 / params.mass +
          (rVec.z * rVec.z) / params.inertiaRoll +
          (rVec.x * rVec.x) / params.inertiaPitch)
        const Jy = -vContactY * mEff   // impulse magnitude [N·s]
        vehicleState.velocity.y        += Jy / params.mass
        vehicleState.angularVelocity.x += -rVec.z * Jy / params.inertiaRoll
        vehicleState.angularVelocity.z +=  rVec.x * Jy / params.inertiaPitch
      }

      // 3. Normal force: distribute vehicle weight equally across grounded wheels.
      //    Phase 4 replaces with spring-damper Fn.
      Fn = params.mass * 9.81 / 4

      // Bug 1 fix: add Fn to totalForce.y so gravity is balanced.
      totalForce.y += Fn

      // Bug 2 fix: Fn torque produces restoring pitch and roll moments.
      // r × Fn (world Y): x-torque from z-offset, z-torque from x-offset.
      totalTorque.x -= rVec.z * Fn   // roll restoring: x-torque from z-offset * upward Fn
      totalTorque.z += rVec.x * Fn   // pitch restoring: z-torque from x-offset * upward Fn
    }

    // b. Contact patch velocity = vehicle velocity + (angularVelocity × (contactPt − CG))
    //    (GLOSSARY.md §Contact Patch Velocity)
    const contactVel = vehicleState.velocity.clone().add(
      new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rVec)
    )

    // c. Decompose contact velocity into wheel-frame components.
    //    Front wheels use per-wheel steer angle from vehicle.js (vehicleState.wheelSteerAngles)
    //    if present; fall back to the scalar steerAngle for front, 0 for rear.
    const steer = (i < 2 && vehicleState.wheelSteerAngles)
      ? vehicleState.wheelSteerAngles[i]
      : (i < 2 ? vehicleState.steerAngle : 0)

    const steerQ    = new THREE.Quaternion().setFromAxisAngle(up, steer)
    const wheelFwd  = forward.clone().applyQuaternion(steerQ)
    const wheelRight = right.clone().applyQuaternion(steerQ)

    const longVel = contactVel.dot(wheelFwd)
    const latVel  = contactVel.dot(wheelRight)

    // d. Drive torque → longitudinal drive force (F = T / r)
    const torque     = getDriveTorque(i, vehicleState, params)
    const driveForce = torque / params.wheelRadius

    // e. Augment params for Phase 1 tire stubs (T-02-02 — intentional, single-threaded).
    //    Phase 3 removes these augmentations when Pacejka replaces the tire bodies.
    params._lateralVelocity      = latVel
    params._longitudinalVelocity = longVel
    params._driveForce           = driveForce

    // f. Tire forces from tire.js (slipAngle/slipRatio unused in Phase 1 bodies)
    const Flat  = computeLateralForce(0, Fn, params)       // lateral force [N]
    const Flong = computeLongitudinalForce(0, Fn, params)  // longitudinal force [N]

    // g. Accumulate world-frame force and torque
    const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
    wheelForce.addScaledVector(wheelRight, Flat)

    totalForce.add(wheelForce)

    // Torque contribution: rVec × wheelForce
    const torqueContrib = new THREE.Vector3().crossVectors(rVec, wheelForce)
    totalTorque.add(torqueContrib)
  }

  // ── Step 3: Integrate linear velocity and position (symplectic integration) ──
  vehicleState.velocity.addScaledVector(totalForce, dt / params.mass)
  vehicleState.position.addScaledVector(vehicleState.velocity, dt)

  // ── Step 4: Integrate angular velocity and quaternion orientation ──────────
  vehicleState.angularVelocity.x += totalTorque.x / params.inertiaRoll  * dt
  vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  vehicleState.angularVelocity.z += totalTorque.z / params.inertiaPitch * dt

  // Quaternion integration from GLOSSARY.md §Quaternion Integration Convention and RESEARCH §Pattern 3.
  // World-frame angular velocity → premultiply convention (dq * q).
  // Guard against zero angular velocity to avoid NaN in normalize (1e-10 threshold).
  const omega     = vehicleState.angularVelocity
  const angSpeed  = omega.length()
  if (angSpeed > 1e-10) {
    const axis = omega.clone().normalize()
    const dq   = new THREE.Quaternion().setFromAxisAngle(axis, angSpeed * dt)
    vehicleState.quaternion.premultiply(dq).normalize()
  }
}
