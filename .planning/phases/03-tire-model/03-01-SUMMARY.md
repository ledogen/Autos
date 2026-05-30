---
phase: 03-tire-model
plan: 01
subsystem: tire-model
tags: [tire-model, pacejka, data]
one_liner: "Pacejka Magic Formula for both lateral and longitudinal forces in tire.js, with B/C/D/E coefficients and wheel dynamics params added to RANGER_PARAMS"

dependency_graph:
  requires: []
  provides:
    - "RANGER_PARAMS.pacejkaB/C/D/E (lateral Pacejka coefficients)"
    - "RANGER_PARAMS.pacejkaBx/Cx/Dx/Ex (longitudinal Pacejka coefficients)"
    - "RANGER_PARAMS.wheelInertia (1.22 kg·m²)"
    - "RANGER_PARAMS.maxHandbrakeTorque (2000 N·m)"
    - "computeLateralForce: Pacejka formula, C clamped [1.0,1.99], no negation, no internal cap"
    - "computeLongitudinalForce: Pacejka formula, C clamped [1.0,1.99], no internal cap"
  affects:
    - "src/physics.js (will read new params; friction circle plan 03-02)"
    - "src/debug.js (will add Pacejka sliders in plan 03-03)"

tech_stack:
  added: []
  patterns:
    - "Pacejka Magic Formula: F = Fz * D * sin(C * atan(B*x - E*(B*x - atan(B*x))))"
    - "C hard-clamp: Math.max(1.0, Math.min(1.99, params.pacejkaC)) — defense in depth (M3-03)"

key_files:
  created: []
  modified:
    - data/ranger.js
    - src/tire.js

decisions:
  - "Pacejka starting values: B=10.0, C=1.9, D=1.0, E=0.97 (symmetric lateral/longitudinal for circular friction ellipse at start)"
  - "C clamp applied inside both tire functions (defense in depth — slider range in plan 03-03 is a second guard)"
  - "No sign negation in computeLateralForce — Pacejka inherits sign from slipAngle (Pitfall 1)"
  - "No internal friction cap in either function — friction circle in physics.js (plan 03-02) is the only cap (Pitfall 4)"
  - "wheelInertia: 1.22 kg·m² — 0.5 × 18 kg × 0.368² solid disk estimate (D-02)"
  - "maxHandbrakeTorque: 2000 N·m — lower than maxBrakeTorque to allow modulated drift (D-09, D-10)"

metrics:
  duration: "~20 minutes"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 03 Plan 01: Pacejka Foundation Summary

## What Was Built

Replaced the Phase 1 linear placeholder bodies in `src/tire.js` with the Pacejka Magic Formula for both lateral and longitudinal tire forces. Added all required Pacejka coefficients, wheel inertia, and handbrake torque constants to `data/ranger.js` (RANGER_PARAMS).

The lateral function now produces sign-correct output without negation — downstream `wheelRight * Flat` accumulation in `physics.js` will produce the correct steering direction once Plan 02 wires the new params through. The longitudinal function accepts slip ratio (to be computed in Plan 02) and returns force via the same Pacejka formula with longitudinal coefficients.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Pacejka coefficients, wheelInertia, maxHandbrakeTorque to data/ranger.js | 3026562 | data/ranger.js |
| 2 | Replace tire.js bodies with Pacejka Magic Formula | 94b0905 | src/tire.js |

## Verification Results

### Task 1 — data/ranger.js
- All 10 new fields present with exact names and starting values
- `node -e "import('./data/ranger.js')..."` confirms `pacejkaB: 10`, `wheelInertia: 1.22`, `maxHandbrakeTorque: 2000`
- `corneringStiffness` and `lateralDampingCoeff` preserved (for slider compat until Plan 03 audit)
- File parses as valid ES module

### Task 2 — src/tire.js
- Behavioral assertions pass: `computeLateralForce(0, 1000, p) === 0`, `computeLateralForce(0.1, 1000, p) === 955.8 > 0`
- `computeLongitudinalForce(0, 1000, p) === 0`, `computeLongitudinalForce(0.2, 1000, p) === 999.2 > 0`
- C clamp spot-check: `pacejkaC: 2.5` produces identical output to `pacejkaC: 1.99` (clamp applied)
- No internal friction cap, no negation, no Phase 1 constructs

## Deviations from Plan

None — plan executed exactly as written.

Minor plan artifact notes (not code issues):
- Plan acceptance criterion `grep -c "Math.atan" src/tire.js` expects 4 but returns 2 (counts lines, not occurrences). Actual occurrence count is 4 (`grep -o "Math.atan" | wc -l`). Code is correct.
- Plan acceptance criterion uses `computeLateralForce(slipAngle` (no space before paren) but original and new code uses `computeLateralForce (slipAngle` (with space) — style was preserved from Phase 1. Signature is identical in substance.

## Known Stubs

None. The Pacejka formulas are fully wired. The `physics.js` call site still passes `slipRatio = 0` (Phase 1 stub) — that is resolved in Plan 02 (omega integrator + slip ratio computation). This is expected and noted in the plan.

## Threat Flags

None. The C hard-clamp mitigates T-03-01 (C slider reaching 2.0 collapses formula). T-03-02 (NaN from zero inputs) is prevented by Pacejka's total-function domain (atan and sin defined everywhere; zero input returns zero, verified).

## Self-Check: PASSED

- `data/ranger.js` modified and committed: 3026562 ✓
- `src/tire.js` modified and committed: 94b0905 ✓
- Both files on worktree-agent-a5732e39e2ded4fbb branch ✓
- Behavioral assertions verified via Node.js import smoke test ✓
