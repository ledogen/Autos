---
id: BUG-212
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "I feel like the GPS map line gets kind of confused especially for missions with multiple stops"
relates: FEAT-266, FEAT-257, BUG-204, DEC-398
---
lane: bug (alpha by default)

# BUG-212: The GPS route line gets confused, especially on multi-stop missions

## Next steps
The owner drives a paper round and a demolition job (card bugs-1117-gps-food-camp-drive) and answers the two drawing questions there.

## Summary
The GPS line seems to get confused, most on missions with several stops. Stated as a feeling: no specific stop or seed was named.

## Description
Owner's words, verbatim (inbox 20261118062617-1pat):

> I feel like the GPS map line gets kind of confused especially for missions with multiple stops

## Tracker
- [x] The GPS line follows the intended next stop and tour on a multi-stop mission
- [x] A repro (seed, mission, position) is captured first (census + gate paper-guide-keep, seed 1)
- [ ] Owner has driven it

## Decisions
- Measured (test/gps-multistop-census.mjs, 6 random seeds, a driver that FOLLOWS the GPS 20 m a re-plan, i.e. one RR_PARAMS.tourS at ~20 m/s; paper 4/7/9/11 houses and every demolition job; clean / a missed stop / off the route / a U-turn; 448 drives):
  - DEFECT, fixed: the line flips between two tours of equal length. Flip-backs (the leg's house changes, then comes back, no delivery between): paper 89 to 104 per 24 drives, demolition 9 to 10 per 4; the two houses up to 982 m apart. Cause: the tours tie to the metre, and the planner breaks the tie by its candidate sort (distance from the truck), which swaps as the truck moves. Fix: the re-plan keeps the order being followed unless a new tour beats it by more than RR_PARAMS.keepM = 5 m (0 m left 2 flip-backs, 5 m and 25 m none).
  - DEFECT, fixed: a demolition job's MAP drew the job's planned route while the GPS followed the re-planned tour, so after a miss or a U-turn they disagreed on order. The map now draws the GPS's tour (the paper round's rule, DEC-399). At the job start they agreed on 4 of 4 jobs.
  - Not found: the tour growing while followed (0 after a harness fix), the line pointing into a dead-end spur, a mis-ordered turn arrow on the paper round (map and GPS read the same line). Stale line after a delivery: the re-plan job measured 7 to 401 ms of CPU, pumped in frame spare time, so the GPS can lead to the house just served for a fraction of a second; not changed.
  - Design questions (owed card, not built): overlapping legs on one road (a spur in and out) draw on top of each other with no direction; the stops are not numbered on the map.

## Open questions
- Which mission, which seed, and what did the line do (flip, double back, point behind)?

## Links
FEAT-266, FEAT-257, BUG-204, DEC-398

## Files
the GPS / guide route in src/main.js and the road system

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062617-1pat).
- 2026-11-17 4286e100 + dcd4eac1 + 444e14e1 (keepM in planTourJob; paper and demolition pass the followed order), 59f66aab (demolition map line). Gate paper-guide-keep.mjs (control 24 flip-backs, built 0); smoke demolition step checks the map line. Unverified: the owner's drive.
