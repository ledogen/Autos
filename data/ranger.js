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
  bodyWidth:    1.66,   // m — track(1.46) + wheel width(0.25) - 0.05 margin so wheels visible from side
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
  maxBrakeTorque:  1700,  // N·m — flat brake deceleration placeholder
  // Bug 4 fix: reverse uses maxReverseTorque (symmetric to forward), not maxBrakeTorque
  maxReverseTorque: 800,  // N·m — matches maxDriveTorque; used by getDriveTorque for reverse
  maxHandbrakeTorque: 4000, // N·m — rear-only handbrake; doubled from 2000 to actually lock rears; exposed as slider (D-16)

  // ── Tire Spring-Damper ───────────────────────────────────────────────────
  // tireStiffness: radial spring constant. At rest, each corner compresses ~38mm (mg/4 / k).
  // tireDamping: ζ≈0.56 relative to critical (2·√(k·m)=2683 N·s/m). Kept below critical so
  // the wheel returns to ground quickly but doesn't prematurely unload — overdamped tire
  // damping causes tireFz to hit zero while hub is still 2 cm in ground (hubVy drives damping
  // term negative, triggering spurious airborne flag at high hub velocities).
  tireStiffness: 100000,  // N/m
  tireDamping:     1500,  // N·s/m — ζ≈0.56; reduced from 4000 to prevent premature wheel lift-off

  // ── Phase 1 Friction Placeholders (D-10) ─────────────────────────────────
  // Must be exposed as lil-gui sliders in Plan 03.
  // See docs/GLOSSARY.md §Term Definitions for units and meaning.
  // Note: lateralDampingCoeff is now unused (replaced by corneringStiffness slip-angle model)
  // but kept so existing debug sliders do not break.
  lateralDampingCoeff:    4000,  // N/(m/s) — damps lateral contact-patch velocity (unused, kept for slider compat)
  corneringStiffness: 50000,     // N/rad — linear tire lateral stiffness; used by computeLateralForce (Bug 6 fix)
  frictionCoeff:      0.9,       // peak tire-road friction coefficient; caps Flat and Flong at μ*Fn

  // ── Body Contact (collision against walls/ramp faces) ────────────────────
  bodyContactStiffness: 200000,  // N/m — stiffer than tire; metal-on-terrain response
  bodyContactDamping:     1000,  // N·s/m
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
  //   Sprung mass per corner (rear):  mass·weightRear /2 ≈ 1360·0.45/2 ≈ 27 000 N/m
  // Damping ratio target: ζ ≈ 0.64 → c = 2ζ√(k·m) = 1.28·√(k·m)
  //   c_critical_front = 2·√(33000·374) ≈ 7026 N·s/m → ζ=0.64: c ≈ 4500
  //   c_critical_rear  = 2·√(27000·306) ≈ 5749 N·s/m → ζ=0.64: c ≈ 3700
  //   Raised from ζ=0.40 (2800/2300) — at ζ=0.40 the pitch mode amplitude was large enough
  //   to lift front wheels off ground on every upswing (half-wave oscillation at 3 Hz).
  // restLength: allowance for suspension travel (room for bump + droop from static equilibrium)
  suspensionStiffnessFront:  33000,   // N/m — 1.5 Hz body bounce at front sprung corner mass
  suspensionStiffnessRear:   27000,   // N/m — 1.5 Hz body bounce at rear sprung corner mass
  suspensionDampingFront:     3000,   // N·s/m
  suspensionDampingRear:      3000,   // N·s/m
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
  arbStiffnessFront:   5000,   // N/m — front anti-roll bar stiffness (D-06)
  arbStiffnessRear:       0,   // N/m — rear ARB (D-06)

  // ── Suspension Travel + Stops (Phase 4.1 — D-08) ──────────────────────────────────────────
  // suspensionTravel: total strut compression before bump stop engages (bump side only).
  // Typical road truck: ~100 mm bump + ~100 mm droop from static = ~200 mm total travel.
  suspensionTravelFront:       0.25,   // m — strut travel before bump stop (D-08)
  suspensionTravelRear:        0.25,   // m — strut travel before bump stop (D-08)

  // suspensionBodyOffset: Y shift of mount point in body space (ride-height control).
  // Default 0 = current behavior unchanged (mount is at -(cgHeight - wheelRadius) body-Y).
  suspensionBodyOffsetFront:   0.0,    // m — positive = mount lower in body space (raises ride height) (D-08)
  suspensionBodyOffsetRear:    0.035,  // m — (D-08)

  // bumpStopStiffness: penalty spring engaging at strutComp >= suspensionTravel.
  // At 10× front spring: k_eff ≈ 363 000 N/m. Stability: sdt^2 * k_eff / m_u = 0.35 < 4. OK.
  bumpStopStiffness:         330000,   // N/m — ~10× front spring; exposed as slider (D-08, D-14)

  // DROOP_STOP_STIFFNESS: fixed constant; engages at strutComp <= 0 (fully extended).
  // Sized so static hub weight (~18 kg) deflects < 10 mm: k > 18*9.81/0.010 = 17 658 N/m.
  // 20 000 N/m gives ~8.8 mm deflection at hub weight → meets the <10 mm target.
  DROOP_STOP_STIFFNESS:        20000,  // N/m — not a slider; fixed constant (D-08)

  // ── Physics Timestep (Phase 4 — D-09) ────────────────────────────────────
  // Mirrors the PHYSICS_DT constant in main.js. Stored here so suspension.js (pure-math,
  // no main.js import) can verify sub-step stability against dt without importing main.js.
  physicsDt:  1 / 60,   // s — outer physics step (≈16.667ms); substep = physicsDt/2 (D-08)

  // ── Phase 6/7 Terrain (TERR-06 / TERR-01–04) ─────────────────────────────
  // terrainAmplitude: live Y-rescale multiplier (Path A — instant, no Worker round-trip).
  // Applied to raw noise heights during chunk geometry build. Default 1.0 because the
  // coarse layer already outputs values in metres — no additional scale needed at default params.
  // Changing this slider live rescales existing geometry without Worker regeneration (D-09 Path A).
  terrainAmplitude: 1.0,   // Y-rescale multiplier — Path A instant rescale; coarse layer outputs metres directly

  // Phase 7: Three-layer seeded height function parameters (TERR-01/02/03).
  // Calibration starting values from RESEARCH.md §Calibration — interactive tuning via debug sliders.
  // See terrain.js coarseHeight / fineHeight / regionalModulator for the formulas.
  //
  // Coarse ridged-multifractal layer (TERR-01: Eastern-Sierra escarpments + flat valleys)
  coarseAmplitude: 150,    // m — full-scale range of coarse layer (P7-3 calibrated lock)
  coarseFreq:      0.0005, // 1/m — base frequency (1/2000 m = 2 km wavelength)
  coarseOctaves:   4,      // octave count; each halves wavelength, gain 0.5 per octave
  ridgeSharpness:  1.6,    // pow() exponent; 1=linear ridges, 2.5=moderate peaks, 4=knife-edge

  // Fine FBM layer (TERR-02: suspension texture)
  fineAmplitude:   0.5,    // m — slope perturbation at 20 m wavelength (P7-3 calibrated lock)
  fineFreq:        0.05,   // 1/m — 20 m base wavelength

  // Regional-roughness modulator (TERR-03: scales fine amplitude across map)
  regionalStrength: 1,     // 0=uniform, 1=full modulation (valley vs hillside roughness)
  regionalScale:    500,   // m — modulator wavelength

  // rampEnabled: when false, ramp triangles are skipped in queryContacts + queryVertexContacts,
  // and rampMesh.visible is set false via the setRampVisible callback in debug.js.
  rampEnabled: true,       // ramp collision + visibility toggle

  // ── Input Ramp Rates (FEAT-01) ───────────────────────────────────────────
  // Smoothed throttle/brake accumulators in vehicle.js ramp at these rates (1/s).
  // throttleRampRate: 4/s → full range in 250 ms
  // brakeRampRate:    8/s → full range in 125 ms
  // releaseRampRate: 20/s → release in ~50 ms (fast but not instant)
  throttleRampRate: 4,    // /s — drive/reverse input ramp (250 ms to full)
  brakeRampRate:    8,    // /s — brake input ramp (125 ms to full)
  releaseRampRate: 20,    // /s — release decay rate for both axes

  // ── Phase 8 Road Routing — D-09 LOCKED cost model (valley-trunk core) ─────
  // Soft-cost turn-penalty A* weights for the valley-following streaming trunk in src/road.js.
  // Cost (per A* edge, D-09):
  //   edgeCost = roadWDist·horiz + roadWAlt·h + roadWGrade·grade²
  //            + roadWOver·max(0, grade − maxRoadGrade) + roadWTurn·(Δheading/45°)
  // These are live-tunable (08-07 sliders flow through this._proto.params seeded from these).
  // The over-cap term is FINITE/SOFT — there is NEVER an Infinity edge / hard grade block
  // (D-02 REVISED; the old hard block caused the "no path" failure — see 08-VERIFICATION.md).
  // See .planning/phases/08-road-routing/08-RESEARCH.md + spike 001 for derivation.
  //
  // maxRoadGrade: SOFT target grade the over-cap penalty measures against (rise/run ratio).
  // Exceeding it is penalized (roadWOver·excess), NOT blocked — the route climbs steep ground
  // only when wrapping around would cost more.
  // FEAT-10: raised 0.15→0.20. At 0.15 the router switchbacked so hard to stay gentle that roads
  // SPIRALED (2.3× detour, 34/62 runs looping). A steeper grade lets roads run straighter (~1.8×
  // detour, ~22 loops); tall fills are handled by the constant-slope embankment carve (landed with it).
  // Live slider: lower = gentler + windier; higher = straighter + steeper.
  maxRoadGrade: 0.20,   // ratio (20%) — SOFT over-cap target (FEAT-10; never a hard block)

  // roadWDist: directness weight — cost per metre of horizontal travel. Keeps the trunk from
  // wandering; balanced against the altitude/grade terms. D-09 default 1.
  roadWDist: 1,         // cost units / m horizontal — directness (D-09)

  // roadWAlt: stay-low valley-seeking weight — DOMINANT term. The altitude cost is measured
  // RELATIVE to the straight anchor→anchor baseline: roadWAlt·max(0, δ + roadValleyDepthCap), where
  // δ = terrainHeight − baseline. Above baseline → avoid (route around ridges); below baseline →
  // seek the low ground (valley spine); below the cap → saturates (bounded, no km wander).
  roadWAlt: 1.0,        // cost units/m altitude·m — valley-seeking term, per-metre (×L) (D-09 / D-04)

  // roadValleyDepthCap: how far BELOW the anchor baseline still earns valley-seeking reward (m).
  // Higher = stronger pull into deep valleys & more decisive, less squiggly roads (but a touch more
  // detour); lower = flatter, more direct-but-aimless. The cap is what keeps the old absolute-altitude
  // global magnet (km wander) from coming back. ~40 m re-activates the spine over ~all road length.
  roadValleyDepthCap: 40,  // m below baseline that still rewards descending (bounded valley-seek)

  // FEAT-10 merge graph (replaces the deleted COVER suppression).
  // roadNodeMergeRadius: a macro-anchor ADOPTS the position of a strictly-higher-priority neighbour
  //   anchor (lower (mz,mx)) whose raw valley-snap lies within this radius (±1-cell window) → converging
  //   anchors collapse to ONE shared graph node. Kills the spiral/duplicate stacking at the source and
  //   removes the over-constrained short stubs whose ribbon tears. Must be < PROTO_ANCHOR_SPACING (256);
  //   too large collapses roads into one trunk, too small leaves duplicates. 0 = merge off.
  //   Tuned to 50: collapses genuinely-coincident anchors (the ~27 m degenerate stubs whose ribbon
  //   tears) without merging distinct anchors that sit on a bend (which would concentrate the bend into
  //   a sharp hairpin — measured 68° at R=90 vs ~34° pre-existing at R=50). The spiral/duplicate bulk is
  //   already handled upstream by FEAT-12 earthwork routing, so this is the residual same-basin collapse.
  roadNodeMergeRadius: 50,
  // roadMergeBand: how close two merged endpoints count as the "same node" when dropping a DEGENERATE
  //   edge (both endpoints coincide → collapsed stub) or a REDUNDANT edge (same node-pair already
  //   connected by a higher-priority edge → parallel duplicate). m.
  roadMergeBand: 24,

  // roadWGrade: gentle-grade weight — quadratic (grade²) cost. 2× grade → 4× penalty; shapes
  // smooth gentle climbs without forbidding any grade. D-09 default 400.
  // NOTE (fixed-angle redesign): the router cost is now accrued PER-METRE × arc length, since turn
  // primitives vary in length (fixed-angle: arc = R·turnAngle). roadWGrade/roadWOver/roadWAlt were
  // rescaled accordingly (they were per-8m-primitive before). Tuned via a headless radius+grade sweep
  // on seed 6 + lone-pine to give sweeping radii on mild ground (avg ~130 m, ~50% of road ≥100 m) while
  // switchbacking where grade forces it.
  roadWGrade: 100,      // cost units/m — quadratic grade² penalty (gentle climbs); per-metre (×L)

  // roadWOver: FINITE over-cap penalty — roadWOver·max(0, grade − maxRoadGrade). Strongly (but
  // never infinitely) discourages exceeding maxRoadGrade; forces switchbacks where the grade
  // would otherwise blow past the target. NEVER Infinity (D-02 REVISED). D-09 default 8000.
  roadWOver: 2500,      // cost units/m over-grade — SOFT over-cap penalty, per-metre (×L) (FEAT-10: 5000→2500 — let roads take a steeper line instead of spiralling)

  // roadWTurn: curvature penalty weight (wCurv) in the arc router. QUAL-05: the per-primitive cost is
  // wCurv·κ²·L (curvature SQUARED — "bending energy"), so for a given heading change the cost is
  // wCurv·Δθ/R → a TIGHTER radius costs more. This biases the route to gentle sweeps on mild ground and
  // lets tight radii (down to roadArcHardRadius) emerge ONLY where grade/altitude savings outweigh the
  // penalty (i.e. where the terrain is genuinely steep). Was 120 under the old LINEAR (wCurv·|κ|·L)
  // model, which was radius-blind per turn → roads turned tight everywhere. 8000 picked by a headless
  // radius-distribution sweep: tight (<20 m) arc-length 48%→8%, avg radius 24 m→53 m, min radius still
  // the hard floor (8 m). Higher = gentler/straighter; live-tunable via "Curve Penalty (wCurv)".
  roadWTurn: 8000,      // cost units — wCurv·κ²·L curvature penalty (QUAL-05); higher = gentler roads

  // ── FEAT-10 earthwork routing ────────────────────────────────────────────────────────────────
  // The router used to cost grade against RAW terrain, so it SPIRALLED to follow contours (43/63 runs
  // looped >270° at seed 6). These three turn on the "fill-the-valley / cut-the-ridge" cost model: the
  // router (and the design-grade profile) follow a LOW-PASSED terrain line instead of raw, paying a
  // weighted deviation (earthwork) penalty, bounded by a cap. Result (seed 6): loops 43→15, full-circle
  // spirals 20→2, detour 1.72→1.19, no perf cost. Set roadEarthworkWindow=0 to fully revert to terrain-
  // following routing. (Carve fills/cuts to the design line; deviationCap keeps them carve-buildable.)
  //
  // roadEarthworkWindow: half-width (m) of the terrain low-pass = the design grade line. Larger =
  // smoother/straighter roads + bigger earthwork. 0 = OFF (terrain-following, the old behaviour).
  roadEarthworkWindow: 120,
  // roadWDeviation: weight on the per-metre |design − terrain| earthwork penalty. Higher = hugs terrain
  // more (less fill/cut, windier); lower = straighter (more earthwork). 0 = OFF.
  roadWDeviation: 3,
  // roadDeviationCap: max |design − terrain| (m) the router/profile will build — bounds fill/cut depth so
  // the carve can construct it. On terrain taller than this the design grade falls back to terrain grade
  // and the road still switchbacks (the genuinely-forced loops).
  roadDeviationCap: 8,

  // roadJunctionFootprints: render the flat pad mesh at AT_GRADE crossings (FEAT-07 Step 2). Now ON: the
  // pad sits coplanar with the two strands the mid-span flatten eased to node.nodeY, so the crossing reads
  // as one paved intersection (mesh == the flattened collision surface). The old 296 ms stall is gone —
  // _detectJunctions() is the bounded, once-per-build, identity-cached crossing classifier (warmed by
  // _streamNetwork), so the per-tile build is a cache hit. Only AT_GRADE nodes get a pad (GRADE_SEP =
  // overpass Step 3; NEAR_PARALLEL = glancing graze). Set false to hide the pads.
  roadJunctionFootprints: true,

  // ── Crossing classifier (FEAT-07/08/11/13 foundation) ───────────────────────────────────────────
  // road.js _detectJunctions() finds every inter-run / self-run XZ crossing and CLASSIFIES each by the
  // strand-to-strand elevation gap (dY) and crossing angle. The class drives what later steps build:
  //   NEAR_PARALLEL (angle < roadCrossAngleMin) — a glancing/duplicate graze, NOT a junction (no pad/bridge).
  //   AT_GRADE      (dY ≤ roadCrossMergeDY)      — flatten both strands to one shared pad (FEAT-07).
  //   GRADE_SEP     (dY >  roadCrossMergeDY)     — overpass: one strand bridges the other (FEAT-08); the
  //                                                cut-side counterpart is a tunnel (FEAT-11).
  // roadCrossMergeDY is COUPLED to roadCrossOverpassClearance: a grade-separation only makes physical
  // sense when the natural strand gap is already big enough to fit the lower truck UNDER the upper deck
  // (deck thickness + truck height ≈ roadCrossOverpassClearance). Below that you can't build a bridge
  // there anyway → flatten both strands into one at-grade pad (these are service roads — the pad must
  // clear a large truck + deck). So default mergeDY ≈ clearance (4.5 m): dY < 4.5 m merges, dY ≥ 4.5 m
  // overpasses. At current earthwork params (roadDeviationCap 8 m) that grade-separates ~27% of inter-row
  // crossings (the genuinely tall gaps, up to ~10 m); the rest flatten. Raise to flatten still more.
  // USER-OWNED — tune to taste; live-tunable sliders are a later step.
  roadCrossMergeDY:  4.5,  // m  — strand dY at/below which a crossing flattens to one pad vs grade-separates (≈ clearance).
  roadCrossAngleMin: 12,   // deg — crossings shallower than this are near-parallel grazes, not junctions.
  roadCrossOverpassClearance: 4.5, // m — deck underside clearance above the lower strand (truck + deck). RESERVED for Step 3.

  // ── Road network topology (FEAT-13) ─────────────────────────────────────────────────────────────
  // roadNetworkMode: how the macro-anchor lattice is turned into roads.
  //   'rows'  — one E-W run per macro-row anchor(mx,mz)→anchor(mx+1,mz). Parallel by construction (the
  //             historical generator; every existing gate validates this mode).
  //   'graph' — a per-anchor directional GRAPH: each anchor links to a hashed spanning-forest parent
  //             (downhill in a per-cell priority hash) + root-chaining + seeded stitch/loop edges, over
  //             the 8-neighbourhood. Roads run in VARIED directions (not parallel), orphan-free,
  //             window-invariant, mostly-tree with a few loops. Headless-validated: 0% orphans, max
  //             direction variety, ~67% of anchors in one connected component at extraEdgeProb 0.22.
  roadNetworkMode: 'rows',
  // roadGraphFlatMerges: graph mode — force EVERY crossing to a flat at-grade intersection (no dynamic
  // overpasses). Roads meet/merge at one shared height instead of one floating over another. Real
  // grade-separation is deferred to future prefab intersections (cloverleaf etc.), not the dynamic
  // system. true is strongly recommended: dynamic overpasses produce intense Z geometry at junctions.
  roadGraphFlatMerges: true,
  // roadGraphDeviationCap: graph mode earthwork fill/cut cap (m), much tighter than rows' roadDeviationCap.
  // Graph edges still EARTHWORK (smooth grades — pure terrain-following makes near-parallel edges step on
  // slopes), but the low cap keeps edge endpoints near the ground so roads MEET at grade and flat merges
  // stay gentle (a high cap floats junctions 8–15 m apart → the steep-ramp / overpass chaos). ~2 m gives
  // smooth, step-free, low-float roads (the forest-service-road look). Raise for smoother long grades at
  // the cost of steeper merges.
  roadGraphDeviationCap: 2,
  // roadGraphExtraEdgeProb: graph mode only — per-cell probability of a seeded EXTRA edge (a loop, and a
  // stitch that fuses adjacent forest trees into one drivable network). 0 = pure forest (isolated pockets);
  // higher = more connected + more loops (less tree-like). At 0.4 the orthogonal (4-neighbour) graph puts
  // ~70% of anchors in one component (connected-leaning, few loops); raise toward 0.5–0.65 for ~85%.
  roadGraphExtraEdgeProb: 0.55,
  // roadGraphDiagonals: graph mode neighbourhood. false = orthogonal 4-neighbourhood (E/W/N/S): roads
  // meet at NODES as real T/X junctions with almost no mid-span crossings → fewer intersections/overpasses,
  // cleaner. true = 8-neighbourhood (adds diagonals): more varied directions but dense mid-span X-crossings.
  roadGraphDiagonals: false,

  // roadMinTurnRadius: D0 — minimum turn radius (m) for road centerlines. _filletMinRadius inserts a
  // circular arc of this radius wherever the implied corner radius is tighter, rounding (not excising)
  // hairpin corners. Higher = wider hairpins (arms further apart); lower = tighter corners.
  // FLOOR CONSTRAINT (D0): minRadius must be ≥ roadHalfWidth + roadClearanceMargin so the ribbon's
  // inner edge (at ±roadHalfWidth from centerline) cannot fold onto itself. With roadHalfWidth=5 and
  // roadClearanceMargin=0.5, the floor is ~5.5 m. The DEFAULT 12 m is "a little wider than the road"
  // (user intent): comfortably above the fold floor (so hairpins never self-overlap) while keeping
  // switchbacks looking like switchbacks. filletMinRadius (src/road-carve.js) rounds any turn tighter
  // than this to radius ≈ minRadius via curvature-clamp relaxation, so 12 m means a radius-12 U-turn
  // at hairpins (arms separate by ~2×12 = 24 m). Much larger values flatten tight switchbacks toward
  // straight caps; the fold floor is the hard lower bound, 12 m is the smooth-but-tight default.
  // Floor enforced in src/road.js _refreshParams (Math.max clamp) and slider lower bound in debug.js.
  // Live-tunable via the "Min Turn Radius (m)" debug slider (src/debug.js Roads folder).
  roadMinTurnRadius: 15,   // m — arc-fillet min turn radius (D0); safety floor ≥ roadHalfWidth + clearance (~5.5 m). 15 m = user's "15–20 m" feel pick (2026-06-16); live-tunable via "Min Turn Radius (m)" slider.

  // D-arc (2026-06-16) — arc-primitive router knobs (arcPrimitiveConnect). The road is min-radius-VALID
  // by construction: roadArcHardRadius is the HARDEST (tightest) turn the router can express — the real
  // fold floor — while roadArcGentleRadius + wTurn (curvature cost) bias toward gentle/straight runs.
  roadArcHardRadius:   8,   // m — tightest switchback radius (≥ roadHalfWidth+clearance ≈ 5.6 m floor). Higher = no tight turns.
  roadArcGentleRadius: 75,  // m — gentle-turn primitive radius (the preferred, cheap curve). 75 m
                            // sweeps wider → fewer tight loopbacks; the loopbacks that remain read as
                            // natural cloverleaf/on-ramp curves (see feat-road-self-overpass ticket).
  roadArcHeurWeight:   1.5, // weighted-A* heuristic inflation — PERF knob: higher = faster streaming, slightly less optimal routing.

  // ── Fixed-angle motion-primitive palette (QUAL-05 follow-up: large sweeping radii) ──────────────
  // The router turns a FIXED ANGLE per primitive (one heading bin) at one of these radii, so arc length
  // scales with radius — a 200 m sweep is representable (a fixed-LENGTH step at 200 m would turn <1° and
  // be invisible to the lattice). The router prefers the LARGEST radius that fits the heading change +
  // grade, so mild ground gets sweeping turns (avg ~130 m, ~50% of curved road ≥100 m radius) and tight
  // radii (down to roadArcHardRadius) appear only where grade forces a switchback. Largest→smallest;
  // last entry should equal roadArcHardRadius (the min-radius floor). NOTE: with fixed-angle primitives,
  // COARSER heading bins give LONGER (sweepier) arcs — finer bins (the old anti-zigzag intuition) is not
  // needed and is slower; 24 bins (15°) is the sweet spot. gradeSamples>1 samples grade along the long
  // arcs so the search isn't blind to intra-arc steepness.
  roadArcRadii: [200, 90, 35, 8],  // m — curvature palette (sweep / gentle / medium / hard floor)
  roadArcHeadingBins: 24,          // heading discretization (15°); one bin turned per turn primitive
  roadArcGradeSamples: 2,          // grade samples along each primitive arc (≥2 for long sweeps)

  // spurProbability: Probability that any given trunk macro-cell spawns a spur branch.
  // Retained for the DEFERRED D-01 spur pass (trunk-only ships first). D-01 / RESEARCH A1.
  spurProbability: 0.15, // ratio [0,1] — spur chance (deferred D-01 spur pass)

  // ── Phase 9 Road Surface — D-04/D-05/D-07/D-08 carve params ──────────────
  // These params drive the cut-and-fill terrain carve (SURF-05) and the ribbon geometry (SURF-01).
  // Live-tunable via the Roads folder debug sliders (debug.js onRoadSurfaceChange).
  // All distances in metres, slopes as H:V ratios.

  // roadWidth: total paved ribbon width. Two driving lanes at 5 m each = 10 m default.
  // D-04 — road width drives halfWidth, crown, and camber geometry.
  roadWidth: 10,            // m — total paved width (D-04)

  // roadHalfWidth: half of roadWidth — ribbon extends ±roadHalfWidth from centerline.
  // DERIVED: keep in sync with roadWidth manually (roadHalfWidth = roadWidth / 2).
  // Stored separately to avoid repeated division in hot paths.
  roadHalfWidth: 5,         // m — half roadWidth (derived; keep in sync with roadWidth)

  // roadShoulderWidth: blend/shoulder zone width beyond the ribbon edge.
  // Within this zone the terrain blends smoothly from ribbon grade back to raw terrain.
  // 2.5 m gives a 1:2 blend fade for a standard paved shoulder width. D-05.
  roadShoulderWidth: 2.5,   // m — shoulder blend zone width beyond ribbon edge (D-05)

  // roadFillHeight: maximum fill embankment height (delta cap).
  // When the road design grade is ABOVE the terrain (fill), the height difference is clamped
  // to this value before computing the fill-toe distance. Prevents extreme causeways.
  // Default 2.0 m — ~one-storey raised causeway, tunable up to 4 m. D-07.
  roadFillHeight: 2.0,      // m — max fill embankment height cap (D-07)

  // roadCutSlope: H:V ratio for the cut face (terrain higher than design grade).
  // 1.0 = 45° — moderate rocky cut slope. Range: 0.5:1 (steep) to 2:1 (gentle). D-08.
  roadCutSlope: 1.0,        // H:V ratio — cut face slope ~45° (D-08)

  // roadFillSlope: H:V ratio for the fill embankment (design grade higher than terrain).
  // 3.0 = 18.4° — standard dirt embankment slope (3 m horizontal per 1 m vertical). D-08.
  roadFillSlope: 3.0,       // H:V ratio — fill embankment slope, 3:1 dirt standard (D-08)

  // roadMaxEmbankmentToe: FEAT-10 — hard cap on how far the fill/cut embankment apron may extend
  // BEYOND the carve core (carveHalfWidth). Without it, a tall fill on a steep road ramps at its full
  // slope for tens of metres; at a tight turn the two arms' giant aprons OVERLAP and fight (different
  // target Ys) → fan-shaped terrain shards radiating from the turn. Capping the apron keeps each arm's
  // embankment within the D3 max-floor guard's reach so overlaps resolve cleanly. Trade-off: a very
  // tall fill gets a slightly steeper (never vertical) bank once its natural toe exceeds this. Live
  // slider: lower = tighter banks, fewer shards; higher = gentler banks, more overlap risk. 10 m keeps
  // the fill-support gate green (slope stays < 1.5 for the strongest fills) while killing the shards.
  roadMaxEmbankmentToe: 10, // m — max embankment apron width beyond the carve core (FEAT-10 shard cap)

  // designGradeWindow: sliding-window half-width for design grade smoothing.
  // The smoothed road profile is a windowed average of analyticHeight over this half-width
  // on both sides of each spline sample. 50 m suppresses the 20 m fine-noise wavelength
  // (fineFreq 0.05/m) while preserving coarse terrain grade. D-06.
  designGradeWindow: 50,    // m — sliding-window smoothing half-width for design grade (D-06)

  // crownHeight: height of the centerline crown above the ribbon edges (metres).
  // The crown is a parabolic cross-section: peak at centerline, tapers to 0 at ribbon edge.
  // Default 0.05 m = 5 cm (1% cross-slope on a 5 m half-width) — subtle water-shedding
  // profile that is physically meaningful without being noticeable at driving speed.
  // Exposed via debug slider (D-04). Range: 0–0.2 m.
  crownHeight: 0.05,       // m — centerline crown above ribbon edge (D-04 / A12)

  // camberStrength: gain from road curvature (1/m) to camber angle (RADIANS).
  // camberAngle = clamp(camberStrength * signedKappa, -6°, +6°).
  // UNITS BUG FIX: the result is RADIANS, not degrees. The old default 200 made
  // camberStrength*kappa = 200*0.02 = 4 RADIANS (229°) for a 50 m curve → clamped to the full 6°
  // on essentially EVERY curve (any radius < ~1900 m). That over-banked the physics surface
  // (rollovers / erratic contact normal once the run-arc camber fix made physics actually feel it).
  // For ~4° of bank at a 50 m radius (signedKappa≈0.02): 4° = 0.070 rad → camberStrength ≈ 3.5.
  // 4 gives proportional banking: ~1° at R=200 m, ~4.6° at R=50 m, clamped 6° on tight hairpins (R<37 m).
  // Exposed via debug slider (D-04). Range: 0.5–10.
  camberStrength: 4,       // rad·m — curvature→camber gain (D-04 / A4); proportional 1–6° banking

  // roadCamberRate: maximum rate of camber change along the road centerline (degrees per metre).
  // D2 (plan 09-21): the camberProfile(arcS) slew-rate limiter forward-marches along the
  // CONTINUOUS canonical run, clamping |dCamber/ds| ≤ roadCamberRate (°/m). This is what
  // eases banking across tile-seam boundaries and through curvature zero-crossings — killing
  // the clamp-flip spike (bug #4). Must be ≤ MAX_DCAMBER_DEG_PER_M=2.0 (harness gate).
  // Default 1.5 °/m: eases banking smoothly; tight corners ramp up over ~4 m instead of spiking.
  roadCamberRate: 1.5,     // °/m — max camber slew rate along run arc-length (D2)

  // ── Phase 9 Road Surface — Plan 04 junction params (SURF-07 / D-12–D-15) ────
  // roadJunctionBlendLength: how far before a junction node each road's design grade
  // blends toward the shared nodeY elevation (D-14 / A8).
  // approach_Y(s) = lerp(designGradeY(s), nodeY, max(0, 1 - dist_to_node / blendLength))
  // 30 m default — enough to smooth the grade ramp without extending far into approach lanes.
  roadJunctionBlendLength: 30,  // m — grade-blend reach toward junction node (D-14 / A8)

  // FEAT-10: roadJoinWeldLength — how far from a run's endpoints the ribbon cross-section tangent
  // blends toward the shared canonical node heading (_protoAnchorHeading), so adjacent runs build the
  // SAME endpoint cross-section and their ribbon edges line up (seals the outside-of-bend wedge at run
  // joins). m. 0 = off (endpoint tangent = local last-segment direction, the un-sealed default).
  roadJoinWeldLength: 6,

  // roadFilletRadius: default corner fillet radius for junction footprints (D-13 / A5).
  // Used as a slider default; actual per-junction R_f is computed from halfWidth*tan(theta/2).
  // Default 5 = roadHalfWidth default, produces quarter-circle fillets at 90° crossings.
  roadFilletRadius: 5,          // m — junction corner fillet radius default (D-13 / A5)

  // ── Phase 9 Plan 05 — Road Quality Markings (D-02/D-03) ───────────────────
  // roadQualityStretch: arc-length per quality tier (metres). Each stretch gets a deterministic
  // quality value from (worldSeed, runKey, stretchIdx). 500 m gives ~2–4 tier changes per km. D-02.
  roadQualityStretch: 500,     // m — arc-length per road-quality tier stretch (D-02 / A9)

  // roadQualityBlend: marking transition zone at stretch boundaries (metres). D-02.
  // Smooth-step over this span prevents marking tier from snapping visually.
  roadQualityBlend: 10,        // m — smooth-step blend zone at stretch boundaries (D-02 / A9)

  // ── Phase 9 Plan 05 — Cliff Shading (D-11) ────────────────────────────────
  // roadCliffSlopeLo: slope threshold where cliff color begins to blend in.
  // slope = 1 - vertexNormal.y. At slope=0.3 (~17° from vertical) cliff grey starts mixing.
  roadCliffSlopeLo: 0.3,       // [-] slope lower threshold for cliff blend onset (D-11 / A10)

  // roadCliffSlopeHi: slope threshold where terrain is fully cliff-colored.
  // At slope=0.6 (~54° from vertical) terrain reads fully as weathered cliff rock.
  roadCliffSlopeHi: 0.6,       // [-] slope upper threshold for full cliff color (D-11 / A10)

  // ── Phase 9 Plan 06 — Pothole / Crack Micro-Noise (SURF-06 / D-03) ──────────
  // potholeEnabled: master toggle. When false, potholeNoise always returns 0 and the
  // road surface is perfectly smooth (crown + camber only). Allows A/B comparison.
  // SURF-06 (stretch goal). D-03 severity tied to per-stretch roadQuality hook.
  potholeEnabled: true,         // bool — master on/off for pothole perturbation (D-03 / SURF-06)

  // potholeAmplitude: maximum signed Y perturbation at roadQuality=0 (low quality).
  // ~4 cm is felt as a light jolt at walking pace; imperceptible at highway speed.
  // Range: 0–0.1 m. Exposed as a debug slider in the Roads folder.
  potholeAmplitude: 0.04,       // m — peak perturbation depth at lowest quality (D-03 / SURF-06)

  // potholeFrequency: spatial frequency of the noise lattice (bumps per metre).
  // 0.3/m = one lattice cell per ~3.3 m → realistic pothole spacing on rural roads.
  // Range: 0.1–1.0/m. Higher = more frequent, smaller bumps.
  potholeFrequency: 0.3,        // /m — noise lattice frequency (D-03 / SURF-06)

  // ── Phase 9 Plan 10 — Decal Ribbon Depth-Bias + Edge Skirts ──────────────────
  // roadSkirtDepth: vertical distance the edge apron drops below the ribbon edge vertex.
  // 0.4 m ensures the skirt face extends below the terrain surface when the road
  // sits above the surrounding ground, closing the see-through gap at ribbon edges.
  // Range: 0–1.5 m. Exposed as a Road Surface debug slider.
  roadSkirtDepth: 0.4,          // m — vertical apron depth below ribbon edge (Plan 09-10)

  // roadPolygonOffsetFactor: WebGL polygon-offset factor applied to the ribbon material.
  // Negative value pulls the ribbon toward the camera in depth, ensuring it renders
  // over coplanar terrain without z-fighting. Paired with roadPolygonOffsetUnits.
  // Range: -4–0. Exposed as a Road Surface debug slider (live material update, no rebuild).
  roadPolygonOffsetFactor: -1,  // [-] polygon-offset factor (negative = toward camera) (Plan 09-10)

  // roadPolygonOffsetUnits: WebGL polygon-offset units bias paired with the factor.
  // Negative units further bias the ribbon toward the camera. Together with a negative
  // factor the ribbon reliably wins depth over terrain at all viewing angles.
  // Range: -8–0. Exposed as a Road Surface debug slider (live material update, no rebuild).
  roadPolygonOffsetUnits: -1,   // [-] polygon-offset units bias (Plan 09-10)

  // ── Phase 9 Plan 11 + Plan 22 — Terrain Carve (SURF-04 / SURF-05 / D3) ────
  // roadClearanceMargin: the terrain-mesh carve target sits this many metres BELOW the
  // ribbon surface so the terrain can never poke through the decal ribbon + skirt.
  // D3 (plan 09-22): carve trough tilts WITH the ribbon (crown + camber), so clearance
  // is now uniform on banked turns — inside-edge clip and outside-edge gap are eliminated.
  // Also the ROAD-EDGE DROPOFF height: physics rides the road on-ribbon and drops to the carved dirt
  // (this far below) off the ribbon edge, so clipping the edge is punishing (BUG-15). 0.25 m = a
  // realistic, jolting-but-not-launching edge. Range: 0–1.5 m. Exposed as a Road Surface debug slider.
  roadClearanceMargin: 0.25,    // m — terrain (and physics shoulder) sits this far BELOW the ribbon (Plan 09-11 / D3)

  // roadCarveExtraWidth: extra lateral width beyond roadHalfWidth + roadShoulderWidth
  // that the terrain carve footprint covers. Ensures the carved depression is wider than
  // the ribbon + its edge skirts so the skirt apron always sits on carved-down terrain.
  // Default 3 m; increase if skirt edges are still sitting above terrain.
  // D3 COUPLING (plan 09-22): the effective carve footprint is bounded to min(halfWidth +
  // carveExtraWidth, roadMinTurnRadius). Adjacent switchback arms separate by ~2*minRadius
  // (D0), so the footprint cap ensures each arm's trough stays within its ½ of the gap.
  // To widen the footprint further, widen roadMinTurnRadius alongside carveExtraWidth.
  // Range: 0–8 m. Exposed as a Road Surface debug slider.
  roadCarveExtraWidth: 3.0,     // m — extra carve footprint beyond ribbon + shoulder (Plan 09-11 / D3)

  // roadTileKeepMargin: D5 ring hysteresis (plan 09-20).
  // Ribbon tiles are KEPT for this many extra tiles beyond the terrain active ring before
  // being disposed. When crossing a tile edge, the terrain ring shrinks by one tile on one
  // side and expands on the other; without hysteresis the ribbon tile that just left the
  // ring is disposed and immediately re-enqueued → visible thrash (bug #2).
  // A margin of 1 tile means keep-radius = build-radius + 1, so the departing tile is held
  // for ~1 extra frame-cycle before disposal. Units: tiles. Range: 0–3.
  roadTileKeepMargin: 1,        // tiles — keep-radius = build-radius + this margin (D5 / 09-20)

  // ── Phase 9 Plan 24 — Dirt-colour edge skirts (SURF-05 / D-08) ───────────────
  // roadDirtColor: hex colour applied to the ribbon's downward edge aprons (skirt verts).
  // Visually distinguishes the engineered dirt shoulder from the paved asphalt surface.
  // Muted brown (~0x6b5a3e) matches exposed earth/gravel typical of rural road construction.
  // D-01 discipline: procedural vertex colour only — no texture or image asset.
  // SURF-05: cut/fill shoulders read as dirt, not asphalt.
  // D-08: material intent — shoulder face is unpaved earth.
  // Units: hex RGB int (0xRRGGBB). Exposed as a colour picker in the Road Surface folder.
  roadDirtColor: 0x6b5a3e,     // hex RGB — dirt-brown skirt vertex colour (SURF-05 / D-08 / Plan 09-24)

  // ── Wheel dust trails (src/dust.js — visual polish) ──────────────────────────
  // Stylized sprite puffs kicked up behind the wheels, tinted to the dirt we drive on.
  // dustEnabled: master toggle. dustColor: puff tint — a light warm tan that, decoded
  // from sRGB, lands near the terrain general-ground colour (terrain warm-brown
  // 0.72/0.60/0.47 linear) so airborne dust reads as the same earth, a touch lighter.
  // dustAmount: density multiplier (0 = off-ish, 1 = default, >1 = heavier). Units: hex / scalar.
  dustEnabled: true,
  dustColor: 0xc9b79a,         // hex RGB — dust puff tint (dirt we're driving on)
  dustAmount: 1.0,             // [-] emission density multiplier
  // dustPavedFactor: how much dust survives on the paved asphalt ribbon (vs full dirt dust
  // off-road). Tyres on tarmac barely scuff dust, so this is low; it ramps smoothly up to 1
  // across the ribbon edge into the dirt shoulder. 0 = none on asphalt, 1 = same as dirt.
  dustPavedFactor: 0.1,        // [-] on-asphalt dust multiplier

  // ── FEAT-05 — Alpine terrain look (procedural biome colour + fbm detail) ─────
  // Palette (hex RGB; decoded as LINEAR /255 in terrain.js _writeChunkVertexColors — these
  // ARE the linear vertex-colour values, NOT sRGB, so a colour picker round-trips exactly).
  // Tuned for high-altitude Eastern Sierra / Lone Pine: granite-grey rock, decomposed-granite
  // soil, muted sage-meadow green. Replaces the old desert warm-brown palette.
  terrainRockColor:  0x72604b, // granite grey — steep faces AND high (above-treeline) terrain
  terrainDirtColor:  0x69481b, // alpine soil/decomposed-granite — moderate slopes (the "general" mid)
  terrainGrassColor: 0x426917, // muted sage — FERTILE/forest flats (above the basin floors; trees go here)
  terrainMeadowColor: 0x1c270c, // lush green — MEADOW basins (local lows where water collects)
  terrainCutoutColor: 0x757066, // engineered road cut face (man-made grey-tan, distinct from cliff)
  terrainFillColor:   0x6b5740, // dirt fill embankment / road foundation

  // Biome split (slope + altitude). slope = 1 - vertexNormal.y. Altitude = raw terrain world Y.
  terrainGrassSlopeMax: 0.16,  // [-] above this slope, no grass (too steep to hold meadow)
  terrainTreelineLo:    60,    // m — below this altitude grass is full; rock-alt term is 0
  terrainTreelineHi:    200,   // m — above this altitude terrain trends to bare granite (treeline)

  // Meadow (relative elevation). rel = rawHeight - localMean(radius). Negative = local basin
  // where water collects → lush meadow; rel ≈ 0 (flat bench) → fertile/forest green.
  terrainRelRadius:    40,     // m — neighbourhood radius for the local-mean low-pass (valley scale)
  terrainMeadowRelLo:  -12,    // m — rel at/below this (deep basin) reads full meadow
  terrainMeadowRelHi:  -2,     // m — rel at/above this (flat bench) reads fertile, not meadow

  // Procedural fbm detail (shared shader in terrain-detail.js — terrain + road shoulder).
  // terrainDetailScale is the master multiplier AND a perf kill-switch: 0 disables the
  // per-pixel noise entirely (escape hatch for weak GPUs — PERF-05 coordination).
  terrainDetailScale:    1.0,  // [-] master 0..1 (0 = no fbm mottle/bump at all)
  terrainNoiseScale:     0.15, // 1/m — fbm spatial frequency (~6.7 m period)
  terrainMottleStrength: 0.22, // [-] albedo mottle depth (multiplies biome colour)
  terrainBumpStrength:   0.7,  // [-] normal-perturbation strength on rocky/high terrain
  roadShoulderBump:      0.5,  // [-] gravel bump strength on the dirt road shoulder only
};
