---
id: BUG-194
type: bug
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "If I miss a newspaper throw in Larry's Mission and then turn around to go back and make that delivery, it says \"Wrong Way.\" I think maybe we can fix this if we just always have the GPS navigate to the nearest undelivered paper target so if you miss and pass it it'll still flip the GPS around and say hey you're going the wrong way you should turn around and go back and get that one"
relates: FEAT-63, FEAT-257, DEC-371, src/paper-route.js
---
lane: SM-3 missions

# BUG-194: Paper route says Wrong Way when turning back for a missed house

## Next steps
Owner: drive a missed throw and turn back (owed card).

## Summary
The guide is now one stop: the nearest owed house by road from the truck, re-planned every 1 s (quietly) and on delivery / leaving the line.

## Description
Root: the guide was the shortest tour through all owed houses and only re-planned on an out-of-order delivery or 2 s off the line, so a truck that passed a miss stayed "on the line" heading away from it. `_startReplan` now plans want 1 (planTourJob's one-Dijkstra path); `RR_PARAMS.nearS` is the cadence. Tour order, par and deadline: the priced tour (`route`) stays as accepted; par and the deadline were frozen at accept and are untouched (the guide never carried par). Only the displayed line changes: one leg to the nearest house, not the whole tour.

## Tracker
- [x] Guide = nearest owed house by road (paper-reroute pins it)
- [x] Par unchanged
- [ ] Owner drive

## Decisions
- 2026-11-17, owner: DEC-371.

## Open questions
- The line on the map now shows one leg, not the whole remaining tour. Fine, or keep a faint tour behind it?

## Files
`src/paper-route.js` · `test/paper-reroute.mjs`

## Log
- 2026-11-17: paper-reroute green.
- 2026-11-17: superseded by FEAT-266 (DEC-398): the guide is the shortest tour through the planned houses still owed, re-planned every 1 s; the nearest-house rule is gone.

- 2026-11-17 CLOSED by the orchestrator on the owner's card answer ("Good: close them", card missions-1117-look). On main, in the play build.
