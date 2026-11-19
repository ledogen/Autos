---
id: BUG-228
type: bug
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox) — "There is subtle color banding everywhere in the game. You can see it in the main menu, in the gradients and lighting on the floor. I can see it in the world, the bands move as the exposure compensation adjusts. What is the color depth of our game? Is it less than you would typically see in a high performance game? I feel like normally you don't notice the banding, but I can see it pretty clearly on the Mac Air."
relates: PERF-53, src/main.js, src/sky.js, src/exposure.js, src/stage.js
---
lane: Engine & world

# BUG-228: Colour banding in smooth gradients (menu floor, sky, lit ground); the bands move with the exposure

## Next steps
Add dithering at the output and measure its cost; show the owner a before | after on the Mac Air's own screen.

## Summary
The game draws straight to an 8-bit-per-channel canvas (256 levels per colour, the normal output depth) with no
dithering. A smooth, dark gradient spans only a few of those levels, so each step shows as a band; the exposure
adjustment slides the steps across the scene, which is why the bands move.

## Description
Found by grep on 11-18: `WebGLRenderer` in `src/main.js` renders directly to the canvas (no post-processing chain),
ACES tone mapping (`src/sky.js`), no material has `dithering` on, and no output dither exists. Big-budget games
output the same 8 bits; they hide the steps by rendering internally at higher precision and adding a sub-level noise
(dithering) before the final rounding. Three.js has this built in per material (`material.dithering = true` adds
about half a level of screen-space noise in the fragment shader before output), which costs a few shader
instructions per pixel. Our custom-shader materials (terrain, sky, road, water) need the same chunk added by hand.

## Tracker
- [ ] Dither on every material that draws a smooth gradient (terrain, sky, stage floor, roads, water, props).
- [ ] Before | after captures of the menu floor, a dusk sky and a lit hillside, magnified.
- [ ] Cost measured (GPU by active cycles, PERF-40 bench) and shown.
- [ ] Owner's look on the Mac Air.

## Log
- 2026-11-18 minted by the orchestrator from the inbox note.
