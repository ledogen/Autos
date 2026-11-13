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

## Progress — 2026-11-13 (branch `perf/perf-41-terrain-shader`, worktree `CarGame-perf41`)

Lever 1, built as four commits. Measured parked at two fixed freecam views per seed (near: 7 m behind the spawn, 2.6 m up;
vista: 30 m back, 45 m up), GPU active cycles (busy × MHz) over 8 s, 2 reps, builds alternated, machine held quiet.
Tool: `wip/perf-41/gpucmp.mjs` (git-invisible). Note: GPU ms/frame does NOT move. The GPU lowers its clock to stay
~90 % busy at 60 fps, so the saving shows only as cycles.

| lever | change | picture |
|---|---|---|
| 1a b1ccec24 | steep-face rock pair read only where `ts_steep > 0` | same |
| 1c 6b76733f | base fbm computed once; bump centre tap + dither coarse octave reuse it | same |
| 1d f3c43a2a | baked prop-shadow taps skipped past the fade end (240 m) | same |
| 1b 898dfda8 | hash-noise fbm → one baked tileable RGBA noise texture (R fbm, GB bump differences), 2 taps | pattern moves |

| seed | view | base Mcyc/s | 1a+1c+1d | all four |
|---|---|---|---|---|
| 2654449719 | near | 593 | −5.6 % | −12.1 % |
| 2654449719 | vista | 664 | −5.8 % | −13.9 % |
| 1172941705 | near | 575 | −3.7 % | −12.1 % |
| 1172941705 | vista | 660 | −5.5 % | −15.9 % |
| 759313244 | near | 615 | −6.3 % | −14.3 % |
| 759313244 | vista | 636 | −7.8 % | −13.9 % |
| mean | | | **−5.8 %** | **−13.7 %** |

Pixels moved > 8/255 vs base: same-picture build 0.02–0.19 % (one 0.93 %), inside the base-vs-base rep floor of
0.05–0.26 %. All four: 0.8–5.7 %, and only 0.01–0.08 % moved more than 32/255. The baked-noise bake costs ~59 ms at boot
(512², 64 cells, a 213 m repeat at the 0.3 /m mottle scale). Seed 17535907's vista view crashed Chrome on base too
(not this branch). Owner's sheet: https://claude.ai/artifact/CPc7eCYh59L3ktcM4nA61y

Lever 4 probe (`wip/perf-41/shadowprobe.mjs`, driving, unquiet machine, so ms are indicative only). The day clock is NOT
the per-frame cost: day.js pushes the sun on a 0.1 h ladder (~one step per 6 s), so the far cascade re-renders only on
that step or every 64 m. The NEAR map re-renders every moving frame (by design, the truck's own shadow): ~1.2–1.8 ms GPU,
41 draw calls, 246 k triangles per pass. Terrain chunks do not cast into it. Ground cover (12 instanced draws) is 178 k
of the 246 k triangles; the truck's ~25 parts and the remaining props are the rest. So the lever is ground cover's
shadow casting (lever 5's half), not the pass's update rate. It is a visual call.

Owner, 2026-11-13: the baked noise (1b) is APPROVED, so lever 1 ships whole (1a+1b+1c+1d).

### 2026-11-13, second quiet window (base = main ee0cdc82)
- **Lever 2, distance fade (b2d03c9f, v2 5857bad1; reverted d774c6bc):** every surface/noise read eases to its map's average texel over
  150–220 m and is skipped beyond. v1 used textureGrad (needed for reads inside a branch): **6–10 % MORE** cycles than
  lever 1. v2 used implicit-LOD reads inside the branch: −1.3…+3.3 % against lever 1, which is noise. Picture unchanged
  within the rep floor. No saving, so the recommendation is to drop it.
- **Ground-cover shadow ceiling:** playtest-bench, 150 s drives, 2 seeds, lever 1 with and without cover shadows.
  Valid seed 1768572700: drive 844 vs 844 Mcyc/s. Seed 17535907: 739 vs 751 (the no-cover drive was short). The
  ceiling is about 0. The 178 k cover triangles in the near pass do not show in the GPU's total load. Leave them as they are.
- **Lever 1 while driving:** main 908 → 844 Mcyc/s (−7 %) on the valid seed. Parked −7…−11 % (bench) / −8…−18 % (fixed views).
- Sheet updated: https://claude.ai/artifact/CPc7eCYh59L3ktcM4nA61y

### 2026-11-13, resolution — lever 1 ships, the rest closed (owner)
Owner: "res cap shouldnt be necessary to get the game super snappy. drop the fade and shadow changes, smoke and commit."
The branch ships **lever 1 only** (1a+1b+1c+1d; `src/terrain.js` + `src/terrain-texture.js`). The fade is reverted
(d774c6bc). The cover-shadow cut was only ever a throwaway bench build and never touched this branch. Gates after the
rebase onto main 51eb8e96: `cdp-smoke` 26 steps, zero console errors; `terrain-texture` green. Close this ticket at landing.

**Dead ends — measured, do not redo:**
- **Distance fade of the surface detail (lever 2).** No saving. Past ~150 m the GPU already reads the smallest mip
  levels (pre-shrunk copies of each texture), so a skipped read saves almost nothing. A read inside a branch needs
  `textureGrad` (explicit gradients) to stay correct, and on this GPU that read is slower than the reads it skips:
  v1 cost +6–10 %. v2 kept plain reads in the branch: −1.3…+3.3 %, which is noise.
- **Ground-cover shadow casting (lever 5's half).** Switching cover shadows off entirely: drive 844 vs 844 Mcyc/s.
  The 178 k cover triangles in the near shadow pass do not show in total GPU load. So baking them (as distant props
  are), a low-poly shadow proxy, or a rate cut cannot save anything either. They do not sway with wind (owner).
- **The shadow pass's update rate (lever 4).** The day clock is not a per-frame cost. The sun moves on a 0.1 h ladder
  (~6 s a step), and the far cascade redraws only on a step or every 64 m. The near map redraws every moving frame by
  design (the truck's own shadow), and it is mostly the ground-cover triangles above.
- **Render-resolution cap below 1200 lines (lever 3).** Declined by the owner. Not needed for snappiness.
- **GPU ms/frame as the metric.** It does not move. The GPU lowers its clock (DVFS, dynamic voltage and frequency
  scaling) to stay ~90 % busy at 60 fps. Compare by active cycles (busy × MHz) only.
- **Seed 17535907's vista view** (30 m back, 45 m up) crashes headless Chrome on main too. Not this branch; pick another
  seed for fixed-view benches.

**Tools** (git-invisible, copied to the main checkout's `wip/perf-41/` so they outlive this worktree): `gpucmp.mjs`
(fixed freecam views, cycles + pixel diff vs build 0, `--ports --labels --seeds --reps --hold --out`), `shadowprobe.mjs`
(near/far shadow pass cost while driving), `shadercheck.mjs <port>` (boot + console errors), `gpuab.mjs`, `runs/`.

**What is left of the GPU budget** (not this ticket): props and POI draw cost with distance (PERF-44, with BUG-164).
