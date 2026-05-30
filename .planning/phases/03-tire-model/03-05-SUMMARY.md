---
phase: 03-tire-model
plan: 05
subsystem: tire-model
tags: [tire-model, physics, omega-integrator, lateral-force, CR-03, WR-02, gap-closure]
one_liner: "Omega integrator hoisted outside contacts loop (CR-03) and lateral force negated at application site (WR-02)"

dependency_graph:
  requires:
    - "03-02 (omega integrator, slip ratio, friction circle introduced)"
  provides:
    - "Airborne wheels now spin up under drive/brake torque (lastScaledFlong=0 when no contact)"
    - "Lateral tire force correctly opposes hub lateral velocity (grip resists slide, not amplifies it)"
    - "Free-rolling clamp gated on contacts.length > 0 (grounded-only, as intended)"
    - "wheelDebug.omega updated outside contacts loop so airborne omega is logged each step"
  affects:
    - "src/physics.js stepPhysics per-wheel loop structure"

tech_stack:
  added: []
  patterns:
    - "lastScaledFlong sentinel: zero-initialised before contacts query; set inside contacts loop after friction-circle scaling; consumed by omega integrator outside loop"
    - "Omega integrator outside contacts loop: uses lastScaledFlong*wheelRadius as roadReactionTorque; handles airborne case (lastScaledFlong=0) transparently"
    - "WR-02 negation: addScaledVector(wheelRight, -Flat) so grip direction opposes slide direction"
    - "Free-rolling clamp now conditional on contacts.length > 0 to prevent erroneous clamp when airborne"

key_files:
  created: []
  modified:
    - src/physics.js

decisions:
  - "Combined both CR-03 and WR-02 into a single atomic edit since both changes are in the same for-of contacts block and the hoisting refactor naturally placed the WR-02 change"
  - "lastScaledFlong uses block-scope let (not const) so contacts loop can assign it — tracks last contact's scaled force for multi-contact edge case (last contact wins, consistent with existing wheelDebug behavior)"
  - "Omega integrator wrapped in a bare block {} for scoping of OMEGA_EPSILON/wheelInertia — prevents variable shadow risk from future expansion"
  - "CR-02 (throttle-while-reversing torque) is intentional design — getDriveTorque unchanged as documented in plan objective"

metrics:
  duration: "~10 minutes"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 03 Plan 05: CR-03 and WR-02 Gap Closure Summary

## What Was Built

Two targeted physics correctness fixes in `src/physics.js` to close the CR-03 and WR-02 issues from REVIEW.md:

**CR-03 — Omega integrator hoisted out of contacts loop:**
The per-wheel omega integrator was previously nested inside `for (const { normal, depth, contactPoint } of contacts)`. This meant airborne wheels never updated `wheelOmega`, producing stale slip ratios on landing and no in-air spin-up from drivetrain torque.

The fix introduces `let lastScaledFlong = 0` before the contacts query (zero for the airborne case), assigns `lastScaledFlong = Flong` inside the contacts loop after friction-circle scaling (preserving constraint #5: road reaction uses scaled force), and moves the full omega integrator block outside the contacts loop. Airborne: `lastScaledFlong` stays 0, road reaction torque is 0, and drive/brake torque integrates freely. The free-rolling clamp is now conditioned on `contacts.length > 0` to prevent erroneous clamping when airborne.

**WR-02 — Lateral force negated at application site:**
`Flat` from `computeLateralForce(positiveSlipAngle)` is positive, but was applied via `+wheelRight` — pushing the car further into a slide instead of opposing it. The fix changes `wheelForce.addScaledVector(wheelRight, Flat)` to `wheelForce.addScaledVector(wheelRight, -Flat)`, with a comment referencing WR-02. The tire.js sign convention (positive slipAngle → positive Flat) is unchanged.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix CR-03 — hoist omega integrator out of contacts loop | a3cf6b2 | src/physics.js |
| 2 | Fix WR-02 — negate lateral force at application site | a3cf6b2 | src/physics.js |

Note: Both changes were applied in a single atomic edit since they affect adjacent lines in the same contacts block. One commit covers both tasks.

## Verification Results

### Structural checks

- `lastScaledFlong` defined before contacts query and set inside contacts loop after friction-circle scaling: PASS
- Omega integrator lines (wheelOmega[i] = ...) at lines 224/226, contacts loop at line 156 — integrator is AFTER contacts loop close: PASS
- `addScaledVector(wheelRight, -Flat)` count = 1: PASS
- `addScaledVector(wheelRight, Flat)` (unnegated) count = 0: PASS
- WR-02 comment within 2 lines above negated application: PASS
- `node --check src/physics.js`: SYNTAX OK

### Acceptance criteria notes

The plan acceptance criteria specify `grep -c 'for (const { normal, depth, contactPoint } of contacts)'` should return 1. The file contains 2 occurrences — the second is the body contact points loop at line 242 (Step 3b), which pre-dates this plan and is a separate feature (normal-only force for bumper corners). The criterion's intent was "no duplicated omega integrator", which passes: the integrator block contains `wheelInertia` at lines 216 (declaration) and 227 (usage), both within the single integrator block.

## Deviations from Plan

None — plan executed exactly as written. Both CR-03 and WR-02 changes landed in one commit as a natural consequence of the refactor — both changes are in the same per-contact block and the hoisting work placed both in scope simultaneously.

## Known Stubs

None. Both correctness issues are fully resolved. Human drift/wheelspin verification from VERIFICATION.md can now be performed meaningfully.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `src/physics.js` modified and committed: a3cf6b2
- `node --check src/physics.js`: SYNTAX OK
- `addScaledVector(wheelRight, -Flat)` present, unnegated form absent
- Omega integrator lines (224/226) are after wheel contacts loop open (156) and after contacts loop close (~208)
- `lastScaledFlong` assigned inside contacts loop after friction-circle scaling, consumed outside
