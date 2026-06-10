---
phase: 08-road-routing
plan: "04"
subsystem: road-routing
tags: [road, exit-gate, test-harness, D-06, ROAD-01, ROAD-02, ROAD-03, ROAD-04, valley-trunk, soft-cost-model]
dependency_graph:
  requires: [src/road.js (08-01..03), src/seed.js, test/road-test-harness.js]
  provides: [D-06 REVISED seam exit gate, ROAD-01..04 browser harnesses, D-09 locked TEST_PARAMS]
  affects: [test/road-test-harness.js, test/test-road-seam.html, test/test-road.html]
tech_stack:
  added: []
  patterns:
    - "ensureTile() return value used directly for tile access (no _getTile calls in tests)"
    - "Sparse-network skip: seam pair without road skipped rather than hard-failed; gate asserts >= 1 seam"
    - "_protoConnect(anchorA, anchorB) called directly for soft-model and switchback assertions"
    - "THREE imported at module top for Vector3 construction in ROAD-02/03 proto tests"
key_files:
  created: []
  modified:
    - test/road-test-harness.js
    - test/test-road-seam.html
    - test/test-road.html
decisions:
  - "D-09 TEST_PARAMS: retired maxRoadGrade 0.12 / routeGridSize / roadSlopePenalty / roadAltWeight — replaced with locked wDist/wAlt/wGrade/wOver/wTurn plus maxRoadGrade 0.15"
  - "Seam gate sparse-skip: road-free tile pairs skipped (not failed); gate still requires >= 1 seam checked"
  - "ROAD-02 soft model: hard-grade-block assertion removed per D-02 REVISED; replaced with non-empty finite network + _protoConnect never-returns-null assertion"
  - "ROAD-03 switchback: _protoConnect with mockCoarseHeight (50% ramp) checks lateral X-extent > PROTO_CELL (10 m)"
metrics:
  duration: "5m"
  completed: "2026-06-10T05:25:28Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 3
---

# Phase 8 Plan 04: Refresh Exit-Gate Harnesses — D-06 REVISED + ROAD-01..04

**One-liner:** Browser exit-gate harnesses refreshed to the valley-trunk architecture — TEST_PARAMS carries locked D-09 cost weights, seam gate skips sparse tiles and asserts C0/C1 on sliced splines, and ROAD-01..04 target the new network API with soft-model and switchback assertions replacing the retired per-tile router calls.

## What Was Built

### `test/road-test-harness.js` — D-09 locked cost params (Task 1)

Replaced the old Phase-8 routing fields of `TEST_PARAMS` with the locked D-09 cost-model params:

**Old (retired):**
- `maxRoadGrade: 0.12` — hard 12% cap
- `routeGridSize: 16` — per-tile A* grid size
- `roadSlopePenalty: 50` — quadratic slope cost
- `roadAltWeight: 0.1` — valley-seeking weight

**New (D-09 locked):**
- `maxRoadGrade: 0.15` — soft 15% target (over-cap penalty kicks in above this)
- `roadWDist: 1` — directness weight
- `roadWAlt: 0.85` — valley-seeking altitude weight (stay low)
- `roadWGrade: 400` — quadratic grade penalty (gentle discouragement)
- `roadWOver: 8000` — soft over-cap penalty (expensive but finite — never hard-blocks)
- `roadWTurn: 120` — per-45° turn penalty (long straights + true switchbacks)

Coarse-layer locked values (Phase 7) and `assert` / `mockCoarseHeight` unchanged.
`mockCoarseHeight` comment updated to reference 15% soft target instead of 12% hard limit.

### `test/test-road-seam.html` — D-06 REVISED seam exit gate (Task 1)

Retargeted from the old `_getTile`-based API to the public `ensureTile` return value:

- Uses `ensureTile(tX, tZ)` and stores the returned tile objects in a local Map — no `_getTile` calls
- **Sparse-network skip**: if a tile pair has no road spline, logs a skip message and continues rather than hard-failing (valid — the valley-trunk network does not cover every tile)
- **Gate guards**: `assert('D-06 EXIT GATE: at least one seam was checked', totalSeams >= 1)` ensures the gate is not vacuously passing on a fully sparse network
- Determinism test uses `ensureTile()` return values directly for both instances
- No references to `_seamPoint`, `_deriveEdgeWaypoints`, `_routeTile`, or `_getTile`

**Why C0/C1 hold on the sliced splines:** Both adjacent tiles compute the shared boundary point identically (pure function of the boundary index, not the tile) — `getPoint(1.0)` of tile A and `getPoint(0.0)` of tile B return the same Vector3 by construction. The matching interior control points keep tangents aligned for C1.

### `test/test-road.html` — ROAD-01..04 against valley-trunk API (Task 2)

Full rewrite of all assertions against the new network API:

**ROAD-01 Determinism:**
- Asserts `_tileCache.size` equal across two same-seed instances
- Asserts `spline.getPoint(0.5)` distance < 1e-6 across two instances  
- Asserts `queryNearest(32, 32)` result identical across two instances (or both null)
- Removed: `_deriveEdgeWaypoints`, `_getTileWaypointsOnly`, `_getTile` calls

**ROAD-02 / D-09 Soft Model:**
- Asserts network non-empty (`_tileCache.size >= 1`) after 3×3 stream
- Asserts all tile spline midpoints finite (no degenerate Infinity control points)
- Asserts `_protoConnect(anchorA, anchorB)` returns `wps.length >= 2` (never no-path)
- Asserts all `_protoConnect` waypoints finite (soft cost → finite g-scores)
- **Removed**: the old hard-grade-block assertion (contradicts D-02 REVISED)

**ROAD-03 Switchback:**
- Injects `mockCoarseHeight` (50% grade ramp) via constructor override
- Calls `_protoConnect(anchorA, anchorB)` where anchors span Z=0 to Z=200 (100 m altitude gain)
- Asserts lateral X-extent > 10 m (PROTO_CELL) — proves the router detours laterally rather than climbing straight up the 50% ramp
- Removed: `_getTileWaypointsOnly` waypoint grade loop (hard-grade check, contradicts D-09)

**ROAD-04 Query:**
- `ensureTile` returns non-null, idempotent (same reference)
- `getPointAt(0.5)` finite, `getTangentAt(0.5)` unit length
- `queryNearest(32, 32)` non-null, unit tangent, finite point

**D-06 Seam (folded):**
- Updated to match test-road-seam.html: sparse-skip, assert >= 1 seam, ensureTile return values

**No-recursion:**
- Rewritten to use `ensureTile` instead of `_getTile`

**Three.js import added** at module top level (needed for `new THREE.Vector3()` in ROAD-02/03 proto connection tests).

## Deviations from Plan

None — plan executed as written. All automated verify commands passed.

## Threat Surface Scan

No new threat surface introduced. These are browser-only test harnesses:
- No network endpoints, file writes, or user-controlled data
- `_protoConnect` call is read-only (returns waypoints, does not modify scene)
- All assertions are pure reads on already-constructed objects

## Known Stubs

**Spur branch logic** — inherited from plans 01/02/03. `spurProbability: 0.15` in TEST_PARAMS is present but no spur generation is implemented. Trunk routing is complete; spurs deferred per D-01 (dropped from Phase 8 scope per 08-04-PLAN.md trim). This does not affect any exit-gate assertion.

## Verification Status

### Automated (all PASS):

**Task 1:**
- PASS: roadWAlt in harness
- PASS: no retired params (routeGridSize, roadSlopePenalty, roadAltWeight)
- PASS: C0 assertion present in seam test
- PASS: ensureTile present in seam test
- PASS: no retired symbols (_routeTile, _seamPoint, _deriveEdgeWaypoints, _getTile)

**Task 2:**
- PASS: no retired symbols in test-road.html
- PASS: queryNearest present
- PASS: switchback present
- PASS: determinism present
- PASS: _protoConnect used for switchback
- PASS: ensureTile present
- PASS: soft model assertion present

### Browser verification required (Three.js requires HTTP server):

Run: `python3 test/nocache-server.py 8138`

Load `http://127.0.0.1:8138/test/test-road-seam.html`:
```
PASS: D-06 seam C0 (-1,-1)→(0,-1): dist=...m < 0.01m
PASS: D-06 seam C1 (-1,-1)→(0,-1): angle=...° < 5°
[... C0/C1 assertions for road-bearing seams ...]
PASS: D-06 EXIT GATE: at least one seam was checked (network not fully sparse)
--- Seam continuity summary ---
  Seams checked: N  (skipped sparse: M)
  Max tangent angle at seam: X.XX°
  EXIT GATE D-06: PASS
PASS: D-06 EXIT GATE: all checked seams pass C0 (<0.01 m) and C1 (<5°)
PASS: D-06 determinism: tile(0,0) spline exists on both instances
PASS: D-06 determinism: same seed → same boundary tangent on tile(0,0) (diff < 1e-9)
--- test-road-seam.html complete ---
```

Load `http://127.0.0.1:8138/test/test-road.html`:
```
PASS: harness loads
PASS: ROAD-01 determinism: ...
PASS: ROAD-02 soft model: ...
PASS: ROAD-03 switchback: ...
PASS: ROAD-04 queryNearest: ...
PASS: D-06 EXIT GATE: ...
--- Road routing test suite complete ---
```

## Self-Check

### Files exist:
- FOUND: test/road-test-harness.js
- FOUND: test/test-road-seam.html
- FOUND: test/test-road.html
- FOUND: .planning/phases/08-road-routing/08-04-SUMMARY.md

### Commits exist:
- e3ac656 feat(08-04): update TEST_PARAMS to D-09 cost model; retarget seam exit gate to valley-trunk splines
- dc3c256 feat(08-04): rewrite test-road.html against valley-trunk API — ROAD-01..04 + soft model + switchback

## Self-Check: PASSED
