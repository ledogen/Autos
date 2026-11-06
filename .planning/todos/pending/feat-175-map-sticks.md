---
id: FEAT-175
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: FEAT-125 (pad bindings), the map view
---
lane: B

# FEAT-175: The map pans on the left stick and zooms on the right stick; throttle stays driving

> We should remap map panning to left stick and remap map zoom to right stick vertical axis I've noticed that while
> technically there is a way to separate throttle inputs from map zoom It's just not very intuitive to have it
> Dependent on throttle state when you open the map view or if you release it with map view open. Better to leave
> throttle mapped to driving always and use both sticks for navigating the map view. Opening the map takes left stick
> as well, so by definition the player's thumb will be off of it. So it should be fine to pan on left stick. We can
> still use the dpad for menu interaction in map.

## Acceptance
- [ ] With the map open on the pad: left stick pans, right stick vertical zooms; the triggers drive (throttle/brake) as always, never zoom.
- [ ] The D-pad still works the map's menus.
- [ ] The bindings chart (BINDINGS) and the map's on-screen hints say so; pinned in cdp-smoke's pad step.
