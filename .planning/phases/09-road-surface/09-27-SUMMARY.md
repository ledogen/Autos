---
phase: 09-road-surface
plan: 27
subsystem: road
tags: [BUG-14, grade-Y, seam-continuity, physics, carve, P2-fix]
dependency_graph:
  requires:
    - phase: 09-25
      provides: runProfile — seam-continuous gradeY by run-global arcS (the sampler both fix sites read from)
    - phase: 09-26
      provides: RoadSample/byArc/sampleRoadAt API (context for physics fix; _sampleCarveWorld uses runProfile directly)
  provides:
    - _sampleCarveWorld designY from runProfile gradeY (physics grade C0 across seams)
    - _buildCarveTable roadY from runProfile gradeY (carve grade C0 across chunk boundaries)
  affects: [src/road.js, src/terrain.js]
tech_stack:
  added: []
  patterns: [continuous-profile-grade-read, amplitude-convention-unchanged, worker-byte-identical]
key_files:
  created: []
  modified:
    - src/road.js
    - src/terrain.js
decisions:
  - "nr.arcS is run-global (BUG-10 fix in 3df47cd) — using it as the arcS key to runProfile gives C0 grade across any slice-switch: both sides of the boundary resolve to the same arcS and thus the same gradeY"
  - "roadY (world-space, post-amplitude) replaces samples[bi+1] (also world-space) in _buildCarveTable; the existing carveTargetY / amp pre-amplitude division is kept unchanged — no double-divide risk"
  - "Exterior-arm branch (enyExt) also replaced with runProfile gradeY for the same reason — height-agreement requires both branches to read the same source"
  - "runProfile out-object (09-25 optional 3rd arg) NOT wired here — flagged as perf-cache TODO in comment per design doc line 70; acceptable for now (~20 calls/frame on hot path)"
  - "No BUG-13 fill cap re-introduced (design explicitly forbids capping physics grade)"
metrics:
  duration: ~15 minutes
  completed: "2026-06-15T16:30:00Z"
  tasks: 2
  commits: 2
  files: 2
---

# Phase 9 Plan 27: P2 — BUG-14 Grade Y from Continuous Profile (Physics + Carve) — Summary

**BUG-14 closed: grade Y now reads `runProfile(arcS).gradeY` in both the physics contact surface (`_sampleCarveWorld`) and the terrain carve builder (`_buildCarveTable`), making height C0 across all tile/chunk seams by construction — no teleport, no upward-step launch.**

## What Was Built

### Task 1 — `_sampleCarveWorld` physics grade from `runProfile` (commit ebf8514)

In `src/road.js _sampleCarveWorld` (~line 1718), replaced:
```js
let designY = nr.point.y
```
with:
```js
let designY = this.runProfile(nr.arcS ?? 0, nr.runKey ?? '').gradeY
```

`nr.point.y` was derived from the nearest per-slice spline sample. At a tile boundary the "nearest" sample snapped to the new slice, producing a discrete Y step (~300 mm at Coarse Amp 150, seed 7) that caused chassis penetration into the terrain. The physics solver resolved the penetration as an upward impulse — the BUG-14 launch.

`nr.arcS` is run-global (BUG-10 fix). At a slice-switch both sides resolve to the same boundary arcS, so `runProfile(nr.arcS).gradeY` is C0 across the seam. The crown + camber + pothole fold below `designY` was left unchanged — it already keys on `nr.arcS / nr.runKey`.

### Task 2 — `_buildCarveTable` carve grade from `runProfile` (commit e188dc2)

In `src/terrain.js _buildCarveTable` (interior branch, ~line 962), replaced:
```js
const ny = samples[bi + 1]
// ...
let carveTargetY = ny + crownY + tiltY - clearanceMargin
```
with:
```js
const roadY = this._roadSystem.runProfile(arcS, runKey).gradeY
// ...
let carveTargetY = roadY + crownY + tiltY - clearanceMargin
```

`arcS = sampleArcS[biIdx]` and `runKey = sampleRunKeys[biIdx]` were already computed just below the old `ny` read — the block was reordered so `arcS`/`runKey` are available before the grade read.

The exterior-arm branch (max-floor guard) also replaced `enyExt = samples[extBi + 1]` with `roadYExt = runProfile(sampleArcS[extIdx], sampleRunKeys[extIdx]).gradeY` — same source for both branches.

**Amplitude convention:** `roadY` is world-space post-amplitude, identical to what `samples[bi+1]` was. The existing `gradeY_preamp = carveTargetY / amp` division at the carveTable write site is unchanged — no double-divide, no skip.

`terrain-worker.js` is byte-identical (reads RAW heights; carve + profile are main-thread only).

## Verification

- `node --check src/road.js` exits 0
- `node --check src/terrain.js` exits 0
- `git diff --stat src/terrain-worker.js` — no change (worker byte-identical)
- `node test/spline-continuity.mjs` — all 8 gate fixtures PASS (gentle-baseline, tile-seam-mismatch, physics-sampling-continuity, hairpin, switchback-no-arm-flip, two-arms-no-undermine, camber-rate, hairpin-fillet-enforced)
- `grep -n "nr.point.y" src/road.js` — no live code matches inside `_sampleCarveWorld` (only comments)
- `grep -n "samples\[bi + 1\]" src/terrain.js` — no non-comment matches
- `grep -n "runProfile" src/terrain.js` — shows both interior and exterior reads at lines 995 and 1026
- `grep -n "runProfile" src/road.js` — shows physics read at line 1730
- No BUG-13 fill cap introduced in either file
- carveTable gradeY_preamp (`carveTargetY / amp`) amplitude handling identical to pre-change code

## Deviations from Plan

None — plan executed exactly as written. The reorder of `arcS`/`runKey` before the grade read (mentioned in the plan action text) was straightforward since those variables were already being computed in the same block.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | ebf8514 | fix(09-27): _sampleCarveWorld designY from runProfile gradeY (BUG-14 physics) |
| 2 | e188dc2 | fix(09-27): _buildCarveTable roadY from runProfile gradeY (BUG-14 carve) |

## Performance Note (Deferred)

`runProfile` allocates one `{ gradeY, camberRad, tx, tz }` object per call. On the hot physics path (~20 calls/frame: 4 wheels × ~5 substeps), this is the primary allocation chokepoint for the P0 profile infrastructure. The 09-25 `runProfile(arcS, runKey, out)` optional out-object parameter was designed to eliminate this. Wiring it here was deferred as premature optimization (acceptable for now; flagged per design doc line 70). When profiled as measurable, pass a module-scope reusable object at the `_sampleCarveWorld` call site.

## Self-Check

Files modified:
- src/road.js — FOUND, node --check PASS
- src/terrain.js — FOUND, node --check PASS

Commits:
- ebf8514 — verified in git log
- e188dc2 — verified in git log

## Self-Check: PASSED
