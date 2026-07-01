---
id: BUG-28
type: bug
status: completed
resolved: 2026-06-30
resolution: "Markings moved from interpolated vertex-colours to a per-fragment shader (aMark attribute + fwidth-antialiased masks + arc-based dashes) in src/road-mesh.js, commit 687e6bd. FEAT-05 shoulder isolation preserved; junction pads suppress the stripe. Verified in-browser by user — crisp lines, no smear."
opened: 2026-06-30
severity: medium
source: user-report
note: "Road lane markings render as a big smeared GRADIENT where the stripe should be, not a crisp/dotted
line. Root cause: markings are VERTEX COLOURS on a coarse cross-section (CROSS_SEGS=8 → ~9 lateral verts
over a ~10 m road = ~1.1 m vertex spacing), but the stripe is only 0.30 m wide (MARK_CENTER_HALF=0.15).
One vertex goes white, its neighbours ~1.1 m away stay dark asphalt, and the GPU LINEARLY INTERPOLATES
between them → a ~2 m white-to-dark gradient instead of a 0.3 m line. Friend's 'single-point sampling'
intuition points the right way — but there is NO texture to set nearest-filter on; the real fix is to
evaluate the marking PER-FRAGMENT in the shader (procedural, D-01-safe; onBeforeCompile hook already exists)."
---

# BUG-28: Lane markings are a smeared gradient, not a crisp/dotted line

## Symptom

Road markings have looked broken the whole time: instead of a crisp centerline (or dotted lines) there's
a **big smeared gradient** spread across the lane where the marking should be.

## Root cause

Markings are painted as **per-vertex colours** (D-01, no texture/asset) on a coarse cross-section, then
**Gouraud-interpolated** by the GPU across the gap between verts:

- `CROSS_SEGS = 8` (`src/road-mesh.js:53`) → 9 lateral verts spanning the full ~10 m road width = **~1.1 m
  between adjacent verts**.
- The centerline stripe is `MARK_CENTER_HALF = 0.15` m → a **0.30 m** wide stripe; edge lines are
  `MARK_EDGE_HALF = 0.10` m, narrower still (`road-mesh.js:64–65`).
- A vertex is coloured white only if `|uLat| < MARK_CENTER_HALF` (`road-mesh.js:344–357`). So the centre
  vertex (`uLat = 0`) goes white and its neighbours (`uLat ≈ ±1.1 m`) stay dark asphalt — and the
  rasteriser **linearly blends** white→dark across that ~1.1 m on each side. Result: a ~2 m gradient
  smear, never the 0.3 m crisp line. Narrow edge lines often miss landing on a vertex at all.
- Dashes barely exist: only the Mid-tier *edge* line is intermittent (`(arcS % 12) < 8`, applied
  per-section, `road-mesh.js:304`), so there's no real dotted centerline; longitudinal resolution is
  coarse too.

The marking width is far below the vertex spacing, so vertex-colour painting **cannot** produce a sharp
line by construction — it's a sampling-resolution mismatch, not a tuning issue.

## Why "single-point sampling" is the right instinct (but needs the no-asset twist)

The friend's suggestion (nearest/point texture sampling) is the right *direction* — you want the marking
evaluated at a high enough resolution that the stripe edge is sharp. But there is **no texture** here to
switch to nearest filtering; markings are vertex colours. The equivalent that respects D-01 (no asset
files) is to **evaluate the marking per-fragment in the shader** — effectively per-pixel sampling of a
procedural stripe function — which gives crisp, antialiased lines and real dashes for free.

## Fix directions (decide at planning)

- **PREFERRED — procedural marking in the fragment shader (asset-free, D-01-safe).** The road material
  already uses `onBeforeCompile` with `addWorldVaryings` + a `customProgramCacheKey`
  (`road-mesh.js:114–135`) and already isolates the shoulder per-fragment via `vColor.r - vColor.b`.
  Add a small vertex attribute carrying the per-vertex **lateral coordinate `uLat` and run-arc `arcS`**
  (e.g. `aMarkCoord = vec2(uLat, arcS)`), interpolate to the fragment, and compute the marking mask in
  the fragment shader: centerline = `1 - smoothstep(halfW - aa, halfW + aa, abs(uLat))` with
  `aa = fwidth(uLat)` for antialiasing; dashes = gate on `fract(arcS / period)`; edge lines = same on
  `halfWidth - abs(uLat)`. Mix marking colour over the asphalt base. Crisp at any distance, real dotted
  lines, no asset, no extra geometry. Keep the quality-tier brightness/dash logic (`roadQuality`) but
  move the *spatial* test into the shader.
- **Alternative — runtime-generated stripe texture.** Bake a stripe pattern into a `DataTexture`/canvas
  at load (still procedural, arguably D-01-OK since no file) and UV-map the ribbon; sample with
  appropriate filtering/aniso. More machinery (UVs + texture) than the shader path, given the shader hook
  already exists.
- **NOT sufficient alone — just raise `CROSS_SEGS`.** Denser cross-section verts would sharpen the smear
  but never make it truly crisp (still linear ramps between verts), wastes geometry, and doesn't fix
  longitudinal dashes. At most a stopgap.

Whatever the path: markings must stay **window-invariant** (pure fn of arc/lateral coord + seed/quality,
identical regardless of tile/stream order), not regress the FEAT-05 shoulder gravel shader (it keys off
`vColor.r - vColor.b` — moving markings out of vertex colour must not break that isolation), and keep
`npm test` green.

## Acceptance

- Centerline renders as a **crisp, constant-width** stripe (sharp edges, no gradient smear) at all view
  distances and angles; antialiased, not aliased/shimmering.
- Dotted/dashed markings render as actual dashes (clean on/off), per the quality tiers.
- Edge lines render crisply where present; junction marking suppression (`inJunction`) still works.
- FEAT-05 shoulder gravel shading unaffected; window-invariant; `npm test` green.

## Related

- Marking + shader code: `src/road-mesh.js` (vertex-colour markings `:340–361`, `onBeforeCompile`
  `:114–135`); quality tiers `src/road-quality.js`.
- QUAL-10 junction visual blend (`qual-junction-visual-blend.md`) — also touches marking rendering at
  junctions (markings currently just stop); a shader-based marking makes the junction feather easier.
- D-01 procedural-only (no asset files) discipline — the constraint shaping the fix.
