/**
 * src/tire.js — Combined-slip Pacejka in slip-VELOCITY space.
 *
 * Inputs are slip velocities (m/s) at the contact patch — NOT slip ratios or slip angles.
 * Eliminates the singular behavior of angle/ratio formulations at zero vehicle velocity,
 * which would otherwise produce huge forces from tiny perturbations at rest.
 *
 * The caller (physics.js) should pass FILTERED slip velocities — i.e. slip displacements `s`
 * from a relaxation-length update (`ds/dt = v_slip − s·|v|/L`). The relaxation models tire
 * carcass viscoelastic dynamics (the carcass takes a characteristic distance L of vehicle
 * travel to build up to its target force). This combination is numerically stable at 60Hz.
 *
 * Anisotropy hooks: `tireStiffnessLong` and `tireStiffnessLat` scale the slip components
 * before computing the magnitude. Default 1.0 (isotropic). Real tires usually have
 * longitudinal > lateral by ~30–50%, but the project starts isotropic and tunes later.
 *
 * `tireSlipVelRef` is the characteristic slip velocity (m/s) at which the Pacejka curve
 * approaches peak. Lower v_ref → tire reaches peak grip at smaller slip → "stiffer" feel.
 *
 * Force magnitude: F = μ · Fn · D · Pacejka(|s_scaled| / v_ref)
 * Decomposed along slip vector: F_long = F · s_long_scaled / |s_scaled|, F_lat similar.
 *
 * Also returns `dFmagDs` (derivative of force magnitude w.r.t. |s|), well-defined at
 * |s|=0 via the analytical limit. Used by the semi-implicit ω integrator in physics.js
 * to linearize the road-reaction torque without singularity at rest.
 *
 * Do NOT import Three.js — this module is pure math.
 *
 * Conventions: see docs/GLOSSARY.md
 */

/**
 * Compute combined longitudinal + lateral tire force at this wheel's contact patch.
 *
 * @param {number} slipVx - [m/s] longitudinal slip velocity at the contact patch
 *   (use the relaxation-filtered slip displacement, not the instantaneous ω·r − v_x).
 *   Positive = wheel surface moves forward relative to ground (wheelspin / drive).
 * @param {number} slipVy - [m/s] lateral slip velocity at the contact patch (filtered).
 *   Positive = contact patch moves to wheel's +right relative to ground.
 * @param {number} Fn - [N] normal force on this wheel.
 * @param {object} params - RANGER_PARAMS. Reads pacejkaB/C/D/E, frictionCoeff,
 *   tireStiffnessLong, tireStiffnessLat, tireSlipVelRef.
 * @returns {{Flong: number, Flat: number, dFmagDs: number}}
 *   Flong: positive = wheel-forward (drive direction).
 *   Flat:  positive = wheel-right.
 *   dFmagDs: d|F|/d|s_scaled| in N/(m/s), well-defined at slip = 0.
 */
export function computeTireForces (slipVx, slipVy, Fn, params) {
  const kL   = params.tireStiffnessLong ?? 1.0
  const kT   = params.tireStiffnessLat  ?? 1.0
  const vRef = params.tireSlipVelRef    ?? 1.0
  const B    = params.pacejkaB
  const C    = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // C=2 collapses formula
  const D    = params.pacejkaD
  const E    = params.pacejkaE
  const mu   = params.frictionCoeff ?? 1.0

  const sx   = slipVx * kL
  const sy   = slipVy * kT
  const sMag = Math.hypot(sx, sy)

  // Evaluate Pacejka and its derivative analytically.
  // x = |s_scaled| / v_ref  is dimensionless slip; both Pacejka() and its
  // derivative are well-defined at x=0 (slope = B·C·D).
  const x   = sMag / vRef
  const Bx  = B * x
  const arg = Bx - E * (Bx - Math.atan(Bx))
  const z   = Math.atan(arg)
  const pac = Math.sin(C * z)
  const Fmag = mu * Fn * D * pac

  // d|F|/d|s|  via chain rule:
  //   d(arg)/dx = B − E·B + E·B/(1+Bx²)  = B·(1 − E + E/(1+Bx²))
  //   d(pac)/dx = C·cos(C·z) · 1/(1+arg²) · d(arg)/dx
  //   d|F|/d|s| = μ·Fn·D · d(pac)/dx · (1/v_ref)
  // At |s|=0: arg=0, z=0, cos(0)=1, 1/(1+0²)=1, d(arg)/dx=B → slope = μ·Fn·D·B·C/v_ref.
  const argDeriv = (B / vRef) * (1 - E + E / (1 + Bx * Bx))
  const pacDeriv = C * Math.cos(C * z) / (1 + arg * arg) * argDeriv
  const dFmagDs  = mu * Fn * D * pacDeriv

  if (sMag < 1e-9) {
    return { Flong: 0, Flat: 0, dFmagDs }
  }

  return {
    Flong: Fmag * sx / sMag,
    Flat:  Fmag * sy / sMag,
    dFmagDs,
  }
}
