---
id: FEAT-249
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "When you drive into the shade of a mountain it still really bothers me that you can see the edge of the shadow probe and the terrain turns light again out there So we can add a map wide shadow to the edge of the shadow probe? So that we can add a map wide shadow"
relates: FEAT-243, PERF-41, src/main.js, src/terrain.js
---
lane: unplaced

# FEAT-249: Mountain shade does not stop at the edge of the shadow map

## Next steps
A free lane (Opus): measure options for shade beyond the ±256 m far map (a third, coarse, rarely redrawn cascade; or a low-resolution baked horizon shade per chunk) and show before/after with cost.

## Summary
Terrain shadows come from a shadow map that covers 512 m around the truck. Beyond its edge the ground is lit again, so a shaded valley shows a bright rim. Extend the shade to the visible world.

## Description
The far cascade is `sunFar` in main.js (2048², 0.25 m/texel, redrawn every 64 m). PERF-41 lists shadow dead ends the owner declined; read it first. Cost is judged by GPU active cycles and per-second spikes.

## Tracker
- [ ] No visible lit rim past the shadow map when in a mountain's shade
- [ ] Cost measured (GPU active cycles, spikes)
- [ ] Owner has looked
