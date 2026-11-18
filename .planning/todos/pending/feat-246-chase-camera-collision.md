---
id: FEAT-246
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "We should add collisions to the chase camera so it can't go through walls or terrain. The simple system where it just moves towards the center of rotation is fine Because it should work with our current system"
relates: FEAT-75, src/main.js, src/camera-boom.js, DEC-397
---
lane: unplaced

# FEAT-246: The chase camera cannot pass through walls or terrain

## Next steps
Owner: look at round 2 on the play build (owed card campfire-camera-r2-look): the chase camera now stops at tunnel walls and the crown. "Good" closes this ticket.

## Summary
The chase camera clips through terrain and walls. The owner accepts the simple fix: move it toward the centre of rotation until it is clear.

## Description
Start with the analytic terrain height along the boom (cheap, no engine query), then a ray against the colliders if walls still clip. Ease back out so it does not pop.

## Tracker
- [x] Camera stays above terrain
- [x] Camera does not pass through building walls (static solids, one ray)
- [x] No popping when the block clears (tau 0.12 s)
- [x] Owner round 1 (2026-11-17): "the chase camera collides with terrain correctly but does not collide with tunnel walls"
- [x] Camera does not pass through tunnel walls or the crown (the ray also sees the road group: lining, portal ring)
- [ ] Owner has looked at round 2

## Decisions
- None of its own. The import seam (CLAUDE.md): main.js names the groups, camera-boom.js only receives the engine.

## Open questions
- None.

## Links
FEAT-264 (same owner card), DEC-397.

## Files
`src/camera-boom.js` (`boomFreeFraction`, `makeBoomProbe`) · `src/camera.js` (`_applyBoom`) · `src/main.js` (the probe, mask `GROUP_STATIC | GROUP_ROAD`) · `test/camera-boom.mjs` · `test/cdp-smoke.mjs` step `boreCam`

## Log
- 2026-11-17 (lane p, round 2): the wall ray's mask gains GROUP_ROAD (the bore lining and portal ring are road-tile colliders); the probe moved into camera-boom.js (`makeBoomProbe`) so the gate runs the real thing on a synthetic bore, open road and a 10 % crest. The deck under the truck never shortens the boom (front-face only, under the ray's start). Probe 5.0 µs a frame at seed 6's bore (old static-only ray 4.4 µs). Smoke step `boreCam`: a full right-stick swing in the bore never leaves the camera behind the lining.

- 2026-11-17: owner (inbox 20261118061603-gwrm): the camera snaps in close at every tunnel exit. Minted BUG-207.
