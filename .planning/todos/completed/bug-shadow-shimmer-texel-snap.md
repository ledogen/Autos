---
id: BUG-29
type: bug
status: completed
resolved: 2026-06-30
resolution: "Texel-snapped the sun shadow frustum to the shadow-map grid in the light's view basis (src/main.js), commit 6f609ce. Verified in-browser by user — shadow edges stay locked, no shimmer."
opened: 2026-06-30
severity: minor
source: user-report
note: "Shadows DITHER/shimmer on surfaces as the view moves — they don't stay smoothly locked to the
vehicle's frame of travel. Root cause: the directional sun's shadow camera is re-centred on the
continuous streamCenter (vehicle/freecam position) every frame WITHOUT texel-snapping (main.js:1319–1324),
so the shadow-map texel grid slides sub-texel under the geometry → crawling/shimmering shadow edges (the
classic ortho-shadow shimmer). Fix = quantise the shadow camera position to shadow-map texel increments.
User's mental model ('scene moves, vehicle doesn't') reframed below — it's the un-snapped follow, not a
fixed-vehicle origin. Related to PERF-07 (baking would remove prop-shadow shimmer by other means)."
---

# BUG-29: Shadows dither/shimmer instead of staying locked to the vehicle's frame of travel

## Symptom

Shadows shimmer / dither on the surface as you drive — the shadow edges crawl rather than staying
smoothly attached to the world as the view moves. The user described it as the shadows not staying
"locked to the vehicle's frame of travel."

## Root cause

The directional sun's shadow frustum follows the view, but **without texel snapping**. Every frame
(`src/main.js:1318–1326`):

```
sun.position.set(streamCenter.x + sunDir.x*200, sunDir.y*200, streamCenter.z + sunDir.z*200)
sun.target.position.set(streamCenter.x, 0, streamCenter.z)
```

`streamCenter` is the **continuous** vehicle (or freecam) position. So the orthographic shadow camera
slides by arbitrary sub-texel amounts each frame. Because the shadow map is a fixed 2048² grid over a
440 m frustum (`main.js:499–506` → ~0.21 m/texel), moving the projection by a fraction of a texel every
frame re-quantises which texels cover each surface point → the shadow edge **swims/dithers**. This is the
textbook directional-shadow shimmer from a moving shadow camera that isn't texel-aligned.

### Reframing the user's hypothesis

The user's intuition ("the scene moves and the vehicle doesn't, so shadows dither on the surface")
captures the *effect* but not the mechanism: this codebase is **not** a fixed-vehicle floating-origin —
the vehicle genuinely moves through world space (`streamCenter = vehicleState.position`) and terrain/
props/road stream around it. The shadow camera *does* follow the vehicle; it just follows
**continuously, un-snapped**, so the shadow-map sampling grid slides under the geometry. Same visible
result, but the fix is texel-snapping the follow, not changing the world's frame of reference.

## Fix

Standard cascaded/ortho shadow shimmer fix — **snap the shadow camera to texel increments**:

- Compute the world-space size of one shadow texel: `texel = (frustumWidth) / shadowMapSize`
  (here ≈ `440 / 2048`). Quantise the shadow camera centre to that grid:
  `cx = round(streamCenter.x / texel) * texel` (same for z), and offset `sun.position`/`sun.target` by
  the snapped centre instead of the raw `streamCenter`. Snap in the **light's view basis** (project the
  centre onto the light's right/up axes, round, reproject) for correctness when `sunDirection` isn't
  axis-aligned — a plain world-XZ snap is an acceptable first cut since the frustum target is the ground
  plane.
- After snapping, call `sun.shadow.camera.updateProjectionMatrix()` / `updateMatrixWorld()` as needed.
- While here, sanity-check `sun.shadow.bias` / `normalBias` (no explicit bias is set on the sun today —
  `main.js:496–506`) to remove any residual acne/peter-panning once the swim is gone.

This is cheap (a couple of `round`s/frame, gated by the existing `if (sun.castShadow)`), independent of
the PERF-07 bake, and fixes the dither for **all** dynamic shadows (terrain receivers, vehicle, props).

## Acceptance

- Driving/panning: shadow edges stay stable (no crawl/shimmer) as the view moves — locked to the world,
  not swimming on the surface.
- No new shadow acne / peter-panning introduced; shadows still follow the sun direction
  (`SkySystem.sunDirection`) and cover the streamed band.
- Negligible per-frame cost added; `npm test` green.

## Related

- **PERF-07** pre-bake env shadows (`perf-bake-env-shadows-vs-dynamic.md`) — the user raised this dither
  alongside the bake idea; baking prop shadows would remove *prop* shimmer by dropping those casters, but
  THIS fix removes the dither for all dynamic shadows and is far cheaper. Do this regardless of PERF-07.
- Shadow-follow code: `src/main.js:1312–1326`; sun/shadow setup `:496–506`.
- **QUAL-02** SkySystem sun direction ([[project_qual02_skybox]]) — the shadow direction source.
