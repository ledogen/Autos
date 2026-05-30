/**
 * src/tire.js — Phase 3 tire module.
 *
 * Combined-slip Pacejka: one curve, evaluated at σ_total = √(slipRatio² + tan²(slipAngle)),
 * with the force magnitude decomposed along the slip vector. Naturally collapses Flat to zero
 * at full lockup/wheelspin (where the slip vector aligns purely with the longitudinal axis)
 * and collapses Flong to zero at pure sliding (slipRatio=0 with nonzero slipAngle). Replaces
 * the prior two-axis Pacejka + explicit friction-circle pair — combined slip IS the friction
 * circle, evaluated kinematically rather than as a sqrt cap on outputs.
 *
 * Single set of coefficients (pacejkaB/C/D/E). The legacy longitudinal coefficients
 * (pacejkaBx/Cx/Dx/Ex) are removed; the tire response is isotropic in long/lat. Add an
 * anisotropy scalar to σ_total if/when slight long-vs-lat stiffness differences matter.
 *
 * `frictionCoeff` (μ) remains as a global grip multiplier on the force magnitude.
 *
 * Do NOT import Three.js — this module is pure math.
 *
 * Conventions: see docs/GLOSSARY.md
 */

/**
 * Compute combined longitudinal + lateral tire force at this wheel's contact patch.
 *
 * @param {number} slipRatio - [-] longitudinal slip (ω·r − v_x) / max(|ω·r|, |v_x|, ε).
 *   Free-rolling = 0; full wheelspin → +1; locked braking → -1.
 * @param {number} slipAngle - [rad] lateral slip; positive = contact patch velocity to wheel's +right.
 * @param {number} Fn - [N] normal force on this wheel.
 * @param {object} params - RANGER_PARAMS with pacejkaB/C/D/E and optional frictionCoeff (μ).
 * @returns {{Flong: number, Flat: number}} forces in wheel-frame.
 *   Flong: positive = forward (wheel heading direction).
 *   Flat:  positive = wheel's +right (sign follows slipAngle sign — no internal negation).
 */
export function computeTireForces (slipRatio, slipAngle, Fn, params) {
  const B = params.pacejkaB
  const C = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // hard clamp — C=2 collapses formula
  const D = params.pacejkaD
  const E = params.pacejkaE
  const mu = params.frictionCoeff ?? 1.0

  const sigmaLong = slipRatio
  const sigmaLat  = Math.tan(slipAngle)
  const sigmaTotal = Math.hypot(sigmaLong, sigmaLat)

  if (sigmaTotal < 1e-6) return { Flong: 0, Flat: 0 }

  const Bs = B * sigmaTotal
  const Fmag = mu * Fn * D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))))

  return {
    Flong: Fmag * (sigmaLong / sigmaTotal),
    Flat:  Fmag * (sigmaLat  / sigmaTotal),
  }
}
