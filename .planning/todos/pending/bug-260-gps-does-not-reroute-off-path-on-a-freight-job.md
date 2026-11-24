---
id: BUG-260
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-23 — "I took a freight mission and went way off the GPS path and it never recalculated to give me directions from my current location."
relates: src/gps.js, src/mission.js
---
lane: Spare

# BUG-260: GPS does not reroute when you leave the path on a freight job

## Next steps
Fixed on land/bug-260-gps-reroute; waits for the owner's drive (take any single-destination job, leave the route, expect a new line from the truck within ~2 s).

## Summary
On a freight mission the owner drove far off the GPS route and the route was never recalculated from the truck's position.

## Tracker
- [x] Reproduced, cause named: every single-destination job (freight, haul, a fetch's legs); only the tutorial, the waypoint, multi-drops, papers and demolition re-planned
- [x] Fixed with a gate that drives off the route and expects a new one (test/gps-job-reroute.mjs)
- [ ] Owner's drive

## Log
- 2026-11-24: opened from the owner's inbox note.
- 2026-11-24: cause: a job's GPS line (missionSystem.guideRoute) was fixed at accept; main.js's BUG-118 re-plan (_tutDetourTick) served only the tutorial and the waypoint. Moved into paper-route.js StrayGuide, _tutLeg now also hands it a running job's line (door = routeEndDoor, the route's own end). Multi-drops/papers/demolition keep their TourGuide. Gate gps-job-reroute.mjs. Undriven.
