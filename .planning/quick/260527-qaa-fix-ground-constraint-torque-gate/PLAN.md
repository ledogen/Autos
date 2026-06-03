---
slug: 260527-qaa-fix-ground-constraint-torque-gate
title: Fix ground constraint timing and velocity-gated W/S torque
status: in_progress
created: 2026-05-27
---

# Fix: Ground Constraint Timing + Velocity-Gated Drive/Brake Torque

## Objective

Two physics bugs in src/physics.js and src/tire.js:

1. Ground constraint fires POST-integration, causing 1-frame position lag that produces visible body bounce.
2. S key accidentally drives front wheels backward at 3000 N·m because maxBrakeTorque is applied regardless of direction.

## Tasks

### Task 1 — physics.js: Ground constraint to top of stepPhysics

- Move `params._rotateVector` assignment to top of stepPhysics (before constraint)
- Move the ground constraint block (currently Step 5) to run BEFORE the force loop
- Change `isGrounded` check to `contactPt.y <= 0.005` (5mm tolerance)
- Remove the post-integration constraint block (it's now at the top)

### Task 2 — physics.js: Set params._longitudinalVelocity before getDriveTorque

- In the per-wheel loop, move `params._lateralVelocity` and `params._longitudinalVelocity` assignments to BEFORE the `getDriveTorque` call
- `params._driveForce` is still set after (for computeLongitudinalForce)

### Task 3 — physics.js: getDriveTorque velocity-gated logic

Replace getDriveTorque body with:
- W pressed, longVel >= DEAD_ZONE: drive forward (rear wheels, +maxDriveTorque; front = 0)
- W pressed, longVel <= -DEAD_ZONE: brake from reverse (all 4 wheels, +maxBrakeTorque)
- W pressed, |longVel| < DEAD_ZONE: drive forward (rear wheels) — default to drive at rest
- S pressed, longVel <= -DEAD_ZONE: drive reverse (rear wheels, -maxReverseTorque; front = 0)
- S pressed, longVel >= DEAD_ZONE: brake from forward (all 4 wheels, -maxBrakeTorque)
- S pressed, |longVel| < DEAD_ZONE: drive reverse (rear wheels) — default to reverse at rest
- Dead zone threshold: 0.5 m/s

## Files

- src/physics.js — ground constraint reorder, params reorder, getDriveTorque rewrite
