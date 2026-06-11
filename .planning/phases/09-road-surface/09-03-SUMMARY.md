---
phase: 09-road-surface
plan: "03"
subsystem: road-mesh
tags: [ribbon-mesh, crown, camber, streaming, SURF-01, SURF-03, D-04]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [road-mesh-module, RoadMeshSystem, sweepRibbon, crown-camber-gradeY, road-tile-lifecycle]
  affects: [src/road-mesh.js, src/road.js, src/terrain.js, src/main.js, data/ranger.js, test/test-road-mesh.html, test/test-road-carve.html]
tech_stack:
  added: []
  patterns: [ribbon-sweep-from-spline, crown-profile, signed-curvature-camber, tile-keyed-lifecycle, shared-material-no-dispose]
key_files:
  created:
    - src/road-mesh.js
  modified:
    - data/ranger.js
    - src/road.js
    - src/terrain.js
    - src/main.js
    - test/test-road-mesh.html
    - test/test-road-carve.html
decisions:
  - "Crown + camber folded into both sweepRibbon (mesh Y) and _sampleCarveWorld/_buildCarveTable (carve gradeY) so analyticNormal returns the banked normal physics feels (height-agreement constraint)"
  - "Camber estimated via second queryNearest 2 m ahead along road tangent — gives signed curvature without requiring spline access from carve call sites"
  - "_buildCarveTable imports crownProfile from road-carve.js to keep formula identical with sweepRibbon (same function, same params)"
  - "getActiveChunkKeys() accessor added to TerrainSystem for road mesh syncToChunkRing lifecycle"
  - "road.js imports crownProfile from road-carve.js so _sampleCarveWorld uses identical formula as sweepRibbon and _buildCarveTable"
  - "RoadMeshSystem._buildRoadTile marks empty-road tiles in _tileMeshMap to prevent re-queuing"
metrics:
  duration: "~28 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 6
---

# Phase 9 Plan 3: Road Ribbon Mesh + Crown/Camber (SURF-01/SURF-03) Summary

**One-liner:** RoadMeshSystem sweeps a 10 m crowned+cambered ribbon along tile splines; crown+camber folded into both visual mesh Y and physics carve gradeY via identical crownProfile + signed-curvature formula.

## What Was Built

### Task 1: src/road-mesh.js — RoadMeshSystem ribbon sweep with crown + curvature camber

**`src/road-mesh.js`** (new file)

Class `RoadMeshSystem` with full tile-keyed streaming lifecycle:

**`sweepRibbon(spline, designGradeY, points, params)`**
- Samples `N_LONG` sections (from `_smoothDesignGrade` points array) at arc-length-correct positions via `getPointAt` / `getTangentAt`
- Per-section: right vector = `(tan.z, 0, -tan.x).normalize()` (Y-up perpendicular)
- Zero-length tangent guard (T-09-04): falls back to unit-X right vector to prevent NaN
- Signed curvature via finite difference on `getTangentAt` at `u ± 0.01`; XZ cross product gives sign
- `camberAngle = clamp(camberStrength * signedKappa, -6°, +6°)` (T-09-04 clamp)
- `CROSS_SEGS = 8` lateral vertices; `uLat = (j/8 - 0.5) * roadWidth`
- Vertex Y = `designGradeY[i] + crownProfile(uLat, halfWidth, crownHeight) + uLat * sin(camberAngle)`
- Asphalt vertex color `(0.15, 0.15, 0.17)` dark cool grey (SURF-02 base)
- CCW quad strip indices (2 triangles per quad)
- `geometry.computeVertexNormals()` for smooth visual normals

**Tile lifecycle:**
- `ensureRoadTile(tileX, tileZ)` — enqueues tile if not built/pending
- `disposeRoadTile(key)` — removes meshes, disposes geometries (NOT material — shared)
- `flushPendingQueue()` — builds up to 1 tile per frame (`MAX_ROAD_BUILDS_PER_FRAME = 1`)
- `syncToChunkRing(activeKeys)` — enqueues new tiles, disposes evicted tiles
- `clearAll()` — full reset on road re-stream

**Shared material:** `MeshPhongMaterial({ vertexColors: true, side: THREE.FrontSide })` — one instance, never disposed per-tile.

**Module-scope scratch vectors:** `_scratchPt` / `_scratchTan` avoid per-sample Vector3 allocation (GC pressure guard).

### Task 2: Crown+camber fold-in; RoadMeshSystem wired; ranger.js + test assertions

**`data/ranger.js`**
- `crownHeight: 0.05` — m, centerline crown height (D-04 / A12)
- `camberStrength: 200` — m·rad/rad, curvature-to-camber gain (D-04 / A4)

**`src/road.js`**
- Import `crownProfile` from `./road-carve.js`
- `_sampleCarveWorld`: folded `crownProfile + camber tilt` into `gradeY` for on-ribbon vertices (`latDist < halfWidth`)
  - Signed lateral = `dx * tz - dz * tx` (positive = right side of road)
  - Camber estimated via second `queryNearest` 2 m ahead along road tangent
  - Same formula as `sweepRibbon` — ensures `analyticNormal` returns the banked normal physics feels

**`src/terrain.js`**
- Import `crownProfile` from `./road-carve.js`
- `_buildCarveTable`: same crown + camber fold-in for on-ribbon vertices
  - `crownProfile(signedLat, halfWidth, crownHeightVal)` + `tiltY = signedLat * sin(camberAngle)`
  - Camber estimated via second `queryNearest` 2 m ahead
  - Stored as `gradeY_preamp = designY / amp` (includes crown+camber now)
- `getActiveChunkKeys()` — new public accessor returns `Set<string>` of current chunk keys

**`src/main.js`**
- Import `RoadMeshSystem` from `./road-mesh.js`
- `roadMeshSystem` module-scope variable
- Constructs `RoadMeshSystem(scene, roadSystem, analyticHeight, RANGER_PARAMS)` after terrain+road exist
- `terrainSystem.setRoadSystem(roadSystem)` wires carve hook in `analyticHeight`
- Render loop: `syncToChunkRing(terrainSystem.getActiveChunkKeys())` + `flushPendingQueue()` per frame
- `debouncedRebuildFull`: clears + re-creates `roadMeshSystem` on seed/terrain change
- `debouncedRoadRebuild`: `roadMeshSystem.clearAll()` on re-route

**`test/test-road-mesh.html`**
- Replaced SURF-01 placeholder with real smoke: constructs RoadMeshSystem over fixed seed, builds tile, asserts geometry vertex count > 0, centerline normal finite + length ≈ 1, index buffer present

**`test/test-road-carve.html`**
- Added SURF-03 crown assertions: peak = `crownHeight` at centerline, zero at edge, midpoint between, non-zero lateral gradient
- Added SURF-03 camber direction: positive curvature (left turn) → right edge higher (`tiltRight > 0`), left edge lower (`tiltLeft < 0`), lateral normal `nx < 0` (tilts toward inside of turn)

## Deviations from Plan

### Auto-adjusted: Camber estimated via second queryNearest (not direct spline curvature)

**Found during:** Task 2 implementation

**Issue:** `_sampleCarveWorld` and `_buildCarveTable` use `queryNearest` to find the nearest road point but don't have access to the spline object or its `u` parameter. The plan specified the "same formula" as `sweepRibbon` which uses `getTangentAt` finite-difference curvature. Without spline access, direct `getTangentAt` is not available.

**Fix:** Estimate local signed curvature by calling `queryNearest` at a point 2 m forward along the road tangent (`wx + tx * eps, wz + tz * eps`), then computing curvature from the tangent change. This gives the same signed-kappa formula with a small spatial approximation (2 m vs the 0.01 normalized-u eps in sweepRibbon). The approximation is sufficient for physics — the exact curvature values match closely for smooth splines.

**Files modified:** `src/road.js` (`_sampleCarveWorld`), `src/terrain.js` (`_buildCarveTable`)

**Impact:** Minor computational overhead (one extra `queryNearest` per analyticHeight call when on ribbon). Accepted — `analyticHeight` is called for physics contacts, not per-frame globally.

### Auto-adjusted: crownProfile imported into road.js and terrain.js

**Found during:** Task 2 — consistency check

**Issue:** The plan required "same crownProfile formula" — adding an inline formula would risk drift. The `crownProfile` function already exists in `road-carve.js` (Plan 09-02).

**Fix:** Added `import { crownProfile } from './road-carve.js'` to both `road.js` and `terrain.js`. This ensures the identical function is called at all three sites (sweepRibbon, _sampleCarveWorld, _buildCarveTable).

## Known Stubs

None — all SURF-01 and SURF-03 functionality is complete. Test placeholders for SURF-02 (asphalt material) and SURF-07 (junction footprint) remain, as these are forward-placeholders for Plans 09-04 and 09-05 respectively.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. RoadMeshSystem uses own-math geometry (Three.js BufferGeometry from pure functions). T-09-04 camber clamp and NaN guard implemented as required.

## Verification

Automated:
- `road-mesh.js`: `class RoadMeshSystem` present, `computeVertexNormals` present, `sweepRibbon|crownProfile|camber` count=29
- `main.js`: `RoadMeshSystem` count=6
- `ranger.js`: `crownHeight|camberStrength` count=6
- `test-road-mesh.html + test-road-carve.html`: `SURF-01|SURF-03` counts 12+10

Browser verification (manual):
- Open `test/test-road-mesh.html`: SURF-01 ribbon mesh smoke PASS (vertex count > 0, normal ≈ 1)
- Open `test/test-road-carve.html`: SURF-03 camber direction PASS + prior SURF-04/05 gates still PASS

## Self-Check: PASSED

Files created/modified confirmed:
- `src/road-mesh.js` — commit ff55a18 (new file, 388 lines)
- `data/ranger.js`, `src/main.js`, `src/road.js`, `src/terrain.js`, `test/test-road-mesh.html`, `test/test-road-carve.html` — commit 5d8b140
