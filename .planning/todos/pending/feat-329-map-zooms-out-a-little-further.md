---
id: FEAT-329
type: feature
status: open
severity: minor
opened: 2026-11-24
source: owner, 2026-11-24 (inbox) — "when previewing a route on the map sometimes i cant zoom out enough to see the entire route. simple fix for now. reduce min zoom level a little"
relates: PERF-38, PERF-46
---
lane: free lane

# FEAT-329: The map zooms out a little further

## Next steps
A routine lane (Sonnet): lower the map's minimum zoom a little (state the old and new figure and the widest route it now fits), and check the map's cost at the new widest view (PERF-38, PERF-46 are about map cost).

## Summary
A previewed route sometimes does not fit on the map at the widest zoom. The owner wants the simple fix: a slightly lower minimum zoom.

## Description
(See Summary and the owner's words in `source:`.)

## Tracker
- [ ] Built
- [ ] Owner's look

## Decisions
None yet.

## Open questions
None.

## Links
PERF-38, PERF-46

## Files
`src/map2d.js`

## Log
- 2026-11-24: minted by the orchestrator from the owner's inbox.
