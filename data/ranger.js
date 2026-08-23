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

  // ── Drivetrain (FEAT-23 Phase 1: engine → torque converter → automatic gearbox → final drive) ──
  // Replaces the old flat maxDriveTorque/maxReverseTorque stub. The chain lives in src/drivetrain.js,
  // stepped once per physics step; getDriveTorque reads the per-wheel result. All fields are debug-
  // tunable (Drivetrain & Brakes folder). Numbers picked for a 2002 Ranger 3.0L V6 + 4R44E 4-speed
  // auto so the climbing/taper behavior EMERGES from the model (not injected).
  //
  // Engine torque curve: ascending [rpm, N·m] control points (piecewise-linear lookup in drivetrain.js).
  // 2002 Ranger 3.0L Vulcan V6 ≈ 250 N·m (185 lb·ft) peak @ ~3750 rpm, ~145 hp @ 4750. Edit these points
  // to reshape the curve; engineTorqueScale is the global slider multiplier over the whole curve.
  engineTorqueCurve: [
    [ 800, 160], [1200, 195], [2000, 225], [2800, 242], [3750, 250],
    [4500, 240], [5200, 215], [5800, 150],
  ],
  engineTorqueScale:  1.0,   // [-] global multiplier over the torque curve (slider)
  engineIdleRPM:      750,   // rpm — governed idle floor; engine never drops below this
  engineRedlineRPM:  5500,   // rpm — rev limiter cuts torque above this (over 200 rpm band)
  engineIdleThrottle:  0.0,  // [-] idle-throttle floor for creep torque; 0 = no creep (keeps BUG-20 slope-hold at zero input). Raise (~0.04) for authentic automatic idle-creep.
  engineRpmLag:        0.0,  // s — first-order lag on engine RPM (0 = instant; ~0.1 adds rev-flare feel)

  // Torque converter (simplified quasi-static slip model): torque ratio = converterStallTorqueRatio
  // at zero speed ratio, falling to 1.0 at converterCouplingSR. converterStallRPM is the WOT stall
  // speed the engine holds against a locked turbine (the low-speed torque multiplication that launches
  // the truck off a steep grade).
  converterStallTorqueRatio: 2.0,   // [-] torque multiplication at stall (SR=0)
  converterCouplingSR:       0.86,  // [-] speed ratio at/above which the converter couples 1:1 (TR=1)
  converterStallRPM:         2400,  // rpm — WOT stall speed (turbine held, foot flat)

  // Automatic gearbox + final drive (4R44E-like). gearRatios[0] is 1st; wheel/axle torque =
  // turbineTorque × gearRatio × finalDrive, split open-diff across the two rear wheels (RWD Phase 1).
  gearRatios:   [2.47, 1.47, 1.00, 0.71],  // 4-speed ratios (1st→4th)
  finalDrive:   3.73,   // [-] axle final-drive ratio
  reverseRatio: 2.47,   // [-] reverse gear reduction (S-pedal is the reverse throttle)

  // Automatic shift schedule. Thresholds are in COUPLED (locked/no-slip) engine RPM = road-speed-in-gear,
  // NOT the converter-slipping engineRPM — see drivetrain.js (else the box lugs in top gear on a climb
  // because the stall speed floors engineRPM above the downshift point). Hysteresis: an upshift is blocked
  // if it would immediately fall below (shiftDownEff + 200); shiftHoldTime is the min dwell after any shift.
  shiftUpRPM:    5400,  // rpm(coupled) — upshift near redline (always-WOT play use, redline 5500)
  shiftDownRPM:  1300,  // rpm(coupled) — light-throttle/cruise downshift floor
  // kickdownRPM: WOT downshift point. The downshift threshold scales with throttle from shiftDownRPM (lift)
  // up to kickdownRPM (floored), so flooring it on a grade drops a gear into the power band. Keep below
  // ~shiftUpRPM/1.7 so a fresh upshift doesn't immediately re-trigger a downshift (hunting).
  kickdownRPM:   2400,  // rpm(coupled) — downshift point at wide-open throttle (kickdown)
  // shiftHysteresis: the PRIMARY anti-hunt lever. An upshift only fires if the NEXT gear's coupled RPM
  // would sit this far ABOVE the current downshift point — so the box only upshifts into a gear it can
  // actually hold. Bigger = firmer, hunts less (holds lower gears longer on grades); too big delays
  // upshifts on the flat. rpm(coupled).
  shiftHysteresis: 800, // rpm(coupled) — headroom the higher gear must clear before upshifting
  shiftHoldTime: 0.6,   // s — minimum dwell between shifts (anti-hunt timer)

  // Wheelspin shift-lock (FEAT-23): on an open-diff RWD burnout the rear wheels spin faster than the
  // truck moves, inflating the coupled RPM past the upshift point → the box hunts mid-slide. When the
  // driven-axle surface speed exceeds the ground reference (front wheels / CG speed) by more than
  // wheelspinThreshold [m/s], shifts are held. Measured normal grip slip p90 ≈ 6.7 m/s, burnout ≈
  // 10–20 m/s, so 7.5 locks only genuine wheelspin (not a gripping corner exit). Hook for a future
  // traction-control system (reads the same signal, exposed as vehicleState.drivetrain.wheelspin).
  wheelspinShiftLock: true, // master toggle for the wheelspin shift-lock
  wheelspinThreshold: 7.5,  // m/s — driven-vs-ground surface-speed excess above which shifts are held

  // Service brake, split front/rear (front-biased like a real car — more clamp up front where weight
  // transfers under braking). Consumed per-wheel by getBrakeTorque (front = wheels 0/1, rear = 2/3).
  maxBrakeTorqueFront: 1300,  // N·m — front axle service-brake torque per wheel-pair path
  maxBrakeTorqueRear:   450,  // N·m — rear axle service-brake torque (reduced to curb rear lockup)
  maxHandbrakeTorque: 4000, // N·m — rear-only handbrake; doubled from 2000 to actually lock rears; exposed as slider (D-16)

  // ── Rear differential (FEAT-23 Phase 2 seed) ──────────────────────────────────────────────────
  // rearDiffMode: 'open' | 'lsd' | 'locked'. Selected in the debug panel (Vehicle → Differentials →
  // Rear Differential). Open = equal torque split, wheels spin independently. LSD/locked add an internal
  // coupling torque ∝ the rear wheels' speed difference that shuttles torque from the faster (spinning)
  // wheel to the slower (gripping) one — a CLAMPED viscous coupling for LSD, a stiff one for locked.
  // Total axle torque is preserved (coupling only redistributes). Front diff + a per-axle final-drive
  // slider come later; kept intentionally minimal for now.
  rearDiffMode: 'open',
  diffLsdCoupling:  25,   // N·m per rad/s — LSD viscous coupling (torque per unit rear speed difference)
  diffLsdMaxTorque: 400,  // N·m — LSD coupling clamp (the "limited" in limited-slip; bias cap)
  diffLockCoupling: 30,   // N·m per rad/s — locked-diff coupling (stiff; ≤ ~36 keeps the explicit step stable)

  // Aerodynamic drag (FEAT-23): lumped Cd·A [m²]; F = ½·ρ·CdA·v² opposing horizontal velocity (ρ≈1.225).
  // Without it the geared drivetrain would accelerate to an unrealistic top speed; ~1.2 m² (Cd≈0.45 ×
  // ~2.7 m² frontal for a compact truck) settles top-gear cruise near ~150 km/h. 0 disables. Slider.
  aeroDragArea: 1.2,   // m² — lumped drag area Cd·A

  // Engine audio (FEAT-23, src/engine-audio.js): a simple WebAudio oscillator drone whose pitch tracks
  // engine RPM. Starts on the first keypress (browser autoplay gate). Placeholder sound — revisit later.
  engineAudioEnabled: true,  // master toggle for engine sound
  engineAudioVolume:  0.5,   // 0..1 volume

  // Tire-slip audio (src/tire-audio.js): procedural squeal on pavement / noise tear on dirt, gated by
  // per-wheel slip velocity (silent < 4 m/s, full at 12 m/s). Shares the engine's AudioContext.
  tireAudioEnabled:   true,  // master toggle for tire-slip sound
  tireScreechVolume:  0.7,   // 0..1 — pavement squeal (0.5 -> 0.7, owner: wanted it louder on tarmac)
  tireDirtVolume:     0.3,   // 0..1 — loose-surface roar
  // Rolling road noise (no slip required, per-wheel surface): blacktop hum+hiss and a quieter
  // rendering of the dirt roar. Rides the tireAudioEnabled toggle — it is tyre noise.
  tireRoadVolume:     0.4,   // 0..1 — rolling road noise, both surfaces

  // Wind noise (src/wind-audio.js): airspeed-driven aero roar + hiss, independent of the ground.
  windAudioEnabled:   true,  // master toggle for wind sound
  windVolume:         0.4,   // 0..1 volume

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
  frictionCoeff:      0.8,       // peak tire-road friction coefficient; caps Flat and Flong at μ*Fn

  // ── Body Contact (collision against walls/ramp faces) ────────────────────
  bodyContactStiffness: 200000,  // N/m — stiffer than tire; metal-on-terrain response
  bodyContactDamping:     1000,  // N·s/m
  // Rebound on a frame/undercarriage slam: the body leaves at this fraction of its approach speed.
  // 0 = fully plastic (the old BUG-27 thud — all impact energy absorbed, no bounce); 1 = perfectly
  // elastic. Only applies above REST_VEL_THRESHOLD (physics.js), so resting contact is untouched.
  // Tunable now that the solver uses a sampled-once bias (see BODY_RESTITUTION_DEFAULT) — the value
  // no longer compounds with probe/pass count the way BUG-27's did.
  bodyRestitution:        0.21,  // slight bounce — a 10 m drop rebounds instead of dead-stopping

  // ── Phase 3 Pacejka Tire Model (D-07) ────────────────────────────────────
  // Combined-slip Pacejka in SLIP-VELOCITY space (m/s). One isotropic curve, evaluated at
  // |s| = √(s_long² + s_lat²) where s is the relaxation-length-filtered slip displacement.
  // Peak force per wheel = frictionCoeff × pacejkaD × Fn. Hard-clamped at C=[1.0,1.99] in tire.js.
  pacejkaB:  10.0,   // stiffness factor — initial slope of force curve
  pacejkaC:   1.9,   // shape factor — C<2 required; hard-clamped in computeTireForces
  pacejkaD:   1.0,   // peak factor — peak force = frictionCoeff × D × Fn
  pacejkaE:  0.97,   // curvature — near 1.0 produces realistic post-peak falloff

  // Slip-velocity tire model parameters (added with combined-slip rewrite).
  // BUG-20: the steady-state grip curve depends only on the RATIO tireRelaxationLength/tireSlipVelRef
  // (= Pacejka(κ·L/vRef)), while the stored carcass displacement — and hence the slide-to-stop slosh
  // energy — scales with L alone. So L and vRef are shrunk together from the old 0.3/1.0 (ratio 0.3),
  // holding the ratio at 0.3: identical grip, ~1/3 the carcass displacement → the slosh is gone and
  // force builds snappier. Tune these via the coupled "Carcass Length / Slosh" + "Relax:VRef Ratio"
  // sliders (debug.js), NOT independently — moving one alone silently rescales grip.
  tireRelaxationLength: 0.135,     // m — carcass length / "sloshiness" (× vRef sets grip via the ratio)
  tireSlipVelRef:       0.3333,  // m/s — slip velocity ref; L/vRef = 0.3 reproduces the original grip curve
  tireStiffnessLong:    1.0,   // anisotropy hook — scale longitudinal slip component (default 1.0 isotropic)
  tireStiffnessLat:     1.0,   // anisotropy hook — scale lateral slip component (real tires ≈ 0.7×Long)
  tireBreakawaySlip:    0.18,  // BUG-20: friction-circle break-away, in Pacejka-ARGUMENT space (x =
                               // slip/vRef), so it pins to a fixed point on the grip curve (≈ the peak,
                               // x≈0.18 for B/C/E above) and its displacement limit auto-scales with
                               // vRef as the slosh/ratio sliders retune. Lower = lets go before peak;
                               // higher pushes past the peak into the unstable post-peak region.

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
  // Owner retune 2026-08-15: matched to the CORRECTED inertia axes (x=pitch, z=roll — FEAT-48
  // final fix). Stiffer/more-damped rear + softer front ARB + shorter carcass + μ 0.8 rebalance
  // roll/pitch response around the honest tensor. frictionCoeff 0.9→0.8 is deliberate
  // COMPENSATION, not a grip nerf: the old swapped-high roll inertia lifted inside wheels and
  // peeled drive torque away through the open diff; planted wheels at μ 0.8 pace the same —
  // owner verified par calibration stays close (no re-cal needed).
  suspensionStiffnessFront:  33000,   // N/m — 1.5 Hz body bounce at front sprung corner mass
  suspensionStiffnessRear:   33000,   // N/m — 1.5 Hz body bounce at rear sprung corner mass
  suspensionDampingFront:     3500,   // N·s/m
  suspensionDampingRear:      4000,   // N·s/m
  suspensionRestLengthFront:  0.20,   // m — travel allowance front axle (typical road truck)
  suspensionRestLengthRear:   0.22,   // m — slightly more rear travel (lighter unloaded rear)
  // wheelMass: unsprung mass per corner (tire + wheel + stub axle).
  // I = 0.5 × wheelMass × r²; wheelMass ≈ 18 kg matches wheelInertia derivation above.
  wheelMass:                    18,   // kg — per-corner unsprung mass (D-02)

  // wheelFootprint: tire-envelope ground sampling. When true (default), the wheel-contact query
  // samples a small stencil across the tire's footprint and rests the disc on the HIGHEST terrain it
  // can touch (envelope of h + √(r²−d²)), instead of a single point-probe under the hub. This stops the
  // tire sinking into troughs / clipping through crests on rumble strips and steep slopes. Set false to
  // revert to the legacy single-column probe (A/B comparison; also cheaper on very weak CPUs).
  wheelFootprint:             true,   // tire-envelope footprint sampling on wheel ground contact

  // ── Anti-Roll Bars (Phase 4 — D-06) ──────────────────────────────────────
  // Bilinear-spring approximation: ARB force shares the same lever arm as the main spring (D-07).
  // F_arb = arbStiffness · (suspComp[left] − suspComp[right]) per axle.
  // Front ARB stiffer than rear → promotes understeer balance for a Ranger.
  // At 0.5g lateral: target ≈5° body roll total; front+rear ARBs together provide this.
  arbStiffnessFront:   4500,   // N/m — front anti-roll bar stiffness (D-06)
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

  // ── Water features (FEAT-22 / FEAT-17 ponds / FEAT-18 streams / FEAT-24 meanders) ──
  // Consumed by src/water.js (WaterSystem); wired into terrain carve + render via main.js.
  // USER-OWNED tunable set (mirrors WATER_DEFAULTS in water.js — keep in sync).
  // Detection reads RAW terrain height only (carve-free); every knob feeds a
  // bounded, window-invariant computation (streamKeepFraction is a DETERMINISTIC
  // per-saddle hash, not a runtime dice roll).
  water: {
    // Ponds (FEAT-17, Plan-B rim fill):
    minBasinDepth:    12,   // m — RARITY DIAL: rim-above-floor closure depth to qualify a basin
    pondMaxRadius:    50,   // m — footprint cap (~100 m diameter; ponds, not lakes)
    pondSearchRadius: 64,   // m — rim ray-cast reach (≥ pondMaxRadius)
    pondRimSamples:   24,   // rays cast to find the rim (lowest ring peak = spill proxy)
    pondFreeboard:    1.5,  // m — waterLevel = rimHeight − freeboard (never overflows)
    pondSkirtWidth:   10,   // m — shoreline buffer: no road gen + scatter ground (FEAT-06)
    // Streams (FEAT-18, saddle-sourced gradient-descent trace):
    saddleMinDrop:    22,   // m — min traced descent to keep a stream (prominence/rarity dial)
    streamMinLength:  160,  // m — drop shorter trickles
    streamKeepFraction: 0.55, // FEAT-24 spawn-rate dial: deterministic per-saddle thinning (0..1)
    streamStep:       8,    // m — descent step length
    streamMaxLength:  1400, // m — hard cap on a trace (bounds the stream query margin)
    streamWidth:      3,    // m — channel bed half-width baseline (slope-scaled per point)
    streamDepth:      2.5,  // m — bed cut below surrounding terrain
    streamBankWidth:  5,    // m — bank ramp width (each side)
    streamWaterDepth: 0.6,  // m — water surface above the bed (render ribbon)
    // Meander / width character (FEAT-24 — Kennedy-Meadows meadow streams):
    meanderSlopeRef:  0.32, // VALLEY slope below which the meander engages (rework 2026-07-08:
                            //   alpine "flat" floors measure 12–30% at the 64 m scale — 0.10 meant
                            //   windiness almost never engaged; full meadow mode now below ~16%)
    meanderStrength:  1.5,  // 0..2 — master windiness dial (deviation amplitude scale)
    meanderWavelength: 90,  // m — meander bend spacing (rework 2026-07-08: 60 m lobes were barely
                            //   wider than the ~15 m flat-ground channel — telephone-cord read; 90 m
                            //   gives lazy loops at the same angular amplitude/sinuosity)
    meanderAmplitude: 1.35, // rad — limit-cycle deviation amplitude at full meadow factor
    meanderForce:     0.001,// rad/m² — fine-terrain phase coupling (keep small)
    meanderFineEps:   3,    // m — fine-gradient sample offset (senses the ripple layer)
    climbTolerance:   0.6,  // m — max micro-bump the trace may flow over (≈ ripple amplitude)
    stallSteps:       40,   // accepted steps without a new low ⇒ trace settles (generous: flats)
    widthFlatScale:   2.6,  // × streamWidth at zero slope (wide lazy meadow channel)
    widthSteepScale:  0.65, // × streamWidth at/above widthSlopeRef (narrow chute)
    widthSlopeRef:    0.10, // slope at which the width reaches the steep end
    widthSmooth:      0.25, // per-point EMA along the trace (width flicker damping)
  },

  // rampEnabled: when false, ramp triangles are skipped in queryContacts + queryVertexContacts,
  // and rampMesh.visible is set false via the setRampVisible callback in debug.js.
  rampEnabled: true,       // ramp collision + visibility toggle (FEAT-31 testing lab only)

  // FEAT-36/FEAT-48: what the throw key launches. 'paper' = the scoring newspaper (FEAT-61);
  // 'barrel' / 'rock' spawn dynamic engine debris (src/debris.js) — physics test projectiles,
  // selected from the debug panel. Debris throws never touch paper-route scoring or inventory.
  throwProjectile: 'paper',

  // ── Input Ramp Rates (FEAT-01) ───────────────────────────────────────────
  // Smoothed throttle/brake accumulators in vehicle.js ramp at these rates (1/s).
  // throttleRampRate: 4/s → full range in 250 ms
  // brakeRampRate:    8/s → full range in 125 ms
  // releaseRampRate: 20/s → release in ~50 ms (fast but not instant)
  throttleRampRate: 4,    // /s — drive/reverse input ramp (250 ms to full)
  brakeRampRate:    8,    // /s — brake input ramp (125 ms to full)
  releaseRampRate: 20,    // /s — release decay rate for both axes


  // roadMergeBand: how close an edge's two endpoints count as the "same node" — a DEGENERATE (collapsed)
  //   edge whose endpoints coincide within this band is skipped at graph assembly. m.
  roadMergeBand: 24,


  // roadJunctionFootprints: render the flat pad mesh at AT_GRADE crossings (FEAT-07 Step 2). Now ON: the
  // pad sits coplanar with the two strands the mid-span flatten eased to node.nodeY, so the crossing reads
  // as one paved intersection (mesh == the flattened collision surface). The old 296 ms stall is gone —
  // _detectJunctions() is the bounded, once-per-build, identity-cached crossing classifier (warmed by
  // _streamNetwork), so the per-tile build is a cache hit. Only AT_GRADE nodes get a pad (NEAR_PARALLEL =
  // glancing graze — no pad). Set false to hide the pads.
  roadJunctionFootprints: true,

  // QUAL-10/11 "cut-back-and-weld" junctions (buildJunctionFootprint + _detectNodeJunctions): the swept
  // ribbons are TRIMMED back from each graph node and a GRADED pad drops into the cleared room. QUAL-11:
  // the pad boundary is welded to each leg's real ribbon end cross-section and adjacent legs join with
  // tangent-arc fillets (roadFilletRadius) — no flare hiding the seam any more (roadJunctionFlare
  // removed; the QUAL-10 circle pad survives only as the self-intersection fallback). The fill rides the
  // real asphalt-top surface (road.sampleRoadTopY, FEAT-19 grade line) and draws with a stronger
  // polygonOffset (road-mesh.js _getJunctionMaterial) so it overlaps the trimmed ribbon ends seamlessly.
  // roadJunctionApronLift is an optional hair of Y over the ribbon (0 = coplanar; raise only if a pad
  // z-fights).
  roadJunctionApronLift: 0.0,
  // roadJunctionCutback: how many metres the swept ribbons are cut back from each junction node so the
  // pad has clean room (the pad mouths overlap the trimmed ribbon ends by halfWidth/2). The single
  // "intersection size" knob. Bigger = more open intersection; too big eats short links node↔node.
  roadJunctionCutback: 10,
  // roadJunctionCarveRadius: near a junction the terrain carve holds the road grade FLAT out to
  // (carve core + this radius) and eases crown/camber to flat, so terrain is dug/filled to the plaza
  // instead of clipping up through the pad. Keep ≈ the pad extent (≈ cutback) to avoid a bare-dirt ring
  // around the pad. 0 = off (no junction carve).
  roadJunctionCarveRadius: 7,
  // roadJunctionKinkDeg (QUAL-16): degree-2 graph nodes are a road CONTINUING through the node, but
  // each edge is routed independently so the two arrival tangents meet at a heading KINK. Above this
  // threshold (°) the node becomes a mini-junction — ribbons cut back, QUAL-11 weld/fillet pad fills
  // the corner (n=2: mouth → inside fillet → mouth → outside join) — so the driven surface is wide
  // and continuous through the kink. Below it (and for straight pass-throughs) ribbons stay
  // untouched: no pad spam. 0 = off. Kinks > 75° are never padded (degenerate strands).
  roadJunctionKinkDeg: 9,

  tunnelBoreRadius: 8,      // m — half-tube lining radius; also the physics bore-apex clearance

  // ── Crossing classifier (FEAT-07/11/13 foundation) ──────────────────────────────────────────────
  // road.js _detectJunctions() finds every inter-run / self-run XZ crossing and CLASSIFIES each by
  // crossing angle. Every crossing merges FLAT (at grade) — dynamic overpasses were descoped (roads in
  // the woods meet at grade, never float one over another). The class drives the pad style:
  //   NEAR_PARALLEL (angle < roadCrossAngleMin) — a glancing/duplicate graze, NOT a junction (no pad).
  //   AT_GRADE      (otherwise)                 — flatten both strands to one shared pad (FEAT-07).
  roadCrossAngleMin: 12,   // deg — crossings shallower than this are near-parallel grazes, not junctions.

  // roadGraphMaxDegree: cap on junction connectivity (2026-07-17/18 user preference: FEWER
  // 4-ways, not none — β-lune thinning was a no-op here because the blue-noise field makes
  // Urquhart ≈ RNG already). Nodes above this degree lose incident edges longest-chord-first,
  // each drop connectivity-safe (drop-aware detour, evaluated live). 0 = off. Pair with
  // roadGraphDegreeDetourHops to control HOW redundant an edge must be to qualify.
  roadGraphMaxDegree: 3,
  // roadGraphDegreeDetourHops: the degree pass may only drop an edge whose endpoints reconnect
  // within this many hops — the partial-thinning dial. Measured, seed-6 landmark window at
  // cap 3: hops 2 = no-op (no 4-way there is a trivial triangle diagonal), hops 3 = 4-ways
  // 6→3 (half thin, half survive load-bearing), hops 8 = all gone (the reverted hard cap).
  roadGraphDegreeDetourHops: 4,
  // ── FEAT-13 v2 blue-noise anchor + Urquhart knobs (graph mode only) ──
  // roadSiteSpacing: the PRIMARY density knob — cell size (m) the blue-noise anchor sites are seeded over
  // (≈ one site per cell after Poisson thinning), DECOUPLED from the 256 m macro-grid. 640 m ≈ a sparse
  // remote forest-service network: ~4 nodes/km², ~670 m between junctions, ~45% dead-end spurs. Smaller =
  // denser (256 = the old tight grid). Pair roadSiteMinDist ≈ 0.65× this.
  roadSiteSpacing: 640,
  // ── FEAT-68 corridor router (v2) price list ──────────────────────────────────────────────────
  // The router buys elevation with MONEY, never with length, so every entry is a price expressed in
  // METRES OF FLAT ROAD (cRoadM = 1 is the numéraire: "a metre of bore costs the same as N metres of
  // road"). This replaced v1's ~15 interacting abstract weights with ~5 physically-meaningful ones.
  //
  // It lives HERE, in RANGER_PARAMS, rather than as a module constant in corridor-router.js, for two
  // reasons: the debug sliders bind the same object every other road knob binds (so a live edit is
  // never aliased away by a hot-module reload swapping the algorithm module underneath the panel),
  // and RoadSystem hands this object to each route job — which is what makes a Worker, a separate
  // module instance with its own defaults, price exactly what the main thread prices.
  roadV2: {
    cRoadM: 1.0,      // on-grade road, per m — the unit everything else is quoted in
    // Grade discomfort: cost/m factor is 1 + wGrade·g². Climbing H m at grade g costs about
    // H·(1/g + wGrade·g), minimised at g* = 1/√wGrade — so this sets the grade the router WANTS to
    // climb at. 40 put g* at 16% and the solver just took steep straights (owner: "no switchbacks");
    // 120 puts g* near 9%, forest-road grade, so length wins against sustained steepness.
    // Owner review 2026-08-20: 120 → 180 alongside cTurn 30 → 55 — "this forces a little more
    // turning without it being free and everywhere". g* = 1/√180 ≈ 7.5%.
    wGrade: 180,
    cCutM: 0.15,      // cut, per m of length per m of depth (linear haul term)
    // Quadratic cut term (owner 2026-08-18: "no visual difference in the mountaintop above a tunnel —
    // just carve a clean hole"): real cuttings go superlinear past ~8 m (rock walls, stabilisation),
    // and without it the solver trenched to the 20 m class boundary before conceding a portal.
    // Cut ≈ bore at ~9 m now, so portals emerge at bench depth and approach notches stay small.
    cCut2: 0.12,
    cFillM: 0.12,     // fill, per m of length per m of height
    cBoreM: 12.0,     // bore, per m (owner 2026-08-18: "too happy to tunnel" — raised 8 → 12)
    cPortal: 250,     // fixed, per bore portal (also raised — kills pop-through mini-bores)
    // Direction-change cost, per RADIAN — the hairpin dial. The corridor search is heading-free, so
    // without this a ladder of twenty micro-zigzags prices identically to two long traverses and the
    // search has no reason to prefer the buildable shape (v1's roadWTurn lesson as a physical knob).
    // Measured on the eval trio: 15 → 20/38/32 hairpins, 30 → 17/21/24, 60 → 17/15/11, with grade
    // compliance identical at all three — it trades hairpin density against sweep, nothing else.
    // Owner review 2026-08-21 (set from the live sliders): 55 -> 45.
    cTurn: 45,
    // Bridges are DE-SCOPED from the vocabulary (owner 2026-08-18): real forest bridges are short,
    // same-elevation water crossings, not grade machines — and valley-spanning decks raise "why is
    // there no road down there". Machinery stays; flip bridgesOn to re-enable. The planned way back
    // is a post-router conversion of stream/water crossings only.
    bridgesOn: false,
    cBridgeM: 20.0,   // bridge deck, per m (only read when bridgesOn)
    cAbutment: 100,   // fixed, per bridge end (only read when bridgesOn)
    cutMax: 20,       // m below ground where a cut becomes a BORE — a 12–20 m trench is an open rock
                      // cutting at road grade cap, not a tunnel; at 12 the bore's 18% cap
                      // rate-limited legitimate cliff descents through deep-cut pockets
    fillMax: 8,       // m above ground where a fill would become a bridge (so: the fill ceiling)
    // Vertical corner-rounding window in METRES (0 = off). The solved profile is defined at ~10 m
    // stations and lerped onto the 4 m polyline, so grade is constant within a station and changes
    // INSTANTANEOUSLY at each one — a corner every 10 m, which reads as a periodic tick through the
    // suspension however small the grade step (owner 2026-08-20: "lots of tiny microcrests and
    // troughs"). This low-passes the shipped samples so each corner becomes a short vertical curve.
    //
    // MEASURED, and the curve is not monotone — more is NOT smoother. Vertical jolt (v²·dg/ds at
    // 20 m/s, p99 over seeds 20/11): 0 m → 0.51/0.46 g · 15 m → 0.24/0.24 g · 30 m → 0.48/0.45 g.
    // Past ~2 stations the ±0.25 m displacement bound starts clipping, and clipping puts corners
    // back. 15 m ≈ 1.5 stations is the floor of that curve, which is why the slider stops at 25.
    // Crest airtime survives (strongest crest 0.31 → 0.25 g) because a real crest spans many
    // stations; the bound is half the solver's own elevation quantum, so the shipped road never
    // departs from the priced one by more than the solver could resolve in the first place.
    vSmoothM: 15,
    onTol: 0.75,      // m — |deck − ground| within this counts as on-grade
    // Owner review 2026-08-21 (set from the live sliders): 0.35 -> 0.24. The ladder's relief rung
    // then solves refusals at min(0.38, 0.27), and the ceiling rung still guards the 0.38 contract.
    gMaxRoad: 0.24,   // hard vocabulary cap for surface states (the sustained ceiling is 0.40)
    gMaxBore: 0.18,   // bores are gentler by construction (FEAT-40 lineage)
    // BUG-53 merge (phase 2, owner ruling 2026-08-22): "evaluate where these come within some
    // proximity of one another, then merge and share one run until they diverge again or hit a
    // node". Two runs leaving the same node CONFLICT while their centres are within mergeProxM;
    // the loser adopts the winner's course from the node out to the last conflict, then tapers
    // back onto its own. 18 m is the shared-earthworks distance — halfWidth 5 + shoulder 2.5 each
    // side + 3 m carve extra — i.e. the separation below which the two roads write their cut/fill
    // stencils into the same terrain vertices. Owner-set 2026-08-22.
    mergeProxM: 18,
    // A merged pair may swing apart and come back — that FLARE is a bulge in one road, not two
    // roads going different places, so the merge bridges it and the bulge disappears. Both bounds
    // are measured off the owner's seed-3 captures, whose flares run 35 m (1598/5875), 44 m
    // (-105/2418) and 49 m (1044/7423, which also crosses itself inside its flare — the reason no
    // separate crossing rule is needed: two polylines that meet are already in conflict). Wider or
    // longer than these and the legs are genuinely going somewhere different: the merge stops at
    // the first divergence and the flare is counted.
    mergeFlareM: 60,   // m — widest the pair may swing apart inside a merge
    mergeGapM: 200,    // m — longest flare the merge may bridge, measured along the run
    // MID-SPAN merges (legs that part at the node and only run together far out) are built and
    // measured but OFF by default: re-solving the loser's tail from the winner's deck changes its
    // approach grade into its far node, and the junction pad there — which is not part of that
    // solve — ends up sitting above the road it serves. Measured as collision cliffs of 1.75 m
    // (seed 7) and 2.37 m (seed 6) about 14 m out from the node, which road-smoothness catches.
    // Turn on to work the class; it needs the junction pass (naive meets at degree >= 3) first.
    mergeMidSpan: false,
    // BUG-55 pair census: an edge is a CANDIDATE conflict partner of a registering edge when its
    // node-to-node CHORD comes within this of the registering edge's ROUTE polyline. Chord-to-
    // chord was measured useless (blue-noise keeps chords >= 407 m apart while routes wander up
    // to 657 m off their chords and land 0.3 m from each other — the seed-6 (3328,-27) tear);
    // chord-to-ROUTE catches a conflict whenever the partner's own wander is under this bound,
    // measured 0-4 fresh partner routes per window at 300. A pair BOTH of whose members wander
    // beyond this is blind to the census — identically so in every window (the test is a pure fn
    // of one route + one chord), so it is a counted coverage bound, never a tear risk.
    // overlap-census reports each real conflict's best-direction chord-to-route distance so this
    // stays measurably above the max.
    censusChordM: 300,
  },

  // roadSiteCandidates: seeded candidate sites PER cell before Poisson-disk thinning. >1 breaks the
  // residual grid regularity (one-per-cell still reads as rows); 2–3 gives an organic blue-noise field.
  roadSiteCandidates: 3,
  // roadSiteMinDist: Poisson-disk minimum spacing (m) between accepted anchor sites — thins WITHIN the
  // cell grid for an even, row-free field. Keep ≈ 0.65× roadSiteSpacing. Lower = denser/closer anchors.
  roadSiteMinDist: 420,
  // roadSiteValleySnap: gradient-descend each site onto the local valley floor (like the rows anchors) so
  // roads still favour valleys. false = sites stay at their seeded jitter position (more even, less natural).
  roadSiteValleySnap: false,
  // roadGraphMargin: cells of padding around the stream band over which the Urquhart graph is computed, so
  // an interior edge's membership is independent of the stream center (window-invariance). 3 is ample for
  // blue-noise spacing; raise only if the invariance gate reports center-dependent interior edges.
  roadGraphMargin: 3,

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

  // Camber (road banking) — SATURATING superelevation model (src/road.js camberFromCurvature):
  //   camber(κ) = camberMaxAngleDeg · |κ| / (|κ| + 1/camberKneeRadiusM)   (sign from κ).
  // Replaces the old linear `camberStrength·κ` (unbounded, hard-clamped, over-banked hairpins the
  // instant gentle curves got any bank). The saturating form self-bounds at camberMaxAngleDeg and its
  // effective gain DECREASES with curvature → more bank per unit curvature on sweepers/long curves,
  // less on hairpins. Defaults hit ~4/10/15 effective "strength" at a hairpin / 50 m sweeper / long
  // curve, i.e. ~16° at R=15 m, ~11° at R=50 m, ~5.7° at R=150 m. Both exposed via debug sliders.
  camberMaxAngleDeg:  20,   // asymptotic max bank (deg) tight hairpins approach; also the effective cap
  camberKneeRadiusM:  60,   // radius (m) that gets HALF of max bank — raise to push strong banking
                            // out to gentler curves, lower to concentrate it on tight ones

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

  // ── QUAL-13: sloped junction pads ────────────────────────────────────────────
  // A ≥3-way junction pad is a PLANE, not a level disc. Its grade vector is least-squares fit
  // from the incident roads' arrival slopes (the pad "splits the difference" of what the roads
  // are already doing), clamped to roadJunctionPadMaxGrade. 0 = flat pads (pre-QUAL-13).
  roadJunctionPadMaxGrade: 0.07,   // rise/run — max pad plane grade (~7%, drivable intersection)
  // The pad's elevation may shift from the mean approach-Y toward the terrain median over the pad
  // disc (L1 fit) by at most this many metres — shrinks uphill cut walls without letting the pad
  // chase a gully/ridge far from every approach road. 0 = off (elevation = mean approach Y).
  roadJunctionPadTerrainBias: 3.0, // m — cap on terrain-seeking pad elevation shift
  // Adaptive approach-blend reach: when a run's own graded endpoint sits far above/below the pad
  // plane, easing it over the fixed roadJunctionBlendLength would create a 60–130% artificial
  // grade spike (the QUAL-13 junction grade artifact). The grade blend stretches so the
  // correction itself never exceeds this grade (camber blend keeps the fixed reach).
  roadJunctionBlendMaxGrade: 0.12, // rise/run — max artificial grade the junction blend may add

  // FEAT-10: roadJoinWeldLength — how far from a run's endpoints the ribbon cross-section tangent
  // blends toward the node's edge heading (_edgeTerminalHeading), so adjacent runs build the
  // SAME endpoint cross-section and their ribbon edges line up (seals the outside-of-bend wedge at run
  // joins). m. 0 = off (endpoint tangent = local last-segment direction, the un-sealed default).
  roadJoinWeldLength: 6,

  // roadFilletRadius: junction pad corner fillet radius (QUAL-11). The tangent arc joining two
  // adjacent legs' facing ribbon-edge lines — how rounded the pad corners are. Shrunk automatically
  // where a corner is too tight to fit (and ×0.5 once more if the boundary self-intersects).
  roadFilletRadius: 5,          // m — junction pad corner fillet radius (QUAL-11)


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
  // (this far below) off the ribbon edge, so clipping the edge is punishing (BUG-15). 0.15 m = a
  // gentle edge that settles the car on shoulder↔road transitions (was 0.25 m — a taller, jolting lip)
  // while still keeping enough dropoff that the decal never clips terrain on banked turns.
  // Range: 0–1.5 m. Exposed as a Road Surface debug slider ("Clearance Margin (m)").
  roadClearanceMargin: 0.15,    // m — terrain (and physics shoulder) sits this far BELOW the ribbon (Plan 09-11 / D3)

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

  // ── Tire smoke (src/smoke.js — visual polish) ─────────────────────────────────
  // Grey burnout/wheelspin smoke, structurally reused from dust.js's puff pool but with its
  // own emission model: quantity needs slip velocity AND normal force together (a loaded,
  // slipping tyre), not either alone — see smoke.js header. Works on any surface, unlike dust,
  // which is why there's no on-road fade knob here.
  smokeEnabled: true,
  smokeColor: 0xcfcfcf,        // hex RGB — light grey smoke tint
  smokeAmount: 1.0,            // [-] emission density multiplier

  // ── Dirt spray (src/dirt-spray.js — visual polish) ────────────────────────────
  // The loose-surface counterpart to tire smoke: a slipping tyre on dirt throws a dense stream of
  // dark clods backwards out of the contact patch, and those clods shed slow, draggy dust motes
  // that hang in the air. Gated by combined contact-patch slip (vLong/vLat) AND the loose-surface
  // factor, so it is effectively absent on the paved ribbon (where smoke takes over instead).
  // dirtSprayColor: base tint — clods darken it, floaters lighten it. Defaults to dustColor when
  // unset so the palettes stay in family.
  dirtSprayEnabled: true,
  dirtSprayAmount: 1.0,        // [-] emission density multiplier
  dirtSprayColor: 0x8a7350,    // hex RGB — thrown-earth tint (between dustColor and roadDirtColor)

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
