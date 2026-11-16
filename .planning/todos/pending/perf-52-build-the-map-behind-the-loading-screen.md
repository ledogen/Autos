---
id: PERF-52
type: perf
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "The very first time I open the map it usually hangs for about half a second to a second Not the end of the world that the hang is there but I'd much rather it be behind the loading screen So can we force load the map during world load so that we don't have to look at the Freeze the first time the player hits the button"
relates: src/map2d.js, src/main.js
---
lane: Map batch

# PERF-52: The first map open hangs 0.5 to 1 s; build it behind the loading screen

## Next steps
Map batch agent.

## Summary
The first time the map opens it hangs for about half a second to a second. Do that work during world load so the freeze is behind the loading screen.

## Tracker
- [ ] Measured: first map open, worst frame, before
- [ ] The map's first-open work runs during world load
- [ ] After: first open within a normal frame or two; load time cost stated

## Log
- 2026-11-16: filed from the owner's inbox note.
