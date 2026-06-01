/**
 * 2002 Ford Ranger XLT 2WD parameters.
 * Values sourced from .planning/PROJECT.md; inertia tensor values are estimates
 * (box model) and are intended to be tuned via the debug menu.
 * Phase 3: Pacejka coefficients added (D-07). Spring constants (Phase 4) still pending.
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
  bodyLength:   4.61,   // m — approximate exterior length (2002 Ford Ranger)
  bodyWidth:    1.85,   // m — approximate exterior width  (2002 Ford Ranger)
  bodyHeight:   1.60,   // m — approximate exterior height (2002 Ford Ranger)

  // ── Mass & Inertia ────────────────────────────────────────────────────────
  // Box model formula: I = (1/12) * mass * (a² + b²) where a,b are the two
  // body dimensions perpendicular to the rotation axis.
  //   inertiaRoll  (Ixx): width² + height²  → (1/12)*1360*(1.85²+1.60²) ≈  800 kg·m²
  //   inertiaPitch (Iyy): length² + height² → (1/12)*1360*(4.61²+1.60²) ≈ 3300 kg·m²
  //   inertiaYaw   (Izz): length² + width²  → (1/12)*1360*(4.61²+1.85²) ≈ 3700 kg·m²
  mass:         1360,   // kg — curb weight estimate
  inertiaRoll:  (1 / 12) * 1360 * (1.85 ** 2 + 1.60 ** 2),  // kg·m² (Ixx — roll,  ≈  800)
  inertiaPitch: (1 / 12) * 1360 * (4.61 ** 2 + 1.60 ** 2),  // kg·m² (Iyy — pitch, ≈ 3300)
  inertiaYaw:   (1 / 12) * 1360 * (4.61 ** 2 + 1.85 ** 2),  // kg·m² (Izz — yaw,   ≈ 3700)

  // ── Drivetrain ────────────────────────────────────────────────────────────
  // Phase 1 placeholder; Phase 2+ replaces drivetrain model.
  // Values consumed by getDriveTorque stub.
  maxDriveTorque:  800,   // N·m — flat throttle torque for Phase 1 response
  maxBrakeTorque:  3000,  // N·m — flat brake deceleration placeholder
  // Bug 4 fix: reverse uses maxReverseTorque (symmetric to forward), not maxBrakeTorque
  maxReverseTorque: 800,  // N·m — matches maxDriveTorque; used by getDriveTorque for reverse
  maxHandbrakeTorque: 4000, // N·m — rear-only handbrake; doubled from 2000 to actually lock rears; exposed as slider (D-16)

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

  // ── Phase 3 Pacejka Tire Model (D-07) ────────────────────────────────────
  // Combined-slip Pacejka in SLIP-VELOCITY space (m/s). One isotropic curve, evaluated at
  // |s| = √(s_long² + s_lat²) where s is the relaxation-length-filtered slip displacement.
  // Peak force per wheel = frictionCoeff × pacejkaD × Fn. Hard-clamped at C=[1.0,1.99] in tire.js.
  pacejkaB:  10.0,   // stiffness factor — initial slope of force curve
  pacejkaC:   1.9,   // shape factor — C<2 required; hard-clamped in computeTireForces
  pacejkaD:   1.0,   // peak factor — peak force = frictionCoeff × D × Fn
  pacejkaE:  0.97,   // curvature — near 1.0 produces realistic post-peak falloff

  // Slip-velocity tire model parameters (added with combined-slip rewrite)
  tireRelaxationLength: 0.3,   // m — characteristic distance over which tire force builds; ~0.3 for road tires
  tireSlipVelRef:       1.0,   // m/s — slip velocity at which Pacejka curve approaches peak
  tireStiffnessLong:    1.0,   // anisotropy hook — scale longitudinal slip component (default 1.0 isotropic)
  tireStiffnessLat:     1.0,   // anisotropy hook — scale lateral slip component (real tires ≈ 0.7×Long)

  // Wheel angular dynamics (D-02)
  // I = 0.5 × mass_wheel × r²; mass_wheel ≈ 18 kg (245/75R16 truck tire+wheel assembly)
  // → I = 0.5 × 18 × 0.368² ≈ 1.22 kg·m²
  wheelInertia: 1.22,  // kg·m² — 0.5 × 18 kg × 0.368² (D-02)
  rollingResistanceCoeff: 0.015,  // [-] horizontal drag = Cr · Σ Fn; 0.015 ≈ tire on dry pavement (~0.15 m/s² coast decel)

  // ── Steering ─────────────────────────────────────────────────────────────
  maxSteerAngle:  0.52,  // rad (~30°) — max steer angle at low speed
  steerRate:      1.2,   // rad/s — accumulation rate while steering key is held
  steerDecayRate: 2.0,   // rad/s — return-to-zero rate when key is released
  speedSteerRef:  15,    // m/s — reference speed at which max steer is halved (M1-08)

  // ── Weight Distribution ───────────────────────────────────────────────────
  weightFront:  0.55,   // fraction — 55% of weight on front axle (estimate)
  weightRear:   0.45,   // fraction — 45% of weight on rear axle (estimate)

  // ── Suspension Spring-Damper (Phase 4 — D-04) ────────────────────────────
  // Quarter-car per corner: hub↔body spring in series with the tire spring above.
  // Natural frequency target: ~1.5 Hz body bounce → f_n = (1/2π)√(k/m)
  //   Sprung mass per corner (front): mass·weightFront/2 ≈ 1360·0.55/2 ≈ 374 kg → k = (2π·1.5)²·374 ≈ 33 000 N/m
  //   Sprung mass per corner (rear):  mass·weightRear /2 ≈ 1360·0.45/2 ≈ 306 kg → k = (2π·1.5)²·306 ≈ 27 000 N/m
  // Damping ratio target: ζ ≈ 0.4 (slightly underdamped) → c = 2ζ√(k·m) = 0.8·√(k·m)
  //   Front: 0.8·√(33000·374) ≈ 2800 N·s/m; Rear: 0.8·√(27000·306) ≈ 2300 N·s/m
  // restLength: allowance for suspension travel (room for bump + droop from static equilibrium)
  suspensionStiffnessFront:  33000,   // N/m — 1.5 Hz body bounce at front sprung corner mass
  suspensionStiffnessRear:   27000,   // N/m — 1.5 Hz body bounce at rear sprung corner mass
  suspensionDampingFront:     2800,   // N·s/m — ζ≈0.40 (slightly underdamped) at front
  suspensionDampingRear:      2300,   // N·s/m — ζ≈0.40 (slightly underdamped) at rear
  suspensionRestLengthFront:  0.20,   // m — travel allowance front axle (typical road truck)
  suspensionRestLengthRear:   0.22,   // m — slightly more rear travel (lighter unloaded rear)
  // wheelMass: unsprung mass per corner (tire + wheel + stub axle).
  // I = 0.5 × wheelMass × r²; wheelMass ≈ 18 kg matches wheelInertia derivation above.
  wheelMass:                    18,   // kg — per-corner unsprung mass (D-02)

  // ── Anti-Roll Bars (Phase 4 — D-06) ──────────────────────────────────────
  // Bilinear-spring approximation: ARB force shares the same lever arm as the main spring (D-07).
  // F_arb = arbStiffness · (suspComp[left] − suspComp[right]) per axle.
  // Front ARB stiffer than rear → promotes understeer balance for a Ranger.
  // At 0.5g lateral: target ≈5° body roll total; front+rear ARBs together provide this.
  arbStiffnessFront:  15000,   // N/m — front anti-roll bar stiffness (D-06)
  arbStiffnessRear:    8000,   // N/m — softer rear ARB encourages oversteer balance (D-06)

  // ── Physics Timestep (Phase 4 — D-09) ────────────────────────────────────
  // Mirrors the PHYSICS_DT constant in main.js. Stored here so suspension.js (pure-math,
  // no main.js import) can verify sub-step stability against dt without importing main.js.
  physicsDt:  1 / 60,   // s — outer physics step (≈16.667ms); substep = physicsDt/2 (D-08)
};
