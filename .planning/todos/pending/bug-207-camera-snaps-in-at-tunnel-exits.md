---
id: BUG-207
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "The camera seems to collide with something at tunnel portals. I feel like every time I drive out of a tunnel it quickly snaps in really close to the t…"
relates: FEAT-246, BUG-77, src/camera-boom.js, src/camera.js
---
lane: bug (alpha by default)

# BUG-207: Camera snaps in close to the truck when driving out of a tunnel

## Next steps
Replay a tunnel exit headless against camera-boom.js and see what the probe hits at the portal.

## Summary
Every time the truck leaves a tunnel the chase camera quickly snaps in close to it at the exit. It looks like the camera boom (FEAT-246) hits something at the portal.

## Description
Owner's words, verbatim (inbox 20261118061603-gwrm):

> The camera seems to collide with something at tunnel portals. I feel like every time I drive out of a tunnel it quickly snaps in really close to the truck right at the exit.

## Tracker
- [ ] No camera snap-in when exiting a tunnel, on any portal
- [ ] The boom still keeps the camera out of walls and terrain inside the tunnel

## Decisions

## Open questions
- Is it every tunnel or particular portals? The owner says "every time".

## Links
FEAT-246, BUG-77, src/camera-boom.js, src/camera.js

## Files
src/camera-boom.js · src/camera.js (_applyBoom) · src/main.js (mask GROUP_STATIC | GROUP_ROAD)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118061603-gwrm).
