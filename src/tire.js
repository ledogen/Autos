/**
 * src/tire.js — Phase 3 tire module.
 *
 * Exports the Pacejka Magic Formula for lateral and longitudinal tire forces.
 * Replaces Phase 1 linear placeholder bodies per Plan 03-01 (M3-03, M3-04).
 *
 * Signatures are locked (D-05, D-06) — do NOT change them.
 * Callers in physics.js pass:
 *   slipAngle  [rad] — lateral slip angle (atan2(latVel, |longVel| + 0.01))
 *   slipRatio  [-]   — longitudinal slip ratio (ω·r − v_x) / max(|ω·r|, |v_x|, ε)
 *   Fz         [N]   — normal force on this wheel from suspension
 *   params           — RANGER_PARAMS with Pacejka coefficients (pacejkaB/C/D/E, pacejkaBx/Cx/Dx/Ex)
 *
 * Do NOT import Three.js — this module is pure math.
 *
 * Conventions: see docs/GLOSSARY.md
 */

/**
 * Compute lateral (side) force at this wheel's contact patch using Pacejka Magic Formula.
 *
 * Formula: F = Fz * D * sin(C * atan(B*x − E*(B*x − atan(B*x))))
 * where x = slipAngle.
 *
 * @param {number} slipAngle - [rad] tire slip angle; positive = contact patch velocity
 *   pointing in wheel's +right direction. Sign convention per GLOSSARY.md §Slip Angle.
 *   Caller (physics.js) computes atan2(latVel, |longVel| + 0.01) and passes it here.
 * @param {number} Fz - [N] normal force on this wheel from suspension.
 * @param {object} params - RANGER_PARAMS with Pacejka lateral coefficients:
 *   params.pacejkaB [—]   stiffness factor (initial curve slope)
 *   params.pacejkaC [—]   shape factor (hard-clamped to [1.0, 1.99] — M3-03)
 *   params.pacejkaD [—]   peak factor (D * Fz = peak lateral force)
 *   params.pacejkaE [—]   curvature factor (post-peak falloff)
 * @returns {number} Flat [N] lateral force. Positive = wheel's right (+X body direction).
 *   Sign follows slipAngle sign — no internal negation (Pitfall 1 in RESEARCH.md).
 *   No internal friction cap — friction circle in physics.js is the only cap (M3-05).
 */
export function computeLateralForce (slipAngle, Fz, params) {
  const B = params.pacejkaB
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // M3-03: hard clamp — C=2 collapses formula
  const D = params.pacejkaD
  const E = params.pacejkaE
  const x = slipAngle
  return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
  // NOTE: No negation. Pacejka sign follows x sign — positive slipAngle → positive Flat.
  // NOTE: No internal friction cap. Friction circle in physics.js handles combined budget.
}

/**
 * Compute longitudinal (drive/brake) force at this wheel's contact patch using Pacejka Magic Formula.
 *
 * Formula: F = Fz * Dx * sin(Cx * atan(Bx*x − Ex*(Bx*x − atan(Bx*x))))
 * where x = slipRatio.
 *
 * @param {number} slipRatio - [-] longitudinal slip ratio (ω·r − v_x) / max(|ω·r|, |v_x|, ε).
 *   Free-rolling = 0; full wheelspin → +1; locked braking → -1. See GLOSSARY.md §Longitudinal Slip Ratio.
 * @param {number} Fz - [N] normal force on this wheel from suspension.
 * @param {object} params - RANGER_PARAMS with Pacejka longitudinal coefficients:
 *   params.pacejkaBx [—]  longitudinal stiffness factor
 *   params.pacejkaCx [—]  longitudinal shape factor (hard-clamped to [1.0, 1.99] — M3-03)
 *   params.pacejkaDx [—]  longitudinal peak factor
 *   params.pacejkaEx [—]  longitudinal curvature factor
 * @returns {number} Flong [N] longitudinal force. Positive = forward (wheel heading direction).
 *   Sign follows slipRatio sign — positive slipRatio (wheelspin) → positive forward force.
 *   No internal friction cap — friction circle in physics.js is the only cap (M3-05).
 */
export function computeLongitudinalForce (slipRatio, Fz, params) {
  const B = params.pacejkaBx
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaCx))  // M3-03: hard clamp — C=2 collapses formula
  const D = params.pacejkaDx
  const E = params.pacejkaEx
  const x = slipRatio
  return Fz * D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))))
  // NOTE: No internal friction cap. Friction circle in physics.js handles combined budget.
}
