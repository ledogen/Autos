---
phase: 09-road-surface
plan: 21
subsystem: road
tags: [D2, camberProfile, slew-rate, ribbon, physics, generation-invalidation]
dependency_graph:
  requires: ["09-19", "09-20"]
  provides: [camberProfile-method, roadCamberRate-param, ribbon-D2-wired, physics-D2-wired]
  affects: [src/road.js, src/road-mesh.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns:
    - D2 one-camber-profile-per-run (cached Map keyed by runKey + generation)
    - slew-rate limiting (forward-march along continuous arc, °/m)
    - O(log N) binary-search interpolation (allocation-free module helper)
key_files:
  created: []
  modified:
    - src/road.js
    - src/road-mesh.js
    - data/ranger.js
    - src/debug.js
decisions:
  - D2: camberProfile(arcS, runKey) builds once per canonical run — walk network points → signedCurvature → ±6° clamp → forward slew-rate limit (roadCamberRate °/m); result cached in _camberProfileCache Map; invalidated when this._generation changes (D1)
  - D2: _interpolateCamber module-scope helper (binary search + linear interp, no allocation) used by camberProfile for O(log N) query
  - D2: sweepRibbon replaces per-vertex _splineCurvatureSigned→camberStrength→clamp with this._road.camberProfile(arcS, runKey); arcS already computed in loop
  - D2: _sampleCarveWorld replaces second queryNearest(wx+tx*eps) camber estimate with this.camberProfile(centerlineArcS, nr.runKey); centerlineArcS shared with pothole keying
  - roadCamberRate: 1.5 °/m default (≤ harness gate MAX_DCAMBER_DEG_PER_M=2.0)
metrics:
  duration: ~25m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 9 Plan 21: D2 One Rate-Limited camberProfile Per Canonical Run — Summary

**One-liner:** `camberProfile(arcS, runKey)` builds the slew-rate-limited banking profile once per canonical run (signed κ → ±6° clamp → forward °/m limit), cached via D1 generation counter; ribbon sweep and physics `_sampleCarveWorld` both read it — visual == physics banking, clamp-flip spike at curvature zero-crossings eliminated.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | camberProfile(arcS, runKey) — slew-limited D2 per-run camber cache | 7f62f21 | src/road.js, data/ranger.js, src/debug.js |
| 2 | Ribbon sweepRibbon reads camberProfile (replace per-vertex instantaneous camber) | a0f767b | src/road-mesh.js |
| 3 | Physics _sampleCarveWorld reads camberProfile (replace second queryNearest) | 08ea215 | src/road.js |

## What Was Built

### `_interpolateCamber` module helper (src/road.js)

Module-scope function (above the class, no `this`): binary search + linear interpolation on `{ arcPos[], camberRad[] }` profile arrays. O(log N), allocation-free. Used by `camberProfile()` to avoid per-query closure allocation.

### `_buildCamberProfile(runKey)` (src/road.js)

Walks the `this._network.get(runKey).points` control-point polyline:
1. Computes arc positions (`arcPos[i]`) from chord lengths.
2. For each point i≥1: tangent T0 = pts[i-1]→pts[i], T1 = pts[i]→pts[i+1] (boundary: repeat T0); calls `signedCurvature(t0x,t0z,t1x,t1z,effectiveDs)` (imported from road-carve.js); raw = `camberStrength * kappa`; clamped to ±6° (`MAX_CAMBER = 6*(π/180)`).
3. Forward-marches slew-rate limit: `|camberRad[i] - camberRad[i-1]| ≤ slewRateRadPerM * ds` where `slewRateRadPerM = roadCamberRate * π/180`.
4. Returns `{ arcPos: number[], camberRad: number[] }`.

O(N) build, called once per run per generation.

### `camberProfile(arcS, runKey)` public method (src/road.js)

Lazy-inits `this._camberProfileCache` (Map). Checks cached entry's `generation` vs `this._generation` (D1); rebuilds on mismatch via `_buildCamberProfile`. Delegates to `_interpolateCamber`. Returns 0 if runKey is empty or network entry missing.

### `roadCamberRate` param (data/ranger.js)

`roadCamberRate: 1.5` (°/m) — default chosen to be within the harness gate `MAX_DCAMBER_DEG_PER_M=2.0`. D2 comment names the purpose and the constraint.

### Road Surface slider (src/debug.js)

`'Camber Rate (°/m)'` slider (0.1–4.0, step 0.1) in the Road Surface sub-folder, firing `fireSurface` (`onRoadSurfaceChange`). A full road rebuild is required on change because the camberProfile cache must be invalidated and rebuilt.

### sweepRibbon wiring (src/road-mesh.js)

In the per-section loop: `arcS = arcSOffset + u * arcLen` is now computed **before** the camber line (previously it was after). The old block:
```js
const signedKappa = this._splineCurvatureSigned(spline, u, arcLen)
const rawCamber   = camberStrength * signedKappa
const camberAngle = Math.max(-MAX_CAMBER_RAD, Math.min(MAX_CAMBER_RAD, rawCamber))
```
replaced with:
```js
const camberAngle = this._road.camberProfile(arcS, runKey)
```
`camberStrength` local var removed (now consumed inside camberProfile). `_splineCurvatureSigned` method kept defined but no longer called. `tiltY = uLat * Math.sin(camberAngle)` and `vertsPerSection = 13` unchanged.

### _sampleCarveWorld wiring (src/road.js)

Old second `queryNearest(wx + tx * eps, wz + tz * eps, maxExt + eps)` camber estimate block (6 lines including eps, nrAhead, signedKappa, raw, MAX_CAMBER, clamp) replaced with:
```js
const centerlineArcS = (nr.arcS ?? 0) + (nr.arcSOffset ?? 0)
const camberAngle = this.camberProfile(centerlineArcS, nr.runKey ?? '')
```
`centerlineArcS` extracted before the camber block and reused in the pothole block below (deduplication). `camberStrength` local var removed. The redundant ahead-probe is gone — one fewer `queryNearest` call per physics sample (hot-path perf win).

## Verification Results

```
node --check src/road.js src/road-mesh.js data/ranger.js src/debug.js  →  SYNTAX OK

node test/spline-continuity.mjs  →  EXIT: 0

  GATE RESULT (spline metrics): PASS — 2 gate fixture(s) all within thresholds
    gentle-baseline    → PASS
    tile-seam-mismatch → PASS
  PHYSICS-SAMPLING CONTINUITY: PASS (refine maxDY=0.020 m <= 0.05 m)
  HAIRPIN INNER-EDGE FOLD GATE: PASS (innerEdgeFolds=0)

git diff --stat src/terrain-worker.js  →  (empty — untouched)
```

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed as specified.

The only minor implementation choice not specified: `camberStrength` local vars removed from both `sweepRibbon` and `_sampleCarveWorld` (now consumed inside `camberProfile`) and replaced with clarifying comments. This is a straightforward clean-up consistent with the plan's intent, not a deviation.

## Known Stubs

None — camberProfile is fully wired. The `_camberProfileCache` lazy-init (null until first call per RoadSystem instance) is intentional startup behavior, not a stub.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/road.js` modified (Task 1+3): FOUND (commits 7f62f21, 08ea215)
  - `_interpolateCamber` module function: CONFIRMED
  - `_buildCamberProfile(runKey)` method: CONFIRMED
  - `camberProfile(arcS, runKey)` public method: CONFIRMED
  - `_camberProfileCache` lazy-init: CONFIRMED
  - second queryNearest camber block removed: CONFIRMED (grep nrAhead returns empty)
- `data/ranger.js` modified (Task 1): FOUND (commit 7f62f21) — `roadCamberRate: 1.5`
- `src/debug.js` modified (Task 1): FOUND (commit 7f62f21) — 'Camber Rate (°/m)' slider
- `src/road-mesh.js` modified (Task 2): FOUND (commit a0f767b) — camberProfile called, _splineCurvatureSigned not called from sweepRibbon
- `src/terrain-worker.js` untouched: CONFIRMED (git diff --stat empty)
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- `camberProfile` in road.js: FOUND (10 occurrences)
- `camberProfile` in road-mesh.js: FOUND (3 occurrences — comment + call)
- `roadCamberRate` in ranger.js: FOUND (3 occurrences — declaration + comment)
- `roadCamberRate` in debug.js: FOUND (2 occurrences — slider + comment)
