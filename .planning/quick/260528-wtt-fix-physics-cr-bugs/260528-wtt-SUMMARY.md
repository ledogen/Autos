---
phase: quick
plan: 260528-wtt
subsystem: physics, tire, logger
tags: [bug-fix, physics, cr]
dependency_graph:
  requires: []
  provides: [correct-inertia-axes, isRear-guard, slip-angle-caller-computed, blob-url-cleanup]
  affects: [src/physics.js, src/tire.js, src/logger.js]
tech_stack:
  added: []
  patterns: [try/finally for resource cleanup]
key_files:
  modified:
    - src/physics.js
    - src/tire.js
    - src/logger.js
decisions:
  - "CR-01: X-axis inertia uses inertiaRoll (~800 kg·m²), Z-axis uses inertiaPitch (~3300 kg·m²) — matches Three.js Y-up where X=roll, Z=pitch"
  - "CR-02: slip angle computation moved to physics.js caller; tire.js dead-zone guard (speed < 0.2 m/s) retained inside function"
  - "CR-03: isRear guard added only to reverse-throttle path; forward-braking path unchanged per plan"
  - "CR-04: blob URL revocation in finally block guarantees cleanup regardless of a.click() throw"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-28"
  tasks_completed: 3
  files_modified: 3
---

# Phase quick Plan 260528-wtt: Fix Physics CR Bugs Summary

Fixed four code-review critical bugs: swapped inertia axis mapping (CR-01), front-wheel reverse-brake guard (CR-03), slip angle now caller-computed and passed to tire.js (CR-02), and blob URL lifecycle protected by try/finally (CR-04).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | CR-01 inertia axis mapping + CR-03 isRear guard | d11b76a |
| 2 | CR-02 slip angle caller-computed | 75c474f |
| 3 | CR-04 blob URL try/finally | bb6ffa7 |

## Changes Made

### src/physics.js

**CR-01 (Step 5 angular velocity integration):**
- Before: `x / inertiaPitch`, `z / inertiaRoll` (wrong — roll and pitch were swapped)
- After: `x / inertiaRoll`, `z / inertiaPitch` (correct — X=roll, Z=pitch in Three.js Y-up)

**CR-03 (getDriveTorque reverse-throttle path):**
- Before: all four wheels returned `throttle * maxBrakeTorque` when reversing with throttle held
- After: `isRear ? throttle * maxBrakeTorque : 0` — front wheels return zero torque

**CR-02 (slip angle caller site):**
- Added computation before computeLateralForce call:
  `const slipAngle = Math.atan2(latVel, longVelAbs + 0.01)`
- Call changed from `computeLateralForce(0, Fn, params)` to `computeLateralForce(slipAngle, Fn, params)`

### src/tire.js

**CR-02 (computeLateralForce body):**
- Removed internal `slipAngleCalc = Math.atan2(latVel, Math.abs(longVel) + 0.01)` recomputation
- `const raw` now uses the `slipAngle` parameter: `-params.corneringStiffness * slipAngle`
- Dead-zone speed guard (`sqrt(latVel² + longVel²) < 0.2`) retained — guards atan2 singularity at rest
- Friction cap (`maxFlat = frictionCoeff * Fz`) retained
- JSDoc updated to reflect that caller computes and passes the slip angle

### src/logger.js

**CR-04 (_downloadLog):**
- Wrapped `createElement / click / removeChild` in `try` block
- `URL.revokeObjectURL(url)` moved to `finally` block — guaranteed to run

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None introduced by this plan.

## Threat Flags

None — CR-04 addressed the only threat-model item (T-wtt-01) as designed.

## Self-Check: PASSED

- src/physics.js: inertiaRoll on x-axis, inertiaPitch on z-axis confirmed
- src/physics.js: isRear guard present in reverse-throttle path
- src/physics.js: slipAngle computed and passed to computeLateralForce
- src/tire.js: no slipAngleCalc, no internal atan2; uses slipAngle parameter
- src/logger.js: revokeObjectURL in finally block
- Commits d11b76a, 75c474f, bb6ffa7 present in git log
