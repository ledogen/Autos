---
id: BUG-222
type: bug
status: open
severity: minor
opened: 2026-11-18
source: FEAT-292 agent, 2026-11-18
---
lane: SM-3

# BUG-222: The requisition's return spot is farther than the FEAT-154 nearness limit on about a quarter of seeds

## Next steps
Measure the miss distances on the 60 study seeds and decide whether the limit or the siting is wrong.

## Summary
The return-spot nearness check (40 m, or 100 m on the row's own road) fails on 6 of 23 kept-camp seeds and 12 of 37 moved-camp seeds.

## Description
Pre-existing: kept-camp seeds are byte-identical to main before FEAT-292, so moving the camp does not cause it.

## Tracker
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
FEAT-154, FEAT-292

## Files

## Log
- 2026-11-18 minted by the orchestrator.
