---
id: BUG-133
type: bug
status: open
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
