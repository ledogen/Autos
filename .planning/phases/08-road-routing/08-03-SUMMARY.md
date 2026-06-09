---
phase: 08-road-routing
plan: "03"
subsystem: road-routing
tags: [road, spawn, seam-continuity, exit-gate, D-06, D-07, resolveSpawn, tangent]
dependency_graph:
  requires: [src/road.js (08-01), src/road.js queryNearest/ensureTile (08-02), src/main.js resolveSpawn, src/seed.js]
  provides: [D-07 resolveSpawn road-graph probe, D-06 seam exit-gate test, test/test-road-seam.html]
  affects: [src/main.js, test/test-road-seam.html, test/test-road.html]
tech_stack:
  added: []
  patterns:
    - "Eager 3×3 tile ensureTile at spawn-init before queryNearest (RESEARCH Pitfall 5)"
    - "heading = atan2(tangent.x, tangent.z) for road-facing spawn orientation (D-07)"
    - "analyticHeight for spawn placement (visual surface match); coarseHeight in router (grade independence)"
    - "C0/C1 seam assert: getPoint(1.0) dist < 0.01m and getTangentAt(1.0) vs getTangentAt(0.0) angle < 5°"
key_files:
  created:
    - test/test-road-seam.html
  modified:
    - src/main.js
    - test/test-road.html
decisions:
  - "D-07 body swap: kept exact (wseed, params) → {position, heading} signature and _reseatTruckAtSpawn call site unchanged"
  - "CHUNK_SIZE imported from road.js alongside RoadSystem (already exported in 08-01)"
  - "Phase 7 terrain-only fallback preserved verbatim inside resolveSpawn — null/absent road path falls through with console.warn"
  - "D-06 seam test uses getTangentAt (arc-length uniform) not getTangent (parameter uniform) for physically meaningful angle check"
metrics:
  duration: "3m"
  completed: "2026-06-09T06:00:00Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 8 Plan 03: resolveSpawn Road Probe + D-06 Seam Exit Gate

**One-liner:** resolveSpawn body swapped to road-graph probe with tangent heading (D-07) and terrain-only fallback preserved; standalone D-06 seam-continuity exit-gate test asserts no kink (< 5°) at every 64 m tile boundary across a 3×3 grid.

## What Was Built

### `src/main.js` — resolveSpawn body swap (Task 1)

The `resolveSpawn(wseed, params)` function signature and call site in `_reseatTruckAtSpawn` are unchanged. Only the body was swapped per D-07:

- Added `CHUNK_SIZE` import from `road.js` alongside the existing `RoadSystem` import
- Body now computes `spawnSeed = seedFor(wseed, 'spawn')` and `baseX/baseZ` (±100 m formula) as before
- If `roadSystem` exists: eagerly calls `roadSystem.ensureTile(baseTX + dtx, baseTZ + dtz)` for `dtx,dtz in [-1,0,1]` (9 tiles total) before querying — this satisfies RESEARCH Pitfall 5 (lazy generation means no tiles exist at spawn init time)
- Calls `roadSystem.queryNearest(baseX, baseZ, 200)` with 200 m radius (RESEARCH Open Q4)
- On road hit: `position.y = terrainSystem.analyticHeight(x, z)` for visual surface match (router uses raw `coarseHeight` for grade; spawn placement uses `analyticHeight` so the truck rests on the rendered surface); `heading = Math.atan2(nearest.tangent.x, nearest.tangent.z)` faces down the road
- Null result or absent `roadSystem`: `console.warn` then falls through to the full Phase 7 terrain-only fallback (bounded 50-try grid sweep, `analyticNormal` grade check, `analyticHeight` placement) — entirely preserved, no code removed

### `test/test-road-seam.html` — D-06 exit-gate test (Task 2)

Standalone HTML file with importmap copied verbatim from `index.html` (Three.js r184). Two assertion suites:

**C0/C1 seam continuity across a 3x3 tile grid:**
- Generates tiles `(-1,-1)` through `(1,1)` via `ensureTile`
- For each east-west adjacent pair `(tX, tZ) to (tX+1, tZ)` (6 seams total in a 3x3 grid):
  - C0: `tileA.spline.getPoint(1.0).distanceTo(tileB.spline.getPoint(0.0)) < 0.01 m`
  - C1: `angleBetween(tileA.spline.getTangentAt(1.0), tileB.spline.getTangentAt(0.0)) < 5 degrees`
- Summary: total seams checked, max angle observed, overall PASS/FAIL — this is the D-06 EXIT GATE

**Determinism:**
- Two `RoadSystem` instances with same seed produce the same `getTangentAt(1.0)` on tile `(0,0)` (diff < 1e-9)

### `test/test-road.html` — D-06 seam assertions folded in (Task 2)

Identical C0/C1 assertions added after the existing 08-02 extension tests, so loading one file now runs the full suite: ROAD-01/02/03/04 + 08-02 API tests + D-06 seam continuity.

## Deviations from Plan

None — plan executed exactly as written. Both automated verify commands passed without any intervention.

## Threat Surface Scan

No new threat surface introduced. This plan:
- Modifies only `resolveSpawn` (init-time pure function, no network/file/user-controlled data)
- Creates browser-only dev test tooling (`test-road-seam.html`)
- Satisfies T-08-05: 3x3 eager tile generation is bounded to 9 tiles; `queryNearest` is radius-limited (200 m)
- Satisfies T-08-06: null `queryNearest` falls through to preserved terrain-only fallback (bounded 50 tries, never infinite)

## Known Stubs

**Spur branch logic** — inherited from plans 01/02. `spurProbability` param exists but no spur generation implemented. Trunk routing is complete; spurs deferred per D-01. This stub does not affect seam continuity or spawn behavior.

## Verification Status

### Automated (node verify commands — both PASS):

Task 1 (6 checks):
- PASS: signature-unchanged — function resolveSpawn (wseed, params) present
- PASS: eager-ensureTile — roadSystem.ensureTile( present
- PASS: queryNearest — roadSystem.queryNearest( present
- PASS: tangent-heading — Math.atan2([^)]*tangent present
- PASS: fallback-warn — terrain-only fallback warning present
- PASS: spawn-seed-preserved — seedFor(wseed, 'spawn') present

Task 2 (6 checks):
- PASS: tangent-A-end — getTangentAt(1.0) present in seam test
- PASS: tangent-B-start — getTangentAt(0.0) present in seam test
- PASS: 5deg-threshold — < 5 present in seam test
- PASS: D-06-label — D-06 label present in seam test
- PASS: RoadSystem — RoadSystem import present in seam test
- PASS: seam assertion folded into test-road.html — getTangentAt present in main harness

### Browser verification required (Three.js requires HTTP server):

Load `test/test-road-seam.html` via Live Server. Expected console output:
```
PASS: D-06 seam C0 (-1,-1)→(0,-1): dist=...m < 0.01m
PASS: D-06 seam C1 (-1,-1)→(0,-1): angle=...° < 5°
[... 12 seam assertions total: 6 C0 + 6 C1 ...]
--- Seam continuity summary ---
  Seams checked: 6
  Max tangent angle at seam: X.XX°
  EXIT GATE D-06: PASS
PASS: D-06 EXIT GATE: all seams C1 (no kink > 5° at any 64 m boundary)
PASS: D-06 determinism: same seed → same tangent on tile(0,0) at t=1.0
--- test-road-seam.html complete ---
```

Load `index.html`:
- Truck spawns on a visible road centerline, facing along it
- Reload same seed → same spawn position + heading

## Self-Check

### Files exist:
- FOUND: src/main.js
- FOUND: test/test-road-seam.html
- FOUND: test/test-road.html

### Commits exist:
- FOUND: 826da04 (feat — resolveSpawn road-graph probe, D-07)
- FOUND: 77579d2 (test — D-06 seam exit-gate test + main harness fold)

## Self-Check: PASSED
