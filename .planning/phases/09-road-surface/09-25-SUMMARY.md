---
phase: 09-road-surface
plan: 25
subsystem: road
tags: [continuous-profile, arc-sampler, seam-continuity, P0-foundation]
dependency_graph:
  requires: []
  provides: [runProfile, _buildRunProfile, RoadRunProfile-P0]
  affects: [src/road.js]
tech_stack:
  added: []
  patterns: [generation-invalidated-cache, module-scope-binary-search, single-arc-walk]
key_files:
  created: []
  modified:
    - src/road.js
decisions:
  - "Inlined camber arc-walk into _buildRunProfile (single pass fills all 5 arrays) rather than calling _buildCamberProfile, avoiding 2x arc allocation"
  - "_interpolateRunProfile added as module-scope helper: ONE binary search interpolates gradeY/camberRad/tx/tz to avoid 4x search cost on the 60 fps hot path"
  - "Optional out-object parameter on runProfile allows callers to avoid per-query allocation; defaults to allocating { gradeY, camberRad, tx, tz }"
  - "tx/tz last sample replicates the final segment tangent (same boundary convention as _buildCamberProfile's replicate pattern)"
metrics:
  duration: ~15 minutes
  completed: "2026-06-15T15:34:39Z"
  tasks: 2
  commits: 2
---

# Phase 9 Plan 25: P0 Continuous Run Profile Foundation — Summary

**One-liner:** Unified `RoadRunProfile` (gradeY + tangent + camber arc arrays) with cached O(log N) sampler `runProfile(arcS, runKey)` — seam-continuous by construction, the single source all downstream fixes hang off.

## What Was Built

### Task 1 — `_buildRunProfile(runKey)` (commit 31be0f8)

Added to `RoadSystem` in `src/road.js`. Walks the SAME `this._network.get(runKey).points` XZ arc as `_buildCamberProfile` in a SINGLE pass, filling five parallel arrays:

- `arcPos[]` — monotone XZ cumulative arc-length (metres), N entries
- `gradeY[]` — routed centerline Y per sample (metres); what physics currently reads piecemeal as `nr.point.y`, now continuous along the full run
- `camberRad[]` — slew-limited banking angle (radians); identical algorithm to `_buildCamberProfile`
- `tx[]` / `tz[]` — unit XZ forward tangent components per sample; last sample replicates the previous segment (same boundary handling as `_buildCamberProfile`)

Design constraints met:
- No new geometry source (no `getPointAt`/`getTangentAt`, no `_tiles` read)
- Pure/deterministic (D-16): no `Math.random`, no `Date`, no session state
- `_buildCamberProfile` left untouched (camberProfile still depends on it)

### Task 2 — `_interpolateRunProfile` + `runProfile(arcS, runKey, out)` (commit 16cf78b)

**`_interpolateRunProfile`** — module-scope helper (allocation-free, no `this`). ONE binary search on `arcPos`, then interpolates all four value arrays in the same interval. Avoids 4× the search cost of calling `_interpolateCamber` once per array.

**`runProfile(arcS, runKey, out)`** — public method on `RoadSystem`:
- Lazy-inits `this._runProfileCache` Map
- D1 generation invalidation: entries carry `{ generation, arcPos, gradeY, camberRad, tx, tz }`; rebuilt when `this._generation` differs (identical discipline to `camberProfile` / `_camberProfileCache`)
- Fast path: single call to `_interpolateRunProfile`, O(log N)
- Fallback: unknown/empty run returns `{ gradeY: 0, camberRad: 0, tx: 1, tz: 0 }` without throwing
- Optional `out` object lets hot callers (physics substeps) avoid per-query allocation

## Verification

- `node --check src/road.js` exits 0
- `node test/spline-continuity.mjs` all 8 gate fixtures PASS (gentle-baseline, tile-seam-mismatch, physics-sampling-continuity, hairpin, switchback-no-arm-flip, two-arms-no-undermine, camber-rate, hairpin-fillet-enforced)
- `git diff --stat src/terrain-worker.js` — no change (constraint met)
- `runProfile` and `_buildRunProfile` present in src/road.js
- Cache is `_runProfileCache`, generation-invalidated like `_camberProfileCache`

## Deviations from Plan

None — plan executed exactly as written. `_buildCamberProfile` is untouched; the inlined single-pass approach for `_buildRunProfile` was specified as preferred in the plan action text.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 31be0f8 | feat(09-25): add _buildRunProfile — gradeY/camberRad/tx/tz arc-indexed per run |
| 2 | 16cf78b | feat(09-25): add _interpolateRunProfile + runProfile — cached O(log N) per-run profile sampler |

## Self-Check

Files modified:
- src/road.js — verified present and passing `node --check`

Commits:
- 31be0f8 — verified in git log
- 16cf78b — verified in git log

## Self-Check: PASSED
