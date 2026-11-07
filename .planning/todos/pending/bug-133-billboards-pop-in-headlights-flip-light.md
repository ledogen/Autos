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
