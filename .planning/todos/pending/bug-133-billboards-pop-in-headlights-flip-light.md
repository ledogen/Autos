---
id: BUG-133
type: bug
status: open — built (land/bug-133, on main); waiting on the owner's look at e66f3987
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 (three inbox notes) — "Prop billboards particularly trees don't reflect the truck headlights making pop-in very obvious at nighttime with high beams on" · "Prop billboards flip flop and mirror their orientation at certain angles" · "Prop billboards lighting does not always match what the 3d models lighting looks like making pop-in obvious at certain times of day and certain illumination angles"
relates: BUG-96 (closed 11-05: live Lambert lighting, the sun-side U mirror removed — 2d03f51b, on main and Pages since 11-02), PERF-21 (impostors), FEAT-180 (lighting review), src/props/prop-impostor.js
---
lane: Spare

# BUG-133: prop billboards give themselves away — no headlights, flip/mirror at some angles, light that doesn't match the 3D model

The owner sees the 3D → billboard hand-off ("pop-in") in three ways. BUG-96's fix is in the build they played
(2d03f51b removed the sun-side U mirror and lights each texel live), so these are NEW causes, not that bug back.

1. **Headlights.** At night with high beams, the 3D trees near the truck are lit and the billboards past them are
   not: the billboard shader takes the sun + hemisphere terms only, no spot lights.
2. **Flip / mirror at some angles.** Still seen after BUG-96. Suspects to rule in or out: the atlas's view-tile
   choice snapping between baked azimuths, a quad frame whose right vector flips sign as the view crosses a
   tree's axis, or a mirrored bake for some species.
3. **Lighting mismatch at some sun angles.** The billboard's reconstructed normals vs the 3D model's
   faceted shading, at low sun or with the sun behind the camera.

## Acceptance
- [ ] Each of the three is reproduced headlessly first (a capture or a pinned vantage + time of day), with the cause named.
- [ ] Headlights: within the high beams' reach, a billboard tree is lit like its 3D twin (before/after at 22:00).
- [ ] No billboard changes silhouette or mirrors in one frame while orbiting it or driving a loop.
- [ ] 3D vs billboard brightness matches at dawn, noon and dusk, sun ahead and behind (the BUG-96 shot set, extended).
- [ ] Draw calls and frame time unchanged within noise (props gates + smoke).

## Reproduced headlessly, causes named (Spare, 2026-11-07) — nothing changed yet

**Harness:** `wip/bug-133/repro.mjs <port> <tag>` (git-invisible). Built app on main `f7f20d83`, story seed 6 (a test
seed, fine for reproducing), pinned freecam vantages. Every condition renders one frame three ways:
- every tree 3D (LOD ring 99);
- the game's own frame (ring 2: billboards past the second chunk ring) — or ring 0, where noted;
- no props at all, which gives the tree mask.

Only the **swapped** trees count: a pixel identical in the 3D and the game frame is a tree that stays 3D in both. The
first pass counted those and read a meaningless 1.00. Frames: `wip/bug-133/main2-*.png`.

1. **Headlights — reproduced; cause: the billboard shader has no spot-light term.** It lights texels with the sun and
   the hemisphere only (`prop-impostor.js` fragment shader), so the truck's high beams never reach a billboard.
   - At 22:00 with high beams, billboards inside the beam are **36 % darker** than their 3D twins (ring 0, the beam
     centre: luminance 44.8 → 29.3; 61 % of their pixels darker by > 10 levels). With the lights off they match.
   - In play the gap opens wherever the high beam (reach 200 m) passes the third chunk ring, where billboards start.
     At this vantage that ring held almost no trees in the beam (477 px), so the game-ring number is not meaningful
     here.
2. **Flip-flop — reproduced; cause: the 3D ⇄ billboard swap has no hysteresis.** `_chunkMode` is a pure Chebyshev
   ring around the camera's chunk.
   - A 1 m camera step across one chunk line re-swaps **10 chunks**, every crossing, both ways (4 of 4 crossings). A
     camera that weaves along a chunk line, such as a road running near one, flips those rows back and forth.
   - Each swap changes the silhouette: the swapped trees' 3D and billboard silhouettes overlap only 29–57 % (IoU) at
     the swap distance.
   - Not reproduced: a true **mirror** on the one aspen orbited at 150 m. Its billboard matches the 3D silhouette
     straight from every side (IoU 0.77–0.99, best unmirrored), but an aspen is near-symmetric. BUG-96's atlas
     measurement had pines at 13–80 % of texels with no mirror partner. A pine orbit is owed before calling the
     mirror part done.
3. **Lighting — reproduced as a per-tree pattern, not a brightness offset; cause: one fixed normal tile.**
   - At the game's swap distance, mean brightness matches within 2 % in all six conditions: morning, noon and dusk,
     with the sun ahead and behind (ratio 0.98–1.01).
   - Turning off the 3D props' received shadows changes nothing, so shadows are ruled out.
   - What differs is which facets are lit: 5–25 % of a swapped tree's pixels differ by > 10 levels, most with the sun
     ahead.
   - The normal atlas is ONE front view per variant, while every 3D instance has its own yaw. The billboard's lit side
     follows the tile, not the tree. The same single view is (2)'s silhouette change.

**Fix directions** (for the orchestrator; none built):
- (2a) **Hysteresis on the LOD ring:** promote at `ring`, demote at `ring + 1`. A few lines in `_chunkMode`, the
  smallest change. It ends the flip-flop, but each single swap still shows (2)/(3)'s mismatch.
- (1) **The headlight term in the billboard shader:** the truck's two head SpotLights as uniforms (position,
  direction, cone, distance, decay, colour × intensity), Lambert against the rebuilt normal. One more uniform block;
  no extra draw calls.
- (2)/(3) **Yaw-aware views:** bake N azimuth views per variant and pick the tile for (view azimuth − instance yaw),
  cross-fading the two nearest. It needs the instance yaw as an attribute. Atlas memory goes ×N (≈ 5 MB × N/1 for
  albedo + normals), the bake goes ×N, and draw calls stay the same. This is the real cure for the silhouette and the
  lit-side mismatch, and the largest piece.

## Built: hysteresis + the headlight term (Spare, 2026-11-07, `land/bug-133`)

**Hysteresis (`prop-system.js`):** `_chunkMode(cx, cz, cur)` promotes a chunk at the ring and demotes it only
`LOD_HYSTERESIS` (1) chunk past it, at both boundaries (near ⇄ far, far ⇄ billboard-only). `_lodHyst` is a field, so a
headless harness can pin pure rings with 0.

**Headlights (`prop-impostor.js`, plus `headlightSpots` from `vehicle-model.js` through `main.js`'s `setImpostors`):**
- The billboard fragment shader adds the truck's two head spots the way three lights the 3D trees: smoothstep cone,
  the physical distance falloff with its cutoff window, the beam cookie through the spot's own `shadow.matrix`, and
  Lambert against the rebuilt normal.
- The uniforms are one object set shared by all billboard materials. `PropSystem.update` refreshes it once per frame.
  The cookie matrix is the spot's own matrix object, which three refreshes in place each render.
- With the lamps off, a uniform test skips the loop for the whole draw.

**Proof** (`wip/bug-133/repro.mjs`, main `3df98977` → the branch, the same pinned frames; logs `rp-before/after`):

| | before | after |
|---|---|---|
| E1 22:00 high beams: billboard ÷ 3D luminance in the beam (ring 0) | 0.67 (41 % of pixels darker) | 1.09 (10 % darker, 18 % brighter) |
| E1 lights off | match | match |
| E2a chunks re-swapped per 1 m chunk-line crossing | 10, 10, 10, 10 | 5, 0, 0, 0 (the leading row once) |
| E3 sun lighting, six conditions (not touched) | 0.98–1.01 | 0.98–1.01 |

- Billboards in the beam now come out slightly **brighter** (+7–9 %). The likely cause: the mip-averaged normals face a
  frontal light more squarely than the individual facets do. The 3D trees fall within that margin, where before the
  billboards were 33 % short.
- E3's per-tree lit-side mismatch is unchanged, as expected: that is the single normal tile (design note below).

**Cost.** Draw calls are identical: 159 at night, 147 at noon.
- Chrome uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`; the capped run read 16.7 ms on both sides),
  `wip/bug-133/perf.mjs`, before-after-after-before to cancel the box's drift (+0.2 ms per run, whichever build):
  - night with high beams: 4.75 → 4.80 ms frame-time median;
  - noon with the lamps off: 6.35 → 6.60 ms.
  - Both are within that drift.
- CPU render time per frame: the same within noise (2.3–3.2 ms).
- Triangles move with which chunks the hysteresis keeps 3D: at most one extra ring band of 3D trees behind the
  camera; ±5 % at the two vantages.

**Gates:** affected 11/11 green (props, physics, story), `cdp-smoke` PASS 25/25, zero console errors.

**Still open** under this ticket: the pine orbit (the mirror part of note 2), and the yaw-aware multi-view design note
(note 3's cause).

## Pine orbit: no mirror comes from the single tile (Spare, 2026-11-07)

`wip/bug-133/orbit.mjs`: the most isolated pine (`pine#3`, 16.6 m clear) on seed 6, orbited at 100 m in 30° steps.
Each view compares the billboard's silhouette (pure ring 0) with its 3D twin's. Overlap is measured as IoU, with the
best of ±8 px horizontal shifts, so a projected trunk a few pixels off does not count against it. It is measured both
straight and mirrored about the trunk.
- **Straight IoU 0.64–0.99, and mirrored is lower at every angle.** The 180° view is excluded: the tree fell in the
  camera's own chunk, which stays 3D in both frames.
- So the owner's "mirror" is not a mirrored tile. It was the swap itself: the outline changes by 7–36 % at each swap,
  and without hysteresis a camera near a chunk line repeated the swap over and over. That is now fixed (`e66f3987`).

## The in-beam overshoot (1.09): mostly not the normals, and too small to fix

After the headlight term, billboards in the high beam read 7–9 % brighter than their 3D twins. One test: a scratch
build with the billboard's rebuilt normal left unnormalised. The mip-averaged normal's length then carries the facets'
spread, which is exact Lambert for every facet facing the light, and under the headlights that is every visible
facet.
- The ratio goes 1.09 → 1.06 (beam centre 1.07 → 1.04).
- So mip averaging explains about a third.
- Most of the rest is a near-black night-ambient offset: with the lamps off, billboards also read about +1.5 levels
  of 255 (luminance 4.1 vs 5.8). It shows as a big ratio only because the values are tiny. Shadows were already ruled
  out in E3.
- In absolute terms the whole overshoot is about +2.4 levels of 255 on dark trees 128 m and more away at night.
- **Not worth a fix now.** Dropping the `normalize()` is a one-line change that is more correct. But it also lowers
  side-lit billboards by day, where the means already match within 2 %. It would need E3 rerun; it rides along with
  any later billboard work.

## Design note: per-angle (yaw-aware) billboard views — recommendation: don't build now

**What it would fix that hysteresis does not.** Hysteresis stops the repeated swaps. Each tree now swaps once per
approach. But that one swap still changes:
- **the outline:** pine IoU 0.64–0.99 by angle; the swapped trees at the game's swap distance overlap only 29–57 %
  (E3);
- **the lit side:** 5–25 % of a swapped tree's pixels differ by > 10 levels, with means matching within 2 %.

Both come from ONE baked front view per variant, while every 3D instance has its own yaw. Per-angle views bake N
azimuths per variant and pick the tile for (view azimuth − instance yaw). The outline and lit side then match the 3D
tree at the swap.

**What it costs** (from the code: 8 billboardable variants; 256 px tiles; albedo RGBA16F 8 B/px, normals RGBA8
4 B/px, both with mips ×4/3; each render target also keeps a 4 B/px depth buffer):

| views per variant (N) | tiles | atlas | VRAM, as built today (16F albedo, depth kept) | VRAM, slimmed (RGBA8 albedo, bake depth released) |
|---|---|---|---|---|
| 1 (now) | 8 | 768² (3×3) | ≈ 14 MB | ≈ 6 MB |
| 4 | 32 | 1536² (6×6) | ≈ 57 MB | ≈ 25 MB |
| 8 | 64 | 2048² (8×8) | ≈ 101 MB | ≈ 45 MB |
| 8 at 128 px tiles | 64 | 1024² | ≈ 25 MB | ≈ 11 MB |

128 px tiles were already tried and rejected: stair-stepped cutout edges at 1200p (the `TILE_PX` comment).

- **Draw calls:** unchanged. The same instanced mesh per variant; the tile is chosen in the shader from a per-instance
  yaw attribute.
- **Bake:** N× today's, once at boot.
- **Frame time:** an estimate, not built. Picking the nearest view adds a few ALU ops per billboard fragment. Blending
  the two nearest views doubles the texture samples (4 → 8). Billboards cover little of the screen, so it is likely
  under 0.1 ms.
- **The catch:** stepping between views is a pop of its own. A tree 150 m off, passed at 30 m/s, crosses a 45° view
  boundary every ~4 s, so the forest would shimmer unless the two nearest views are blended. Blending ghosts two
  outlines over each other.

**Recommendation: don't build per-angle views.** After hysteresis the swap happens once per tree per approach, at
128 m and more, where a tree is a few dozen pixels tall. The fix costs 25–45 MB of VRAM even slimmed, and brings its
own popping. If the owner still sees the swap after `e66f3987`, the cheaper lever is a **dithered distance cross-fade
of the swap**:
- both representations draw over a short band (~15–20 m), with complementary screen-door alpha;
- no atlas growth;
- the cost is the overdraw in that band, plus the pool bookkeeping to hold a band instance in both the 3D and the
  billboard pool.

**State of this ticket:** headlights fixed; flip-flop fixed; mirror shown not to exist; lighting means match.
Acceptance line 3 ("no billboard changes silhouette … in one frame") still fails for the single swap per approach.
Close once the owner has looked at `e66f3987` in game, or keep it open for the cross-fade if the owner still sees
the swap.
