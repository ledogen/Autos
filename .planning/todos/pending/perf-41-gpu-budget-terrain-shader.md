---
id: PERF-41
type: perf
status: open
opened: 2026-11-12
severity: major
source: PERF-37 session 3 (owner play on the PERF-38/39 branch, 2026-11-12) — "I don't think the computer is thermaling
  anymore but it's still getting quite toasty. I wish to improve the performance budget further." Package 2.6 W, the GPU
  now the larger half (1.48 W, 82–89 % busy at ~1.05 GHz). Owner, same day: "the proposed gpu improvements can be in a
  linked perf ticket too".
relates: [PERF-37 (parent; session 3 and the GPU split are recorded there), PERF-40 (the bench that measures these),
  PERF-11 (Normal's 1200-line render cap), FEAT-84 (the terrain surface shader), FEAT-85 (ground cover), PERF-16 (the
  on-demand shadow pass)]
branch: perf/perf-37-tire-map — worktree /Users/ledogen/CodeShit/CarGame-perf37
---

# PERF-41 — the GPU budget: the terrain's per-pixel shading

## What was measured

Scratchpad `gpuab.mjs` (to become a PERF-40 mode). Headless, on the real M4 GPU at the owner's 2090 × 1226 canvas,
parked after a 25 s drive, one switch at a time. The measure is GPU active cycles (busy % × MHz). GPU ms and raw watts
mislead here (see PERF-40). Savings on two random seeds:

| switch | seed 2654449719 | seed 1172941705 |
|---|---|---|
| terrain hidden | 60 % | 50 % |
| ¼ the pixels | 53 % | 45 % |
| 900-line cap (from 1226) | 30 % | 39 % |
| terrain detail shader off (`uDetailScale` 0) | 22 % | 40 % |
| terrain surface maps off (`uSurfOn` 0) | 12 % | 26 % |
| all props hidden | 12 % | 28 % |
| near (truck) shadow light off | 12 % | 23 % |
| grass / sage / rye hidden | 7 % | 20 % |

Single readings, about ±10 %. The cost is per pixel, and most of it is `terrain.js`'s fragment shader. Per terrain
pixel it does roughly the following:
- 8 surface-map texture reads, the rock pair projected twice on steep ground;
- three to four `tdFbm` procedural-noise calls: the mottle, the two dither octaves, and the rock bump;
- 5 baked-shadow atlas taps;
- the tunnel cut loop;
- Phong lighting with two shadowed directional lights.

Triangle count is cheap on this GPU: hiding 400k+ triangles of props cost less than the terrain shader.

## Candidate levers (each measured with PERF-40 before it is chosen)

1. **A cheaper terrain shader at the same look.** Precompute or reduce what does not need computing per pixel:
   - the noise octaves (bake the dither and mottle into the surface maps, or a texture lookup instead of `tdFbm`);
   - skip the steep-face second projection with a branch where the ground is flat;
   - fewer atlas taps.
   The look is the owner's to sign off; before/after screenshots.
2. **Distance falloff of the detail.** Full detail near the truck, the flat palette far away. Most pixels are near
   ground, so this saves less than it sounds; measure it.
3. **The render-resolution cap** (Normal is 1200 lines, PERF-11). 900 lines saved 30–39 %. A visual call for the owner.
4. **The truck shadow light** re-renders every frame (the day clock moves the sun, PERF-16). It saved 12–23 %; a lower
   update rate for the far cascade, or a smaller near map.
5. **Ground cover** (FEAT-85), 7–20 %: its realtime shadow casting and its overdraw.

## Acceptance

- [ ] PERF-40 measures each lever (A/B against this branch, three seeds) before it is chosen.
- [ ] The owner picks the levers from the measured numbers and before/after screenshots.
- [ ] GPU active cycles in the PERF-40 drive phase down by the agreed amount, with the look signed off.
