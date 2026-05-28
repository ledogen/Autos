---
slug: qae-lateral-force-dead-zone
date: 2026-05-27
status: in-progress
---

# Fix: Lateral Force Dead Zone at Rest

## Problem
`computeLateralForce` in `src/tire.js` uses `atan2(latVel, |longVel| + 0.01)`. The 0.01 guard means even 0.05 m/s lateral velocity produces ~78° slip angle → near-max cornering force → feedback loop → car creeps and yaws at rest.

## Fix
Add contact-patch speed dead zone: if `sqrt(latVel² + longVel²) < 0.2 m/s`, return 0. Breaks the feedback loop. Phase 3 Pacejka handles proper low-speed behavior.

## Files
- `src/tire.js` — `computeLateralForce`, insert dead-zone check before atan2

## Tasks
- [ ] Apply dead-zone check in `computeLateralForce`
- [ ] Commit
