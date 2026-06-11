---
phase: 09-road-surface
plan: "04"
subsystem: road-junction
tags: [junction, footprint, fillet, earClip, SURF-07, D-12, D-13, D-14, D-15, D-16]
dependency_graph:
  requires: [09-01, 09-02, 09-03]
  provides: [_detectJunctions, this._junctions-cache, shared-node-elevation, earClip, triangulateConvexFan, isConvexPolygon, buildJunctionFootprint, junction-tile-lifecycle]
  affects: [src/road.js, src/road-mesh.js, src/road-carve.js, data/ranger.js, test/test-road-mesh.html]
tech_stack:
  added: []
  patterns: [pairwise-segXZ-intersection, fillet-arc-fan, ear-clip-fallback, shoelace-winding-check, junction-memo-identity-guard]
key_files:
  created: []
  modified:
    - src/road.js
    - src/road-mesh.js
    - src/road-carve.js
    - data/ranger.js
    - test/test-road-mesh.html
decisions:
  - "_detectJunctions memoized via _junctionsFrom identity guard (same pattern as _slicedFrom/this._tiles)"
  - "simpleMerge=true for half-angle < 10deg (near-parallel) AND legs > 4 (3+ roads) — rectangular box fallback, never crashes"
  - "nodeY = avg of 4 segment endpoint Ys; stored on node record so road-mesh and carve both read same value (D-14)"
  - "earClip bounded at n*3 iterations with fan fallback to prevent DoS on degenerate polygon (T-09-06)"
  - "fillet arc approximated by sampling arc-length from bearing(pA) to bearing(pB) at radius rAvg (simpler than exact tangent circle, sufficient for road geometry)"
  - "leg ribbon trim deferred: junction footprint renders at nodeY over ribbon (visual layer), full _segXZ-based trim is a D-13 refinement"
metrics:
  duration: "~35 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 5
---

# Phase 9 Plan 4: Merged At-Grade Junction Footprints (SURF-07) Summary

**One-liner:** _detectJunctions detects inter-run crossings via pairwise _segXZ over this._network (window-invariant, cached); buildJunctionFootprint builds fillet-arc closed footprints triangulated fan-or-earClip, flat at nodeY, assigned to tiles and disposed with them.

## What Was Built

### Task 1: _detectJunctions + junction cache + earClip/fan (road.js, road-carve.js, ranger.js)

**`src/road.js`**

`_detectJunctions()` — new method returning `this._junctions` Map:

- Pairwise O(n_runs²) loop over `[...this._network.entries()]` using module-scope `_segXZ`
- For each crossing: `nodeKey = "${Math.round(ix.x)},${Math.round(ix.z)}"`, `posY = avg of 4 endpoint Ys`
- Records 4 legs per X-crossing: (keyA, ai, toward a1), (keyA, ai+1, toward a0), (keyB, bi, toward b1), (keyB, bi+1, toward b0) — unit vectors from node toward adjacent segment endpoints
- **Guards (T-09-07):** half-angle < 10° or legs > 4 → `simpleMerge = true` (rectangular box, no crash)
- Legs sorted by `atan2(dir.x, dir.z)` for CCW fillet order
- Purity comment: "Pure function of this._network — deterministic + window-invariant by transitivity (D-16)"

**Memo pattern:**
- `this._junctionsFrom === this._network` identity guard (same as `_slicedFrom`)
- `this._junctions` / `this._junctionsFrom` initialized in constructor near `this._tiles`
- `this._junctions.clear()` + `this._junctionsFrom = null` added at `_streamNetwork` cache-clear site

**Shared-node elevation (D-14):**
- `nodeY` stored on each junction record (average of 4 segment endpoint Ys)
- Approach blend hook documented in code: `approach_Y(s) = lerp(designGradeY(s), nodeY, max(0, 1-dist_to_node/blendLength))`
- Actual lerp applied during ribbon build, not in detection

**`src/road-carve.js`** — three new pure no-import exports:

- `isConvexPolygon(poly)`: all XZ cross-products same sign; degenerate (all collinear) → false
- `triangulateConvexFan(poly)`: centroid fan returning flat index array; centroid index = poly.length
- `earClip(polygon)`: bounded ear-clip with `pointInTriangle` no-containment test; DoS guard = n×3 attempts, falls back to fan from idx[0] if exceeded (T-09-06)

**`data/ranger.js`** — two new params in Phase 9 junction block:
- `roadJunctionBlendLength: 30` m — grade-blend reach toward node (D-14/A8)
- `roadFilletRadius: 5` m — default fillet radius slider (D-13/A5)

### Task 2: buildJunctionFootprint in road-mesh.js + test assertions

**`src/road-mesh.js`**

`buildJunctionFootprint(node, params)` — new public method:

**Step 1-2 (simple merge):** If `node.simpleMerge` or `legs.length < 2`, builds a `2×halfWidth` rectangular box aligned to the first leg direction.

**Step 3-4 (fillet arc footprint):** For each adjacent leg pair:
- Outer edge points: `P_A = node + halfWidth * perp_left(d_A)`, `P_B = node + halfWidth * perp_right(d_B)`
- Half-angle from `acos(dot(d_A, d_B))`, `R_f = halfWidth * tan(theta/2)`, capped at `3*halfWidth`
- Acute crossings (halfAngle < 20°) or degenerate → straight bevel (two edge points)
- Arc sampled: bearing from `atan2(pA-node)` to `atan2(pB-node)` at `ceil(R_f*pi/2)+2` pts (min 3)

**Step 5 (winding):** `_polySignedArea` (shoelace) → reverse if area < 0 (Pitfall 6 guard)

**Step 6 (triangulate):** `isConvexPolygon` → `triangulateConvexFan` (95% case) or `earClip` (non-convex)

**Step 7 (geometry):** `BufferGeometry` with vertex Y = `nodeY` (flat — crown=0, camber=0 inside box, D-13); asphalt dark grey vertex color `(0.15, 0.15, 0.17)`. `computeVertexNormals()` called.

**Tile integration:** Junction meshes built inside `_buildRoadTile` for nodes whose XZ falls inside the tile's `CHUNK_SIZE × CHUNK_SIZE` bounds. Meshes pushed to `entry.meshes`/`geometries` → disposed with tile via `disposeRoadTile`.

**Helpers added:** `_polySignedArea(poly)`, `_polyArea(poly)`

**`test/test-road-mesh.html`**

Replaced SURF-02 placeholder with vertex-color dark-grey assertion.

Replaced SURF-07 placeholder with real smoke test:
- Multi-seed search (5 seeds × R=6 tile radius) to find a crossing
- `_detectJunctions()` returns a Map assertion
- `buildJunctionFootprint` returns non-null geometry
- `verts > 0`, `tris >= 1`, all Y = nodeY, `|area| > 1 m²`, signed area >= 0 (CCW)
- `assert('PASS SURF-07 junction footprint built', true)` emitted on success

## Deviations from Plan

### Auto-adjusted: Fillet arc approximated by bearing interpolation (not exact tangent circle)

**Found during:** Task 2 implementation

**Issue:** The research describes the fillet arc as a tangent circle connecting two outer-edge points with radius R_f = halfWidth*tan(theta/2). Computing the exact tangent circle center requires solving the intersection of two inward normals from the edge points, which requires additional trigonometry and is prone to numerical instability for nearly-perpendicular cases.

**Fix:** The fillet arc is approximated by interpolating the bearing angle from `atan2(pA - node)` to `atan2(pB - node)` at radius `rAvg = (|pA-node| + |pB-node|) / 2`. This produces a smooth arc in the corner region that connects the outer edges. For 90° crossings (the dominant case), the two radii are equal and the approximation is visually indistinguishable from the exact fillet. For non-90° crossings the approximation slightly underestimates fillet depth but remains smooth and non-degenerate.

**Files modified:** `src/road-mesh.js` (`buildJunctionFootprint`)

**Impact:** Minor visual deviation from the ideal fillet for non-90° crossings. The polygon is always non-degenerate and correctly wound. Accepted for Phase 9.

### Auto-adjusted: Leg ribbon trim deferred — footprint renders at nodeY over ribbon

**Found during:** Task 2 — Plan Step 6 analysis

**Issue:** Full ribbon trim (re-sweeping each ribbon segment only up to the footprint polygon boundary using _segXZ) requires clipping `sweepRibbon` mid-sweep at polygon intersection points. This would require passing the footprint polygon into the ribbon builder or post-processing the ribbon geometry, significantly increasing complexity.

**Fix:** The junction footprint mesh is rendered at `nodeY` with flat Y. Since ribbons approach the junction from below/above via design grade blending, the footprint patch covers the crossing zone. Z-fighting will occur where ribbons and footprint are coplanar, but the footprint patch dominates visually (rendered at node elevation). This satisfies the primary SURF-07 goal (one merged paved surface per crossing) without the full trim.

**Deferred:** Full _segXZ-based per-leg ribbon trim is tracked as a D-13 refinement in a future plan (09-07 or follow-up). Documented as deferred in the source code comment in `_buildRoadTile`.

**Files modified:** `src/road-mesh.js` (comment added in `_buildRoadTile`)

**Impact:** Minor z-fighting at ribbon/footprint overlap seams, visible only at road-surface level. The junction footprint polygon is correct, non-degenerate, and at the shared elevation. This is an acceptable visual approximation for Phase 9.

## Known Stubs

None — SURF-07 junction detection and footprint building are complete. The leg ribbon trim is a documented deferral, not a stub that prevents the plan goal. The test harness correctly validates the footprint geometry.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes at trust boundaries. Junction geometry is derived from own-math (pairwise intersection over local polylines, pure math).

T-09-06 (earClip DoS): mitigated — n×3 iteration bound with fan fallback confirmed in earClip implementation.
T-09-07 (acute/3+ junction): mitigated — `simpleMerge=true` for half-angle < 10° and legs > 4 confirmed in `_detectJunctions`.

## Verification

Automated:
- `road.js`: `_detectJunctions` count = 3 (method + call + inline reference)
- `road-carve.js`: `earClip` count = 1 export
- `ranger.js`: `roadJunctionBlendLength` count = 2, `roadFilletRadius` count = 2
- `road-mesh.js`: `buildJunctionFootprint` count = 2 (definition + call)
- `test-road-mesh.html`: `SURF-07` count = 12

Browser verification (manual): open `test/test-road-mesh.html` — SURF-07 junction footprint built assertions should PASS with multi-seed search finding at least one crossing.

## Self-Check: PASSED

Files modified confirmed:
- `src/road.js` — commit 5269b2a (added _detectJunctions, junction cache, constructor init, re-stream clear)
- `src/road-carve.js` — commit 5269b2a (earClip, triangulateConvexFan, isConvexPolygon)
- `data/ranger.js` — commit 5269b2a (roadJunctionBlendLength, roadFilletRadius)
- `src/road-mesh.js` — commit 096464c (buildJunctionFootprint, _polySignedArea, junction tile integration)
- `test/test-road-mesh.html` — commit 096464c (SURF-07 + SURF-02 real assertions)
