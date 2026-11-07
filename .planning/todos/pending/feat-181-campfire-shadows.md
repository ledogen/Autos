---
id: FEAT-181
type: feature
status: open
severity: minor
opened: 2026-11-07
source: FEAT-66's "Still owed" (closed 2026-11-07 in Lane A's sweep): "Fire shadows (`light.castShadow`) — wanted once the tent landed; a six-face cube shadow map, so it needs a quality toggle first. Its own perf item."
relates: FEAT-66 (camp gear slots, closed), FEAT-45 (camping areas: "tent model + animated campfire w/ dynamic shadows" deferred there), items.md §2b (the visible-kit rule)
---

# FEAT-181: the campfire casts shadows

## What

The campfire's light (the point light that marks camp) lights the gear at the site but casts no shadows. With the
tent, awning and cooking kit standing round the fire, shadows are what would make the camp read as lit by the fire.

A point light's shadow is a **cube shadow map**: the scene is rendered six times, once per cube face, every frame
the shadow updates. That is the cost to budget, against the 60 fps target on a mid-range laptop. So it comes behind
a quality setting, not on by default everywhere.

## Acceptance

- [ ] A quality setting (the existing quality presets, or a settings row) turns campfire shadows on or off.
- [ ] With it on, the camp gear and the truck near the fire cast shadows from the fire.
- [ ] The cost is measured with the PERF-08 profiling harness, at a camp with the full kit, on and off (ms per
      frame, split between the shadow pass and the rest).
- [ ] Off, the frame is what it is today.
