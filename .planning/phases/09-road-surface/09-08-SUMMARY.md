---
phase: 09-road-surface
plan: "08"
subsystem: road-surface
tags: [cr-01, cr-02, cr-03, design-grade, shared-curvature, pothole-arcs, height-agreement]
dependency_graph:
  requires: [09-07]
  provides: [unified-gradeY-source, shared-signedCurvature, unified-pothole-arcS]
  affects: [src/road-carve.js, src/road-mesh.js, src/road.js, src/terrain.js, src/main.js]
tech_stack:
  added: []
  patterns: [shared-pure-fn, null-spline-fallback, WeakMap-memoization, cr-unified-elevation]
key_files:
  created: []
  modified:
    - src/road-carve.js
    - src/road-mesh.js
    - src/road.js
    - src/terrain.js
    - src/main.js
decisions:
  - "CR-02: signedCurvature exported from road-carve.js (not synced to WORKER_SOURCE); all three camber sites use identical ds=2.0 m world-space call"
  - "CR-01: queryNearest spline-path return exposes spline field so carve sites have the WeakMap cache key; null-spline fallback to nr.point.y prevents passing null to sampleDesignGradeAt"
  - "CR-01: RoadSystem.setRawHeightSampler(fn) added; never passes analyticHeight to avoid carve recursion"
  - "CR-03: pothole roadQuality keyed on centerlineArcS = nr.arcS + (nr.arcSOffset ?? 0) — arcSOffset is 0 now but addition is forward-safe"
  - "_buildCarveTable uses (x,z) => this.rawHeightWorld(x,z) inline lambda rather than storing the reference separately — avoids adding a second reference field to TerrainSystem"
metrics:
  duration: "~20 min"
  completed: "2026-06-12"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 9 Plan 08: CR-01/02/03 Unified Elevation Source + Shared Curvature + Pothole arcS Summary

Both physics carve sites (road.js _sampleCarveWorld and terrain.js _buildCarveTable) now derive base gradeY from sampleDesignGradeAt — the same memoized smoothed-grade source the ribbon mesh uses — eliminating the truck-on-different-surface-than-asphalt visual discrepancy; one shared signedCurvature function (ds=2.0 m) replaces two divergent inline estimators; pothole severity keyed on matching centerline arcS at all three sites.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract shared signedCurvature fn; unify all three camber sites | ba0a97f | src/road-carve.js, src/road-mesh.js, src/road.js, src/terrain.js |
| 2 | Unify gradeY base on smoothed grade + pothole arcS (both carve sites) | 367fd85 | src/road.js, src/terrain.js, src/main.js |

## What Was Built

### Task 1 — signedCurvature shared function (CR-02)

Added `export function signedCurvature(T0x, T0z, T1x, T1z, ds)` to `src/road-carve.js`. The function computes `Math.sign(cross) * (dtLen / ds)` where cross is the XZ tangent cross product and dtLen is `|T1 - T0|`. Degenerate guards: returns 0 if either tangent length < 1e-8 or ds < 1e-10 (ported from road-mesh.js T-09-04 guard). Marked `export` so it is NOT swept into the byte-identical WORKER_SOURCE / terrain-worker.js mirror (the Worker never computes curvature).

**road-mesh.js** `_splineCurvatureSigned`: rewritten as thin wrapper — converts the existing `u ± eps` normalized-u finite diff to a fixed world-space `ds = 2.0 m` step (`du = ds/arcLen`), then calls `signedCurvature(T0.x, T0.z, T1.x, T1.z, actualDs)`. `MAX_CAMBER_RAD` clamp and `camberStrength` scaling unchanged.

**road.js** `_sampleCarveWorld`: replaced inline `kappa = dtLen/eps` block with `signedCurvature(tx, tz, tA.x, tA.z, eps)` where `eps = 2.0`. `MAX_CAMBER` clamp unchanged.

**terrain.js** `_buildCarveTable`: replaced inline `kappa = dtLen/eps` block with `signedCurvature(tx, tz, tAx, tAz, eps)` where `eps = 2.0`. `MAX_CAMBER_RAD` clamp unchanged.

All three sites: ds = 2.0 m world-space → camber magnitude matches at lateral extremes.

### Task 2 — Unified gradeY + pothole arcS (CR-01, CR-03)

**queryNearest return** (road.js spline path): added `spline: bestSpline` to the returned object. The fallback polyline path returns `spline` undefined (still has `arcS: 0`, `runKey: ''`).

**RoadSystem.setRawHeightSampler(fn)**: new setter stores `this._rawHeightSampler`. Called from main.js at both the initial setup and the seed-change (world reset) path, passing `(x, z) => terrainSystem.rawHeightWorld(x, z)`.

**road.js `_sampleCarveWorld`** (CR-01): when `nr.spline && this._rawHeightSampler`, calls `this.sampleDesignGradeAt(nr.spline, nr.arcS, this._rawHeightSampler, p)` as the gradeY base. Null-spline fallback to `nr.point.y` prevents passing null to sampleDesignGradeAt (raw-polyline queryNearest path). Fill-cap clamp (`delta > fillHeight`) preserved after smoothed base computation.

**terrain.js `_buildCarveTable`** (CR-01): when `nr.spline`, calls `this._roadSystem.sampleDesignGradeAt(nr.spline, nr.arcS, (x,z) => this.rawHeightWorld(x,z), p)`. Same null-spline fallback and fill-cap clamp preserved. The inline lambda avoids carve recursion — never analyticHeight.

**Pothole arcS** (CR-03 — both sites): `roadQuality(...)` now keyed on `centerlineArcS = (nr.arcS ?? 0) + (nr.arcSOffset ?? 0)`. `arcSOffset` is 0 for all current tile segments (not yet stored in `_assignSlice`) but the addition is forward-safe and matches mesh's `arcSOffset + u*arcLen` invariant.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria verified.

## Worker CARVE SYNC Verification

terrain-worker.js untouched. `grep -c "sampleDesignGradeAt|rawHeightWorld" src/terrain-worker.js` returns 0. The Worker continues to store RAW heights and apply no carve blend — byte-identical sampleCarve body contract unchanged.

## Known Stubs

None. The phase 09-09 integration test can now assert mesh-Y == physics-Y at on-road positions; the shared elevation source is in place.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- src/road-carve.js exports `signedCurvature`: FOUND
- src/road-mesh.js imports and calls `signedCurvature`: FOUND
- src/road.js imports and calls `signedCurvature`: FOUND
- src/terrain.js imports and calls `signedCurvature`: FOUND
- src/road.js `_sampleCarveWorld` calls `sampleDesignGradeAt`: FOUND
- src/terrain.js `_buildCarveTable` calls `sampleDesignGradeAt`: FOUND
- src/road.js `setRawHeightSampler` setter: FOUND
- src/main.js wires `setRawHeightSampler` at init: FOUND
- terrain-worker.js has 0 new symbols: CONFIRMED
- Task 1 commit ba0a97f: FOUND
- Task 2 commit 367fd85: FOUND
- node --check src/road-carve.js: PASS
- node --check src/road-mesh.js: PASS
- node --check src/road.js: PASS
- node --check src/terrain.js: PASS
- node --check src/main.js: PASS
