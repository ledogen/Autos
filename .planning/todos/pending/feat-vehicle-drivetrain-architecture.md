---
id: FEAT-23
type: feat
status: open
opened: 2026-07-05
severity: major
source: user-observation (steep-grade stall + unrealistic high-speed accel) + product direction (parts/architecture system)
relates_to: getDriveTorque (src/physics.js), RANGER_PARAMS.Drivetrain (data/ranger.js), FEAT-24 (visual vehicle swap hook)
---

# FEAT-23: Vehicle drivetrain architecture & parts-selector system

## Vision

RangerSim should let the player **modify the vehicle's drivetrain architecture** through a simplified
in-game parts selector, and have the physics respond honestly (per the project's core value: "tuning
parameters produces the expected result"). The full scope — deliberately left OPEN as a standing reminder
after Phase 1 ships — is:

- **Drive layout**: 2WD (RWD default) / 4WD / (stretch: FWD, AWD with center diff).
- **Transmission**: automatic (with torque converter) / manual (with clutch); selectable gear count.
- **Gearing**: variable final-drive ratio; variable per-gear ratios (a gear-ratio table the player edits).
- **Differentials** (per axle): open / limited-slip (torque-biasing or clutch-pack) / locked.
- **Parts selector UI**: a simplified menu (debug-folder first, dedicated UI later) that swaps these
  architecture choices and re-derives the physics parameters, rather than editing raw torque scalars.

This is a large, multi-phase effort. It is captured as ONE ticket so the architecture stays coherent; it
will be delivered in slices. **Phase 1 (below) is the only in-scope work right now** — the rest of this
ticket remains open as the roadmap for the parts/architecture system.

## Motivation (why Phase 1 first)

Two concrete, user-reported physics problems both trace to the Phase-1 flat-torque drivetrain stub in
`getDriveTorque` (src/physics.js), which returns `throttle × maxDriveTorque` (800 N·m at the wheel) at
**every** speed:

1. **Steep-grade stall + brake/throttle oscillation.** 800 N·m over the 0.368 m wheel radius is only
   ~2170 N of tractive force. A 20% grade needs `m·g·sinθ` ≈ 1360·9.81·0.196 ≈ 2610 N just to hold
   station — more than the truck can produce. On a steep road it stalls, rolls backward past the
   `FWD_THRESHOLD` (−0.556 m/s) where `getDriveTorque` cuts drive to zero, and the input router flips
   between "drive" and "brake/reverse" — the "stuck alternating" behavior.
2. **Unrealistic acceleration at speed.** The same flat 800 N·m at 30 m/s still delivers full tractive
   force, so the truck keeps pulling hard at highway speed with no torque falloff — nothing models the
   fact that a real drivetrain runs out of engine RPM in high gear.

A **gear-reduction + torque-converter** model fixes BOTH at once: first gear multiplies engine torque by
`gearRatio × finalDrive` (≈ 9–15×) for real hill-climbing grunt, while high gears drop wheel torque as
road speed rises, so acceleration tapers realistically. The torque converter adds low-speed torque
multiplication and lets the engine hold RPM (and thus torque) while the wheels are nearly stopped —
directly curing the stall-and-roll-back oscillation.

---

## Phase 1 (IN SCOPE NOW): automatic transmission + simplified torque-converter slip

Replace the flat-torque stub with a lightweight engine → torque-converter → automatic-gearbox → final-drive
chain that produces wheel torque. Keep it hand-rolled, tunable, and cheap (target: negligible per-step
cost; no allocation in the hot loop).

### Model (simplified, all tunable via debug sliders + `data/ranger.js`)

1. **Engine torque curve.** `engineTorque(rpm) = throttle × curve(rpm)`. A simple piecewise/lookup curve
   peaking near a mid RPM (2002 Ranger 3.0L V6 ≈ 250 N·m @ ~3750 rpm, ~145 hp @ 4750), tapering to an
   idle floor and a redline cutoff. Idle torque keeps the truck creeping and prevents true stall.
2. **Torque converter (simplified slip model).** Input = engine, output = transmission turbine.
   - Speed ratio `sr = turbineRPM / engineRPM`.
   - Torque ratio `TR(sr)`: ≈ `stallTorqueRatio` (~2.0) at `sr=0`, falling linearly to 1.0 at the
     coupling point (`sr ≈ 0.85–0.9`), then 1.0 (locked-ish) above.
   - Converter passes `turbineTorque = TR(sr) × engineTorque`; engine RPM is found from the wheel/turbine
     speed plus a slip term so the engine can spin faster than the turbine at low speed (the mechanism
     that lets it rev up off a stall). A simple capacity/K-factor relation or a slip-vs-load approximation
     is acceptable — no full lockup-clutch fidelity required.
3. **Automatic gearbox.** N-speed ratio table (default 4-speed 4R44E-like: ~[2.47, 1.47, 1.00, 0.75]).
   Turbine speed → engine RPM through the current gear; wheel/axle torque = `turbineTorque × gearRatio ×
   finalDrive` (default final drive ~3.73 or 4.10). Shift schedule: upshift above an RPM threshold,
   downshift below one, **with hysteresis** (and ideally throttle-dependent shift points) so it does not
   hunt. Optional short torque-cut/blend during a shift to avoid a torque step.
4. **Axle → wheels.** Phase-1 layout stays **RWD open diff**: split axle torque across the two rear
   wheels. (Full diff models — LSD/locked, and 4WD split — are later phases of this ticket.) NOTE: the
   current stub sends full torque to *each* rear wheel (effectively doubling/locking); Phase 1 should
   define the open-diff split honestly so later diff work has a correct baseline.

### Integration points (from code read)

- `getDriveTorque(wheelIndex, vehicleState, params)` — src/physics.js:45 — is the single hook, called
  per-wheel inside the ω integrator (physics.js:455) with `vehicleState.wheelOmega[i]` available.
- Recommended shape: a new pure-math module `src/drivetrain.js` (no Three.js, matches module conventions)
  owning drivetrain STATE (`engineRPM`, current `gear`, shift timers). Step it **once per physics step**
  from the rear-axle ω (using start-of-step `wheelOmega`, consistent with the existing operator-splitting),
  producing a per-wheel drive-torque array; `getDriveTorque` then just reads that array. This avoids
  recomputing shared engine state 4× per step.
- New `vehicleState.drivetrain` state must be registered in the **three** vehicleState locations
  (SPAWN_STATE in vehicle.js, the main.js literal, and the main.js reset path) — see memory
  `project_vehiclestate_three_places`.
- Reverse: route through the model's reverse gear (single reduction), not the old `maxReverseTorque`.
- Idle-creep / rollback: engine idle torque through the converter should let the truck hold or creep on
  moderate grades and, on grades it truly can't climb, roll back **smoothly** without the drive/brake
  flip. Revisit the `FWD_THRESHOLD`/`REV_THRESHOLD` input routing so a torque-converter idle interacts
  cleanly with it.

### New params (data/ranger.js, all debug-tunable)

Engine curve control points, `stallTorqueRatio`, converter coupling speed-ratio, `gearRatios[]`,
`finalDrive`, `shiftUpRPM`/`shiftDownRPM` (+ hysteresis), `idleRPM`, `redlineRPM`, `driveLayout`
(RWD for now). Remove/deprecate `maxDriveTorque`/`maxReverseTorque` once the model replaces them (keep a
mapping note; the debug "Drivetrain & Brakes" folder must be updated — memory `feedback_phase_housekeeping`).

### Acceptance (Phase 1)

- **Climbs a steep road**: on a sustained ~20–25% grade the truck accelerates from a stop up the hill and
  holds a steady climbing speed — no stall, no drive/brake oscillation. (Verify in-sim on a real generated
  switchback and/or a headless ramp scenario via the physics-replay harness.)
- **Realistic high-speed taper**: acceleration clearly falls off as speed rises through the gears; the
  truck does not keep pulling at full tractive force at 30 m/s. Top-gear cruise settles at a believable
  terminal speed on the flat.
- **Automatic behaves**: gears up under acceleration and down when loaded/slowing, with **no shift hunting**
  (hysteresis holds through the shift-point band); engine RPM stays between idle and redline.
- **Torque converter reads honestly**: at a stall (foot on throttle, wheels held) engine RPM rises toward
  the stall-speed while turbine is near zero, delivering multiplied torque; converts to near-1:1 as road
  speed matches gear.
- **No regressions**: existing physics gates in `npm test` stay green; low-speed static-friction hold on
  slopes (BUG-20) is unaffected; a HUD/debug readout shows gear + engine RPM for tuning.
- Params exposed as sliders in the debug "Drivetrain & Brakes" folder; gear/RPM added to the scenario log
  fields.

## Later phases (OPEN — do NOT implement in Phase 1)

- **P2 — Differentials**: open / LSD (torque-bias or clutch-pack) / locked, selectable per axle; correct
  torque split + wheel-speed coupling. (Phase 1 leaves a correct open-diff baseline.)
- **P3 — Drive layout**: 4WD (transfer case, front+rear axle drive), then optional AWD/FWD.
- **P4 — Manual transmission**: clutch model + manual gear input (keys), stall on clutch dump, rev-match.
- **P5 — Parts-selector UX**: a simplified selector (beyond raw sliders) that swaps architecture presets
  and re-derives params; ties into FEAT-24 visual vehicle-swap hook if a body/model changes with it.

## Notes

- Keep the whole chain **hand-rolled and cheap** (project constraint: 60fps, lightweight physics; no
  physics lib). Prefer lookup/piecewise over transcendental-heavy curves in the hot path.
- Character must EMERGE from the model, not be injected — pick honest engine/converter/gear numbers for a
  2002 Ranger and let the climbing/taper behavior fall out (memory `feedback_emergent_over_injected`).
- Being worked on a separate worktree (`worktree-drivetrain-model`) to stay clear of concurrent road/water
  work on `main`.
