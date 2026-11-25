---
id: BUG-198
type: bug
status: done
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Let's make sure we get the three free meals when starting a new game."
relates: FEAT-173, FEAT-184, DEC-381, src/main.js
---
lane: C

# BUG-198: A played tutorial starts the run short of mom's three packed lunches

## Next steps
Lane C lands it with the food batch (land/food-1117). Orchestrator: the main smoke covers the tutorial end.

## Summary
The three free meals are mom's packed lunches (FEAT-173; items.md §1d: "starts every run with three packed lunches").
They are granted at the firing, and the tutorial's breakfast card asks the player to eat one, so free will began on two
or fewer. Now the tutorial's end tops them back up to three.

## Description
What a new game grants today: three packed lunches at the run's start (`onRegionLive`, main.js), on every run. The
tutorial holds their fresh clock (DEC-339). Played: the breakfast card (`tut-breakfast`) eats one, the night may eat
more. Skipped: all three stay. The paper scenario (no tutorial): three. The fix is in `_checkOpeningEnd`, just before
Larry's call: count the packed lunches, grant the shortfall to three. Found by reading the code; not driven in the browser.

## Tracker
- [x] Tutorial end tops the packed lunches up to three (played or skipped)
- [ ] Main smoke green after landing

## Decisions
- 2026-11-17, owner (inbox 20261117101001-96ne): the source line above. DEC-381.

## Files
`src/main.js`

## Log
- 2026-11-17: built on land/food-1117 (lane C). No headless gate reaches `_checkOpeningEnd` (main.js); the smoke does.
- 2026-11-24 closed by the orchestrator after a tracker audit: on main since the food batch (merge 1b27af99); the main smoke has been green many times since, so the last box is met.
