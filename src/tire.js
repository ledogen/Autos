/**
 * src/tire.js — Phase 1 tire module.
 *
 * Exports the locked signatures for Phase 3 Pacejka replacement (D-05, D-06).
 * Phase 1 bodies use velocity damping (D-08, D-09).
 *
 * Caller (physics.js) passes per-wheel velocity components via augmented params fields:
 *   params._lateralVelocity      [m/s] — lateral contact patch speed (wheel right direction)
 *   params._longitudinalVelocity [m/s] — longitudinal contact patch speed (wheel forward direction)
 *   params._driveForce           [N]   — drive force already converted from getDriveTorque torque
 *
 * Do NOT import Three.js — this module is pure math.
 *
 * Conventions: see docs/GLOSSARY.md
 */

/**
 * Compute lateral (side) force at this wheel's contact patch.
 *
 * @param {number} slipAngle - [rad] tire slip angle; sign convention in GLOSSARY.md §Slip Angle.
 *   Positive = contact patch velocity points to the wheel's left. Unused in Phase 1.
 * @param {number} Fz - [N] normal force on this wheel from suspension. Unused in Phase 1 damping.
 * @param {object} params - RANGER_PARAMS augmented with:
 *   params._lateralVelocity [m/s] (lateral component of contact patch velocity in wheel's right
 *   direction, computed by physics.js before calling). Phase 3 will use slipAngle and Fz via
 *   Pacejka Magic Formula instead.
 * @returns {number} Fy [N] lateral force. Positive = in wheel's right (+X body direction).
 *   Sign: opposes lateral velocity (damping) — if velocity is positive (rightward), force is
 *   negative (leftward), pulling the car back.
 *
 * Phase 3 replacement: Pacejka Magic Formula Fy = D * sin(C * atan(B * slipAngle − E * (B * slipAngle − atan(B * slipAngle))))
 * scaled by Fz. Phase 3 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeLateralForce (slipAngle, Fz, params) {
  // Phase 1: force proportional to lateral velocity at contact patch — damps sideslip.
  // lateralDampingCoeff [N/(m/s)] set in data/ranger.js, exposed as debug slider (D-10).
  return -params.lateralDampingCoeff * (params._lateralVelocity || 0)
}

/**
 * Compute longitudinal (drive/brake/rolling resistance) force at this wheel's contact patch.
 *
 * @param {number} slipRatio - [-] longitudinal slip ratio (ω·r − v_x) / max(ω·r, v_x).
 *   Unused in Phase 1. See GLOSSARY.md §Longitudinal slip ratio (deferred to Phase 3).
 * @param {number} Fz - [N] normal force on this wheel from suspension. Unused in Phase 1 damping.
 * @param {object} params - RANGER_PARAMS augmented with:
 *   params._longitudinalVelocity [m/s] (longitudinal contact patch speed in wheel forward direction)
 *   params._driveForce [N] (drive force contributed by getDriveTorque, already converted to force
 *   by physics.js via F = T / r). Phase 3 will use slipRatio and Fz via Pacejka Magic Formula instead.
 * @returns {number} Fx [N] longitudinal force. Positive = forward (along wheel heading, which is
 *   in the -Z world direction at heading 0). Rolling resistance opposes motion; drive force adds to it.
 *
 * Phase 3 replacement: Pacejka Magic Formula Fx vs slip ratio, scaled by Fz.
 * Phase 3 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeLongitudinalForce (slipRatio, Fz, params) {
  // Phase 1: rolling resistance drag proportional to longitudinal speed, plus drive force.
  // rollingResistanceCoeff [N/(m/s)] set in data/ranger.js, exposed as debug slider (D-10).
  const rollingDrag = -params.rollingResistanceCoeff * (params._longitudinalVelocity || 0)
  return rollingDrag + (params._driveForce || 0)
}
