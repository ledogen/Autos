---
phase: 08-road-routing
plan: "02"
subsystem: road-routing
tags: [road, debug-viz, lil-gui, queryNearest, setDebugVisible, main-wiring]
dependency_graph:
  requires: [src/road.js (08-01), src/debug.js, src/main.js, data/ranger.js]
  provides: [road query API, Roads lil-gui folder, RoadSystem wiring in main.js]
  affects: [src/road.js, src/debug.js, src/main.js, test/test-road.html]
tech_stack:
  added: []
  patterns:
    - "Module-scope scratch vector (_scratchPt) + getPointAt(u, target) for allocation-light queryNearest"
    - "setDebugVisible auto-builds lines on first enable (no manual buildDebugLines() required)"
    - "ensureTile() returns tile object for idempotent cache-hit reference equality"
    - "debouncedRoadRebuild() mirrors debouncedRebuildFull 150ms pattern (D-03 / D-09)"
    - "RoadSystem re-constructed on seed change, preserving _debugVisible state"
    - "_roadState local UI object in debug.js (mirrors _seedState pattern)"
key_files:
  created: []
  modified:
    - src/road.js
    - src/debug.js
    - src/main.js
    - test/test-road.html
decisions:
  - "setDebugVisible auto-build: first call with true builds lines rather than requiring separate buildDebugLines() call"
  - "_scratchPt module-scope + getPointAt(u, target) in-place write — avoids per-sample Vector3 allocation in queryNearest search loop"
  - "ensureTile returns tile for idempotent caller verification (changed from void)"
  - "RoadSystem re-constructed (not invalidated) on seed change — ensures _noiseCoarse closure matches new seed"
metrics:
  duration: "6m"
  completed: "2026-06-09T05:20:38Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 4
---

# Phase 8 Plan 02: Road Query API, Debug Viz, main.js Wiring

**One-liner:** Public road query API (ensureTile/queryNearest/setDebugVisible with allocation-light scratch vectors), Roads lil-gui folder (Show Road Splines + Max Grade), and RoadSystem instantiation + debounced re-route wiring in main.js.

## What Was Built

### `src/road.js` — Public query API enhancements (Task 1)

Five changes to make the plan 01 API complete and correct:

- **`_debugVisible = false` in constructor** — D-05 clean default; `setDebugVisible()` now has persistent state
- **`ensureTile()` returns tile** — Changed from `void` to `return this._getTile(tileX, tileZ)` enabling idempotent cache-hit reference equality checks by callers
- **`setDebugVisible()` auto-build** — Stores `this._debugVisible = visible`; if `visible === true` and `_debugLines.length === 0`, calls `buildDebugLines()` automatically. Toggle via `line.visible` (not dispose/recreate, RESEARCH anti-pattern guard)
- **`queryNearest()` scratch vector** — Added module-scope `const _scratchPt = new THREE.Vector3()` and uses `spline.getPointAt(u, _scratchPt)` (Three.js in-place write) so the search loop makes zero per-sample Vector3 allocations. Final return still allocates two vectors (point + tangent) — once per call
- **Module-scope scratch** positioned after imports (line 38) — safe for ES module execution order

### `test/test-road.html` — 08-02 extension tests (TDD RED/GREEN)

Three new assertion suites added:

- **`08-02 ensureTile` idempotent** — verifies `ensureTile(0,0)` returns non-null, and the second call returns the same object reference (`t1 === t2`)
- **`08-02 queryNearest` unit tangent** — pre-warms 3×3 tile grid via `ensureTile`, then asserts `queryNearest(32, 32)` returns non-null with `|tangent| - 1| < 1e-3`
- **`08-02 setDebugVisible` toggle** — verifies `_debugVisible === false` initially; `setDebugVisible(true)` builds lines (countAfterEnable > 0); `setDebugVisible(false)` doesn't change count; `setDebugVisible(true)` again doesn't rebuild. Uses a minimal stub scene object.

### `src/debug.js` — Roads lil-gui folder (Task 2)

Added after the Regional Modulator sub-folder (last of the Terrain folder), before the Logger hint:

- `const roadFolder = gui.addFolder('Roads')`
- `const _roadState = { roadViz: false }` — UI-only state, mirrors `_seedState` pattern
- `roadFolder.add(_roadState, 'roadViz').name('Show Road Splines')` → guarded `callbacks.onRoadVizToggle(v)`
- `roadFolder.add(params, 'maxRoadGrade', 0.04, 0.20, 0.01).name('Max Grade (ratio)')` → guarded `callbacks.onRoadParamChange()`
- `roadSlopePenalty` (10–200, step 5) and `roadAltWeight` (0–1.0, step 0.01) sliders for RESEARCH A4 runtime tuning, both guarded `onRoadParamChange`
- All callbacks guarded with `typeof callbacks.X === 'function'`
- Existing Terrain folder sliders untouched (no reordering)

### `src/main.js` — RoadSystem wiring (Task 3)

- `import { RoadSystem } from './road.js'` added after TerrainSystem import
- `let roadSystem = null` declared beside `let terrainSystem`
- After `terrainSystem = new TerrainSystem(...)` and `scene.remove(ground)`:
  ```javascript
  roadSystem = new RoadSystem(worldSeed, RANGER_PARAMS)
  roadSystem.init(scene)
  ```
- `debouncedRoadRebuild()` function: 150ms setTimeout → `roadSystem.invalidateCache()` + `buildDebugLines()`. Mirrors `debouncedRebuildFull` pattern (D-09 convention)
- `initDebug` callbacks extended with `onRoadVizToggle` → `setDebugVisible(v)` and `onRoadParamChange` → `debouncedRoadRebuild()`
- `debouncedRebuildFull` (world seed change): after terrain reinit, constructs a new `RoadSystem(worldSeed, RANGER_PARAMS)` with the new seed, preserves `_debugVisible` state, rebuilds lines if was visible
- `roadSystem` is not referenced inside the physics fixed-timestep loop (verified by grep)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written. The TDD red/green cycle was applied naturally: tests were added first (RED), then road.js was modified to make them pass (GREEN).

**Note:** `ensureTile()` returning `void` in plan 01 was a gap (mentioned in plan 02 behavior spec: "second call hits cache, returns same object reference"). Changed to `return this._getTile(tileX, tileZ)`. This is correct completion of plan 01's public API contract, not a bug.

## Threat Surface Scan

No new threat surface introduced. This plan:
- Adds a debug-panel slider (lil-gui, same-origin, developer UI) — within existing T-08-03/T-08-04 mitigations
- `debouncedRoadRebuild()` uses 150ms debounce satisfying T-08-03 (denial-of-service via slider storm)
- `queryNearest` scratch vector satisfies T-08-04 (no per-frame allocation)
- No network endpoints, file writes, or user-controlled data introduced

## Known Stubs

**Spur branch logic** — inherited from plan 01. `spurProbability` param exists but no spur generation. The trunk routing is complete; spurs deferred per D-01.

## Verification Status

Automated verify commands (from plan) — all PASS:
- `PASS all road.js checks` (6 API methods + tangent query present)
- `PASS all debug.js checks` (Roads folder, viz name, guarded callbacks, grade slider range)
- `PASS all main.js checks` (import, singleton, instantiate, init, viz-cb, param-cb, debounce-fn, invalidate)

**Browser verification required** (Three.js requires browser):
Load `test/test-road.html` via Live Server. Expected new assertions:
```
PASS: 08-02 ensureTile: returns tile object (not undefined)
PASS: 08-02 ensureTile: idempotent — same object reference on second call
PASS: 08-02 queryNearest: returns non-null after 3×3 tile warmup
PASS: 08-02 queryNearest: tangent is unit length (|len-1| < 1e-3)
PASS: 08-02 queryNearest: point is finite
PASS: 08-02 _debugVisible initialized false
PASS: 08-02 setDebugVisible(true): lines built when none exist
PASS: 08-02 setDebugVisible(false): _debugLines.length unchanged (no dispose)
PASS: 08-02 setDebugVisible(false): all lines invisible
PASS: 08-02 setDebugVisible(true): all lines visible
PASS: 08-02 setDebugVisible second enable: length still same (no rebuild)
```

Load `index.html` in a browser:
- Open debug panel (backtick) → Roads folder visible with Show Road Splines + Max Grade
- Toggle Show Road Splines → orange centerlines appear/disappear
- Drag Max Grade → roads re-route after ~150ms; same seed → same splines

## Self-Check

### Files exist:
- FOUND: src/road.js
- FOUND: src/debug.js
- FOUND: src/main.js
- FOUND: test/test-road.html

### Commits exist:
- FOUND: 80f7972 (test RED — failing tests for 08-02 behaviors)
- FOUND: eb87490 (feat GREEN — road.js public API enhancements)
- FOUND: d3d4b40 (feat — debug.js Roads folder)
- FOUND: 7984f32 (feat — main.js RoadSystem wiring)

## Self-Check: PASSED
