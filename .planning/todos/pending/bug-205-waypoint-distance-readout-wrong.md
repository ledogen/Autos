---
id: BUG-205
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "the waypoint distance measure at top of screen is wrong"
relates: BUG-204, FEAT-257, FEAT-266, src/main.js
---
lane: bug (alpha by default)

# BUG-205: The waypoint distance readout at the top of the screen is wrong

## Next steps
The owner drives it (card bugs-1117-gps-food-camp-drive): a multi-drop, a fetch and a map waypoint.

## Summary
The distance to the waypoint shown at the top of the screen does not match the real distance. No detail given: what it disagrees with (straight line, road distance, next stop vs. final stop) is not known.

## Description
Owner's words, verbatim (inbox 20261118003748-kztw):

> the waypoint distance measure at top of screen is wrong

## Tracker
- [x] The top-of-screen waypoint distance matches the real distance to the waypoint it names
- [x] Correct on a multi-stop mission, on the paper route and in free roam (the paper round and demolition show a count, no distance)
- [ ] Owner has driven it

## Decisions
- Cause, measured (test/gps-multistop-census.mjs, 6 random seeds 2214849914 3934429850 875292341 350085524 16017472 2361461553, the readout against the planner's road distance from the truck to the stop the GPS leads to; median / max error): multi-drop 2034 / 5583 m (255 samples): `routeRemaining` read to the END of the whole job while the HUD named "stop 1 of 3"; fetch 672 / 5214 m (189): the outbound leg read out-and-back; player waypoint 290 / 1952 m (87): crow-flies while the GPS draws the road line.
- Fix: the multi-drop / fetch reads the current leg's end (the projection capped on that leg); the waypoint reads along the GPS line (`routeLeftM`, DEC-270's rule; DEC-225's "1.12 km to the waypoint" is the wording, kept). After: multi-drop 13 / 425 m, fetch 18 / 672 m, waypoint 10 / 47 m. The residual max is where the job's planned line is not the shortest road from the truck (a POI job's anchored departure): the readout follows the line the GPS draws, as DEC-270 rules.

## Open questions
- Is it wrong by a constant, by a unit, or after a stop changes (multi-stop missions)? The owner gave no numbers.

## Links
BUG-204, FEAT-257, FEAT-266, src/main.js

## Files
the HUD waypoint distance in src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118003748-kztw).
- 2026-11-17 b5731ee4 (mission.js routeRemaining), 4286e100 (main.js waypoint line). Gate gps-readout.mjs 8/8 (5 fail on the old code). Unverified: the owner's drive.
- 2026-11-18 owner follow-up ("add back in total distance, maybe in parentheses"): `routeTotalRemaining` (the leg plus the legs after it along the job's line; a fetch's is out and back). The HUD reads "1.24 km (7.40 km) · stop 1 of 3: …" only when the two differ; one number on a single-stop job and the last leg. Census, 2 seeds: the total against the planner's stop-to-stop distances, median / max 47 / 112 m (multi-drop) and 35 / 76 m (fetch). The "to go" goes when the total shows, and the separators drop to one space, so the longest line (12.48 km (48.73 km) · stop 2 of 4: a 20-letter name · due in 6h 30m) clears the wallet card at the big UI size (it ran under it before) and the rank tile at both. Paper and demolition keep their count. wip/bugs-gfc/readout-total.jpg.
