---
id: BUG-218
type: bug
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox)
---
lane: engine & world

# BUG-218: A missed shift grinds the gears with the engine not running

## Next steps
The owner's run log shows a missShift at 0 rpm, 0 m/s costing 2 % of the transmission (Logs/run-660454599). Find the missed-shift damage rule and gate it on a turning input shaft: with the engine stopped and the truck at rest nothing spins, so nothing can grind. State the physical rule used (shaft speed difference), not an engine-on flag, so a rolling truck with a dead engine is still handled honestly.

## Summary
A missed shift grinds the gears with the engine not running.

## Description
Owner: "You should not be able to grind gears on an engine that's not running."

## Tracker
- [ ] Built
- [ ] A gate or smoke step holds it
- [ ] Owner has looked

## Decisions

## Open questions

## Links

## Files
src/damage.js, src/physics.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
