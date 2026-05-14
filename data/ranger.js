/**
 * 2002 Ford Ranger XLT 2WD parameters.
 * Values sourced from .planning/PROJECT.md; inertia tensor values are estimates
 * (box model) and are intended to be tuned via the debug menu.
 * Phase 1 only — Pacejka coefficients (Phase 3) and spring constants (Phase 4)
 * will be added in later phases.
 *
 * Do NOT Object.freeze() this object — Plan 03 mutates fields live via lil-gui sliders.
 */
export const RANGER_PARAMS = {

  // ── Geometry ──────────────────────────────────────────────────────────────
  wheelbase:    2.85,   // m — center of front axle to center of rear axle
  trackFront:   1.46,   // m — center-to-center wheel spacing at front axle
  trackRear:    1.46,   // m — center-to-center wheel spacing at rear axle
  cgHeight:     0.55,   // m — center of gravity above ground (estimate, laden)
  wheelRadius:  0.368,  // m — 245/75R16 tire radius

  // ── Mass & Inertia ────────────────────────────────────────────────────────
  // Estimated box-model values; expose as debug sliders for tuning.
  // For a box body 4.6m L × 1.8m W × 1.6m H: Ixx≈800, Iyy≈1400, Izz≈2200 kg·m²
  mass:         1360,   // kg — curb weight estimate
  inertiaYaw:   2200,   // kg·m² (Izz — rotation about up axis; turning)
  inertiaPitch: 1400,   // kg·m² (Iyy — rotation about lateral axis; braking)
  inertiaRoll:  800,    // kg·m² (Ixx — rotation about longitudinal axis; cornering)

  // ── Drivetrain ────────────────────────────────────────────────────────────
  // Phase 1 placeholder; Phase 2+ replaces drivetrain model.
  // Values consumed by getDriveTorque stub.
  maxDriveTorque:  400,   // N·m — flat throttle torque for Phase 1 response
  maxBrakeTorque:  3000,  // N·m — flat brake deceleration placeholder

  // ── Phase 1 Friction Placeholders (D-10) ─────────────────────────────────
  // Must be exposed as lil-gui sliders in Plan 03.
  // See docs/GLOSSARY.md §Term Definitions for units and meaning.
  lateralDampingCoeff:    4000,  // N/(m/s) — damps lateral contact-patch velocity
  rollingResistanceCoeff: 20,    // N/(m/s) — rolling drag proportional to longitudinal velocity

  // ── Steering ─────────────────────────────────────────────────────────────
  maxSteerAngle:  0.52,  // rad (~30°) — max steer angle at low speed
  steerRate:      1.2,   // rad/s — accumulation rate while steering key is held
  steerDecayRate: 2.0,   // rad/s — return-to-zero rate when key is released
  speedSteerRef:  15,    // m/s — reference speed at which max steer is halved (M1-08)

  // ── Weight Distribution ───────────────────────────────────────────────────
  weightFront:  0.55,   // fraction — 55% of weight on front axle (estimate)
  weightRear:   0.45,   // fraction — 45% of weight on rear axle (estimate)
};
