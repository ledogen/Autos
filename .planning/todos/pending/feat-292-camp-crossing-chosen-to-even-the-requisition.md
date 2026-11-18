---
id: FEAT-292
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (DEC-424), after losing a run on seed 660454599
relates: DEC-424, FEAT-103, FEAT-154, FEAT-157, FEAT-65, src/poi.js, src/offer-board.js
---
lane: engine & world

# FEAT-292: The camp's crossing is chosen so the requisition is near 22 km

## Next steps
Build DEC-424 in the camp siting; re-run the 61-seed census on the built code.

## Summary
The requisition's loaded total swings 18.0–34.8 km between worlds. The camp keeps today's crossing unless its total is more than 15 % off 22 km; then it takes the qualifying crossing whose total is nearest 22 km. Lines leave their source by the nearer end.

## Description
See DEC-424 for the ruling and the study's numbers. The study measured this rule as "R4b, T 22": mean 22.5, sd 2.1, min 17.5, p10 19.9, p50 22.7, p90 24.8, max 26.9, 37 of 61 camps moved; and the nearer-end rule as "S".
Cold generation only: the choice is a pure function of the seed and the generated world; nothing is saved.

## Tracker
- [ ] The rule built in the camp siting, deterministic, same camp on every load
- [ ] Lines leave by the nearer end of the source's road
- [ ] The 61-seed census on the built code matches the study within rounding; seed 660454599 near 23.6 km
- [ ] expedition-camp gate and world-determinism green; rows and returns (FEAT-154) follow the camp
- [ ] Build-time cost of evaluating the crossings measured
- [ ] Owner has played a run

## Decisions
DEC-424.

## Open questions

## Links
FEAT-103, FEAT-154, card req-evening-options.

## Files
src/poi.js, src/offer-board.js, test/expedition-camp.mjs

## Log
- 2026-11-18 minted by the orchestrator from the owner's answers.
