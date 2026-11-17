---
id: FEAT-246
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "We should add collisions to the chase camera so it can't go through walls or terrain. The simple system where it just moves towards the center of rotation is fine Because it should work with our current system"
relates: FEAT-75, src/main.js
---
lane: unplaced

# FEAT-246: The chase camera cannot pass through walls or terrain

## Next steps
A free lane: pull the camera toward its pivot when the line from pivot to camera is blocked (terrain height, then colliders).

## Summary
The chase camera clips through terrain and walls. The owner accepts the simple fix: move it toward the centre of rotation until it is clear.

## Description
Start with the analytic terrain height along the boom (cheap, no engine query), then a ray against the colliders if walls still clip. Ease back out so it does not pop.

## Tracker
- [x] Camera stays above terrain
- [x] Camera does not pass through building walls (static solids, one ray)
- [x] No popping when the block clears (tau 0.12 s)
- [ ] Owner has looked
