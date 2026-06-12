---
phase: 09-road-surface
plan: "07"
subsystem: road-surface
tags: [cr-04, design-grade, carve-free, cache-invalidation, height-agreement]
dependency_graph:
  requires: []
  provides: [rawHeightWorld, invalidateDesignGradeCache, sampleDesignGradeAt]
  affects: [src/terrain.js, src/road.js, src/main.js]
tech_stack:
  added: []
  patterns: [WeakMap-memoization, arc-length-binary-search, carve-free-sampler]
key_files:
  created: []
  modified:
    - src/terrain.js
    - src/road.js
    - src/main.js
decisions:
  - "rawHeightWorld wraps the height() function with NO _sampleCarveWorld call — lives only on main-thread TerrainSystem, never in terrain-worker.js"
  - "_smoothDesignGrade now returns arcPos Float32Array in result so sampleDesignGradeAt can binary-search without re-computing arc positions"
  - "invalidateDesignGradeCache() assigns a fresh WeakMap (not per-entry delete) — simple, correct, and handles all spline objects in one call"
  - "sampleDesignGradeAt clamps arcS to [arcPos[0], arcPos[N-1]] before interpolation to avoid out-of-bounds"
metrics:
  duration: "~15 min"
  completed: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 9 Plan 07: CR-04 Carve-Free Design-Grade Sampler + Cache Invalidation Summary

Carve-free raw-height sampler added to TerrainSystem; RoadMeshSystem terrainRef switched from carve-inclusive analyticHeight to rawHeightWorld; design-grade WeakMap cache made invalidatable on surface-param changes; shared arc-keyed smoothed-grade lookup helper added for 09-08.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add rawHeightWorld carve-free sampler; wire as RoadMeshSystem terrainRef | eb37fa4 | src/terrain.js, src/main.js |
| 2 | Cache invalidation + arc-keyed smoothed-grade lookup on RoadSystem | 4b486a0 | src/road.js, src/main.js |

## What Was Built

### Task 1 — rawHeightWorld (terrain.js + main.js)

Added `rawHeightWorld(wx, wz)` to TerrainSystem. It calls the module-private `height()` function and multiplies by `terrainAmplitude` — exactly the `raw` local from `analyticHeight` at line 559 — but with NO `_sampleCarveWorld` hook and NO blend. This is the CR-04 carve-free design-grade input source.

Changed `RoadMeshSystem` constructor call in main.js from `(x, z) => terrainSystem.analyticHeight(x, z)` to `(x, z) => terrainSystem.rawHeightWorld(x, z)`. The `roadSystem.setSurfaceSampler` call at line 831 stays `analyticHeight` — viz placement and spawn seating must see the blended surface.

### Task 2 — invalidateDesignGradeCache + sampleDesignGradeAt (road.js + main.js)

**arcPos exposed:** `_smoothDesignGrade` now includes `arcPos` (Float32Array of arc-length positions) in its returned result object alongside `points` and `designGradeY`. Already computed internally — just exposed.

**invalidateDesignGradeCache():** Replaces `this._designGradeCache` with a fresh `new WeakMap()`. All memoized entries are dropped. Called from `debouncedRoadSurfaceRebuild` in main.js before `roadMeshSystem.clearAll()` so the next ribbon sweep recomputes smoothed grade against the new crownHeight / terrainAmplitude / camberStrength values.

**sampleDesignGradeAt(spline, arcS, terrainRef, params):** Delegates to `_smoothDesignGrade` (shared memo), then binary-searches `arcPos[]` for the interval containing `arcS`, linearly interpolates `designGradeY[]`. Clamps `arcS` to `[arcPos[0], arcPos[N-1]]`. O(1) after first sweep per spline. This is the shared elevation source plan 09-08 will call from both carve sites at `nr.arcS`.

## Defects Fixed

**CR-04 double-count:** `_smoothDesignGrade` was fed `analyticHeight` (carve-inclusive). On-ribbon, analyticHeight returns `rawSpline + crown + camber + pothole` (blendW=1). The 50 m smoothing window averaged a surface already containing those terms. `sweepRibbon` then adds crown/camber/pothole again — structural double-count of 0.05 m crown plus camber/pothole in the visible ribbon Y. Fixed by feeding `rawHeightWorld` (carve-free) instead.

**CR-04 stale cache:** `_designGradeCache` was only invalidated on `window` value changes. Surface-param slider changes (crownHeight, terrainAmplitude, camberStrength) persisted spline objects, so the WeakMap returned stale pre-change profiles after `debouncedRoadSurfaceRebuild`. Fixed by calling `invalidateDesignGradeCache()` in that rebuild path.

## Deviations from Plan

None — plan executed exactly as written.

## Worker CARVE SYNC Verification

terrain-worker.js untouched. `grep -c "rawHeightWorld|invalidateDesignGradeCache|sampleDesignGradeAt" src/terrain-worker.js` returns 0. The Worker continues to store RAW heights and apply no carve blend — contract unchanged.

## Known Stubs

None. The carve sites (`_sampleCarveWorld` and `_buildCarveTable`) still read raw `nr.point.y` — that is intentionally left for plan 09-08, which depends on this plan and will wire `sampleDesignGradeAt` at those two sites.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- src/terrain.js contains `rawHeightWorld` definition: FOUND
- src/road.js contains `invalidateDesignGradeCache`: FOUND
- src/road.js contains `sampleDesignGradeAt`: FOUND
- src/main.js wires `rawHeightWorld` as RoadMeshSystem terrainRef: FOUND
- src/main.js calls `invalidateDesignGradeCache` in debouncedRoadSurfaceRebuild: FOUND
- terrain-worker.js has 0 new symbols: CONFIRMED
- Task 1 commit eb37fa4: FOUND
- Task 2 commit 4b486a0: FOUND
- node --check src/terrain.js: PASS
- node --check src/road.js: PASS
- node --check src/main.js: PASS
