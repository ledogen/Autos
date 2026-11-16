---
id: BUG-182
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "there was a lag when i was switching my desktop back to chrome on mac with the gesture and now i think the baked ground texture is dead and just shows black ... also the cluster needles are floating also the map shadows are missing"
relates: PERF-48, FEAT-34, FEAT-180, src/terrain-bake.js, src/cluster.js, src/map2d.js, src/props/prop-impostor.js, src/props/prop-shadow-bake.js, src/sky.js
---
lane: Spare

# BUG-182: A GPU reset leaves every baked picture blank until reload

## Next steps
Spare lane: confirm by forcing a GPU reset, then make every baked cache redraw itself after one.

## Summary
After a hitch while switching desktops, the far ground went black, the gauge cluster lost its face (needles floating)
and the map lost its hillshade. Everything drawn live each frame survived. A page reload cures it.

## Description
### Reading (inferred from the symptoms and the code, not yet reproduced)
Chrome's GPU process reset. The page keeps running, but every picture stored on the GPU comes back empty.
Three.js re-uploads ordinary textures by itself. It cannot restore anything that was DRAWN once and kept:

- **Render targets** (off-screen pictures the GPU drew): `src/terrain-bake.js` (far ground albedo + normal, the black
  ground; the near 70 m is the live shader, which is why it survived), `src/props/prop-impostor.js` (far-prop atlas),
  `src/props/prop-shadow-bake.js`, `src/sky.js` `FOG_CUBE`, `src/exposure.js` (redrawn every frame, self-heals).
- **Cached 2D canvases** (Chrome keeps large 2D canvases on the GPU too): `src/cluster.js` `_bg` (the static face,
  blitted under the needles), `src/map2d.js` ground / water tiles and `_bg`. Others to audit: `dust.js`,
  `stone-texture.js`, `vehicle-model.js`, `main.js`, `debug.js`.

`src/` has no handler for `webglcontextlost` / `webglcontextrestored` (the browser's two events for this) at all.

### Fix shape
One signal, raised when the renderer's context is restored; each cache above marks itself dirty and redraws through
the path it already has. No per-frame checks.

## Tracker
- [ ] Reproduced: forced reset shows the three symptoms
- [ ] Far ground, impostors, prop shadows and fog colour come back after a reset
- [ ] Cluster face and map tiles come back after a reset
- [ ] A check in `test/` forces a reset and fails if a cache stays blank

## Links
Owner's screenshots, 2026-11-15 23:17 and 23:19, seed 2037518182.

## Log
- 2026-11-15: filed from the owner's report; reading above is inference.
