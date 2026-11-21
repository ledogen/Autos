---
id: FEAT-316
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "the vertical poi arrow is great until you're within 10m then it kinda awkwardly shrinks and jumps around. just put it in space above the poi. drop the scaling and translation to try to keep in onscreen. make it dead simple. just real geometry in the 3d world. spinning and bobbing"
relates: FEAT-297, DEC-434, DEC-462, src/gps.js
---
lane: unplaced

# FEAT-316: The POI arrow is plain geometry in space above the POI

## Next steps
Done on land/visual-1120; owner looks at the screenshot sheet (wip/visual-1120/sheet.jpg).

## Summary
The route-end arrow over an off-road POI: fixed world position over its roof, spinning and bobbing. The camera-keeping scaling, swing and wall-probe code is deleted.

## Tracker
- [x] No scaling, bearing swing or camera probe; arrow at roof + 1.5 m; still depth-tested (DEC-462)
- [x] Screenshot sheet looked at

## Files
src/gps.js · src/main.js

## Log
- 2026-11-20: arrow at the POI's roof + 1.5 m, spin 2 rad/s, bob 0.25 m; scaling, bearing swing and camera-ray wall probe deleted (getCamera/getBlocked options gone); depth-tested still (DEC-462). Tallest POI roof is the barn at 8 m, so its tip is at 9.5 m and its tail at 12.5 m.
