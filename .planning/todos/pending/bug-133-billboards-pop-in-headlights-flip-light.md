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
