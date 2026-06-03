---
slug: 260527-qaa-fix-ground-constraint-torque-gate
status: complete
completed: 2026-05-27
commit: 8f8429d
---

# Summary

Fixed two physics bugs in src/physics.js.

## Ground constraint timing
Moved the ground constraint from post-integration (Step 5) to pre-integration (Step 1), before the force loop. Added `params._rotateVector` assignment at the very top so `getWheelPosition` works in the constraint. Changed `isGrounded` threshold from `<= 0` to `<= 0.005` (5mm float tolerance).

## Velocity-gated W/S torque
Replaced flat `getDriveTorque` logic with velocity-gated behavior using `params._longitudinalVelocity` (now set before the `getDriveTorque` call in the per-wheel loop). W drives forward (RWD rear only) or brakes all wheels from reverse. S drives reverse (RWD rear only) or brakes all wheels from forward. 0.5 m/s dead zone prevents mode flip twitchiness near zero.
