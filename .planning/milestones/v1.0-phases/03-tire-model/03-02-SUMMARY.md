---
phase: 03-tire-model
plan: 02
subsystem: tire-model
tags: [tire-model, physics, slip-ratio, friction-circle, omega-integrator, handbrake]
one_liner: "Per-wheel omega integrator, slip ratio, friction circle coupling, and Space-key handbrake wired into physics step"

dependency_graph:
  requires:
    - "03-01 (Pacejka Magic Formula in tire.js; pacejkaB/C/D/E, pacejkaBx/Cx/Dx/Ex, wheelInertia, maxHandbrakeTorque in RANGER_PARAMS)"
  provides:
    - "vehicleState.wheelOmega[4]: per-wheel angular velocity integrated each physics step"
    - "slip ratio computed per wheel: (omegaR - vx) / max(|omegaR|, |vx|, 0.1)"
    - "friction circle: Flat/Flong scaled when sqrt(Flat^2+Flong^2) exceeds frictionCoeff*Fn"
    - "getBrakeTorque helper: rear-only handbrake, proportional foot brake"
    - "Space-key handbrake: vehicleState.handbrake = true while Space held; rear wheels receive maxHandbrakeTorque"
    - "R-key reset: zeroes wheelOmega and handbrake to prevent burnout-on-reset bug"
    - "wheelDebug[i].omega written each contact step"
  affects:
    - "src/debug.js (plan 03-03 will add Pacejka sliders and omega HUD field)"
    - "src/main.js logger captureFrame (wheelDebug now carries omega for future log fields)"

tech_stack:
  added: []
  patterns:
    - "Slip ratio formula: (omegaR - vx) / max(|omegaR|, |vx|, SLIP_EPSILON) — SLIP_EPSILON=0.1 m/s prevents 0/0 at rest"
    - "Friction circle: scale = frictionBudget / combinedForce when combined > budget"
    - "Free-rolling clamp: wheelOmega[i] = vx/r when vehicleSpd + wheelSurfaceSpd < 0.5 m/s — prevents Euler stiffness"
    - "Omega integration: wheelOmega[i] += (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt"
    - "Space key: e.key === ' ' comparison (not e.code === 'Space', not 'space' string)"

key_files:
  created: []
  modified:
    - src/vehicle.js
    - src/physics.js
    - src/main.js

decisions:
  - "getBrakeTorque is module-private in physics.js (not exported) — only stepPhysics needs it"
  - "Omega integrator runs AFTER friction circle so road reaction uses scaled Flong (Pitfall 2 / constraint #5)"
  - "OMEGA_EPSILON = 0.5 m/s for free-rolling clamp (T-03-03 mitigation)"
  - "SLIP_EPSILON = 0.1 m/s in denominator (T-03-04 NaN mitigation)"
  - "e.key === ' ' for Space detection — browser delivers space as single space char, not 'space' string"
  - "getBrakeTorque rear handbrake branch uses params.maxHandbrakeTorque with no fallback default (plan constraint)"

metrics:
  duration: "~30 minutes"
  completed: "2026-05-30"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 03 Plan 02: Physics Wiring Summary

## What Was Built

Wired the Pacejka tire functions from Plan 01 into the full physics pipeline. The car now exhibits combined-slip behavior: wheelspin under throttle, drift under Space-key handbrake, and friction circle coupling between lateral and longitudinal forces.

Three files were modified in strict task order:

1. **src/vehicle.js** — Space key registered in the `keys` object; both keydown/keyup listeners updated to use `e.key === ' '` comparison; `vehicleState.handbrake` written each step; `SPAWN_STATE.handbrake = false` added.

2. **src/physics.js** — `getBrakeTorque` module-private helper added (rear-only handbrake, proportional foot brake). Per-wheel slip ratio computation with SLIP_EPSILON=0.1 m/s. `computeLongitudinalForce` now called with the real slip ratio instead of hardcoded 0. Friction circle scaling applied to both `Flat` and `Flong`. Omega integrator runs after friction circle using scaled `Flong` as road reaction torque, with OMEGA_EPSILON=0.5 m/s free-rolling clamp. `wheelDebug[i].omega` written each contact.

3. **src/main.js** — `vehicleState` init gains `wheelOmega: [0, 0, 0, 0]` and `handbrake: false`. All `wheelDebug` initialiser objects gain `omega: 0`. R-key reset block zeroes `wheelOmega` and `handbrake` to prevent burnout-on-reset.

No UI feedback exists yet — slip-angle HUD, throttle/brake HUD, Pacejka plot, slider audit, logger omega field, and glossary updates all land in Plan 03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Space-key handbrake input and SPAWN_STATE field in vehicle.js | 32ba5f3 | src/vehicle.js |
| 2 | Add slip ratio, friction circle, omega integrator, getBrakeTorque to physics.js | 049b5a1 | src/physics.js |
| 3 | Initialise and reset wheelOmega and handbrake fields in main.js | a2c8d5f | src/main.js |

## Verification Results

### Task 1 — src/vehicle.js
- `e.key === ' '` appears exactly 2 times (one per keydown/keyup listener): PASS
- `vehicleState.handbrake = keys[' '] || false` present: PASS
- `handbrake: false` in SPAWN_STATE: PASS
- No `'space'` string literal: PASS
- Automated verify node check: OK

### Task 2 — src/physics.js
All 12 automated checks passed:
- `getBrakeTorque` function defined with correct signature: PASS
- `getBrakeTorque` NOT exported: PASS
- `SLIP_EPSILON = 0.1` present: PASS
- `OMEGA_EPSILON = 0.5` present: PASS
- `params.wheelInertia || 1.22` present: PASS
- `params.frictionCoeff || 0.9` present: PASS
- `Math.sqrt(Flat * Flat + Flong * Flong)` present: PASS
- `Flong * params.wheelRadius` present: PASS
- `computeLongitudinalForce(slipRatio` present: PASS
- No `computeLongitudinalForce(0` remaining: PASS
- `wheelDebug[i].omega` present: PASS
- `params.maxHandbrakeTorque` present: PASS
- Critical ordering (frictionBudget < roadReactionTorque < totalForce.add): PASS

### Task 3 — src/main.js
- `wheelOmega` refs = 2 (init + reset): PASS
- `handbrake` refs = 3 (init + 2 in reset): PASS
- `omega: 0` in wheelDebug initialisers = 8: PASS
- No `updatePacejkaCurve` reference: PASS

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The omega integrator and slip ratio are fully wired into the physics step. The only absent capability is UI feedback (HUD fields for slip angle, omega; Pacejka plot) — those are intentionally deferred to Plan 03 per the plan's explicit scope note.

## Threat Flags

None. All threats from the plan's threat register are mitigated:
- T-03-03 (Euler stiffness): OMEGA_EPSILON=0.5 m/s free-rolling clamp applied
- T-03-04 (NaN from 0/0 at rest): SLIP_EPSILON=0.1 m/s in denominator
- T-03-06 (burnout-on-reset): wheelOmega and handbrake zeroed in R-key reset block

## Self-Check: PASSED

- `src/vehicle.js` modified and committed: 32ba5f3 ✓
- `src/physics.js` modified and committed: 049b5a1 ✓
- `src/main.js` modified and committed: a2c8d5f ✓
- All automated verify node checks: OK ✓
- Critical ordering check: OK ✓
