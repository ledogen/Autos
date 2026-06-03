---
slug: 260527-qab-zero-pitch-roll-on-ground-contact
title: Zero pitch/roll angular velocity on ground contact
status: in_progress
created: 2026-05-27
---

# Fix: Zero angularVelocity.x/z when ground penetration detected

## Objective

The ground constraint currently zeros velocity.y when penetration is detected but leaves
angularVelocity.x (pitch) and angularVelocity.z (roll) intact. These drive the rocking
oscillation because contact patch vertical velocity = velocity.y + ω.z*r.x - ω.x*r.z.

## Task

In src/physics.js, inside the ground constraint block (Step 1, the `if (maxPenetration > 0)` branch):
- After `if (vehicleState.velocity.y < 0) vehicleState.velocity.y = 0`
- Add: `vehicleState.angularVelocity.x = 0`
- Add: `vehicleState.angularVelocity.z = 0`
- Leave angularVelocity.y (yaw) untouched
