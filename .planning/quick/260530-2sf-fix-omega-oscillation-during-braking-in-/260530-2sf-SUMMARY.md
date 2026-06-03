---
phase: 260530-2sf
plan: 01
subsystem: physics
tags: [omega, braking, oscillation, fix]
dependency_graph:
  requires: []
  provides: [stable-braking-omega]
  affects: [src/physics.js]
tech_stack:
  added: []
  patterns: [spinSign-pattern]
key_files:
  created: []
  modified: [src/physics.js]
decisions:
  - "Use spinSign = omega0 >= 0 ? 1 : -1 instead of Math.sign(omega0) to preserve brake torque at omega=0"
metrics:
  duration: ~5 minutes
  completed: 2026-05-30
---

# Phase 260530-2sf Plan 01: Fix Omega Oscillation During Braking Summary

**One-liner:** Replace `Math.sign(omega0)` with `spinSign = omega0 >= 0 ? 1 : -1` in the omega integrator so brake torque still acts when omega exactly equals zero, eliminating the 0 to 18 rad/s oscillation during braking to rest.

## What Was Done

Fixed a stable oscillation in wheel angular velocity during full braking. The root cause: `Math.sign(0) = 0` would zero out `brakeSigned` exactly when the zero-crossing clamp landed omega at 0. The following frame, road-reaction torque (from slip ratio = -1) kicked omega back up to ~18 rad/s, then the clamp slammed it back to 0 — a perfectly stable oscillation every frame.

The fix uses `spinSign = omega0 >= 0 ? 1 : -1` which evaluates to `1` at omega=0, so brake torque is still applied and counteracts the road-reaction torque before it can build momentum. The `omega0 !== 0` guard on the zero-crossing clamp was also dropped — `spinSign` handles the boundary correctly without it.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace Math.sign(omega0) with spinSign in omega integrator | a3cda5c | src/physics.js |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Pending

Task 2 is a `checkpoint:human-verify` — manual brake-to-stop check in browser is required to confirm omega smoothly approaches 0 and stays at 0 (no 0 to 18 rad/s oscillation).

## Self-Check: PASSED

- src/physics.js modified: FOUND
- Commit a3cda5c: FOUND
- spinSign occurrences (3): PASS
- No Math.sign(omega0) remaining: PASS
- No omega0 !== 0 guard remaining: PASS
