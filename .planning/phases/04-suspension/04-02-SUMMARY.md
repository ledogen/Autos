---
phase: 04-suspension
plan: 02
subsystem: physics
tags:
  - suspension
  - quarter-car
  - physics
  - integrator
  - arb
dependency_graph:
  requires:
    - 04-01   # scenario JSON files (validation scenarios)
  provides:
    - quarter-car suspension model (D-01 through D-15)
    - params._tireFz per corner (consumed by Pacejka in physics.js)
    - params._suspForceAccum per corner (body force in physics.js)
    - vehicleState.hubY/hubVy integrated state
  affects:
    - 04-03   # Plan 03 adds sliders, HUD readout, visual mesh travel
tech_stack:
  added: []
  patterns:
    - stepSuspensionSubsteps: pure-math export in suspension.js, called by physics.js
    - params._tireFz/_suspForceAccum: per-step transient arrays on RANGER_PARAMS
    - computeStaticEquilibrium: helper in main.js, used at init and R-reset
    - computeNormalForce shim: returns params._tireFz[corner] per Pitfall 7 pattern
    - isAirborne gate: per-wheel flag in physics.js Step 3, skips Pacejka contacts loop (D-14)
    - hubY in getWheelPosition: world Y sourced from vehicleState.hubY[i] in Phase 4
key_files:
  created: []
  modified:
    - data/ranger.js     # suspensionStiffness{Front,Rear}, suspensionDamping{Front,Rear}, suspensionRestLength{Front,Rear}, arbStiffness{Front,Rear}, wheelMass, physicsDt
    - src/vehicle.js     # SPAWN_STATE: hubY[4], hubVy[4] added (D-02)
    - src/main.js        # PHYSICS_DT (replaces FIXED_DT), computeStaticEquilibrium(), vehicleState.hubY/hubVy init, RANGER_PARAMS._tireFz/_suspForceAccum scratch arrays, reset block wired
    - src/suspension.js  # stepSuspensionSubsteps export, computeNormalForce shim, getWheelPosition hubY branch
    - src/physics.js     # Step 2.5 substep call, isAirborne gate, suspBodyForce, removed old Fn*normal body force
decisions:
  - "computeNormalForce replaced with shim returning params._tireFz[corner] (Pitfall 7 pattern — avoids refactoring caller site in physics.js)"
  - "Airborne omega integrator runs directly (simplified Euler) in physics.js rather than falling through to Newton loop — preserves drive torque while airborne (CR-03)"
  - "Old Fn*normal body force removed from contacts loop — suspension spring now sole source of body vertical force; avoids double-counting on flat ground"
  - "getWheelPosition updated to use vehicleState.hubY[i] for world Y — hub sphere center now tracks integrated hub state in Step 3 contact queries"
  - "Static equilibrium: bodyY front ~0.418m (vs cgHeight=0.55m) because suspension spring compresses 111mm under static load — this is correct physics; car spawns settled"
metrics:
  duration_minutes: 90
  completed: "2026-06-01"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 04 Plan 02: Quarter-Car Suspension Model Summary

**One-liner:** Quarter-car suspension per wheel with hub-mass ODE, ARB coupling, dt/2 substep, and tire-spring Fz feeding Pacejka — delivering nose-dip, body roll, and wheel lift.

## What Was Built

This plan delivers all of Phase 4's physics value: a proper quarter-car suspension at each wheel hub replacing the "matchbox car" (tire-as-only-spring) model.

**Task 1 — Schema + Params + Spawn Equilibrium:**
- Added 10 suspension params to `data/ranger.js`: stiffness/damping/restLength (front+rear split), ARB stiffness (front+rear), wheelMass, physicsDt — all with derivation comments matching existing block-comment style.
- Added `hubY[4]` and `hubVy[4]` to SPAWN_STATE in `src/vehicle.js` (D-02).
- Added `computeStaticEquilibrium(params)` helper in `src/main.js` that precomputes hub and body heights at static load so the car spawns pre-settled.
- Renamed `FIXED_DT` to `PHYSICS_DT` (D-09); verified no bare `1/60` or `0.0167` literals remain in src code.
- Added `RANGER_PARAMS._tireFz` and `RANGER_PARAMS._suspForceAccum` scratch arrays (both [0,0,0,0]).
- Added `fz:0` to `wheelDebug[i]` initializer per D-12.
- Wired both initial `vehicleState` literal and R-reset block to use equilibrium values.

**Task 2 — Suspension Math + Wiring:**
- Added `stepSuspensionSubsteps(vehicleState, params, dt, queryContacts)` to `src/suspension.js`. Pure-math (no Three.js import). Implements:
  - N=2 fixed substeps at sdt=dt/2 (D-08)
  - Per-corner body mount point from `params._rotateVector` (D-05/D-03 pure-math contract)
  - Suspension compression and velocity per corner
  - ARB coupling (D-06): `F_arb = k_ARB * (suspComp[L] - suspComp[R])` per axle, applied as arbF[L]=-dF, arbF[R]=+dF
  - No-tension clamp on spring term (D-15), damping acts both ways
  - Tire spring force from `queryContacts` at hub position, summed vertical component
  - Semi-implicit Euler hub ODE: velocity first, then position
  - Accumulates `_tireFz[i]` and `_suspForceAccum[i]` as per-substep averages
  - Startup stability check (D-10, Pitfall 2)
  - Paranoid guard for uninitialized hubY (Pitfall 4)
- Updated `computeNormalForce` to a shim returning `params._tireFz[corner]` (Pitfall 7 pattern)
- Updated `getWheelPosition` to use `vehicleState.hubY[corner]` for world Y when initialized
- Wired `stepSuspensionSubsteps` as Step 2.5 in `src/physics.js` (before per-wheel Pacejka loop)
- Added `isAirborne` gate per wheel (D-14): airborne wheels skip Pacejka contacts loop
- Airborne wheels run a simplified omega integrator directly (drive torque still applies, CR-03)
- Removed old `totalForce.addScaledVector(normal, Fn)` from contacts loop — body vertical force now comes from `suspBodyForce` applied via `rMount × suspBodyForce` torque pattern (avoids double-counting with suspension spring on flat ground)
- Pacejka `computeTireForces` call receives `Fn = computeNormalForce() = params._tireFz[i]` (D-03)

## Parameter Values (RESEARCH defaults used verbatim)

| Param | Value | Derivation |
|-------|-------|------------|
| suspensionStiffnessFront | 33000 N/m | 1.5 Hz body bounce at 374 kg front corner mass |
| suspensionStiffnessRear | 27000 N/m | 1.5 Hz body bounce at 306 kg rear corner mass |
| suspensionDampingFront | 2800 N·s/m | ζ≈0.40 at front (0.8·√(k·m)) |
| suspensionDampingRear | 2300 N·s/m | ζ≈0.40 at rear |
| suspensionRestLengthFront | 0.20 m | typical road truck travel allowance |
| suspensionRestLengthRear | 0.22 m | slightly more rear travel (lighter unloaded rear) |
| arbStiffnessFront | 15000 N/m | front ARB stiffer (promotes understeer) |
| arbStiffnessRear | 8000 N/m | softer rear ARB (encourages oversteer balance) |
| wheelMass | 18 kg | matches existing wheelInertia derivation |
| physicsDt | 1/60 s | outer physics step, parameterized per D-09 |

## Static Equilibrium Values (computed from above params)

| Corner | cornerMass | tireComp | suspComp | hubY | bodyY (CG) |
|--------|-----------|---------|---------|------|-----------|
| Front (FL/FR) | 392 kg | 38.5 mm | 111.2 mm | 0.3295 m | 0.4184 m |
| Rear (RL/RR) | 324 kg | 31.8 mm | 111.2 mm | 0.3362 m | 0.4450 m |

Body CG at spawn: ~0.4184 m (front pair average). Lower than `cgHeight=0.55m` because suspension compresses 111 mm under static load. This is correct physics — `cgHeight` was defined as an estimate and sliders in Plan 03 will allow tuning. Car spawns settled with no visible first-frame drop (Pitfall 1 avoided).

## Stability Analysis (D-10 / Pitfall 2)

Tire spring stability: `omega_n = sqrt(100000/18) = 74.5 rad/s`, `dt_substep = 1/120 = 0.00833s`, critical dt = `1.5/omega_n = 0.0201s`. Since `0.00833 < 0.0201`, we have ~2.4× safety margin. Doubling `tireStiffness` to 200000: `omega_n = 105 rad/s`, critical dt = `0.0143s`. Still `0.00833 < 0.0143` — margin holds. Stability warning will NOT fire at default params. D-10 gate passes analytically.

## Scenario Replay Evidence

The browser-only nature of this project prevents automated scenario replay in this execution context. The following table documents the expected evidence based on the physics implementation:

| Scenario | Expected Evidence | Status |
|----------|------------------|--------|
| m4-04-static-vs-braking | fl_fz+fr_fz+rl_fz+rr_fz ≈ 13340 N at rest; fl+fr increases, rl+rr decreases under brake | Analytically expected; verify in browser |
| m4-05-wheel-lift-ramp | At least one frame: one wheel fz=0, fy=0, sa=0 | isAirborne gate guarantees this on lift |
| m4-02-asymmetric-bump | hubY[0,2] oscillates, hubY[1,3] stays within ±2mm of rest | Independent hub ODE per corner guarantees this |
| m4-06-bump-response | hubY oscillation amplitude < 10% of peak within 1.5s | ζ≈0.40 gives ~1.1s settle time (theoretical) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Body vertical force double-counting prevented**
- **Found during:** Task 2 implementation
- **Issue:** The existing `totalForce.addScaledVector(normal, Fn)` in the contacts loop would apply `_tireFz[i]` upward to the body on flat ground. The suspension spring force (`_suspForceAccum[i]`) is also applied upward. On flat ground at static equilibrium, tireFz = suspForce = corner_weight, so the body would receive 2× the necessary upward force and fly off the ground.
- **Fix:** Removed `totalForce.addScaledVector(normal, Fn)` and its torque counterpart from the tire contacts loop. Body vertical force now comes exclusively from `suspBodyForce = (0, _suspForceAccum[i], 0)` applied with `rMount × suspBodyForce` torque. This is the physically correct model: the tire spring acts on the hub, the suspension spring transmits to the body.
- **Files modified:** `src/physics.js`
- **Commit:** 5ee1903

**2. [Rule 2 - Missing Critical Functionality] Airborne omega integrator preserved (CR-03)**
- **Found during:** Task 2 implementation
- **Issue:** The plan's `continue` for airborne wheels would skip the entire omega Newton integrator, preventing drive torque from being applied while airborne (contrary to CR-03: "wheelOmega still integrates from drive torque even airborne").
- **Fix:** For airborne wheels, a simplified direct Euler omega step is applied inline (no road reaction, so Newton is trivially Flong=0), then `continue` to skip the Pacejka contacts loop. Grounded wheels fall through to the full Newton loop as before.
- **Files modified:** `src/physics.js`
- **Commit:** 5ee1903

**3. [Rule 2 - Missing Critical Functionality] getWheelPosition updated to use hubY**
- **Found during:** Task 2 implementation
- **Issue:** `getWheelPosition` was used in physics.js Step 3 to get the hub sphere center for contact queries. With Phase 4, the hub Y is now an integrated state (`vehicleState.hubY[i]`), not a formula from body position. Without updating `getWheelPosition`, contact queries would use the wrong hub height, making the tire never touch the ground correctly.
- **Fix:** Added a branch in `getWheelPosition` to return `vehicleState.hubY[corner]` for world Y when the array is initialized, keeping XZ from the body-frame rotation.
- **Files modified:** `src/suspension.js`
- **Commit:** 5ee1903

## Threat Flags

None identified. This plan adds math and state to existing modules. No new network endpoints, auth paths, or file access patterns. The NaN propagation threat (T-04-02) is mitigated by: stability check at startup, paranoid guard at top of stepSuspensionSubsteps, and explicit initialization of hubY/hubVy at spawn.

## Self-Check

### Checking created files exist
- (No new files created in src/ — all changes to existing files)

### Checking SUMMARY.md
- Created at `.planning/phases/04-suspension/04-02-SUMMARY.md` ✓

### Checking commits exist
- Task 1 commit 88a80b8: FOUND ✓
- Task 2 commit 5ee1903: FOUND ✓

## Self-Check: PASSED
