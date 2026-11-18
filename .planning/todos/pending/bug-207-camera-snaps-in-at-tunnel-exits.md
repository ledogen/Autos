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
Fixed on land/bugs-1117-pad-cam-light; owner drives out of a tunnel, card bugs-1117-pad-cam-light-drive. Close on his word.

## Summary
Every time the truck leaves a tunnel the chase camera quickly snaps in close to it at the exit. It looks like the camera boom (FEAT-246) hits something at the portal.

## Description
Owner's words, verbatim (inbox 20261118061603-gwrm):

> The camera seems to collide with something at tunnel portals. I feel like every time I drive out of a tunnel it quickly snaps in really close to the truck right at the exit.

## Tracker
- [x] No camera snap-in when exiting a tunnel, on any portal (gate boom-portal: 5 random seeds, 14 portal runs, step 0.00 m)
- [x] The boom still keeps the camera out of walls and terrain inside the tunnel (camera-boom gate, smoke boreCam)
- [ ] Owner drives out of a tunnel

## Decisions

## Open questions
- Answered: every tunnel, every exit (measured). Was: is it every tunnel or particular portals? The owner says "every time".

## Links
FEAT-246, BUG-77, src/camera-boom.js, src/camera.js

## Files
src/camera-boom.js · src/camera.js (_applyBoom) · src/main.js (mask GROUP_STATIC | GROUP_ROAD)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118061603-gwrm).
- 2026-11-18 CAUSE: the boom's terrain test read analyticHeight(x, z) with no query height, which over a bore is the hill above it. At an exit (truck out, camera still in the bore) the boom bisected back to the portal face: 6.3–6.5 m → 0.03–0.2 m in one frame at every exit of seed 717319401 (wip/bugs-pcl/boom-trace.mjs). Not a collider: the ray was clean.
- FIX (44555775 + main.js in 454deaff): each boom point is tested at its own height, analyticHeight(x, z, _, y) (the bore floor below the crown). Honest geometry, no rate limit; the instant pull-in for real walls stays. Gate boom-portal (heavy): within 40 m of a portal no step > 0.5 m/frame at 15 m/s, boom ≥ 3 m; fails on the old probe.
