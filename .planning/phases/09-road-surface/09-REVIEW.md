---
phase: 09-road-surface
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - data/ranger.js
  - src/debug.js
  - src/main.js
  - src/road-carve.js
  - src/road-mesh.js
  - src/road-quality.js
  - src/road.js
  - src/terrain-worker.js
  - src/terrain.js
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues-found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues-found

## Summary

Phase 9 builds the drivable road surface: ribbon mesh, terrain cut-and-fill carve,
physics height integration, junctions, materials, and pothole noise. The carve-sync
discipline (WORKER_SOURCE vs terrain-worker.js) is genuinely clean and byte-identical,
and the Worker DataCloneError constraint is respected (only scalar terrain params + a
Transferable carve table cross the boundary). Good work there.

However, the phase's own declared exit gate — HEIGHT AGREEMENT between the visual mesh
and the physics surface — is violated by a real elevation-source mismatch, and the
crown/camber fold-in diverges numerically between the three sites that the summaries
claim are "identical." These are the highest-value defects because the project's core
value ("physics that feel honest, a car that rides the road") depends directly on this
invariant. The pure-function unit tests in the test harness pass because they test the
shared functions in isolation — they do NOT exercise the divergent *call sites*, so the
gate passed on paper while the integrated surfaces disagree.

Findings below are ordered by severity. CR-01 through CR-03 are the height-agreement
cluster; CR-04 is a determinism break in the design-grade cache.

## Critical Issues

### CR-01: Mesh uses smoothed design grade Y; physics carve uses raw routing spline Y — height-agreement gate violated

**File:** `src/road-mesh.js:215`, `src/road.js:1346`, `src/terrain.js:857`
**Issue:**
The ribbon mesh elevation and the physics/terrain carve elevation are computed from two
**different** height sources, so the visual road and the physics surface do not agree —
the exact failure RESEARCH §Pitfall 2 and the phase exit gate were meant to prevent.

- `sweepRibbon` (mesh): `vy = designGradeY[i] + crownY + tiltY + pY` where `designGradeY`
  comes from `_smoothDesignGrade` — a 50 m sliding-window average of `analyticHeight`
  (road-mesh.js:215, fed by road.js:1434).
- `_sampleCarveWorld` (physics, analyticHeight): `designY = nr.point.y` — the **raw
  routing spline Y** straight from the A* network (road.js:1346).
- `_buildCarveTable` (terrain mesh + sampleHeight): also `designY = nr.point.y`
  (terrain.js:857).

`nr.point.y` is the unsmoothed routing elevation (the A* trunk follows raw `coarseHeight`,
which carries no fine-noise smoothing and is a different quantity than a windowed average
of `analyticHeight`). The two will differ by up to the fine-noise amplitude plus the
smoothing offset wherever terrain is not locally flat. Result: the truck floats above or
sinks into the visible asphalt — wheels submerged or hovering — which is precisely the
symptom the gate forbids.

The pure-function harness tests pass because `carveBlend`/`crownProfile` are correct in
isolation; nothing in the harness asserts `analyticHeight(onRoadXZ) ≈ ribbonVertexY` at a
real on-road position, so the divergence is invisible to CI.

**Fix:** Both carve sites must use the SAME smoothed design grade the mesh uses. Either:
(a) have `_buildCarveTable` / `_sampleCarveWorld` sample the memoized `_smoothDesignGrade`
result for the nearest spline instead of `nr.point.y`, or (b) make the ribbon mesh use
`nr.point.y` (drop smoothing) so all three agree. Option (a) preserves D-06. Sketch for (a):

```javascript
// in _sampleCarveWorld / _buildCarveTable, after queryNearest returns nr:
const slice = this._sliceForSpline(nr.spline)        // need spline handle from queryNearest
const dg = this._smoothDesignGrade(slice.spline, this._surfaceSampler, p)
let designY = sampleDesignGradeAtArc(dg, nr.arcS)    // interpolate designGradeY at nr.arcS
```

This requires `queryNearest` to also return the matched spline (it currently discards it
after computing point/tangent). Until the elevation source is unified, SURF-04/SURF-05 are
not satisfied regardless of what the unit tests report.

### CR-02: Crown/camber "identical formula" claim is false — mesh and carve compute camber magnitude with different denominators

**File:** `src/road-mesh.js:139`, `src/road.js:1371`, `src/terrain.js:881`
**Issue:**
The summaries (09-03) and code comments repeatedly assert the camber tilt uses "the SAME
formula" at all three sites so `analyticNormal` returns the banked normal the mesh shows.
It does not.

- `sweepRibbon._splineCurvatureSigned` (mesh): `kappa = dtLen / (du * arcLen)` where
  `du ≈ 0.02` (normalized-u finite difference, eps=0.01) and `dtLen = |T(u+eps) − T(u−eps)|`
  of unit tangents (road-mesh.js:139).
- `_sampleCarveWorld` (physics): `kappa = dtLen / eps` with `eps = 2.0` **metres**, and
  `dtLen = |tangentAhead − tangent|` from a second `queryNearest` 2 m forward (road.js:1371).
- `_buildCarveTable`: same 2 m-ahead approximation as the physics path (terrain.js:881).

The normalized-u curvature (`/(du*arcLen)`) and the 2 m world-space curvature (`/eps`) are
different estimators that only coincide when the spline is perfectly unit-speed and locally
circular. On real splines they yield different `camberAngle`, hence different `tiltY =
signedLat * sin(camberAngle)`, hence the mesh surface and the carved physics surface bank by
different amounts at the road edges. Combined with CR-01 this compounds the floating/sinking
at the lateral extremes of the ribbon (where camber tilt is largest, `|signedLat| = halfWidth`).

**Fix:** Extract a single shared signed-curvature function into `road-carve.js` (or
`road.js`) that takes a consistent input (e.g. two world-space tangents and a world-space
step) and call it from all three sites with identical arguments. The mesh path already has
the spline; the carve paths use the 2 m probe — pick ONE estimator and use it everywhere.
Document the chosen estimator in the SYNC comment so it cannot drift again.

### CR-03: Pothole noise is applied to mesh/physics but is NOT in the terrain carve table the Worker round-trip rebakes — and lives only in `_buildCarveTable`'s `designY`, which feeds `sampleHeight` but never the live `analyticHeight`/mesh agreement check

**File:** `src/road-carve.js:150`, `src/terrain.js:896`, `src/road.js:1389`, `src/road-mesh.js:257`
**Issue:**
`potholeNoise(wx, wz, rq, ...)` is added to `designY` in all three on-ribbon sites, which is
correct in spirit (world-coord keyed → deterministic). But the **road-quality input `rq`
diverges** between sites, so the perturbation is NOT identical:

- mesh (`sweepRibbon`): `q = roadQuality(arcSOffset + u*arcLen, runKey, worldSeed)` —
  arc-length based (road-mesh.js:220).
- physics (`_sampleCarveWorld`): `rq = roadQuality(nr.arcS, nr.runKey, worldSeed)` where
  `nr.arcS = bestU * bestArcLen` from a *separate* `queryNearest` probe (road.js:1388).
- terrain (`_buildCarveTable`): `rq = roadQuality(nr.arcS, nr.runKey, worldSeed)` from yet
  another per-vertex `queryNearest` (terrain.js:895).

`roadQuality` is a step/blend function of `arcS`. The mesh's `arcS` is sampled at the ribbon
section `u`; the carve's `arcS` comes from `queryNearest`'s nearest-point `bestU` on the same
spline — but `bestU` for a vertex offset laterally from the centerline lands at a *different*
arc position than the mesh section directly above it, and near the ±500 m stretch boundaries
(and the 10 m blend zone) the two `arcS` values can fall on opposite sides of a tier
transition. There `rq` differs, so `severity = 1 − rq` differs, so `potholeNoise` returns a
different Y. The "height-agreement gate" SURF-06 test (09-06 assertion #4) only checks that
`potholeNoise` is deterministic for *identical inputs* — it never checks that the inputs
match across sites.

**Fix:** Drive pothole severity from a world-coordinate-keyed quality value rather than an
arc-length-keyed one (since the deviation note already moved the *noise lattice* to world
coords for exactly this reason — the severity input was left on `arcS` and reintroduces the
divergence). Alternatively, snap all sites to the centerline arc position before calling
`roadQuality` (project the vertex onto the spline and use the centerline `arcS`, not the
laterally-offset nearest-point `arcS`). The chosen approach must be identical in mesh and
both carve sites.

### CR-04: `_smoothDesignGrade` memoizes on spline identity only — returns stale grade after road params / terrain change, and depends on carve-inclusive `analyticHeight` (self-referential)

**File:** `src/road.js:1436-1443`
**Issue:**
The design-grade cache is a `WeakMap` keyed by the spline object, invalidated only when
`window` (designGradeWindow) changes:

```javascript
const cached = this._designGradeCache.get(cacheKey)
if (cached && cached.window === window) return cached.result
```

But `designGradeY` is computed from `terrainRef = analyticHeight`, which depends on
`terrainAmplitude`, all coarse/fine noise params, AND the road carve itself (analyticHeight
now blends in `_sampleCarveWorld`). Two correctness problems:

1. **Stale on param change:** changing `terrainAmplitude`, coarse params, or any carve param
   does not change `window`, so the cache returns the OLD design grade for the same spline
   object. The mesh keeps rendering at the pre-change elevation while the carve table (rebuilt
   fresh) uses new heights → mesh/physics disagree until the spline object is GC'd and
   rebuilt. `debouncedRoadSurfaceRebuild` clears road tiles but does NOT clear
   `_designGradeCache`.
2. **Self-reference:** `analyticHeight` → carve → `nr.point.y` (raw, not recursive, so no
   infinite loop), but the *smoothed* grade is a windowed average of the carve-blended
   height. Sampling `analyticHeight` along the centerline returns `raw + blendW*(gradeY−raw)`
   where on-ribbon `blendW=1` so it returns `gradeY = nr.point.y + crown + camber + pothole`.
   The "design grade" thus bakes crown/camber/pothole into the smoothing window average, then
   `sweepRibbon` adds crown/camber/pothole AGAIN on top of `designGradeY[i]`. Crown and the
   pothole/camber terms are double-counted in the visible mesh elevation.

**Fix:**
- Invalidate `_designGradeCache` in `invalidateCache()` and on the surface-param debounce
  (clear it alongside `roadMeshSystem.clearAll()` in main.js:273), and include a params
  generation counter (or the relevant param values) in the cache validity check, not just
  `window`.
- Sample the design grade from a **carve-free** height (raw terrain only), e.g. pass a
  dedicated `(x,z) => rawTerrainHeight` sampler into `_smoothDesignGrade` instead of the
  carve-inclusive `analyticHeight`, so crown/camber/pothole are added exactly once (in
  `sweepRibbon`) and the smoothing operates on the underlying terrain, not on its own output.

## Warnings

### WR-01: `roadHalfWidth` is a manually-synced derived field — only the debug slider keeps it consistent; programmatic `roadWidth` changes silently desync geometry

**File:** `data/ranger.js:246`, `src/debug.js:239-243`
**Issue:** `roadHalfWidth` must equal `roadWidth/2`, but the only sync point is the debug
slider's `onChange` (debug.js:241). Any other path that sets `roadWidth` (a future preset,
URL param, or test) leaves `roadHalfWidth` stale, and every carve/mesh site reads
`p.roadHalfWidth ?? 5` directly — so the ribbon width and the carve width diverge with no
error. This is a latent height-agreement landmine.
**Fix:** Make `roadHalfWidth` a getter (`get roadHalfWidth() { return this.roadWidth/2 }`) or
derive it at each read site (`const halfWidth = (p.roadWidth ?? 10) / 2`). Drop the separate
stored field and the manual sync.

### WR-02: `_buildCarveTable` runs `queryNearest` per vertex (65×65 = 4225 calls) plus a second per on-ribbon vertex for camber — and is built TWICE per chunk

**File:** `src/terrain.js:832`, `src/terrain.js:741` + `src/terrain.js:1064`
**Issue:** `_buildCarveTable` is invoked once in `_updateChunkRing` (to ship the Transferable)
and AGAIN in `_flushPendingQueue` (for the `_chunkMap` copy), each doing up to ~4000–8000
`queryNearest` calls (each of which scans a `(2*blk+1)²` tile block, ~9×9 tiles at maxExt).
That is a large synchronous main-thread cost per chunk build. While raw perf is out of v1
scope, this crosses into a *correctness/robustness* concern: it can blow the
MAX_BUILDS_PER_FRAME frame budget and stall, and the duplicate build means any
non-determinism between the two calls (e.g. tiles warmed in between) yields a Worker carve
table that disagrees with the `_chunkMap` carve table.
**Fix:** Build the carve table once, keep a reference for the `_chunkMap` path, and clone the
buffer for the Transferable (`carveTable.slice()`), rather than rebuilding. This also removes
a potential mesh/Worker disagreement source.

### WR-03: `_buildCarveTable` early-out bounding check can skip chunks that a road clips at the corner

**File:** `src/terrain.js:811-815`
**Issue:** The cheap pre-check queries `queryNearest(chunkCenter, queryRadius)` with
`queryRadius = maxExt + S*0.71` (half-diagonal). If the nearest road point to the chunk
*center* is beyond that radius, the whole chunk is skipped (`return null`) — but a road can
still clip a chunk corner while its nearest approach to the center exceeds the half-diagonal
when the road is tangent near a corner and curves away. `S*0.71` ≈ 45.3 m is the exact
half-diagonal, leaving zero margin, so a road grazing one corner at `maxExt` lateral distance
from that corner is missed. Result: a visible ribbon with no carve under it (truck drives
through un-carved terrain at the chunk edge).
**Fix:** Add margin to the pre-check radius (e.g. `+ maxExt` or use the full diagonal plus
`maxExt`), or drop the center pre-check and rely on the per-vertex loop's own `anyNonZero`
short-circuit.

### WR-04: Junction footprint is rebuilt for EVERY road tile, scanning ALL junctions in the network

**File:** `src/road-mesh.js:480-502`
**Issue:** `_buildRoadTile` calls `this._road._detectJunctions()` (returns the whole map) and
then iterates **all** junction nodes for every tile built, testing each against the tile
bounds. With N tiles and M junctions this is O(N·M) footprint-containment tests per stream,
and `buildJunctionFootprint` allocates geometry for each match. A node exactly on a tile
boundary (`nx === tileWorldX + CHUNK_SIZE` is excluded by `< `, but floating-point boundary
nodes) could be assigned to zero tiles or, if rounding differs, two — producing either a
missing or a z-fighting double footprint.
**Fix:** Bucket junctions by tile key once in `_detectJunctions` (store `node.tileKey`), then
in `_buildRoadTile` look up only that tile's nodes. Use the same `Math.floor(nx/CHUNK_SIZE)`
assignment as roads so a node lands in exactly one tile deterministically.

### WR-05: `earClip` winding assumption can silently produce zero/fan triangulation for CW input despite the upstream reverse

**File:** `src/road-carve.js:318-320`, `src/road-mesh.js:656`
**Issue:** `earClip`'s `isEar` requires `cross > 0` (CCW). `buildJunctionFootprint` reverses
the polygon to CCW via `_polySignedArea` before triangulating — but `_polySignedArea` uses
`(a.x*b.z − b.x*a.z)` (XZ shoelace) whose sign convention for "CCW" in the XZ plane is
opposite to the screen-space XY convention `earClip` assumes (`(bx−ax)*(cz−bz) − ...`). If the
two conventions disagree, every vertex fails the `cross > 0` test, `earClip` finds no ear,
trips the DoS fallback, and emits a naive fan that can self-overlap for a concave footprint —
producing inverted/overlapping junction triangles. This only manifests on the non-convex
(acute / 3-way) junction path, which the smoke test reaches rarely (multi-seed search).
**Fix:** Verify the winding convention end-to-end: ensure `_polySignedArea > 0` corresponds to
the same orientation `earClip`'s `cross > 0` expects (both measured in XZ with the same handed
sign). Add an assertion/test that feeds a known concave XZ polygon through
`reverse-if-needed → earClip` and checks all output triangles are CCW with positive area.

### WR-06: Fillet arc is a bearing-interpolation around the node, not a tangent fillet — radius collapses for non-90° crossings and can invert the footprint

**File:** `src/road-mesh.js:639-647`
**Issue:** The deviation note (09-04) documents that the "fillet" samples bearing from
`atan2(pA−node)` to `atan2(pB−node)` at `rAvg`. For non-perpendicular crossings `|pA−node|`
and `|pB−node|` differ, so `rAvg` is a compromise radius that does not pass through either
outer-edge point — the footprint corner no longer touches the ribbon edges, leaving a gap or
overlap at the leg/footprint seam (z-fighting, already acknowledged as deferred). More
seriously, when the chosen short arc (`dBear` normalized to [−π,π]) goes the "wrong way"
around for an obtuse leg pair, the sampled arc bulges *inward* across the node, producing a
self-intersecting (non-simple) polygon that breaks both the convexity test and `earClip`.
**Fix:** Compute the true tangent fillet center (intersection of the inward edge normals at
`pA` and `pB`) and sample the arc about that center between `pA` and `pB`, or — given Phase 9
accepts visual approximation — clamp to the simple-merge box whenever
`||pA−node| − |pB−node|| / rAvg` exceeds a small threshold, so degenerate arcs never reach
triangulation.

## Info

### IN-01: `road-mesh.js` re-exports then re-imports the same symbols from `road-quality.js`

**File:** `src/road-mesh.js:39-40`
**Issue:** Lines 39 (`export { roadQuality, ... } from './road-quality.js'`) and 40
(`import { roadQuality, ... } from './road-quality.js'`) both pull the same names. Harmless
but redundant; the re-export for backward compat is fine, the separate import could use the
re-exported binding. Minor readability cost.
**Fix:** Keep the re-export; drop the duplicate `import` line and reference the local binding,
or vice-versa.

### IN-02: Stale/misleading comment in `road-mesh.js` header — claims "Plan: 09-05" though file carries 09-03/04/05/06 work

**File:** `src/road-mesh.js:30`
**Issue:** The header `Plan: 09-05` undersells the file's scope (ribbon sweep 09-03, junctions
09-04, materials 09-05, pothole 09-06). Future maintainers may look in the wrong SUMMARY.
**Fix:** Update to `Plans: 09-03..09-06` or drop the single-plan tag.

### IN-03: `buildJunctionFootprint` leg-trim comment claims trimming happens "naturally" — it does not

**File:** `src/road-mesh.js:550-553`
**Issue:** The comment asserts "ribbon ribbons are ALREADY trimmed ... ribbon sweeps stop at
the tile boundary naturally." This is incorrect — ribbons are swept full-length per slice and
the footprint is rendered on top (the 09-04 deviation note correctly calls this z-fighting and
defers real trim). The in-code comment contradicts the deviation note and will mislead.
**Fix:** Replace with the accurate deferral note: footprint overlays the ribbon; real
`_segXZ` trim is deferred (matches 09-04-SUMMARY).

### IN-04: `_smoothDesignGrade` two-pointer window is asymmetric and can divide by a small count at the first sample

**File:** `src/road.js:1479-1497`
**Issue:** The window is seeded forward-only (`arcPos[hi] − arcPos[0] < window`) before the
loop, then the loop advances both pointers using `arcPos[i+1<N?i+1:i]` as the pivot — an
off-by-one pivot that makes the averaged window centered on `i+1` rather than `i`, and at
`i=0` the average covers only `[0, window)` (forward half), not a centered window. The result
is a slight forward bias in the smoothed grade and a non-symmetric profile near tile starts
(contributes to the Pitfall-7 seam the research warned about). Not a crash — `hi−lo ≥ 1`
always — but the grade is not the centered average the doc comment promises.
**Fix:** Use an explicit centered window: for each `i`, advance `hi` while
`arcPos[hi] − arcPos[i] < window` and `lo` while `arcPos[i] − arcPos[lo] >= window`, pivoting
on `i` (not `i+1`). Verify symmetry with a flat-then-ramp test input.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
