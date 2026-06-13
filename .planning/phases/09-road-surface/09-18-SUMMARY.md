---
phase: 09-road-surface
plan: 18
subsystem: road
tags: [arc-fillet, hairpin, min-turn-radius, D0, post-pass]
dependency_graph:
  requires: []
  provides: [_filletMinRadius, roadMinTurnRadius-floor, hairpin-gate]
  affects: [src/road.js, data/ranger.js, src/debug.js, test/spline-continuity.mjs]
tech_stack:
  added: []
  patterns: [arc-fillet corner rounding, ribbon inner-edge fold detection, catmull-rom harness sweep]
key_files:
  created: []
  modified:
    - src/road.js
    - data/ranger.js
    - src/debug.js
    - test/spline-continuity.mjs
decisions:
  - D0: _filletMinRadius rounds tight corners to minRadius (arc-fillet), replacing coil-excision at the canonical-run post-pass
  - D0: roadMinTurnRadius floored >= roadHalfWidth + clearanceMargin + 0.1 in _refreshParams; default changed from 45 m to 12 m
  - D0: hairpin harness gate proves swept ribbon inner edge has zero folds at R=8 m (above 5.6 m floor)
metrics:
  duration: ~25m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 9 Plan 18: D0 Arc-Fillet Minimum Turn Radius — Summary

**One-liner:** Arc-fillet pass `_filletMinRadius` rounds hairpin corners to minRadius (not excises) with minRadius floored ≥ roadHalfWidth + clearance so ribbon inner edges cannot fold.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace _limitCurvature with _filletMinRadius arc-fillet pass | 346cdab | src/road.js |
| 2 | Floor roadMinTurnRadius >= roadHalfWidth + clearance + slider range | 38f6a3d | data/ranger.js, src/road.js, src/debug.js |
| 3 | Hairpin gate fixture — ribbon inner edge does not fold | 4862c23 | test/spline-continuity.mjs |

## What Was Built

### _filletMinRadius (src/road.js)
New method replacing `_limitCurvature` at the `_streamNetwork` post-pass call site (line ~1326). For each interior vertex where the implied corner radius < minRadius, inserts a circular arc of radius = minRadius tangent to both incoming and outgoing legs:
- Computes XZ deflection angle φ using cross/dot of normalized leg unit vectors
- Tangent length = minRadius × tan(φ/2) — standard road geometry formula
- Inserts N_ARC=8 arc sample points between trim points T1 and T2
- Y elevation interpolated linearly across the arc (grade continuity)
- Pure function, deterministic, window-invariant (D0 contract)
- `_limitCurvature` kept defined but unreferenced (marked superseded by D0)

### roadMinTurnRadius floor (data/ranger.js + src/road.js + src/debug.js)
- ranger.js: default changed 45 → 12 m; comment updated to reference D0 arc-fillet
- road.js `_refreshParams`: `Math.max(roadMinTurnRadius, halfW + clearance + 0.1)` clamp so slider drags below floor are ignored
- debug.js: Min Turn Radius slider lower bound raised 20 → 6 m; comment updated to reference D0

### Hairpin gate fixture (test/spline-continuity.mjs)
- `buildHairpinPoints()`: two 50 m straight legs + 16-segment semicircle (R=8 m, arm separation 16 m)
- `sweepRibbonInnerEdge()`: sweeps ±5 m ribbon half-width along XZ right-normal; detects folds by dot-product reversal of consecutive inner-edge segments
- `computeHairpinMetrics()`: returns foldCount, armSeparation, halfWidth
- HAIRPIN INNER-EDGE FOLD GATE section printed after physics-sampling section
- Gate: inner-edge fold count == 0 — PASS (16 m arm separation vs 10 m ribbon width)

## Verification Results

```
node test/spline-continuity.mjs  →  exit=0

HAIRPIN INNER-EDGE FOLD GATE:
  hairpin | armSeparation=16.00 m | ribbonHalfWidth=5.00 m | innerEdgeFolds=0 | PASS

All prior gates still pass:
  gentle-baseline          → PASS
  tile-seam-mismatch       → PASS
  physics-sampling-continuity → PASS

node --check src/road.js, data/ranger.js, src/debug.js, test/spline-continuity.mjs → OK
git diff --stat src/terrain-worker.js → (empty — untouched)
_protoConnect/_protoAnchor → untouched
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/road.js` modified: FOUND (commits 346cdab, 38f6a3d)
- `data/ranger.js` modified: FOUND (commit 38f6a3d)
- `src/debug.js` modified: FOUND (commit 38f6a3d)
- `test/spline-continuity.mjs` modified: FOUND (commit 4862c23)
- `_filletMinRadius` count in road.js ≥ 2: FOUND (definition line 961 + call site line 1326)
- `_limitCurvature(pts` in _streamNetwork: 0 call sites (definition only at line 1104)
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- `src/terrain-worker.js` untouched: CONFIRMED
