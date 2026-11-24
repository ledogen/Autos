---
id: BUG-260
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-23 — "I took a freight mission and went way off the GPS path and it never recalculated to give me directions from my current location."
relates: src/gps.js, src/mission.js
---
lane: Spare

# BUG-260: GPS does not reroute when you leave the path on a freight job

## Next steps
A lane reproduces it headless (take a freight job, drive far off the route) and finds why the reroute does not fire.

## Summary
On a freight mission the owner drove far off the GPS route and the route was never recalculated from the truck's position.

## Tracker
- [ ] Reproduced, cause named (freight only, or every job type?)
- [ ] Fixed with a gate that drives off the route and expects a new one
- [ ] Owner's drive

## Log
- 2026-11-24: opened from the owner's inbox note.
