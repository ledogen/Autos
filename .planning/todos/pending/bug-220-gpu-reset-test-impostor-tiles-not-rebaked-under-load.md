---
id: BUG-220
type: bug
status: open
severity: minor
opened: 2026-11-18
source: lane agents, 2026-11-17 and 2026-11-18
---
lane: engine & world

# BUG-220: After a GPU reset, 8 tree-impostor atlas tiles are still empty when the test measures (seen twice under load)

## Next steps
Decide whether the game is slow to re-bake or the test measures too early; make the test wait on the re-bake finishing, or fix the re-bake.

## Summary
The gpu-reset test failed with 8 empty impostor-atlas tiles on first runs at load 9 to 11 and passed on re-runs (after FEAT-235 on 11-17, and on the BUG-217 branch on 11-18).

## Description
Twice is not noise. If a player's GPU resets under load, trees may show blank billboards until the re-bake completes: measure how long that is.

## Tracker
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
FEAT-235, BUG-217

## Files

## Log
- 2026-11-18 minted by the orchestrator.
