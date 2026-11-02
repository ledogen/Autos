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
