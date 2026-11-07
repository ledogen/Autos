---
id: FEAT-175
type: feature
status: closed
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

## Work log

**2026-11-07, Lane B — built on feature/machine, not landed.**

- `src/gamepad.js`: with the map open, the left stick is `pad.panX / panY` and the right stick's vertical is
  `pad.zoom` (up in, down out, `mapZoomRate` 2.0 e-folds/s at full deflection, as the triggers had). The
  triggers are the throttle and brake on the map, always; steering is 0 while the map is open (the left stick
  is its pan). The old hand-over rule — a trigger held as the map opened stayed the truck's until let go
  (`mapPass`) — is deleted: there is nothing to hand over any more.
- `src/map2d.js` pans on `pad.panX / panY`. The right stick's horizontal does nothing on the map (the camera
  never orbits behind it, as before).
- The D-pad is untouched on the map (pick-up ↓, set spawn ←, reset → held), and the bumpers still page offers.
- BINDINGS (the settings Controls table is built from it): "look around" right stick, "map: pan" left stick
  (map open), "map: zoom in / out" right stick ↑ / ↓ (map open). The map draws no zoom/pan hint of its own.
- Pinned in `test/pad-e2e.mjs`'s map section: left stick pans and steers nothing; right stick up zooms in, down
  out; RT on the map is throttle and zooms nothing. Not run yet: Chrome held. debug-sliders and
  camera-follow-clock green.

## Resolution

**Closed on evidence (Lane B, 2026-11-07).** Landed d5c03b3a. Left stick pans, the right stick's vertical zooms,
the triggers always drive; the D-pad is unchanged on the map; BINDINGS says so (the map draws no pan/zoom hint of
its own). Pinned in test/pad-e2e.mjs's map section rather than cdp-smoke's pad step (that is where the map's pad
checks live): left stick pans and steers nothing, right stick up/down zooms in/out, RT is throttle and zooms
nothing. pad-e2e ALL OK on main.
