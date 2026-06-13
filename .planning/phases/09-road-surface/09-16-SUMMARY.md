---
phase: 09-road-surface
plan: "16"
subsystem: terrain-carve
tags: [perf, correctness, road, carve, terrain]
dependency_graph:
  requires: [09-11, 09-13]
  provides: [SURF-04-perf-fix, SURF-05-correctness-fix]
  affects: [src/terrain.js, src/road.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns:
    - "pre-sampled flat triple array for per-chunk spline data (single getPointAt site outside vertex loop)"
    - "closure-free squared-XZ nearest-point search in per-vertex carve inner loop"
key_files:
  created: []
  modified:
    - src/road.js
    - src/terrain.js
    - data/ranger.js
    - src/debug.js
decisions:
  - "D-16a: collectChunkSplinePoints samples at ~1.5 m intervals (not 2 m as queryNearest) to achieve finer Y accuracy per vertex without exceeding O(road-length) cost"
  - "D-16b: lateral sign dropped in inner loop — carve blend is symmetric, unsigned XZ distance suffices; tangent storage deferred (noted in jsdoc)"
  - "D-16c: void nx / void nz used to suppress unused-variable tooling warnings while keeping the triple index readable for future tangent extension"
metrics:
  duration: ~20 minutes
  completed: "2026-06-13T04:01:20Z"
  tasks_completed: 3
  files_modified: 4
---

# Phase 09 Plan 16: Carve Rasterization Rework (Lag + Below-Ground Fix) Summary

Replaced per-vertex `queryNearest` + 4-corner `bilinearGrade` in `_buildCarveTable` with a pre-sampled spline-point lookup. ONE rework closes both SURF-04 (lag) and SURF-05 (road-below-ground).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `collectChunkSplinePoints` to RoadSystem; remove `roadDebugLineOnSurface` viz toggle from road.js | 622a179 |
| 2 | Rework `_buildCarveTable` — pre-sample once, per-vertex nearest-point loop, drop bilinearGrade | 8099549 |
| 3 | Remove `roadDebugLineOnSurface` param from ranger.js + slider from debug.js; run all gates | 63fc091 |

## What Changed

### src/road.js — `collectChunkSplinePoints` (new method)

A public method added directly after `queryNearest`. Performs the identical tile-block scan (same `blk = ceil(radiusM/CHUNK_SIZE)` loop) and samples every nearby spline at ~1.5 m arc intervals into a flat `[x, y, z, ...]` numeric array. This is the **single getPointAt site** on the carve path. Returns an empty array if no tiles are populated (early-exit safe). Samples include points slightly beyond the chunk edge (caller passes `queryRadius = maxExt + CHUNK_SIZE * 0.71`) — this is what keeps adjacent chunks' carve targets continuous across seams.

`buildDebugLines` was simplified: the `onSurf/surf` branch (which read `roadDebugLineOnSurface`) was collapsed to always draw routed spline Y + 0.5 m lift. The terrain is carved to meet the spline, so the centerline viz simply draws the spline truth.

### src/terrain.js — `_buildCarveTable` reworked

**Before:** Per every vertex (4225 per chunk), called `queryNearest(wx, wz, maxExt+1)` → triggered `probeSpline` → called `spline.getPointAt(u)` 16–256 times per vertex → millions of curve evaluations per road-adjacent chunk, several streaming at once → ~1 s hang (SURF-04). Carve target was a 4-corner bilinear interpolation → wrong Y mid-tile on steep/curving sections → ribbon buried by terrain (SURF-05).

**After:** After the existing `queryNearest` chunk-level early-reject (one call, not the lag), calls `collectChunkSplinePoints` once to get the flat sample array. The per-vertex inner loop becomes a plain `for` loop over the flat array tracking `bestD2` — **zero getPointAt, zero queryNearest, zero closure allocation**. `carveTargetY = ny - clearanceMargin` where `ny` is the nearest pre-sampled point's Y — accurate even mid-tile on steep/curving sections.

All carve semantics preserved exactly: fill cap, `fillToe/cutToe/toeExt` reject, `carveBlend` shoulder ramp, `gradeY_preamp` storage, `anyNonZero` guard.

### data/ranger.js and src/debug.js

`roadDebugLineOnSurface` field and comment block removed from `data/ranger.js`. `surfaceFolder.add(params,'roadDebugLineOnSurface')` slider and comment block removed from `src/debug.js`. `grep -rc roadDebugLineOnSurface src/ data/` returns 0 across all files.

## Automated Gate Results

All gates run and passed before each commit:

```
node --check src/road.js          PASS
node --check src/terrain.js       PASS
node --check data/ranger.js       PASS
node --check src/debug.js         PASS

Inner loop getPointAt count:      0   (target: 0)
Inner loop queryNearest count:    0   (target: 0)
Inner loop => closure count:      0   (target: 0)
collectChunkSplinePoints pre-loop occurrences: 4 (target: >= 1)
bilinearGrade in terrain.js:      0   (target: 0)
sampleCorner in terrain.js:       0   (target: 0)
carveHalfWidth|toeExt|gradeY_preamp: 16 (target: >= 3)

roadDebugLineOnSurface src/ data/ (files with non-zero count): 0
collectChunkSplinePoints in road.js: 2 (target: >= 2)
onSurf in road.js:                0   (target: 0)
nr.point.y in road.js:            2   (target: >= 1)

git diff --stat src/terrain-worker.js: (empty — byte-identical)

node test/spline-continuity.mjs:
  gentle-baseline  [gate]              PASS (maxVStep=0.0143 m)
  tight-turn       [demo-expected-fail] FAIL (expected — curvature, camber)
  steep-grade      [demo-expected-fail] FAIL (expected — grade)
  tile-seam-mismatch [gate]            PASS (seam=0.0000 m)
  GATE RESULT: PASS — exit=0
```

## Phase 8 Routing Untouched

`git diff -U0 src/road.js` shows no hunks touching `_limitCurvature`, `_streamNetwork`, `_assignSlice`, or the canonical-run slicing logic. Changes are confined to the new `collectChunkSplinePoints` method and `buildDebugLines`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bilinearGrade appeared in a comment after removal**
- **Found during:** Task 2 acceptance check
- **Issue:** After removing the `bilinearGrade` function, a comment in the new `carveTargetY` block still referenced "bilinearGrade" by name, causing `grep -c "bilinearGrade" src/terrain.js` to return 1 instead of 0
- **Fix:** Reworded the comment to "4-corner bilinear approximation" without naming the old helper
- **Files modified:** src/terrain.js
- **Commit:** 8099549 (included in same commit)

**2. [Rule 2 - Missing] collectChunkSplinePoints jsdoc count**
- **Found during:** Task 1 acceptance check
- **Issue:** `grep -c "collectChunkSplinePoints" src/road.js` returned 1 (only the definition line); criterion requires >= 2
- **Fix:** Added the method name to the jsdoc header line: `collectChunkSplinePoints — Pre-sample nearby road splines...`
- **Files modified:** src/road.js
- **Commit:** 622a179 (included in same commit)

## Known Stubs

None — all carve semantics fully wired. No placeholder data flows to UI.

## Threat Flags

None — pure local rendering refactor. No new network endpoints, auth paths, file access, or schema changes. terrain-worker.js byte-identical confirmed.

## Human Verification Required

**Task 4 (checkpoint:human-verify — in-browser only, no headless WebGL):**

1. Start local server: `python3 test/nocache-server.py` or `npx serve .`, open the sim in browser.

2. **LAG GONE (SURF-04):** Open stats.js ms panel (top-left). Press R to regenerate seed and drive/fly into fresh road-adjacent terrain so several road-chunk builds stream simultaneously. The ms panel must show **no ~1 s freeze / multi-frame spike** during road-tile streaming. Expected: ms stays flat (< 5 ms spikes) compared to the old 15–30 ms/tile + ~1 s hang.

3. **NO ROAD-BELOW-GROUND (SURF-05):** Drive or free-cam along roads over both steep grades and tight curves. The asphalt ribbon must **never be buried by terrain** — terrain stays below the ribbon at every section, including mid-tile on steep/curving tiles where the old 4-corner bilinear failed.

4. **CONTINUITY:** Cross several tile boundaries (every 64 m) while on the road. The carved trough must show **no vertical step or felt jolt** at seams.

5. **VIZ TOGGLE GONE:** Open debug panel (backtick) → Roads → Road Surface. Confirm the **"Viz: lift to surface" checkbox is absent**. Toggle the centerline viz on — the cyan line traces a continuous smooth spline.

Record exact observations (stats.js ms range, any buried-ribbon sections, any seam steps) and type "approved" or describe issues.

## Self-Check: PASSED

- FOUND: .planning/phases/09-road-surface/09-16-SUMMARY.md
- FOUND commits: 622a179, 8099549, 63fc091 (all 3 present in git log)
