---
id: BUG-216
type: bug
status: open
opened: 2026-11-17
severity: major
source: owner run log autos-run-660454599 (Logs/run-660454599/run.jsonl)
---

# BUG-216: Two road spots bottom the suspension repeatedly on seed 660454599

## Next steps
Run RoadSystem.debugSampleAt / test/replay.mjs at both spots and look at the profile for a step, a kink or a carve seam; then census for the same signature on random seeds.

## Summary
The owner's run log shows the suspension hitting its bump stops at the same places on different days; the second visit to one of them was the puncture that ended the run.

## Description
Seed 660454599, story mode. Spot A, about (461, 976): bump stop on day 7 10:15 at 17.96 m/s (front spring 22 → 20 %), and on day 9 09:32 at 17.49 m/s a bump-stop puncture (37.7 kN against a 30.0 kN threshold, tire at 4 %). Spot B, about (655, 1910–1956): five bump stops and an impact within one game minute on day 4 at 9–27 m/s. A worn front spring (38 % on day 4, 0 % by day 8) makes bottoming easier, so first establish whether a fresh truck bottoms there at those speeds: if it does, the road has a defect; if not, this is the wear spiral working as designed and the ticket closes with that finding.

## Tracker
- [ ] Profile and grade at both spots reported (step height, curvature, what feature it is)\n- [ ] A fresh truck driven over each at the logged speed: bottoms or not\n- [ ] If a defect: cause named, census on 30 random seeds, fix or a follow-up ticket

## Decisions

## Open questions

## Links
BUG-200, BUG-201, FEAT-93, DEC-395

## Files
src/road.js, test/replay.mjs, Logs/run-660454599/run.jsonl

## Log
- 2026-11-17 minted by the orchestrator from the owner's lost run (seed 660454599, day 9).
