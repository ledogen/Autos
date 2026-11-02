---
id: BUG-96
type: bug
status: open
severity: minor
opened: 2026-10-26
source: owner, 2026-10-26 — "Tree Billboard sprites don't look great in all lighting conditions and angles and they flip-flop and mirror themselves at certain orientations, which is visually jarring."
relates: PERF-21 (impostors), src/props/prop-impostor.js, src/props/prop-system.js
---
lane: C → Spare (2026-11-02: Lane C has no session; Spare took it, says so to C)

# BUG-96: Distant-tree billboards mirror-flip at some headings and read badly in some lights

## What

Two things, same file (`src/props/prop-impostor.js`):

1. **The flip-flop.** The vertex shader's sun-side U mirror (comment "Sun-side texture flip",
   `ux = mix(1−uv.x, uv.x, step(0, sunRight·uSunDir.x))`) mirrors every tile whenever the sun's screen
   side crosses the baked side. It snaps when the view direction passes dead-ahead/behind the sun, and
   on a winding road that boundary is crossed constantly, so whole hillsides of trees mirror in one
   frame. It was added for the "fixed upper-right highlight" (2026-07-19) — the cure is now the worse
   defect. Options, cheapest first: (a) drop the flip and flatten the baked gradient instead (the
   `FLATTEN` lever exists, user-tuned off); (b) bake TWO tiles per variant (sun-left / sun-right) and
   cross-fade by `sunRight` instead of snapping; (c) bake a view-independent (ambient-only) tile and
   do the sun-side shading in the fragment shader from the quad's normal — no texture dependence on
   azimuth at all. (c) is the one that also fixes item 2.
2. **Lighting.** The tile is baked under the sky look at bake time and relit by a ratio in the
   shader (LIT_GAIN); at low sun / dusk the trees read flat or too bright against the 3D ring. Rebake
   cadence and the ratio are in the file header.

Tunable from the Props GUI folder (billboard sun contrast / flatten). Prove on :3774 at dawn, noon
and dusk, driving a loop, before and after.

## Acceptance

- [ ] Driving any loop, no distant tree mirrors in a single frame (no snap at any heading).
- [ ] The LOD takeover ring (3D → billboard) stays as hidden as today.
- [ ] Dawn / noon / dusk screenshots: billboard trees match the 3D ring's brightness within eyeballing.
- [ ] Draw-call count for impostors unchanged, or the increase stated.

## Measured, then built option (c) — Spare, 2026-11-02

**Measured first** (`wip/bug-96/atlas.mjs`, a readback of the live baked atlas): what the U mirror
swaps, per tile, is the tree's SILHOUETTE as much as its shading — 11–26 % of an aspen tile's opaque
texels and 13–80 % of a pine's have no mirror partner, and the baked shading ran 20–73 % brighter on
the bake's sun side. So (a) dropping the flip would leave a fixed-side highlight of that size (or erase
the facets entirely at full flatten), and (b) cross-fading two mirrored tiles would ghost silhouettes
that differ by up to 80 %. Only (c) takes the azimuth dependence out of the tile.

**Built (c):** the atlas is baked ONCE, light-free — the unlit albedo (RGBA16F) plus the faceted surface
NORMALS (a second, RGBA8 atlas; flat-shaded `MeshNormalMaterial`, the bake camera's view space being
world axes). The billboard shader rebuilds each fragment's world normal from the quad's own frame
(right, trunk axis, toward-viewer) and lights it with three's Lambert terms from the live rig —
sun × max(n·L, 0) + hemisphere(n.y), over π — the maths the 3D trees get. No mirror, so no silhouette
ever changes with the view; the highlight sits on the true sun side from every azimuth; dawn and dusk
are the live rig, not a bake-time ratio. A sky-look change now updates uniforms only (no re-bake).
Retired with it: the view-ratio relight, the sun-side U flip, the flatten lever (its GUI slider and
`lod.flatten`) and the tile-mean readback. `lod.litGain` 1.7 → 1 — the 3D trees' own Lambert; the old
value compensated the retired ratio's flat canopy average; the "billboard sun contrast" slider stays.

**Cost:** draw calls unchanged (one more sampler per billboard material). Memory: one more 768² RGBA8
atlas with mips and a depth buffer for its bake ≈ 5 MB.

**Shots** (`wip/bug-96/`, story seed 6, a vantage 35 m over the spawn valley; main on :8000 = before):
morning / noon / dusk, facing the sun and away, each also with the 3D ring set to 0 so EVERY tree is a
billboard (`*-bb.png`) — the brightness match head-on. After: billboards carry the 3D trees' facet
shading and brightness; before: flatter and lighter than the 3D frame. Gates: props 6/6 + smoke.
