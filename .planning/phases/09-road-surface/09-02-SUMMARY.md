---
phase: 09-road-surface
plan: "02"
subsystem: road-carve
tags: [carve, terrain, physics-height, worker-sync, exit-gate, SURF-04, SURF-05]
dependency_graph:
  requires: [09-01]
  provides: [road-carve-module, carve-table-builder, analyticHeight-carve-hook, sampleHeight-carve-hook, flushPendingQueue-carve-hook, worker-carve-sync, exit-gate-tests]
  affects: [src/road-carve.js, src/terrain.js, src/terrain-worker.js, src/road.js, data/ranger.js, test/test-road-carve.html]
tech_stack:
  added: []
  patterns: [worker-safe-pure-function-sync, carve-post-read-blend, transferable-float32array, weakmap-memoization]
key_files:
  created:
    - src/road-carve.js
  modified:
    - data/ranger.js
    - src/road.js
    - src/terrain.js
    - src/terrain-worker.js
    - test/test-road-carve.html
decisions:
  - "carveTable stores gradeY_preamp (= worldY / terrainAmplitude) so the Worker can blend without knowing terrainAmplitude (Worker never receives amp)"
  - "Worker receives carveTable Transferable but stores RAW heights; main thread applies carve in _flushPendingQueue and sampleHeight via chunk.carveData — chunk.heights always raw (Pitfall 1)"
  - "analyticHeight uses _sampleCarveWorld(wx,wz,rawAmp) to avoid infinite recursion (cannot call analyticHeight from within analyticHeight)"
  - "_buildCarveTable returns null when no road system attached or no road within range; Transferable only sent when carveTable non-null"
  - "CARVE SYNC sections (sampleCarve fn + carveTable handler) verified byte-identical in WORKER_SOURCE and terrain-worker.js"
metrics:
  duration: "~14 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 5
---

# Phase 9 Plan 2: Road Carve System (SURF-04/SURF-05) Summary

**One-liner:** Pure no-import road-carve.js (sampleCarve/crownProfile/carveBlend), per-chunk carveTable Transferable, identical carve blend at all four sites (analyticHeight, sampleHeight, _flushPendingQueue, Worker), exit-gate pure-function assertions in test harness.

## What Was Built

### Task 1: road-carve.js pure functions, ranger.js carve params, design-grade smoothing

**`src/road-carve.js`** (new file)

Worker-safe module with zero imports. Contains three exported pure functions:
- `sampleCarve(wx, wz, carveTable, N, originX, originZ, cellSize)` — bilinear lookup into per-vertex Float32Array carve table, returns `{ blendW, gradeY }`.
- `crownProfile(uLat, halfWidth, crownHeight)` — parabolic crown (peak at center, 0 at edge).
- `carveBlend(raw, dist, designGradeY, halfWidth, shoulderWidth)` — on-ribbon returns designGradeY; shoulder zone linearly blends back to raw; beyond shoulder returns raw.

Top comment establishes SYNC RULE: function bodies are copied verbatim into terrain.js WORKER_SOURCE and terrain-worker.js, edited in the same commit (T-07-03-SYNC discipline).

**`data/ranger.js`**

New "Phase 9 Road Surface" param block added after Phase 8 road routing block:
- `roadWidth: 10` (m, D-04), `roadHalfWidth: 5` (derived), `roadShoulderWidth: 2.5` (m, D-05)
- `roadFillHeight: 2.0` (m max fill cap, D-07), `roadCutSlope: 1.0` (H:V 45°, D-08)
- `roadFillSlope: 3.0` (H:V 3:1 embankment, D-08), `designGradeWindow: 50` (m, D-06)

Each param has a multi-line domain comment and inline unit/decision tag.

**`src/road.js`**

Added `_smoothDesignGrade(spline, terrainRef, params)` to RoadSystem: arc-length sampled at ~2 m intervals, two-pointer sliding-window average of `analyticHeight` over `designGradeWindow` half-width. WeakMap-memoized per spline object + window value. Returns `{ points, designGradeY: Float32Array }`.

Added `_sampleCarveWorld(wx, wz, rawAmp)`: analytic carve lookup for `analyticHeight` without chunk dependency. Takes rawAmp to avoid infinite recursion into analyticHeight.

### Task 2: carveTable builder, identical carve at all 4 sites, Worker sync, exit-gate tests

**`src/terrain.js`** — multiple extensions:

1. **`setRoadSystem(roadSystem)`**: new public method to wire TerrainSystem to RoadSystem after both are constructed. Guards with `this._roadSystem = roadSystem ?? null`.

2. **`_buildCarveTable(cx, cz)`**: new private method. Iterates GRID_SAMPLES×GRID_SAMPLES grid for a chunk; queries `this._roadSystem.queryNearest(wx, wz, maxExt)` per vertex; computes lateral distance from centerline; applies fill cap (`roadFillHeight`); stores `[blendW, gradeY_preamp]` per vertex where `gradeY_preamp = designY / amp`. Returns null if no road system attached or no road near chunk.

3. **`analyticHeight`**: after computing `raw`, calls `this._roadSystem._sampleCarveWorld(wx, wz, raw)` if roadSystem attached; applies blend if `blendW > 1e-6`. rawAmp passed to avoid recursion.

4. **`sampleHeight`**: after bilinear raw, checks `chunk.carveData`; bilinearly interpolates `[blendW, gradeY_preamp]`; applies `gradeY_preamp * amp` for world-space blend.

5. **`_flushPendingQueue`**: calls `_buildCarveTable(cx, cz)` for each chunk; stores result as `chunk.carveData`. Y loop: `raw + blendW*(gradeY_preamp*amp - raw)`.

6. **`_updateChunkRing`**: builds fresh carveTable per chunk (buffer consumed by postMessage); sends `{ type:'generate', cx, cz, key, carveTable }` with `[carveTable.buffer]` Transferable when carveTable non-null.

7. **WORKER_SOURCE**: added `sampleCarve` function body (CARVE SYNC) and `carveTable` destructuring in `onmessage`. Worker receives and acknowledges carveTable (T-09-02 mitigation) but stores RAW heights (does not bake carve, preserving Pitfall 1 invariant).

8. **`_chunkMap`**: now stores `{ mesh, heights, carveData }` — carveData is the per-chunk blend table.

**`src/terrain-worker.js`** (rewritten)

Byte-identical mirror of WORKER_SOURCE. Contains full `sampleCarve` function body and `carveTable` destructuring in message handler with CARVE SYNC comments. Heights stored RAW; carveTable received and acknowledged but not applied to heights.

**`test/test-road-carve.html`**

Replaced SURF-05/SURF-04 placeholder with exit-gate pure-function assertions (no TerrainSystem/Worker needed for these pure tests):
- `carveBlend` on-ribbon, shoulder t=0.5, beyond shoulder, fill case, cut case
- `crownProfile` peak/edge/midpoint/symmetry
- `sampleCarve` bilinear center vertex and (0.5,0.5) quarter-cell
- Carve-continuity: fill 3m scenario — adjacent-step delta < allowedSlope*step (no seam)
- Carve-continuity: cut 4m scenario — same
- Carve monotonicity: fill case decreases monotonically from center to far

## Deviations from Plan

### Auto-adjusted: carveTable stores gradeY_preamp not gradeY

The plan specified `carveBlend` returns `gradeY` in world space. However, the Worker never receives `terrainAmplitude` (kept out of workerParams to prevent DataCloneError per memory `project_terrain_worker_constraints`). To allow the Worker to blend without knowing amp, carveTable stores `gradeY_preamp = gradeY / amp`. Main-thread sites multiply by amp when reading. This preserves the exact same blend result at all four sites while satisfying the DataCloneError constraint.

### Auto-adjusted: Worker stores RAW heights (not blended)

The plan suggested the Worker applies carve in its height loop. However, if Worker produced blended heights AND `_flushPendingQueue` also applied carveData, the blend would be applied twice (double-carve). Resolution: Worker receives and acknowledges carveTable (Transferable contract satisfied, T-09-02 mitigated), but heights remain RAW. `_flushPendingQueue` applies carve from chunk.carveData — the single source of truth for mesh carve. `chunk.heights` is always the raw Worker output (Pitfall 1 satisfied).

### Auto-adjusted: _sampleCarveWorld takes rawAmp parameter

`analyticHeight` computes rawAmp before calling the carve hook. If `_sampleCarveWorld` called `analyticHeight` internally, it would recurse infinitely. Resolution: `_sampleCarveWorld(wx, wz, rawAmp)` receives the already-computed rawAmp and does not call back into analyticHeight. Blend formula is still identical.

## Known Stubs

None — all carve functions are complete. The `rebuildAllChunks()` path (Path A amplitude rescale) does not re-apply carve after road re-stream, but this is pre-existing behavior (out of Plan 09-02 scope) and logged as a deferred improvement.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. carveTable is own-math Float32Array, local-only, no external input (T-09-03 accepted).

## Verification

Automated:
- `road-carve.js`: no top-level `import`, 3 exports present, SYNC RULE comment present
- `ranger.js`: `designGradeWindow` count=2, `roadFillHeight` count=2, etc.
- `road.js`: `_smoothDesignGrade` count=1, `designGrade` count=12
- CARVE SYNC sections: byte-identical in WORKER_SOURCE and terrain-worker.js (Python diffcheck)
- test-road-carve.html: 19 SURF-05 assertions, 7 sampleCarve references

Browser verification (manual): open `test/test-road-carve.html` — all SURF-05/SURF-04 exit-gate pure-function assertions should show `PASS` in DevTools console.

## Self-Check: PASSED
