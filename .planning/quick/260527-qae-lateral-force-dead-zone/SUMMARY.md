---
slug: qae-lateral-force-dead-zone
date: 2026-05-27
status: complete
commit: 69cba5d
---

# Summary

Added a 0.2 m/s contact-patch speed dead zone in `computeLateralForce` (`src/tire.js`).

The `atan2(latVel, |longVel| + 0.01)` formula was mapping noise-level lateral velocity (~0.05 m/s) to ~78° slip angle, producing near-maximum cornering force and a positive feedback loop that caused the car to slowly slide and yaw at rest.

One line added: guard returns 0 when `sqrt(latVel² + longVel²) < 0.2`.
