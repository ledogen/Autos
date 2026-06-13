---
phase: 09-road-surface
plan: 19
subsystem: road
tags: [generation-counter, D1, invalidation, ribbon, carve, versioning]
dependency_graph:
  requires: ["09-18"]
  provides: [roadGeneration-accessor, builtGeneration-ribbon, builtRoadGeneration-carve]
  affects: [src/road.js, src/road-mesh.js, src/terrain.js]
tech_stack:
  added: []
  patterns: [generation-counter invalidation, version-mismatch frame-spread rebuild]
key_files:
  created: []
  modified:
    - src/road.js
    - src/road-mesh.js
    - src/terrain.js
decisions:
  - D1: single _generation counter on RoadSystem bumps in both invalidateCache (re-route) and _streamNetwork past lazy gate (real re-stream); roadGeneration() accessor exposes it
  - D1: ribbon tiles stamp builtGeneration on _tileMeshMap entry; syncToChunkRing re-enqueues stale tiles for frame-spread rebuild (MAX_ROAD_BUILDS_PER_FRAME preserved)
  - D1: carve chunks stamp builtRoadGeneration on _chunkMap entry; _updateChunkRing re-carves in-place (no worker round-trip, capped at MAX_BUILDS_PER_FRAME per tick)
metrics:
  duration: ~20m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 9 Plan 19: D1 Generation Counter — Single Invalidation Source — Summary

**One-liner:** Single `_generation` counter on RoadSystem bumps on re-route + real re-stream; ribbon tiles (`builtGeneration`) and carve chunks (`builtRoadGeneration`) rebuild on mismatch — fixes stale ribbon (#1) and slider-no-rebuild-carve (#6) with one mechanism.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Generation counter on RoadSystem (single bump point) | 8ec1b19 | src/road.js |
| 2 | Ribbon tiles record + check builtGeneration (fixes stale ribbon #1) | a9c7013 | src/road-mesh.js |
| 3 | Carve chunks record + check builtRoadGeneration (fixes slider-no-rebuild #6) | 0fb9997 | src/terrain.js |

## What Was Built

### `_generation` counter + `roadGeneration()` (src/road.js)

- `this._generation = 0` added to constructor near `_network`/`_tiles` field declarations with a D1 explanatory comment naming the downstream consumers (ribbon tiles, carve chunks).
- Bumped in `invalidateCache()` (the re-route path — called by `debouncedRoadRebuild` in main.js whenever routing sliders change, including maxGrade).
- Bumped in `_streamNetwork()` at the point where a real re-stream commits (after passing the lazy gate, co-located with `this._network.clear()` and `this._slicedFrom = null`). The lazy-gate early-return paths do NOT bump.
- `roadGeneration() { return this._generation }` public accessor added with JSDoc referencing D1 and plan 09-19.

### Ribbon tile versioning (src/road-mesh.js)

- `_buildRoadTile` stamps `builtGeneration: this._road.roadGeneration()` on every `_tileMeshMap` entry — both the road-geometry case and the empty-road (no-segments) case so re-routes can re-check tiles that previously had no road.
- `syncToChunkRing` adds a version-mismatch rebuild pass after the existing enqueue/dispose/queue-prune passes: snapshots built keys, iterates, and for any entry in `activeKeys` whose `builtGeneration !== currentGen` calls `this.disposeRoadTile(key)` then `this.ensureRoadTile(cx, cz)`. Frame-spread preserved — re-enqueue lets `flushPendingQueue` drain at `MAX_ROAD_BUILDS_PER_FRAME`, never rebuilds all stale tiles in one frame.

### Carve chunk versioning (src/terrain.js)

- `_flushPendingQueue` stamps `builtRoadGeneration: this._roadSystem?.roadGeneration() ?? -1` on every `_chunkMap` entry (alongside the existing `mesh`, `heights`, `carveData` fields). Default of `-1` when no roadSystem ensures chunks built before the road system is wired get re-carved on first ring sync after road arrives.
- `_updateChunkRing` adds a D1 version-mismatch re-carve pass after the eviction loop and before the new-chunk request loop: iterates `_chunkMap`, skips chunks matching `currentRoadGen`, re-calls `_buildCarveTable(cx, cz)` for stale chunks, re-applies the blend (`raw + blendW * (gradeY - raw)`) to the existing mesh `position` buffer in-place, recomputes vertex normals + vertex colors via `_writeChunkVertexColors`, then stamps `chunk.builtRoadGeneration = currentRoadGen`. Capped at `MAX_BUILDS_PER_FRAME` re-carves per ring-sync tick to avoid frame spikes on sudden re-route.
- **CARVE SYNC preserved:** `src/terrain-worker.js` is byte-identical — carve remains a post-read main-thread blend. No new symbol added to the worker.

## Verification Results

```
node test/spline-continuity.mjs  →  exit=0

  GATE RESULT (spline metrics): PASS — 2 gate fixture(s) all within thresholds
    gentle-baseline          → PASS
    tile-seam-mismatch       → PASS
  PHYSICS-SAMPLING CONTINUITY: PASS (refine maxDY=0.020 m <= 0.05 m)
  HAIRPIN INNER-EDGE FOLD GATE: PASS (innerEdgeFolds=0)

node --check src/road.js src/road-mesh.js src/terrain.js  →  OK (all exit 0)
git diff --stat src/terrain-worker.js  →  (empty — untouched)
```

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed as specified.

## Known Stubs

None — all generation versioning is fully wired. The `builtRoadGeneration` sentinel default (`-1`) intentionally triggers a re-carve on first sync after roadSystem is set, which is correct behavior, not a stub.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/road.js` modified: FOUND (commit 8ec1b19) — `_generation`, `roadGeneration()`, two `_generation++` sites
- `src/road-mesh.js` modified: FOUND (commit a9c7013) — `builtGeneration` on both tile-entry paths, mismatch pass in syncToChunkRing
- `src/terrain.js` modified: FOUND (commit 0fb9997) — `builtRoadGeneration` on _chunkMap entry, re-carve pass in _updateChunkRing
- `src/terrain-worker.js` untouched: CONFIRMED (git diff --stat empty)
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- Two `_generation++` sites in road.js (not inside lazy-gate early-return): CONFIRMED (lines 631, 1287)
- `roadGeneration()` accessor exists: CONFIRMED (line 812)
- `builtGeneration` appears in road-mesh.js: CONFIRMED (4 occurrences: comment + mismatch check + 2 set sites)
- `builtRoadGeneration` appears in terrain.js: CONFIRMED (5 occurrences: comment + mismatch check + stamp + 2 set sites)
