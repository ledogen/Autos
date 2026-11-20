---
id: FEAT-311
type: feature
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "One other request is distance to the next house with distance to the last house in parentheses up at the top somewhere."
relates: FEAT-295, BUG-205, BUG-245, src/main.js, src/paper-route.js
---
lane: unplaced

# FEAT-311: The paper route's top line shows the distance to the next house (and to the last)

## Next steps
Owner: read the line on the branch (owed card route-houses-2-drive) and change the wording if you want.

## Summary
While a paper route runs, the top readout (#paper-hud) now leads with the road distance to the next house still owed,
the distance to the last house in parentheses, then the existing count and papers. Same form as the job HUD
(BUG-205 follow-up): "0.45 km (3.10 km)", and "0.45 km to go" once the next house is the last.

## Description
- The measure is the GPS's: `PaperRouteSystem.distancesLeft(x, z)` reads `line()` (the guide's tour re-planned from
  the truck, the same line the GPS draws), matches the truck on the leg to the first porch not yet delivered, and adds
  the line past it to its last porch. mission.js `_tourLeft`'s measure; `routeLeftM` takes an `end` vertex for it.
- Width: km() keeps two decimals and the HUD font is the pinned monospace one, so the centred box holds its width
  as the numbers fall; the line is written through `_hudText`, only when it changed.
- [DEFAULT] wording: `0.45 km (3.10 km) · 2 / 9 delivered   7 papers · due in 1h 20m`; "to go" on the last house.

## Tracker
- [x] The line shows while the route runs, the GPS's road distance
- [x] Node check (`test/paper-guide-keep.mjs`): both numbers only fall as the truck drives the round; at each
      delivered house the first switches to the next house and the second carries on
- [ ] Owner reads it on the branch (wording is [DEFAULT])

## Files
`src/paper-route.js` · `src/mission.js` · `src/main.js` · `test/paper-guide-keep.mjs`

## Log
- 2026-11-20: ec9d806d. paper-guide-keep PASS (0 rises over 1.54 km, 3 switches, last-house number moved 3 m at a switch).
- 2026-11-20: smoke papers step reads "0.64 km (2.10 km) · 0 / 4 delivered   8 papers · due in 5h 16m"; frame at wip/route-houses-2/hud.jpg (main checkout). Gates 47/47, smoke 42/42.
