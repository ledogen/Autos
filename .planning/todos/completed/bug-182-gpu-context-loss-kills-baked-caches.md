---
id: BUG-182
type: bug
status: closed
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "there was a lag when i was switching my desktop back to chrome on mac with the gesture and now i think the baked ground texture is dead and just shows black ... also the cluster needles are floating also the map shadows are missing"
relates: PERF-48, FEAT-34, FEAT-180, src/terrain-bake.js, src/cluster.js, src/map2d.js, src/props/prop-impostor.js, src/props/prop-shadow-bake.js, src/sky.js
---
lane: Spare

# BUG-182: A GPU reset leaves every baked picture blank until reload

## Next steps
Orchestrator: land `land/bug-182`, smoke main. Close the ticket after the landing (the owner can confirm on the next
real reset; nothing owner-only is open).

## Summary
After a hitch while switching desktops, the far ground went black, the gauge cluster lost its face (needles floating)
and the map lost its hillshade. Everything drawn live each frame survived. A page reload cured it. Fixed on
`land/bug-182`: every baked picture now redraws itself after a reset.

## Description
### What was measured (2026-11-16, headless Chrome, seed 6, `test/gpu-reset.mjs`)
The reading in the first filing was right, and wider than guessed. A real GPU-process reset (CDP
`Browser.crashGpuProcess`) gives:
- **WebGL**: `webglcontextlost`, then `webglcontextrestored` on the renderer's canvas. Three.js cancels the lost event
  itself (`preventDefault` in WebGLRenderer, confirmed), so it restores and re-uploads every ordinary texture from its
  source. Render targets come back as empty storage.
- **Every 2D canvas in the page** (60 of them) gets `contextlost` then `contextrestored`, and comes back fully clear,
  its drawing state (transform) reset too. Even `willReadFrequently` canvases (software-backed) lose their pixels
  (checked on a bare page). So any canvas drawn once and kept is blank, AND any texture three re-uploads from such a
  canvas is blank.

The `WEBGL_lose_context` extension (loseContext / restoreContext) reproduces only the WebGL half.

| measured after a reset, before the fix | before reset → after |
|---|---|
| far ground (shot straight down at ground 420 m from the truck) | 0.2 % black → 71 % black |
| gauge cluster canvas | 17 % blank → 98 % blank (face AND needles: parked, nothing changed, so it never redrew) |
| open map canvas | 0 % blank → 67 % blank (hillshade tiles + background gone) |
| 2D canvases lost (blank share → 100 %) | cluster face, map ground tiles (258²), shore tiles (32²), map background, map legend, dust puff, both headlight cookies, cobble + masonry + 2 normal maps |

Also: the exposure meter's pixel read fails while the context is lost, which threw 8 unhandled promise rejections.

### Fix (one native signal per kind, each cache redraws through the path it already has)
- WebGL caches listen for `webglcontextrestored` on `renderer.domElement` (three's own listener runs first, so the
  renderer is already re-initialised): terrain bake re-allocates both atlases and clears its baked set (every tile
  re-bakes); impostor atlas re-bakes; prop-shadow atlas re-queues every tile that held a chunk; sky marks the fog cube
  stale (it self-healed in the test because exposure moved, but a steady view would not).
- 2D caches listen for `contextrestored` on their own canvas: cluster repaints its face and re-applies its scale; map
  drops its tile memo and rebuilds (the same three lines new water uses), repaints its legend; the headlight cookie
  calls its existing `redraw`.
- Static canvas textures (dust puff, stone cobble / masonry + normals, drop-zone mark, lab signs) now hand three the
  pixels (`ImageData`, plain JS memory) instead of the canvas, so a reset has nothing to blank. Stone textures drop
  their canvases entirely.
- Exposure: the failed read is caught and skipped.
- Not touched: `debug.js` plots (redrawn every frame), the map's visible canvas (redrawn every frame while open),
  `exposure.js` render target (re-rendered every meter).

## Tracker
- [x] Reproduced: forced reset shows the three symptoms
- [x] Far ground, impostors, prop shadows and fog colour come back after a reset
- [x] Cluster face and map tiles come back after a reset
- [x] A check in `test/` forces a reset and fails if a cache stays blank

## Links
Owner's screenshots, 2026-11-15 23:17 and 23:19, seed 2037518182. Logs (git-invisible): `wip/bug-182/` in the Spare
worktree.

## Files
`src/terrain-bake.js` · `src/props/prop-impostor.js` · `src/props/prop-shadow-bake.js` · `src/sky.js` · `src/exposure.js` ·
`src/cluster.js` · `src/map2d.js` · `src/vehicle-model.js` · `src/dust.js` · `src/stone-texture.js` · `src/main.js` ·
`src/lab.js` · `test/gpu-reset.mjs`

## Log
- 2026-11-15: filed from the owner's report; reading above is inference.
- 2026-11-16 (Spare): reproduced all three symptoms with `Browser.crashGpuProcess`; fixed as above on `land/bug-182`.
  `node test/gpu-reset.mjs --mode=crash` and `--mode=webgl` PASS (after = the no-reset control, `--mode=none`, to the
  digit). Rainy-day check, not a gate (needs Chrome + a dev server). Not verified: prop shadows and the canvas textures
  by eye (no cheap readback; covered by the ground shot and by code), a headed real-GPU reset on the owner's Mac.
- 2026-11-16: landed on main 692f7b93, full smoke green (wip/orch/smoke-1116-182.log). Closed. Not checked by eye: prop shadows, stone and dust textures; not tested on a headed real-GPU reset.
