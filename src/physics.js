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

// Dead zone for velocity-gated W/S switching. Below this speed (m/s) the car is
// treated as "at rest" so the drive/brake mode doesn't flip twitchily near zero.
const DRIVE_DEAD_ZONE = 0.5  // m/s

/**
 * Compute drive/brake torque for a single wheel.
 *
 * Phase 1 stub — returns flat torque values from RANGER_PARAMS constants.
 * Phase 2+ replaces this with a real drivetrain model (torque curves, differential, gear ratios).
 * Signature is locked per D-06/M1-14 — Phase 2 replaces body only, call sites do not change.
 *
 * Velocity-gated semantics (requires params._longitudinalVelocity set by physics.js before call):
 *   W key: drive forward (RWD rear) when longVel > -DEAD_ZONE, brake all wheels when longVel < -DEAD_ZONE
 *   S key: drive reverse (RWD rear) when longVel < +DEAD_ZONE, brake all wheels when longVel > +DEAD_ZONE
 *
 * @param {number} wheelIndex - 0-3 per GLOSSARY.md §Wheel Index (0=FL, 1=FR, 2=RL, 3=RR).
 * @param {object} vehicleState - Full vehicleState; uses .throttle [0,1] and .brake [0,1] fields.
 * @param {object} params - RANGER_PARAMS augmented with params._longitudinalVelocity [m/s]
 *   (set by physics.js per-wheel loop before this call). Uses .maxDriveTorque, .maxReverseTorque,
 *   .maxBrakeTorque [N·m].
 * @returns {number} Torque [N·m] to apply at this wheel. Positive = drive forward.
 *   Phase 2+ replaces this with a real drivetrain model.
 */
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  const longVel = params._longitudinalVelocity || 0

  if (vehicleState.throttle > 0) {
    // W: forward drive above dead zone; brake all wheels when moving backward
    if (longVel < -DRIVE_DEAD_ZONE) {
      return vehicleState.throttle * params.maxBrakeTorque       // all wheels brake from reverse
    }
    return isRear ? vehicleState.throttle * params.maxDriveTorque : 0  // RWD drive forward
  }

  if (vehicleState.brake > 0) {
    // S: reverse drive below dead zone; brake all wheels when moving forward
    if (longVel > DRIVE_DEAD_ZONE) {
      return -vehicleState.brake * params.maxBrakeTorque         // all wheels brake from forward
    }
    return isRear ? -vehicleState.brake * params.maxReverseTorque : 0  // RWD drive reverse
  }

  return 0
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
  // ── Step 0: Rotation helper (needed by getWheelPosition throughout) ────────
  // Set before the ground constraint so the constraint can call getWheelPosition.
  params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)

  // ── Step 1: Ground constraint (correct last frame's penetration first) ─────
  // Applied BEFORE force accumulation so forces are computed on the corrected position.
  // This prevents the 1-frame position lag that caused visible body bounce: without this,
  // Fn was computed pre-integration while the constraint corrected post-integration,
  // leaving a mismatch that caused alternating under/over-support each frame.
  // Single-pass: find deepest penetrating contact, lift body once.
  // Per-wheel correction inside the force loop would cascade (wheel 0 lift → wheels 1-3 airborne).
  {
    let maxPenetration = 0
    for (let i = 0; i < 4; i++) {
      const cp = getWheelPosition(i, vehicleState, params)
      if (-cp.y > maxPenetration) maxPenetration = -cp.y
    }
    if (maxPenetration > 0) {
      vehicleState.position.y += maxPenetration
      if (vehicleState.velocity.y < 0) vehicleState.velocity.y = 0
      // Zero pitch and roll rate — these contribute to contact patch vertical velocity
      // (v_cp_y = velocity.y + ω.z*r.x - ω.x*r.z) and drive the rocking oscillation.
      // Yaw (angularVelocity.y) is intentional steering rotation — leave untouched.
      vehicleState.angularVelocity.x = 0
      vehicleState.angularVelocity.z = 0
    }
  }

  // ── Step 2: Body-space axes from quaternion ────────────────────────────────
  // NEVER use bodyMesh.rotation for body orientation (CLAUDE.md §What NOT to Use, GLOSSARY.md).
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleState.quaternion)
  const up      = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleState.quaternion)

  // ── Step 3: Per-wheel force accumulation ──────────────────────────────────
  const totalForce  = new THREE.Vector3(0, -params.mass * 9.81, 0)  // gravity
  const totalTorque = new THREE.Vector3()

  for (let i = 0; i < 4; i++) {
    // a. Contact patch world position (do NOT mutate vehicleState.position in this loop)
    const contactPt  = getWheelPosition(i, vehicleState, params)
    const contactVec = new THREE.Vector3(contactPt.x, contactPt.y, contactPt.z)
    const rVec       = contactVec.clone().sub(vehicleState.position)

    // b. Ground normal force — 5mm tolerance absorbs floating-point fuzz so a wheel
    //    sitting at y=+0.001 (just above ground) still registers as grounded.
    //    Uses weight-distributed Fn so front/rear Fn torques cancel at equilibrium.
    //    (equal mass*g/4 does NOT cancel because axle offsets are asymmetric — Bug 1/2 fix)
    const isGrounded = contactPt.y <= 0.005
    const Fn = isGrounded ? computeNormalForce(i, vehicleState, params) : 0
    if (isGrounded) {
      totalForce.y  += Fn
      totalTorque.x -= rVec.z * Fn   // r × (0,Fn,0): pitch restoring (τ.x → inertiaPitch)
      totalTorque.z += rVec.x * Fn   // r × (0,Fn,0): roll restoring  (τ.z → inertiaRoll)
    }

    // c. Contact patch velocity = velocity + angularVelocity × r
    const contactVel = vehicleState.velocity.clone().add(
      new THREE.Vector3().crossVectors(vehicleState.angularVelocity, rVec)
    )

    // d. Wheel-frame velocity components
    const steer = (i < 2 && vehicleState.wheelSteerAngles)
      ? vehicleState.wheelSteerAngles[i]
      : (i < 2 ? vehicleState.steerAngle : 0)

    const steerQ     = new THREE.Quaternion().setFromAxisAngle(up, steer)
    const wheelFwd   = forward.clone().applyQuaternion(steerQ)
    const wheelRight = right.clone().applyQuaternion(steerQ)

    const longVel = contactVel.dot(wheelFwd)
    const latVel  = contactVel.dot(wheelRight)

    // e. Augment params before getDriveTorque so velocity-gated brake/drive logic can read longVel.
    //    _driveForce is set after so computeLongitudinalForce gets the final converted value.
    params._lateralVelocity      = latVel
    params._longitudinalVelocity = longVel

    // f. Drive force (getDriveTorque reads params._longitudinalVelocity for velocity gating)
    const driveForce = getDriveTorque(i, vehicleState, params) / params.wheelRadius
    params._driveForce = driveForce

    // g. Tire forces (zero when airborne so Fn=0 suppresses lateral/longitudinal naturally)
    const Flat  = computeLateralForce(0, Fn, params)
    const Flong = computeLongitudinalForce(0, Fn, params)

    const wheelForce = wheelFwd.clone().multiplyScalar(Flong)
    wheelForce.addScaledVector(wheelRight, Flat)
    totalForce.add(wheelForce)
    totalTorque.add(new THREE.Vector3().crossVectors(rVec, wheelForce))
  }

  // ── Step 4: Integrate linear velocity and position (symplectic integration) ──
  vehicleState.velocity.addScaledVector(totalForce, dt / params.mass)
  vehicleState.position.addScaledVector(vehicleState.velocity, dt)

  // ── Step 5: Integrate angular velocity and quaternion orientation ──────────
  // World X = lateral axis → pitch (nose up/down) → inertiaPitch
  // World Y = vertical axis → yaw (turning) → inertiaYaw
  // World Z = longitudinal axis → roll (side to side) → inertiaRoll
  vehicleState.angularVelocity.x += totalTorque.x / params.inertiaPitch * dt
  vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
  vehicleState.angularVelocity.z += totalTorque.z / params.inertiaRoll  * dt

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
