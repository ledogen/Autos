---
phase: quick-260513-vaw
plan: "01"
subsystem: physics
tags: [physics, naming, gravity, rigid-contact, params]
dependency_graph:
  requires: []
  provides: [gravity-force, per-wheel-rigid-contact, Flat-Flong-Fn-naming]
  affects: [src/physics.js, src/tire.js, src/suspension.js, data/ranger.js]
tech_stack:
  added: []
  patterns: [rigid-contact-impulse, per-step-gravity]
key_files:
  created: []
  modified:
    - data/ranger.js
    - src/tire.js
    - src/suspension.js
    - src/physics.js
decisions:
  - "Rigid contact uses impulse (velocity zeroing + position correction), not spring force — matches Phase 1 matchbox-car mental model"
  - "Fn = mass*g/4 per grounded wheel — static weight per wheel as stable proxy; Phase 4 replaces with spring-damper"
  - "Gravity applied once outside per-wheel loop — avoids 4x amplification"
  - "Parameter names Fz in function signatures preserved — locked Phase 3/4 interface contract"
metrics:
  duration_seconds: 128
  completed_date: "2026-05-14T05:37:45Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase quick-260513-vaw Plan 01: Physics Fix Gravity Rigid Contact Naming Summary

**One-liner:** Gravity + per-wheel rigid contact impulse replacing CG clamp, with Fn/Flat/Flong naming cleanup across physics/tire/suspension stack.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tune params in data/ranger.js | 34768cd | data/ranger.js |
| 2 | Naming cleanup — tire.js and suspension.js | b00668e | src/tire.js, src/suspension.js |
| 3 | physics.js — gravity, rigid contact, naming | 50e0412 | src/physics.js |

## What Was Built

### Task 1 — ranger.js param tuning
- `rollingResistanceCoeff`: 200 → 20 (car can actually move and cruise)
- `maxDriveTorque`: 250 → 400 N·m (noticeably stronger throttle response)

### Task 2 — Naming cleanup (JSDoc only, no logic changes)
- `src/tire.js` computeLateralForce: `@returns Fy` → `@returns Flat`; Phase 3 comment updated
- `src/tire.js` computeLongitudinalForce: `@returns Fx` → `@returns Flong`; Phase 3 comment updated
- `src/suspension.js` computeNormalForce: `@returns Fz` → `@returns Fn`; Phase 4 comment updated
- Function parameter names (Fz in signatures) preserved — these are the locked Phase 3/4 interface contract

### Task 3 — physics.js rewrite (gravity + rigid contact)
- Gravity: `totalForce.y -= params.mass * 9.81` added once outside the per-wheel loop
- Per-wheel rigid contact block replaces `computeNormalForce` call:
  - `penetrationDepth = Math.max(0, -contactPt.y)`
  - If penetrating: zero downward velocity at CG, push `position.y` up by penetrationDepth, set `Fn = mass*g/4`
  - Else: `Fn = 0` (wheel is airborne, no contact force)
- Renamed `Fy` → `Flat`, `Fx` → `Flong` in variable names and comments
- Removed Step 5 CG-height clamp block (`const minY = params.cgHeight`)
- Removed conditional `angularVelocity.x/z = 0` block
- Full 6DOF quaternion orientation integration unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `Fn = params.mass * 9.81 / 4` — equal weight distribution per wheel regardless of load transfer. Plan-intentional stub; Phase 4 spring-damper replaces with dynamic load transfer.
- `computeNormalForce` in suspension.js — function still exported and remains in codebase but is no longer called by physics.js. Not removed to preserve the locked Phase 4 call-site contract.

## Threat Flags

None — changes are confined to the existing browser physics loop. No new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED

Files confirmed:
- data/ranger.js: rollingResistanceCoeff=20, maxDriveTorque=400
- src/tire.js: @returns Flat / @returns Flong in JSDoc
- src/suspension.js: @returns Fn in computeNormalForce JSDoc
- src/physics.js: gravity line present, penetrationDepth block present, Flat/Flong used, no minY, no angularVelocity.x=0

Node verify script: all 7 checks OK (exit 0).

Commits:
- 34768cd: chore(260513-vaw-01): tune ranger.js params
- b00668e: refactor(260513-vaw-01): rename Fy→Flat, Fx→Flong, Fz→Fn in JSDoc
- 50e0412: feat(260513-vaw-01): physics.js gravity + rigid contact + naming
