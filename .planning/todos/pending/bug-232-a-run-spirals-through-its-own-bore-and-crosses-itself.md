---
id: BUG-232
type: bug
status: open
severity: minor
opened: 2026-11-18
source: BUG-230 census, 2026-11-18
relates: BUG-230, src/road.js
---
lane: Engine & world

# BUG-232: A road run spirals through its own bore and crosses itself 0.2 m apart in plan

## Next steps
Count how often a run passes within a lane width of itself (in plan) on 400 random seeds, and with what height gap. Then decide where routing should refuse it.

## Summary
Seed 948023748, run g:1,0,2:0,1,1: the centrelines pass 0.20 m apart in plan at s 920 and s 1103, with the two decks 0.9 to 2.0 m apart in height. The run goes through its own tunnel bore. A routing defect, found because the BUG-230 census counted the upper stretch's ribbon against the lower stretch's deck (the 1.99 m outlier). n=1 so far: frequency unknown.

## Tracker
- [ ] Reproduced and measured on 13+ random seeds.
- [ ] Cause named in the code.
- [ ] Fixed with a gate, fingerprint and a 400-seed no-throw sweep.

## Log
- 2026-11-18 minted by the orchestrator from the BUG-230 census.
