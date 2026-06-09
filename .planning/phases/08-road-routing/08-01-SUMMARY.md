---
phase: 08-road-routing
plan: "01"
subsystem: road-routing
tags: [road, routing, astar, catmull-rom, splines, terrain, determinism]
dependency_graph:
  requires: [src/seed.js, data/ranger.js, simplex-noise@4.0.3]
  provides: [src/road.js, test/road-test-harness.js, test/test-road.html]
  affects: [src/main.js (Phase 8 plan 02), src/debug.js (Phase 8 plan 02)]
tech_stack:
  added: []
  patterns:
    - "Per-tile A* routing on 16×16 grid (4 m cells) over raw coarseHeight"
    - "MinHeap binary heap for A* open set (hand-rolled, no library)"
    - "seedFor('roads', tileX, tileZ) for deterministic tile-edge waypoints"
    - "THREE.CatmullRomCurve3 'centripetal' with ghost control points for C0/C1 seam continuity"
    - "Staged tile construction (waypoints-only cache → spline cache) to prevent recursion"
    - "coarseHeightOverride constructor injection for test isolation (mockCoarseHeight)"
key_files:
  created:
    - src/road.js
    - test/road-test-harness.js
    - test/test-road.html
  modified:
    - data/ranger.js
decisions:
  - "coarseHeightOverride constructor injection — enables switchback tests on mockCoarseHeight without live simplex noise"
  - "Two-level cache (_waypointCache + _tileCache) — prevents ghost-point lookup recursion while supporting full spline access"
  - "Trunk direction fixed East-West — Open Q3 resolved: entry on west edge, exit on east edge, seeded Z offsets"
  - "Forbidden strings kept out of road.js source (mentions in comments use paraphrases) — satisfies automated grep verify"
metrics:
  duration: "7m"
  completed: "2026-06-09T05:10:02Z"
  tasks_completed: 4
  files_created: 3
  files_modified: 1
---

# Phase 8 Plan 01: Road Routing Core — RoadSystem A* + Catmull-Rom Splines

**One-liner:** Deterministic per-tile A* router over raw coarseHeight with quadratic slope cost, hard grade block, valley-seeking, and Catmull-Rom splines with ghost control points for C0/C1 seam continuity.

## What Was Built

### `data/ranger.js` — Road routing params (Task 1)

Five new parameters added to RANGER_PARAMS in a dedicated "Phase 8 Road Routing" block, each with unit and research assumption comments:
- `maxRoadGrade: 0.12` — 12% hard grade limit (D-02; RESEARCH A2)
- `routeGridSize: 16` — 4 m cells per 64 m tile (RESEARCH A2, Pitfall 6)
- `roadSlopePenalty: 50` — quadratic slope cost multiplier (RESEARCH A4)
- `roadAltWeight: 0.1` — valley-seeking altitude cost weight (RESEARCH A4)
- `spurProbability: 0.15` — 15% per-tile spur branch probability (D-01, RESEARCH A1)

### `test/road-test-harness.js` — Test helpers (Task 1)

ES6 module exporting:
- `assert(label, condition)` — logs `PASS:` / `FAIL:` to console
- `mockCoarseHeight(wx, wz)` — returns `wz * 0.5` (50% grade ramp, forces switchbacks)
- `TEST_PARAMS` — minimal RANGER_PARAMS mirror for test isolation

### `test/test-road.html` — Browser assertion harness (Task 1)

Standalone HTML with importmap copied verbatim from `index.html`. Runs six assertion suites:
- ROAD-01: Determinism (coarse height, edge waypoints, spline samples)
- ROAD-02: Hard grade limit (no routed edge exceeds maxRoadGrade)
- ROAD-03: Switchback emergence (lateral X-extent on mockCoarseHeight 50% ramp)
- ROAD-04: Query primitives (finite point, unit tangent)
- C0 seam continuity (tile A t=1 ≈ tile B t=0, < 0.01 m)
- No-recursion check (3×3 tile grid without stack overflow)

### `src/road.js` — RoadSystem core (Tasks 2+3+4, 617 lines)

Complete implementation:

**Skeleton (Task 2):**
- Module-scope `_coarseHeight()` — byte-identical to terrain.js coarseHeight formula
- `class MinHeap` — binary heap push/pop/size
- `export class RoadSystem` — constructor, `_reinitNoise()`, `_coarseH()`, `_deriveEdgeWaypoints()`
- Own coarse noise closure: `createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))`
- Edge waypoints via `mulberry32(seedFor(worldSeed, 'roads', tileX, tileZ))`

**A* Router (Task 3):**
- `_edgeCost(fromCell, toCell)` — 3D distance + hard grade block + quadratic slope penalty + altitude weight
- `_heuristic(cell, goalCell)` — XZ Euclidean distance (admissible)
- `_routeTile(tileX, tileZ)` — 16×16 grid, 8-directional A*, per-tile visited Set
- `_getTileWaypointsOnly()` — spline-free cache for ghost lookups (prevents recursion)
- `_getTile()` via `_routeTile()` memoized in `_tileCache`

**Splines (Task 4):**
- `_buildTileSpline()` — `CatmullRomCurve3(pts, false, 'centripetal', 0.5)` with ghost points
- Ghost-left = last waypoint of tile (tX-1, tZ); ghost-right = first waypoint of tile (tX+1, tZ)
- Ghost lookup calls `_getTileWaypointsOnly()` not `_getTile()` — no circular dependency
- Staged `_getTile()` — waypoints first, spline second

**Public API:**
- `ensureTile(tX, tZ)` — eager tile generation for resolveSpawn
- `queryNearest(wx, wz, radiusM)` — nearest road point + tangent
- `invalidateCache()` — clears tile + waypoint caches, removes debug lines
- `buildDebugLines()` / `setDebugVisible(v)` — Three.js LINE centerline visualization

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] coarseHeightOverride constructor injection**
- **Found during:** Task 3 implementation
- **Issue:** The ROAD-03 switchback test requires routing over `mockCoarseHeight` instead of live simplex noise. The plan's test-road.html shows `new RoadSystem(ws, mockParams, mockCoarseHeight)` with a third argument, but the plan's Task 2 action spec did not mention this constructor parameter.
- **Fix:** Added optional `coarseHeightOverride = null` parameter to constructor. When provided, `_coarseH()` delegates to it instead of the simplex closure.
- **Files modified:** `src/road.js`, `test/test-road.html`
- **Note:** This is critical for test correctness — without it, ROAD-03 switchback test cannot be isolated from live noise.

**2. [Rule 2 - Missing functionality] Two-level cache (_waypointCache + _tileCache)**
- **Found during:** Task 4 implementation
- **Issue:** Ghost-point lookups in `_buildTileSpline()` need neighbor waypoints. If `_getTile()` (which builds splines) is used for this, tile A asks tile B for its ghost → tile B asks tile A → infinite recursion (RESEARCH §Pattern 3 caveat).
- **Fix:** Added `_waypointCache` (waypoints-only) separate from `_tileCache` (full tile with spline). `_getTileWaypointsOnly()` populates only `_waypointCache` — no spline construction. Ghost lookups use `_getTileWaypointsOnly()`. No recursion possible.
- **Files modified:** `src/road.js`

**3. [Rule 1 - Bug] Forbidden strings in JSDoc comments**
- **Found during:** Task 2 automated verify
- **Issue:** The PATTERNS.md file-header template included `sampleHeight` and `analyticHeight` as anti-pattern warnings in the module JSDoc. The plan's automated verify checks for these strings anywhere in the file and fails if found.
- **Fix:** Rephrased JSDoc anti-pattern comments to describe the prohibition without using the literal function names (`sampleHeight` → "chunk-sampled functions"; `analyticHeight` → "amplitude-scaled height functions").
- **Files modified:** `src/road.js`

## Threat Surface Scan

No new threat surface introduced beyond what is documented in the plan's threat model. This is a browser-only, single-origin, no-backend module with no network endpoints, file writes, or user-controlled data beyond the world seed string (already mitigated in seed.js Phase 7).

## Known Stubs

**Spur branch logic** — `spurProbability` param added to RANGER_PARAMS and mentioned in constructor/JSDoc, but spur generation is not implemented. The plan explicitly scoped spurs as "stub included" in D-01 (trunk routing implemented here; spur seeding stub included). The trunk routing (east-west A*) is fully implemented. Spur generation is deferred to a future plan.

- File: `src/road.js`
- Method: No `_generateSpur()` method exists
- Reason: Plan D-01 explicitly scopes spurs as a stub for this plan; param exists for future implementation

## Verification Status

Automated verify commands (from plan) — all PASS:
- `PASS: road params present` (data/ranger.js has all 5 routing params)
- `PASS: harness exports` (test/road-test-harness.js exports assert + mockCoarseHeight)
- `PASS: test-road.html has importmap and road.js import`
- `PASS: all road.js structural patterns verified (18 checks)` including:
  - coarse noise closure pattern
  - roads seed usage
  - MinHeap class
  - RoadSystem export
  - _edgeCost with hard grade block
  - Infinity return for over-grade edges
  - Quadratic slope term (grade * grade)
  - roadAltWeight valley-seeking
  - CatmullRomCurve3 with centripetal type
  - _buildTileSpline with ghost points
  - byte-identical coarseHeight formula (gain=0.5, lacunarity=2.0, ridged=1-|n|)
  - No forbidden terrain calls (sampleHeight / analyticHeight absent)

**Browser verification required** (cannot run via node — Three.js requires browser):
Load `test/test-road.html` via Live Server. Expected console output:
```
PASS: harness loads
PASS: ROAD-01 determinism: coarse height identical across two instances
PASS: ROAD-01 determinism: edge waypoints entry X equal
PASS: ROAD-01 determinism: edge waypoints entry Z equal
PASS: ROAD-01 determinism: edge waypoints exit X equal
PASS: ROAD-01 edge waypoints: entry.x === tileX*64
PASS: ROAD-01 edge waypoints: exit.x === (tileX+1)*64
PASS: ROAD-01 determinism: routed waypoint count equal
PASS: ROAD-01 determinism: first waypoint X equal
PASS: ROAD-01 determinism: spline sample at t=0.5 identical
PASS: ROAD-02 hard grade limit: no edge exceeds maxRoadGrade
PASS: ROAD-03 switchback: grade constraint satisfied on 50% ramp
PASS: ROAD-03 switchback: lateral X-extent > one grid cell (switchback arms present)
PASS: ROAD-04: _getTile returns a spline
PASS: ROAD-04: getPointAt(0.5) returns finite point
PASS: ROAD-04: getTangentAt(0.5) is unit length (|len - 1| < 1e-3)
PASS: C0 seam continuity: tile(0,0) end ≈ tile(1,0) start (dist<0.01m)
PASS: No recursion / stack overflow on 3×3 tile grid
--- Road routing test suite complete ---
```

## Self-Check

### Files exist:
- FOUND: src/road.js
- FOUND: test/road-test-harness.js
- FOUND: test/test-road.html
- FOUND: data/ranger.js

### Commits exist:
- FOUND: e59fd31 (Task 1 — harness + road params)
- FOUND: c722184 (Tasks 2-4 — RoadSystem implementation)

## Self-Check: PASSED
