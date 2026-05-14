/**
 * src/suspension.js — Phase 1 suspension module.
 *
 * Exports the locked signatures for Phase 4 spring-damper replacement (D-05, D-06).
 * Phase 1 bodies return static values: equal weight distribution per axle, wheel positions
 * at fixed offsets from the vehicle CG.
 *
 * Do NOT import Three.js directly — caller passes a rotation helper via params._rotateVector
 * to keep this module pure math and testable outside the browser (no CDN Three.js available
 * in Node test contexts).
 *
 * getWheelPosition returns a plain {x, y, z} object, not THREE.Vector3, to avoid the Three.js
 * import dependency in this pure-math module. Physics.js wraps results in THREE.Vector3.
 *
 * Conventions: see docs/GLOSSARY.md
 * Wheel index convention (GLOSSARY.md §Wheel Index): 0=FL, 1=FR, 2=RL, 3=RR
 */

/**
 * Compute normal force on this wheel's contact patch.
 *
 * @param {number} corner - Wheel index 0-3 (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
 * @param {object} vehicleState - Full vehicleState object (position, velocity, quaternion,
 *   angularVelocity, steerAngle, throttle, brake, wheelAngles). Unused in Phase 1 static bodies.
 * @param {object} params - RANGER_PARAMS; uses params.mass [kg], params.weightFront [-],
 *   params.weightRear [-]. Phase 4 will also use spring stiffness and compression state.
 * @returns {number} Fn [N] normal force on this wheel. Positive = pushing up against wheel.
 *   Phase 4 will compute from spring compression and body acceleration (load transfer).
 *   Phase 1: static distribution — front wheels get mass * g * weightFront / 2,
 *   rear wheels get mass * g * weightRear / 2.
 *
 * Phase 4 replacement: spring-damper Fn with load transfer between corners.
 * Phase 4 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeNormalForce (corner, vehicleState, params) {
  // Phase 1: static weight distribution. No dynamic load transfer.
  // weightFront + weightRear = 1.0 (e.g., 0.55 + 0.45 for the Ranger).
  // Each axle's load is divided by 2 for the two wheels on that axle.
  const g = 9.81  // m/s²
  const isFront = corner === 0 || corner === 1
  return params.mass * g * (isFront ? params.weightFront : params.weightRear) / 2
}

/**
 * Compute world-space position of wheel contact patch center.
 *
 * NOTE on Three.js isolation strategy: This module must not import Three.js (pure-math
 * contract for testability). To rotate local offsets into world space, physics.js injects
 * a rotation helper into params before calling:
 *
 *   params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
 *
 * This keeps all Three.js usage inside physics.js while allowing suspension.js to be a
 * pure function of numbers and plain objects.
 *
 * @param {number} corner - Wheel index 0-3 (0=FL, 1=FR, 2=RL, 3=RR per GLOSSARY.md §Wheel Index).
 * @param {object} vehicleState - Full vehicleState; uses .position and .quaternion for world
 *   placement. Phase 4 will also use spring compression offsets.
 * @param {object} params - RANGER_PARAMS; uses wheelbase [m], trackFront [m], trackRear [m],
 *   cgHeight [m], wheelRadius [m], weightFront [-], weightRear [-].
 *   Also uses params._rotateVector (function) — injected by physics.js before calling.
 * @returns {{x:number, y:number, z:number}} World-space position of wheel contact patch center.
 *   Phase 4 will compute from spring-compressed ride height. Phase 1: fixed local offset rotated
 *   by vehicleState.quaternion, added to vehicleState.position.
 *
 * Phase 4 replacement: dynamic contact patch from spring-compressed suspension geometry.
 * Phase 4 replaces this body only — signature and call site in physics.js do not change.
 */
export function getWheelPosition (corner, vehicleState, params) {
  // Phase 1: fixed local offset per corner in body space.
  //
  // Car forward = -Z (GLOSSARY.md §Coordinate System). Axle positions relative to CG:
  //   Front axle longitudinal offset: -(wheelbase * weightRear) in -Z direction
  //     → local Z = -(wheelbase * weightRear)
  //   Rear axle longitudinal offset: +(wheelbase * weightFront) in +Z direction
  //     → local Z = +(wheelbase * weightFront)
  //
  // Lateral offsets (X):
  //   Left wheels (FL=0, RL=2): -trackFront/2 or -trackRear/2
  //   Right wheels (FR=1, RR=3): +trackFront/2 or +trackRear/2
  //
  // Vertical: wheel contact patch center (ground level, not wheel hub center).
  //   Wheel hub center in body space = -(cgHeight - wheelRadius) in local Y.
  //   Contact patch center is at the bottom of the wheel: local Y = -cgHeight
  //   (wheel center is at y=wheelRadius above ground; ground is 0; body CG is at cgHeight)
  //   So local Y offset = -(cgHeight - wheelRadius) for wheel center hub,
  //   and -cgHeight for contact patch (bottom of tire).
  //   Phase 1 uses wheelRadius contact patch (i.e., wheel center == contact point, flat ground).

  const isFront = corner === 0 || corner === 1
  const isLeft  = corner === 0 || corner === 2

  const localX = isLeft
    ? -(isFront ? params.trackFront : params.trackRear) / 2
    :  (isFront ? params.trackFront : params.trackRear) / 2

  const localZ = isFront
    ? -(params.wheelbase * params.weightRear)
    :  (params.wheelbase * params.weightFront)

  // Contact patch center: wheel hub is at -(cgHeight - wheelRadius) in body Y,
  // contact patch is wheelRadius below hub, so: -(cgHeight - wheelRadius) - wheelRadius = -cgHeight
  const localY = -(params.cgHeight)

  // Rotate local offset into world space using the injected helper.
  // params._rotateVector is set by physics.js before calling this function.
  // If not set (e.g., in unit tests), fall back to identity (no rotation).
  const local = { x: localX, y: localY, z: localZ }
  let rotated

  if (typeof params._rotateVector === 'function') {
    rotated = params._rotateVector(local)
  } else {
    // Fallback for identity quaternion (unit tests without Three.js rotation).
    rotated = { x: localX, y: localY, z: localZ }
  }

  return {
    x: vehicleState.position.x + rotated.x,
    y: vehicleState.position.y + rotated.y,
    z: vehicleState.position.z + rotated.z
  }
}
