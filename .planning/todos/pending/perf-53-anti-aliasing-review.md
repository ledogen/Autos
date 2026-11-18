---
id: PERF-53
type: perf
status: open
severity: minor
opened: 2026-11-18
source: owner, inbox, 2026-11-18
---
lane: engine & world

# PERF-53: Review how the game does anti-aliasing and whether it can be cheaper or better

## Next steps
Measure what the renderer does today (MSAA sample count, pixel ratio, any post pass) and what each costs in GPU active cycles on the PERF-40 bench; propose options with screenshots.

## Summary
Owner: "Dropping a note to look into how we/3js handles anti-aliasing and if it can be optimized better"

## Description
Owner's note above. A measurement and a proposal first; no change without the owner's pick.

## Tracker
- [ ] What is used today, and its cost
- [ ] Options (sample count, resolution scale, a post-process AA) with cost and screenshots
- [ ] Owner picks

## Decisions

## Open questions

## Links
PERF-40, PERF-41.

## Files
src/main.js (renderer setup)

## Log
- 2026-11-18 minted by the orchestrator from the inbox.
