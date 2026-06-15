---
phase: 09-road-surface
plan: 26
subsystem: road
tags: [road-query-api, RoadSample, byArc, sampleRoadAt, seam-continuity, P1-api]
dependency_graph:
  requires:
    - phase: 09-25
      provides: runProfile — seam-continuous gradeY/camberRad/tx/tz by arc-length (the P0 foundation byArc reads from)
  provides:
    - RoadSample typedef (JSDoc @typedef) — contract for all road-surface consumers
    - byArc(runKey, arcS, lateralSigned?) — P0-backed geometry for ribbon/carve/physics callers that already have arcS
    - sampleRoadAt(wx, wz, radiusM?) — world-space query; queryNearest as projector, geometry from runProfile
  affects: [src/road.js, 09-27, 09-28, 09-29, 09-30]
tech-stack:
  added: []
  patterns: [single-road-query-surface, projector-pattern, run-frame-vs-world-frame-camber]
key-files:
  created: []
  modified:
    - src/road.js
key-decisions:
  - "byArc exposes raw run-frame camberRad; sampleRoadAt applies camberSign to put camber into world/slice frame — matches _sampleCarveWorld contract"
  - "sampleRoadAt uses queryNearest only as PROJECTOR (finds runKey+arcS); nr.point.y is never used for gradeY — all geometry from runProfile (P0)"
  - "blendW threshold (halfWidth + shoulderWidth) kept identical to _sampleCarveWorld off-road reject so physics and new API agree on corridor boundary"
  - "Cache chokepoint (per-wheel result reuse across substeps) noted in sampleRoadAt comment but NOT built in P1 — deferred to avoid premature optimization"
  - "surfaceType='asphalt' hook carried on every RoadSample with no friction/tier logic — seam for FEAT-03 dust / audio / junction elevation to slot in"

requirements-completed: [SURF-04, SURF-05]

duration: ~20 min
completed: "2026-06-15T16:00:00Z"
tasks: 2
files: 1
---

# Phase 9 Plan 26: P1 Road-Query API (RoadSample + byArc + sampleRoadAt) — Summary

**`RoadSample` struct + `byArc(runKey,arcS)` + `sampleRoadAt(x,z)` in road.js — queryNearest demoted to projector, all geometry reads from the P0 seam-continuous runProfile, giving every consumer a single surface that can't re-fragment.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-15T15:40:00Z
- **Completed:** 2026-06-15T16:00:00Z
- **Tasks:** 2 (committed together in one feat commit)
- **Files modified:** 1

## Accomplishments

- `RoadSample` JSDoc typedef defines the public contract: `{ onRoad, runKey, arcS, lateralSigned, gradeY, tangent, camber, crown, blendW, surfaceType }`
- `byArc(runKey, arcS, lateralSigned=0)` allocates and returns a RoadSample reading all geometry (gradeY, camberRad, tx/tz) from `runProfile` — the P0 seam-continuous arc-indexed cache; crown from `crownProfile()`; blendW from half-width/shoulder thresholds
- `sampleRoadAt(wx, wz, radiusM?)` world query: calls `queryNearest` as projector only (for runKey+arcS+camberSign+point/tangent for lateral derivation), applies camberSign to put camber in world/slice frame, delegates all geometry to `byArc`
- Off-road reject threshold identical to `_sampleCarveWorld` (|lat| > halfWidth + shoulderWidth) so no corridor boundary disagreement
- `terrain-worker.js` untouched (constraint met)
- All 8 spline-continuity gate fixtures PASS

## Task Commits

Both tasks were implemented in a single edit and committed atomically:

1. **Task 1: Define RoadSample + byArc** — included in `0dfce70`
2. **Task 2: sampleRoadAt** — included in `0dfce70` (same commit; implementations are tightly coupled)

| Task | Hash | Message |
|------|------|---------|
| 1+2 | 0dfce70 | feat(09-26): add RoadSample typedef + byArc(runKey, arcS) — P1 road-query API foundation |

## Files Created/Modified

- `src/road.js` — Added `RoadSample` @typedef (lines ~2155-2169), `byArc` method (~2186), `sampleRoadAt` method (~2250); 127 lines inserted

## Decisions Made

- **byArc exposes run-frame camber, sampleRoadAt applies camberSign:** `byArc` returns `prof.camberRad` unchanged so callers with direct runKey+arcS (ribbon, carve) can apply their own camberSign. `sampleRoadAt` applies `nr.camberSign` before returning so its callers get world/slice frame automatically — mirrors the existing `_sampleCarveWorld` contract.
- **queryNearest as pure projector:** `sampleRoadAt` extracts only `(runKey, arcS, camberSign, point, tangent)` from `queryNearest`; `nr.point.y` is never used for gradeY — the geometry comes exclusively from `runProfile` (P0). This is the core anti-fragmentation invariant.
- **Cache chokepoint deferred:** Per-wheel result caching across substeps noted in JSDoc comment on `sampleRoadAt` (design intent from 09-CONTINUOUS-PROFILE-DESIGN.md line 70) but not built in P1 to stay in scope.

## Deviations from Plan

None — plan executed exactly as written. Both tasks were implementable in a single edit; separate commits were not required as both methods form one cohesive API unit. The acceptance criteria (node --check, grep checks, gate fixtures) all pass.

## Issues Encountered

None.

## Verification

- `node --check src/road.js` exits 0
- `node test/spline-continuity.mjs` all 8 gate fixtures PASS (gentle-baseline, tile-seam-mismatch, physics-sampling-continuity, hairpin, switchback-no-arm-flip, two-arms-no-undermine, camber-rate, hairpin-fillet-enforced)
- `grep -n "byArc" src/road.js` shows method at line 2186
- `grep -n "sampleRoadAt" src/road.js` shows method at line 2250
- RoadSample `@typedef` present with all 10 fields including surfaceType and onRoad hooks
- byArc reads gradeY/camber/tangent from `runProfile` (P0) — no per-tile spline or nr.point.y access
- `git diff --stat src/terrain-worker.js` empty

## Next Phase Readiness

- P2 (BUG-14): `_sampleCarveWorld` and `_buildCarveTable` can now use `byArc` / `runProfile(arcS).gradeY` instead of `nr.point.y` — the API seam is ready
- P3 (BUG-12): `sweepRibbon` can call `byArc(runKey, arcS).tangent` instead of per-slice spline tangent
- P4 (BUG-10): cross-run camber stitch builds on the same `runProfile`/`camberProfile` infrastructure
- No blockers for downstream plans

---
*Phase: 09-road-surface*
*Completed: 2026-06-15*

## Self-Check: PASSED

Files:
- src/road.js: FOUND (node --check PASS)
- 09-26-SUMMARY.md: FOUND (this file)

Commits:
- 0dfce70: FOUND (feat(09-26) commit verified in git log)
