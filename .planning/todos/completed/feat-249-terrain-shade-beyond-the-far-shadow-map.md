---
id: FEAT-249
type: feature
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "When you drive into the shade of a mountain it still really bothers me that you can see the edge of the shadow probe and the terrain turns light again out there So we can add a map wide shadow to the edge of the shadow probe? So that we can add a map wide shadow"
relates: FEAT-243, PERF-41, src/main.js, src/terrain.js
---
lane: unplaced

# FEAT-249: Mountain shade does not stop at the edge of the shadow map

## Next steps
Closed 2026-11-17: good enough on main (owner). Nothing lands. Branch `land/feat-249-far-shade` @ b21696f0 is kept, unlanded, in case the lit band is ever seen on High or Ultra.
## Summary
Terrain shadows come from a shadow map that covers 512 m around the truck. Beyond its edge the ground is lit again, so a shaded valley shows a bright rim. Extend the shade to the visible world.

## Description
The far cascade is `sunFar` in main.js (2048², 0.25 m/texel, redrawn every 64 m). PERF-41 lists shadow dead ends the owner declined; read it first. Cost is judged by GPU active cycles and per-second spikes.

## Tracker
- [ ] No visible lit rim past the shadow map when in a mountain's shade
- [ ] Cost measured (GPU active cycles, spikes)
- [ ] Owner has looked

## Log
- 2026-11-17 (s2): FEAT-243 (landed) has dust, smoke and spray read `sunFar.shadow.matrix` / `sunFar.shadow.map`
  every frame (main.js, SUN_SHADE_UNIFORMS), so a bigger far box needs no particle change.
- 2026-11-17: the owner looked at the sheet ("i dont see a difference between each pair of photos"), then checked main himself: "my wish is already met on main". He plays on Normal, where the far shadow box (±256 m) already passes the fog wall; the branch changes only High and Ultra, and its own before/after sheet shows no visible difference there. Owner: "close as good enough on main". Closed with nothing landed. What he originally saw is not explained; if it shows again, a place capture at the spot is the starting point.
