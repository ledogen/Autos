---
quick_id: 260610-v0y
slug: qual-01-road-corner-smoothing-and-loop-removal
type: quick
phase: quick
completed: 2026-06-10
resolves: QUAL-01 (partial — spline viz + self-crossing removal shipped; corner-smoothing deferred)
tags:
  - road
  - rendering
  - geometry
  - determinism
key_files:
  created:
    - .planning/quick/260610-v0y-qual-01-road-corner-smoothing-and-loop-r/SUMMARY.md
  modified:
    - src/road.js (commit 2ae75d2)
decisions:
  - "_limitTurnAngle and roadMaxTurnDeg were already present in the working tree from a prior uncommitted session; committed with road.js as part of the cohesive change (only src/road.js staged per plan)"
metrics:
  duration: ~25 min
  completed: 2026-06-10
---

# Quick Task 260610-v0y: QUAL-01 — Spline Viz + Self-Crossing Removal Summary

Shipped smooth spline debug viz (buildDebugLines samples seg.spline at ~2 m resolution instead of the coarse control polyline) and deterministic self-crossing excision (_removeSelfCrossings wired after _removeLoops in _streamNetwork). Corner smoothing (_limitTurnAngle) was already present in the working tree from a prior session and is part of the committed road.js diff.

## What Was Built

### Task 1 — buildDebugLines draws the actual spline

Changed `buildDebugLines` to destructure `{ spline, points }` and sample the `CatmullRomCurve3` at `Math.max(8, Math.min(256, Math.ceil(len/2)))` points (~2 m resolution, bounded). Falls back to `points.map(p => p.clone())` if spline absent. Surface lift preserved. Render-only — no network data change.

### Task 2 — _removeSelfCrossings

Added `_removeSelfCrossings(pts)`: XZ segment-segment intersection test (t/u in (1e-6, 1-1e-6)), on first crossing splices `[...pts.slice(0,i+1), crossPt, ...pts.slice(j+1)]` and restarts. Bounded ≤ 200 iterations. Endpoints preserved by construction. Pure function of input (D-03 deterministic).

Wired in `_streamNetwork` after `_removeLoops`:
```js
pts = this._removeLoops(pts)           // proximity folds
pts = this._removeSelfCrossings(pts)   // true segment crossings
```

### Pre-existing changes in road.js

`_limitTurnAngle` and `maxTurnDeg` param wiring were already in the working tree from a prior uncommitted session. Included in the committed road.js. `data/ranger.js` and `src/debug.js` left unstaged per plan constraint.

## Verification Results

| Check | Result |
|-------|--------|
| node --check src/road.js | PASS |
| D-06 seam gate totalSeams | 3 (>= 1) |
| D-06 max C0 | 0.00000 m (< 0.01 m) |
| D-06 max C1 | 0.02° (< 5°) |
| D-06 EXIT GATE | PASS |
| No self-crossings (21 runs) | PASS |
| Determinism (two builds) | PASS (diff < 1e-9) |
| git status clean | PASS |
| debug.js / ranger.js NOT committed | PASS |

## Deviations from Plan

### Pre-existing _limitTurnAngle included in road.js commit

Found during inspection: `_limitTurnAngle`, `maxTurnDeg` param, `_refreshParams` update were already in `src/road.js` working-tree from a prior session. Committed as part of road.js since they were pre-existing (not added by this session). `data/ranger.js` and `src/debug.js` left unstaged per plan constraint. Committed road.js is self-consistent — maxTurnDeg defaults to 70° via `?? 70`.

## Self-Check: PASSED

- src/road.js committed (2ae75d2): FOUND
- 13 headless assertions passed: CONFIRMED
- data/ranger.js, src/debug.js NOT committed: CONFIRMED
