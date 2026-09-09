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
 * Force magnitude: F = μ · Fg · D · Pacejka(|s_scaled| / v_ref)
 *   where Fg = gripLoad(Fn) — FEAT-80 load sensitivity. The grip-carrying load is NOT the normal
 *   load: real tires lose friction coefficient as load rises (Pacejka pDy2, peak Fy ∝ Fz^0.7–0.9),
 *   and past the carcass's rated load the patch buckles and absolute grip falls. See gripLoad().
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
 * FEAT-80 — tire load sensitivity. Maps the normal load Fn to the GRIP-CARRYING load Fg, so that
 * peak force = μ · D · Fg. Two real-world effects, both owner-ruled 2026-09-08:
 *
 *   (1) LINEAR FALLOFF across the normal range. μ_eff = μ · λ, λ = 1 − k·(Fn − F0)/F0 (the Pacejka
 *       pDy2 term with F0 = `tireNominalLoad`, the static per-wheel load, and k =
 *       `tireLoadSensitivity`). Passenger-tire pDy2 is −0.1…−0.2 per nominal load; peak lateral
 *       force then grows as ~Fz^0.8. This is what makes weight transfer COST an axle grip: the loaded
 *       outer wheel gains less than the unloaded inner wheel loses. λ is clamped to [0.2, 1+k] so a
 *       feather-light wheel never invents friction and a crushed one never goes negative.
 *
 *   (2) A HARD KNEE at the carcass's rated load (`tireRatedLoad`; the OE P235/75R15 is rated 2028 lbf
 *       = 9.0 kN at 35 psi). Past it each extra newton of load REMOVES `tireOverloadDrop` newtons of
 *       grip-carrying load — the contact patch goes concave and lateral force falls. Softplus knee
 *       (width 8 % of Fr) so Fg is C¹ across it; floored at 15 % of Fr so an overloaded tire still
 *       has SOME grip (a landing must not turn the wheel into a puck).
 *
 * Before FEAT-80 grip was exactly linear in Fn with no cap: the SM-3 work measured 16–21 kN landing
 * spikes, and at μ 0.8 one wheel could push 13–17 kN sideways in a landing frame — four to five times
 * its static grip — which is the yaw-kick every bump delivered. With defaults, an 18 kN landing now
 * carries ~3.3 kN of grip load (2.7 kN of force), and the curve peaks near the rated load.
 *
 * k = 0 and tireOverloadDrop = 0 reproduce the old model exactly (Fg = Fn). Pure function; also the
 * tuning-panel readout's source of truth.
 *
 * @param {number} Fn      [N] normal load on the wheel (≥ 0)
 * @param {object} params  reads tireNominalLoad, tireLoadSensitivity, tireRatedLoad, tireOverloadDrop
 * @returns {number} Fg [N] grip-carrying load
 */
export function gripLoad (Fn, params) {
  const F0 = params.tireNominalLoad   ?? 0
  const k  = params.tireLoadSensitivity ?? 0
  const Fr = params.tireRatedLoad     ?? Infinity
  const s  = params.tireOverloadDrop  ?? 0
  let lam = 1
  if (k > 0 && F0 > 0) {
    lam = 1 - k * (Fn - F0) / F0
    if (lam > 1 + k) lam = 1 + k
    else if (lam < 0.2) lam = 0.2
  }
  let Fg = Fn * lam
  if (s > 0 && Number.isFinite(Fr) && Fr > 0) {
    // softplus(Fn − Fr; w) = w·ln(1 + e^{(Fn−Fr)/w}): ≈0 well below the knee, ≈(Fn − Fr) well above.
    const w = 0.08 * Fr
    const t = (Fn - Fr) / w
    const over = t > 30 ? (Fn - Fr) : w * Math.log1p(Math.exp(t))
    // The floor is a floor on the KNEE's subtraction only — it can never lift a lightly loaded or
    // airborne wheel (Fn → 0 must give Fg → 0), so it is capped by the pre-knee value.
    const floor = Math.min(0.15 * Fr, Fg)
    Fg -= s * over
    if (Fg < floor) Fg = floor
  }
  return Fg
}

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
 *   tireStiffnessLong, tireStiffnessLat, tireSlipVelRef, and the FEAT-80 load-sensitivity
 *   set (tireNominalLoad, tireLoadSensitivity, tireRatedLoad, tireOverloadDrop) via gripLoad().
 * @param {number} [muScale=1] - PER-WHEEL friction multiplier (SM-3 tire wear + FEAT-38 surface μ).
 *   The caller owns which wheel this is; this module stays a pure single-tire function. Multiplies
 *   params.frictionCoeff, so 1.0 is exactly the old behaviour.
 * @returns {{Flong: number, Flat: number, dFmagDs: number}}
 *   Flong: positive = wheel-forward (drive direction).
 *   Flat:  positive = wheel-right.
 *   dFmagDs: d|F|/d|s_scaled| in N/(m/s), well-defined at slip = 0.
 */
export function computeTireForces (slipVx, slipVy, Fn, params, muScale = 1) {
  const kL   = params.tireStiffnessLong ?? 1.0
  const kT   = params.tireStiffnessLat  ?? 1.0
  const vRef = params.tireSlipVelRef    ?? 1.0
  const B    = params.pacejkaB
  const C    = Math.max(1.0, Math.min(1.99, params.pacejkaC))  // C=2 collapses formula
  const D    = params.pacejkaD
  const E    = params.pacejkaE
  const mu   = (params.frictionCoeff ?? 1.0) * muScale
  const Fg   = gripLoad(Fn, params)   // FEAT-80: grip-carrying load, not the raw normal load

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
  const Fmag = mu * Fg * D * pac

  // d|F|/d|s|  via chain rule:
  //   d(arg)/dx = B − E·B + E·B/(1+Bx²)  = B·(1 − E + E/(1+Bx²))
  //   d(pac)/dx = C·cos(C·z) · 1/(1+arg²) · d(arg)/dx
  //   d|F|/d|s| = μ·Fg·D · d(pac)/dx · (1/v_ref)
  // At |s|=0: arg=0, z=0, cos(0)=1, 1/(1+0²)=1, d(arg)/dx=B → slope = μ·Fg·D·B·C/v_ref.
  const argDeriv = (B / vRef) * (1 - E + E / (1 + Bx * Bx))
  const pacDeriv = C * Math.cos(C * z) / (1 + arg * arg) * argDeriv
  const dFmagDs  = mu * Fg * D * pacDeriv

  if (sMag < 1e-9) {
    return { Flong: 0, Flat: 0, dFmagDs }
  }

  return {
    Flong: Fmag * sx / sMag,
    Flat:  Fmag * sy / sMag,
    dFmagDs,
  }
}
