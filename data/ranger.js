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
  maxDriveTorque:  800,   // N·m — flat throttle torque for Phase 1 response
  maxBrakeTorque:  3000,  // N·m — flat brake deceleration placeholder
  // Bug 4 fix: reverse uses maxReverseTorque (symmetric to forward), not maxBrakeTorque
  maxReverseTorque: 800,  // N·m — matches maxDriveTorque; used by getDriveTorque for reverse

  // ── Tire Spring-Damper ───────────────────────────────────────────────────
  // Matchbox car has no suspension — the tire IS the only compliance between wheel and ground.
  // tireStiffness: radial spring constant. At rest, each corner compresses ~22mm (mg/4 / k).
  // tireDamping: critically damped at ~14000 N·s/m; 8000 gives slightly underdamped feel.
  tireStiffness: 100000,  // N/m
  tireDamping:     4000,  // N·s/m

  // ── Phase 1 Friction Placeholders (D-10) ─────────────────────────────────
  // Must be exposed as lil-gui sliders in Plan 03.
  // See docs/GLOSSARY.md §Term Definitions for units and meaning.
  // Note: lateralDampingCoeff is now unused (replaced by corneringStiffness slip-angle model)
  // but kept so existing debug sliders do not break.
  lateralDampingCoeff:    4000,  // N/(m/s) — damps lateral contact-patch velocity (unused, kept for slider compat)
  rollingResistanceCoeff: 20,    // N/(m/s) — rolling drag proportional to longitudinal velocity
  corneringStiffness: 50000,     // N/rad — linear tire lateral stiffness; used by computeLateralForce (Bug 6 fix)
  frictionCoeff:      0.9,       // peak tire-road friction coefficient; caps Flat and Flong at μ*Fn

  // ── Body Contact (collision against walls/ramp faces) ────────────────────
  bodyContactStiffness: 200000,  // N/m — stiffer than tire; metal-on-terrain response
  bodyContactDamping:     8000,  // N·s/m
  bodyContactRadius:      0.15,  // m — effective sphere radius for bumper corner points

  // ── Steering ─────────────────────────────────────────────────────────────
  maxSteerAngle:  0.52,  // rad (~30°) — max steer angle at low speed
  steerRate:      1.2,   // rad/s — accumulation rate while steering key is held
  steerDecayRate: 2.0,   // rad/s — return-to-zero rate when key is released
  speedSteerRef:  15,    // m/s — reference speed at which max steer is halved (M1-08)

  // ── Weight Distribution ───────────────────────────────────────────────────
  weightFront:  0.55,   // fraction — 55% of weight on front axle (estimate)
  weightRear:   0.45,   // fraction — 45% of weight on rear axle (estimate)
};
