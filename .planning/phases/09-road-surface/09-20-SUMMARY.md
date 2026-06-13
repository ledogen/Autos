---
phase: 09-road-surface
plan: 20
subsystem: road
tags: [D5, D4, ring-hysteresis, arm-disambiguation, queryNearest, carve, stateless]
dependency_graph:
  requires: ["09-19"]
  provides: [roadTileKeepMargin-hysteresis, D4-arm-disambiguation-queryNearest, D4-arm-disambiguation-carve]
  affects: [src/road-mesh.js, src/road.js, src/terrain.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns:
    - D5 ring hysteresis (keep-radius > build-radius via expanded keepSet)
    - D4 stateless arm-disambiguation (dual-best interior/exterior probe, no signature change)
    - stride-5 flat sample array (x,y,z,tx,tz) for carve footprint-aware nearest selection
key_files:
  created: []
  modified:
    - src/road-mesh.js
    - src/road.js
    - src/terrain.js
    - data/ranger.js
    - src/debug.js
decisions:
  - D5: syncToChunkRing computes keepSet = active ring expanded by roadTileKeepMargin tiles; only disposes tiles outside keepSet; build/enqueue still uses original activeKeys (keep-radius > build-radius)
  - D4: queryNearest tracks intBest* (interior to footprint) and extBest* (globally nearest) in parallel; prefers interior; getTangentAt called only on new interior candidates; signature and return shape unchanged
  - D4: collectChunkSplinePoints widens stride 3→5 to carry tangent XZ per sample; _buildCarveTable inner loop applies same dual-best arm rule as queryNearest
metrics:
  duration: ~20m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 9 Plan 20: D5 Ring Hysteresis + D4 Stateless Arm-Disambiguation — Summary

**One-liner:** D5 keep-radius hysteresis (roadTileKeepMargin expands the dispose ring ~1 tile) + D4 footprint-preference arm-disambiguation in both queryNearest and the carve path, eliminating tile-edge thrash (#2) and invisible-ramp launch (#3) with physics signature unchanged.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | D5 ring hysteresis — keep-radius larger than build-radius | 24de076 | src/road-mesh.js, data/ranger.js, src/debug.js |
| 2 | D4 stateless arm-disambiguation in queryNearest (lateral/interior projection) | 15dfa1f | src/road.js |
| 3 | D4 arm-disambiguation in collectChunkSplinePoints + _buildCarveTable carve path | 347a327 | src/road.js, src/terrain.js |

## What Was Built

### D5 Ring Hysteresis (src/road-mesh.js + data/ranger.js + src/debug.js)

`syncToChunkRing` now computes a `keepSet` (the active ring expanded by `roadTileKeepMargin` tiles in each direction) before the dispose pass. Built tiles are disposed only when they fall outside `keepSet`, not the original `activeKeys`. The enqueue/build pass still uses the original `activeKeys` — keep-radius > build-radius.

- `ranger.js`: `roadTileKeepMargin: 1` (default 1 tile, D5 comment explaining purpose)
- `road-mesh.js`: min/max tile XZ computed from activeKeys; `keepSet` built by expanding by `margin | 0` tiles in all four directions; pending queue also pruned against `keepSet`
- `debug.js`: "Keep Margin (tiles)" slider (0–3, step 1) in Road Surface sub-folder, firing `fireSurface` for prompt uptake

### D4 Stateless Arm-Disambiguation in queryNearest (src/road.js)

`_scratchTan` module-scope scratch vector added (mirrors `_scratchPt` rationale — avoids per-call Vector3 in hot path).

`probeSpline` now tracks two parallel bests:
- `extBestD2/extBest*` — globally nearest sample (existing behavior)
- `intBestD2/intBest*` — nearest sample whose footprint the query is interior to (`|signedLat| ≤ footprintHW = roadHalfWidth + roadShoulderWidth`)

`getTangentAt` is called only when `d2 < intBestD2` (new interior candidate found) — rare, bounded by `intBestD2` not `extBestD2`. After the tile scan, if any interior candidate was found, it wins; otherwise extBest (existing behavior) wins.

`queryNearest` signature and return shape `{ point, tangent, runKey, arcS, spline }` are unchanged — physics stays a pure 2D height field (D4 contract).

### D4 Consistent Arm Selection in carve (src/road.js + src/terrain.js)

`collectChunkSplinePoints` stride widened from 3 to 5: each entry is now `[x, y, z, tx, tz]` where `(tx, tz)` is the unit tangent from `getTangentAt` at that arc position. Tangent data is computed in the pre-loop (outside vertex loop), preserving the PERF CONTRACT.

`_buildCarveTable` inner loop:
- `STRIDE = 5` constant declared pre-loop
- `carveFootprintHW` computed pre-loop (same formula as queryNearest)
- Dual-best tracking (`extBi / intBi`) mirrors queryNearest's D4 rule exactly
- `signedLat = (-sdx) * tz - (-sdz) * tx` (consistent sign convention with queryNearest)
- `bi = intBi` if interior found, else `extBi` — carve and physics pick the same arm at switchbacks

PERF CONTRACT fully preserved: zero `getPointAt` / zero `queryNearest` / zero arrow-closure allocations in the inner vertex loop.

## Verification Results

```
node test/spline-continuity.mjs  →  exit 0

  GATE RESULT (spline metrics): PASS — 2 gate fixture(s) all within thresholds
    gentle-baseline          → PASS
    tile-seam-mismatch       → PASS
  PHYSICS-SAMPLING CONTINUITY: PASS (refine maxDY=0.020 m <= 0.05 m)
  HAIRPIN INNER-EDGE FOLD GATE: PASS (innerEdgeFolds=0)

node --check src/road.js src/road-mesh.js src/terrain.js src/debug.js data/ranger.js → OK
git diff --stat src/terrain-worker.js → (empty — untouched)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all three D5/D4 mechanisms are fully wired.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/road-mesh.js` modified: FOUND (commit 24de076) — keepSet logic, pending queue pruning
- `data/ranger.js` modified: FOUND (commit 24de076) — `roadTileKeepMargin: 1`
- `src/debug.js` modified: FOUND (commit 24de076) — "Keep Margin (tiles)" slider
- `src/road.js` modified: FOUND (commits 15dfa1f, 347a327) — `_scratchTan`, dual-best probe, stride-5 collectChunkSplinePoints
- `src/terrain.js` modified: FOUND (commit 347a327) — STRIDE=5, dual-best inner loop
- `src/terrain-worker.js` untouched: CONFIRMED (git diff --stat empty)
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- `roadTileKeepMargin` in ranger.js: FOUND (2 occurrences: declaration + comment)
- `roadTileKeepMargin` in road-mesh.js: FOUND (3 occurrences)
- `intBestSpline` in road.js: FOUND (D4 interior-best tracking)
- `signedLat` / `interior` / `D4` in road.js: FOUND (18 occurrences)
- Return shape `{ point, tangent, runKey, arcS, spline }` unchanged: CONFIRMED (line 575)
