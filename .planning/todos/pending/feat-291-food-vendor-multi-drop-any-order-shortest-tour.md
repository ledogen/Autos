---
id: FEAT-291
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, 2026-11-18 (inbox)
---
lane: free lane

# FEAT-291: Food vendor multi-drop jobs: deliver in any order, default route is the shortest tour

## Next steps
Owner: drive a takeout multi-drop (owed card feat291-multi-drop-drive) and answer "Good: land it" / "Change". Then the orchestrator lands `land/feat-291-multi-drop`.

## Summary
Food vendor multi-drop jobs: deliver in any order, default route is the shortest tour.

## Description
Owner: "For a food vendor job where you have to deliver to multiple locations. It should be in the same style as the Former newspaper delivery model You should be able to deliver in any order that you'd like and optimize the route however you choose Right now it's kind of silly that You get three bags of takeout and then you could potentially drive all the way up One road and then all the way back down that same road to make subsequent deliveries. Then the router should choose the shortest path through all of them and show you that as the default route. Basically reuse the old paper customer routing."

## Tracker
- [x] Built: the stops in the shortest order from the giver (the paper round's planTourJob), any order at the wheel, the GPS re-planned from the truck (paper-route.js TourGuide, now shared with the demolition site)
- [x] A gate holds it: test/multi-drop-tour.mjs (brute-force optimal, any order completes, par follows the tour, save/resume); story-poi's in-order drive updated
- [ ] Owner has looked

## Decisions
- 2026-11-18, owner: "You should be able to deliver in any order that you'd like… the router should choose the shortest path through all of them and show you that as the default route. Basically reuse the old paper customer routing."

## Open questions
- None new. The multi-drop roll (data/offers.js MULTI_DROP: 35 % of takeout/grocery/casserole… offers, 2/3/4 stops weighted 3:2:1) is FEAT-89's PLACEHOLDER, unchanged here.

## Links
- Census: wip/feat-291/census.log, wip/feat-291/census.json (git-invisible).

## Files
src/mission.js, src/paper-route.js, src/main.js, test/multi-drop-tour.mjs, test/story-poi.mjs, test/gates.mjs

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
