---
id: FEAT-291
type: feature
status: done
severity: major
opened: 2026-11-18
closed: 2026-11-19
resolution: "Landed on main; owner answered Good: land it."
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

**Built (land/feat-291-multi-drop).** A takeout, grocery or casserole job with 2 to 4 stops keeps the stops the board rolled. The stops are now ordered by the paper round's exact tour planner (`planTourJob`, brute force over every order), starting from the giver. At the wheel you may hand them over in any order. The GPS line re-plans from the truck through the stops still owed (`TourGuide` in `src/paper-route.js`, lifted out of the demolition-site code in `main.js` and shared by both). `MissionSystem` tracks which stops are handed over (`dropped`, saved and resumed). The par, deadline and pay follow the tour length, as on the paper round.

**Census, 20 random seeds, 600 multi-drop offers** (min / median / max): tour 1.95 / 5.25 / 10.77 km; par 2.4 / 6.7 / 13.9 min; base pay $2.73 / 8.57 / 21.34. Every tour is no longer than the old greedy nearest-next order, and 0 of 600 were shorter: on these seeds the old order was already optimal, so the gain is the any-order freedom and the re-planned GPS, not saved distance. After reordering, a single leg can be shorter than the 1.05 km courier floor; the whole tour cannot.

**Close-out proof (2026-11-18).** 40 affected gates green after merging main (paper-tour, paper-reroute, paper-guide-keep, paper-route, demolition-site and story-poi among them); two reds, both stale fixtures, no code change: test/gps-readout.mjs faked a multi-drop hand-over with the old leg counter; test/cdp-smoke.mjs's demolition step read `__site().tour` / `.guide.customers`, which the TourGuide lift moved to `.guide.tour` / `.guide.leg`. Smoke (all steps) and pad-e2e then pass.

## Tracker
- [x] Built: the stops in the shortest order from the giver (the paper round's planTourJob), any order at the wheel, the GPS re-planned from the truck (paper-route.js TourGuide, now shared with the demolition site)
- [x] A gate holds it: test/multi-drop-tour.mjs (brute-force optimal, any order completes, par follows the tour, save/resume); story-poi's in-order drive updated
- [x] Owner has looked

## Decisions
- 2026-11-19, owner (card feat291-multi-drop-drive): "Good: land it".
- 2026-11-18, owner: "You should be able to deliver in any order that you'd like… the router should choose the shortest path through all of them and show you that as the default route. Basically reuse the old paper customer routing."

## Open questions
- None new. The multi-drop roll (data/offers.js MULTI_DROP: 35 % of takeout/grocery/casserole… offers, 2/3/4 stops weighted 3:2:1) is FEAT-89's PLACEHOLDER, unchanged here.

## Links
- Census: wip/feat-291/census.log, wip/feat-291/census.json (git-invisible).

## Files
src/mission.js, src/paper-route.js, src/main.js, test/multi-drop-tour.mjs, test/story-poi.mjs, test/gates.mjs

## Log
- 2026-11-18 close-out: merged main clean (4bbf7424); 40 affected gates green after the gps-readout fixture fix; census 600 offers, 0 shorter than greedy; smoke (rerun after the accessor fix) green, pad-e2e ALL OK, at load 7.9 / 12.4. Owed card feat291-multi-drop-drive.
- 2026-11-18 minted by the orchestrator from the owner's inbox.
- 2026-11-19: owner drove it and answered "Good: land it" (it is on main). Every Tracker box is ticked: closed. The 35 % multi-drop share and the 3:2:1 stop weights stay FEAT-89 placeholders for the owner.
