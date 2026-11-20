---
id: BUG-228
type: bug
status: closed
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox) — "There is subtle color banding everywhere in the game. You can see it in the main menu, in the gradients and lighting on the floor. I can see it in the world, the bands move as the exposure compensation adjusts. What is the color depth of our game? Is it less than you would typically see in a high performance game? I feel like normally you don't notice the banding, but I can see it pretty clearly on the Mac Air."
relates: PERF-53, src/main.js, src/sky.js, src/exposure.js, src/stage.js
---
lane: Engine & world

# BUG-228: Colour banding in smooth gradients (menu floor, sky, lit ground); the bands move with the exposure

## Next steps
Owner said "Good: land it" (2026-11-19). Merged main into `land/bug-228-banding`, proof green; orchestrator lands it after the PERF-40 A/B bench.
The GPU-cost bench (PERF-40, active cycles) is owed on a quiet machine.

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
- [x] Dither on every material that draws a smooth gradient (terrain, sky, stage floor, roads, water, props).
- [x] Before | after captures of the menu floor, a dusk sky, a lit hillside and fog, magnified (`wip/bug-228/sheet.jpg`).
- [ ] Cost measured (GPU by active cycles, PERF-40 bench) and shown. Instruction delta only so far (below); the bench
      needs a quiet machine (load 11–14 on 11-18).
- [x] Owner's look on the Mac Air: "Good: land it" (2026-11-19).

## Decisions
- Where the bands are born: at the final 8-bit write only. Checked every intermediate: the sky LUT and fog cube are
  half-float, the impostor albedo is half-float, the exposure meter is a log-luminance meter averaged to one float
  (it moves the bands, it does not make them). The terrain bake's 8-bit sRGB albedo stores surface colour, not light
  (the lighting gradient is computed live after it), so it is not a band source. The menu's CSS scrim is not one
  either: Chrome already dithers CSS gradients (0 bands under the scrim); the menu's bands are the 3D floor.
- One chunk, installed centrally: `THREE.ShaderChunk.dithering_fragment` made unconditional in `src/main.js` (next to
  the shadow chunk patches), so every built-in material and every GLB/clone dithers without `material.dithering`;
  the five custom output shaders (sky, moon, dust, impostors, lab floor) include it by hand, after fog.
- Triangular ±1-level noise, not three's uniform ±0.5: measured, the uniform one left flat patches up to 25 px at
  values near a level's centre (they would slide with the exposure like the bands did); triangular gives 13. Static
  screen-space pattern (a hash of the pixel position, no time term), channels R+ G− B+ as three's.
- The moon is additive: it dithers only where it adds light, or its quad would re-grain the sky inside it.

## Open questions
- None for the code. The look is the owner's (card).

## Links
- PERF-53, PERF-40 (the bench that is owed).

## Files
- `src/main.js` (the chunk), `src/sky.js`, `src/moon.js`, `src/dust.js`, `src/props/prop-impostor.js`, the lab floor in
  `src/main.js`. Tools (git-invisible): `wip/bug-228/` shots.mjs, analyze.mjs, sheet.mjs.

## Log
- 2026-11-18 minted by the orchestrator from the inbox note.
- 2026-11-18 built (land/bug-228-banding). Runs of ≥ 8 identical pixels along a line, before → after: menu floor
  17 → 3 (longest 91 → 12 px), dusk sky 31 → 5 (53 → 13), fog 15 → 12 (98 → 21), lit hillside 3 → 0 (texture
  already hid it). The leftover runs are chance runs in the grain, no edge. Cost: ~30 scalar ALU ops incl. 2 sin per
  pixel (estimate from the GLSL, not a compiled count). Bench owed. Affected gates 19/19, cdp-smoke 40/40 and pad-e2e
  green (load 10–11). Pattern static: 0 of 560 000 floor pixels change between two still frames 1 s apart.
- 2026-11-19: owner "Good: land it". main merged in clean (no conflicts). Affected gates 19/19; cdp-smoke green on retry (first run: rockslide opacity 0.5 vs < 0.5, load 12, timing); pad-e2e ALL OK; build OK. Undithered ShaderMaterials: exposure.js:59 and props/prop-shadow-bake.js:153, both offscreen (no final colour). Bench A/B still owed (orchestrator).
