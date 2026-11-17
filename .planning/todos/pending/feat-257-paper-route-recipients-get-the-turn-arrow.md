---
id: FEAT-257
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "We should add the GPS turn arrow to Larry's paper route recipients, just like we did for the tutorial mission destinations."
relates: BUG-194, FEAT-218, DEC-371, src/gps.js
---
lane: SM-3 missions

# FEAT-257: Paper-route recipients get the GPS turn arrow

## Next steps
Owner: look (owed card).

## Summary
The off-road objective arrow (FEAT-218, `gps.js _placeRing`) already reads `customers.at(-1)` of a paper line. With BUG-194 the guide ends at the nearest owed house every time, so each recipient now gets it. No second arrow was built.

## Tracker
- [x] Reuses the FEAT-218 arrow
- [ ] Owner look

## Files
`src/gps.js` (unchanged) · `src/paper-route.js`

## Log
- 2026-11-17: arrives with BUG-194. Not drive-tested headless.
