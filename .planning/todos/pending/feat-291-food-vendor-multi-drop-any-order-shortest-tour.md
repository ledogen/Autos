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
Reuse the paper round's tour helpers (planGuideJob, stepJob, tourLeg in src/paper-route.js): the multi-drop takeout job accepts its drops in any order, the planner's default line is the shortest tour through all of them, par follows that tour. Build on top of BUG-212 (the re-plan keeps the followed order). Check the records governing multi-drop pay and par first.

## Summary
Food vendor multi-drop jobs: deliver in any order, default route is the shortest tour.

## Description
Owner: "For a food vendor job where you have to deliver to multiple locations. It should be in the same style as the Former newspaper delivery model You should be able to deliver in any order that you'd like and optimize the route however you choose Right now it's kind of silly that You get three bags of takeout and then you could potentially drive all the way up One road and then all the way back down that same road to make subsequent deliveries. Then the router should choose the shortest path through all of them and show you that as the default route. Basically reuse the old paper customer routing."

## Tracker
- [ ] Built
- [ ] A gate or smoke step holds it
- [ ] Owner has looked

## Decisions

## Open questions

## Links

## Files
src/paper-route.js, src/mission.js, data/offers.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
