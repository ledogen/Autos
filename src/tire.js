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
 *   Caller (physics.js) computes atan2(latVel, |longVel| + 0.01) and passes it here.
 *   Phase 3 will pass a Pacejka-computed slip angle instead.
 * @param {number} Fz - [N] normal force on this wheel from suspension. Unused in Phase 1 linear model.
 * @param {object} params - RANGER_PARAMS augmented with:
 *   params._lateralVelocity [m/s] (used only for the low-speed dead-zone guard).
 *   params._longitudinalVelocity [m/s] (used only for the low-speed dead-zone guard).
 *   params.corneringStiffness [N/rad] — linear tire lateral stiffness.
 * @returns {number} Flat [N] lateral force proportional to slip angle times corneringStiffness.
 *   Positive = in wheel's right (+X body direction). Returns 0 when both velocity components are 0.
 *
 * Phase 3 replacement: Pacejka Magic Formula Flat = D * sin(C * atan(B * slipAngle − E * (B * slipAngle − atan(B * slipAngle))))
 * scaled by Fz. Phase 3 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeLateralForce (slipAngle, Fz, params) {
  // Phase 1: slip-angle-based linear tire model.
  // Caller passes slipAngle = atan2(latVel, |longVel| + 0.01): positive latVel (contact patch
  // rightward) → positive slip angle → negative Flat (leftward force opposing the drift).
  // The friction cap prevents saturation to ±90°.
  const latVel  = params._lateralVelocity  || 0
  const longVel = params._longitudinalVelocity || 0
  // Dead zone: low speed produces noise-level velocity; guard against atan2 singularity at rest.
  if (Math.sqrt(latVel * latVel + longVel * longVel) < 0.2) return 0
  const raw = -params.corneringStiffness * slipAngle
  // Friction cap: slip angle → ±90° at low speed → force >> Fn without this.
  // Phase 3 Pacejka saturates naturally; Phase 1 needs explicit clamping.
  const maxFlat = (params.frictionCoeff || 0.9) * Fz
  return Math.max(-maxFlat, Math.min(maxFlat, raw))
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
 * @returns {number} Flong [N] longitudinal force. Positive = forward (along wheel heading, which is
 *   in the -Z world direction at heading 0). Rolling resistance opposes motion; drive force adds to it.
 *
 * Phase 3 replacement: Pacejka Magic Formula Flong vs slip ratio, scaled by Fz.
 * Phase 3 replaces this body only — signature and call site in physics.js do not change.
 */
export function computeLongitudinalForce (slipRatio, Fz, params) {
  // Phase 1: rolling resistance drag proportional to longitudinal speed, plus drive force.
  // rollingResistanceCoeff [N/(m/s)] set in data/ranger.js, exposed as debug slider (D-10).
  const rollingDrag = -params.rollingResistanceCoeff * (params._longitudinalVelocity || 0)
  const raw = rollingDrag + (params._driveForce || 0)
  const maxFlong = (params.frictionCoeff || 0.9) * Fz
  return Math.max(-maxFlong, Math.min(maxFlong, raw))
}
