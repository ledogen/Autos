---
id: FEAT-218
type: feature
status: closed
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "This one has been bothering me for a long time and I just realized how to fix it For a lot of missions we use a cyan toroid to mark destinat…"
relates: FEAT-211, FEAT-215, FEAT-187, FEAT-184, src/gps.js
---
lane: Spare

# FEAT-218: Off-road objectives get the GPS turn arrow on the road, not the cyan ring

## Next steps
Built on branch feature/spare; waiting on the owner's look (card feat218-look).

## Summary
Objectives that sit off the side of the road (Larry's paper deliveries, demolition targets, the tutorial gas station) are marked with a cyan ring on the road, which does not point at anything. Show the GPS turn indicator instead, at the nearest road spot, arrow pointing at the target. Objectives on the road (courier ends) keep the ring.

## Description
Inbox 509w:
> This one has been bothering me for a long time and I just realized how to fix it For a lot of missions we use a cyan toroid to mark destinations on the road For the end of a courier mission this is totally fine Because the mission ends on the road and your objective is on the road For something like Larry's paper delivery mission The objective is off the side of the road and we're marking it with a ring on the road Which doesn't really make sense Let's just reuse the GPS turn indicator and put it on the road At the nearest spot to the paper delivery target or demolition target With the arrow pointing at the target that would make it a lot more clear That hey your next next objective is right off the road at this spot I'm also noticing it in the tutorial when you have to stop at the gas station It'd be nice if it pointed off to the gas station instead of circling the road.

## Tracker
- [x] Paper delivery targets, demolition targets and the tutorial gas station show the GPS turn arrow on the road at the nearest spot to the target, arrow pointing at it
- [x] On-road objectives (courier ends) keep the cyan ring
- [x] The tutorial gas station stop points off the road toward the station

## Files
`src/gps.js` · `src/mission.js` · `src/main.js`

## Log
- 2026-11-14 Spare: gps.js reads `objective ?? customers.at(-1)` off the live route (mission.js sets `objective` = the destination POI, per leg too); further than OFFROAD_M = 3 m from the route's last road point -> the turn board (same geometry/hover/colour) at that point aimed at it, no ring; else the ring. Demolition guide carries `objective` (main.js). Covers paper stops, demolition, POI/tutorial stops (mission.end is the POI). Not seen by the owner yet.
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-16: owner on card feat218-look: "Both read well". Closed.
