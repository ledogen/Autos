---
id: FEAT-266
type: feature
status: closed
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "C. To simplify this, let's still generate 16 targets, but let's only ever show 11, whichever makes the shortest route from Larry's. ... let's also only ever show the N targets the player is delivering to in the mission. Never any extra distractions"
relates: FEAT-141, FEAT-63, FEAT-257, BUG-194, DEC-371, DEC-398, src/paper-route.js, src/main.js
---
lane: SM-3 missions

# FEAT-266: A paper route is its planned houses, and the GPS follows the tour through them

## Next steps
Built on `land/feat-266-paper-fixed-houses`, waiting to land. Then the owner drives Larry's first route (owed card `feat266-paper-route-drive`).

## Summary
Only the N houses the planner chose for a round count as deliveries, and only they are ever shown. The GPS follows
the shortest tour from the truck through the houses still owed, so it agrees with the route on Larry's card, and
it turns back to a missed house exactly when turning back is the shorter way. Replaces "any customer counts"
(FEAT-141) and "guide to the nearest house" (DEC-371).

## Description
What the owner hit (seed 3200351065, Larry's first route): the line pointed north at the cluster of four, flipped
south to a lone house as he left the start circle (the nearest by road among all 16), then flipped back near the
cluster. His words: "This is very confusing. I do want the game to direct the player through the shortest straight
line distance of N recipients. I also want it to say, 'You missed one,' by pointing the GPS behind them when they
drive past a delivery without making it, because it's typically faster to turn around immediately than to get to
the end of the route and then turn around."

Ruling (DEC-398): option C, and "let's still generate 16 targets, but let's only ever show 11, whichever makes the
shortest route from Larry's ... only ever show the N targets the player is delivering to in the mission. Never any
extra distractions".

Reading (orchestrator's, to be confirmed on the look card): a region still generates 16 customers. The pool a
route may ever use is the 11 that make the shortest tour from Larry's (11 = the top rung of `PAPER_PARAMS.tiers`
[4, 7, 9, 11]). A round of N delivers to the N of those the planner picks; no other house counts, lights up, shows
on the map or takes a turn arrow. The five houses outside the 11 are never paper targets.

## Tracker
- [x] Only the round's N planned houses count; a paper on any other porch scores nothing and reads as a miss
- [x] Rings, map pips, turn arrows and the count show exactly those N, minus the delivered ones
- [x] The guide is the shortest tour from the truck through the houses still owed; no flip to a house off the route
- [x] Passing an owed house without delivering turns the line back when that is the shorter tour
- [x] The pool is stated: main already places only 11 customers (not 16); every rung's N come from them
- [x] Par, pay, deadline unchanged in meaning; the gate covers the owner's seed
- [ ] Owner drives Larry's first route

## Open questions
- The owner's "still generate 16, show 11" assumed 16 on main. Main places 11 (BUG-134 cut the ladder to 4/7/9/11), so the
  pool is all of them. Generating 16 and keeping the 11 with the shortest tour would make routes tighter but is a world-gen
  change; not built. Asked on the drive card.

## Decisions
- 2026-11-17, owner: DEC-398 (above).

## Files
`src/paper-route.js` · `src/main.js` · `src/gps.js` · `test/paper-route*.mjs`

## Log
- 2026-11-17: minted by the orchestrator from the owner's ruling in chat.
- 2026-11-17: built. Guide = shortest tour through the planned houses still owed, re-planned quietly every 1 s
  (`RR_PARAMS.tourS`) and on delivery; GPS draws its first leg (`gpsLine`) so each house keeps the turn arrow; map shows
  only the owed planned houses; off a route a practice throw reads nothing. paper-reroute extended (seed 6 + owner seed,
  fails on main with 35 checks), paper-tour flipped. Sheet: wip/feat-266/sheet.jpg. Headless and in-game house sets
  differ on this seed (game has house 43, headless 41/7): not chased.

- 2026-11-17 CLOSED by the orchestrator on the owner's card answer ("Drove it: good, close it", card feat266-paper-route-drive). On main, in the play build.
