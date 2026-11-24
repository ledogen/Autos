---
id: BUG-261
type: bug
status: open
severity: minor
opened: 2026-11-24
source: orchestrator, 2026-11-24, from the BUG-258 crease census (200 random worlds, branch proto/bug-258-jagged-edges @ 39952246)
relates: BUG-258, BUG-130, src/road.js
---
lane: engine & world

# BUG-261: The ground jumps at carve handovers and switchback arm flips

## Next steps
A world-gen lane (Opus), after BUG-258's pick is built: both edit `_carveCrossSection` in `src/road.js`. Start from `test/bug258-crease-census.mjs` on the BUG-258 branch, which already finds and counts these.

## Summary
The BUG-258 census found places where the ground itself jumps (a step: more than 0.5 m within 0.1 m), about 76 per world, that none of BUG-258's three fixes touch.

## Description
Measured on 200 random worlds, the 2500 m story region of each:
- "Other" steps are 2.2 % of sharp crease length near roads, about 76 per world, 100° typical and 125° worst, 28 m typical length.
- Two causes named so far: a switchback's arm flipping which side's carve wins (the BUG-130 family), and the handover from a leg's carve to a junction's carve.
- Worst example: seed 465737683 at (689, 186), a 7.5 m step at a leg / junction carve handover.
- Not in scope: the junction bank cut off at the 36 m reach. That is fix (A) of BUG-258.

## Tracker
- [ ] Each cause measured apart (count per world, worst height)
- [ ] The 7.5 m step at seed 465737683 (689, 186) gone
- [ ] Steps per world down, road deck unmoved (0.000 m), MESH == PHYSICS held
- [ ] Before/after sheet on random seeds

## Decisions
None yet.

## Open questions
None.

## Links
BUG-258 (the census and its sheet) · BUG-130

## Files
`src/road.js`

## Log
- 2026-11-24: minted from the BUG-258 study's report.
