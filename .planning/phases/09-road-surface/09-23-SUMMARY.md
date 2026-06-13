---
phase: 09-road-surface
plan: 23
subsystem: test/harness
tags: [D4, D3, D2, gate-fixtures, headless, harness, SURF-03, SURF-04, SURF-05]
dependency_graph:
  requires: ["09-20", "09-21", "09-22"]
  provides: [D4-switchback-no-arm-flip-gate, D3-two-arms-no-undermine-gate, D2-camber-rate-gate]
  affects: [test/spline-continuity.mjs]
tech_stack:
  added: []
  patterns:
    - vendored nearest-arm selector (footprint-preference vs brute-global, mirrors D4 queryNearest)
    - vendored carve-floor cross-section evaluator (max-floor guard, mirrors D3 _buildCarveTable)
    - vendored slew-rate limiter (forward-march |dCamber/ds| ≤ slewRate, mirrors D2 _buildCamberProfile)
    - switchbackMode / twoArmsMode / camberRateMode fixture markers (parallel pattern to physicsMode/hairpinMode)
key_files:
  created: []
  modified:
    - test/spline-continuity.mjs
decisions:
  - D4 fixture: arm A coarse (5 samples, 12m gaps) + arm B dense (40 samples, 1.5m gaps) at SW_ARM_SEP=5m; query lateral offset 1.5m (inside A footprint 2.5m, outside B footprint 3.5m). Brute flips 10x due to coarse A gaps; footprint stays on A 0 flips.
  - D3 fixture: upper arm Y=8m, lower arm Y=0; footprints bounded to ½ arm_sep=12m. Max-floor guard (MAX over covering arms) ensures floor under upper arm = 7.5m (upperY - clearance); undermineDepth=0.
  - D2 fixture: S-curve control points producing curvature sign change; vendored applySlewLimit (forward-march, ±clamp, roadCamberRate=1.5°/m). Unlimited maxDCamber=14.04°/m; slew-limited=1.76°/m ≤ 2.0°/m threshold.
metrics:
  duration: ~20m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 1
---

# Phase 9 Plan 23: D4/D3/D2 Headless Gate Fixtures — Summary

**One-liner:** Three `role:'gate'` fixtures added to `test/spline-continuity.mjs` — D4 switchback proves footprint-preference arm selector never flips (brute would flip 10x), D3 two-arms proves max-floor guard keeps undermineDepth=0, D2 camber-rate proves slew limiter holds maxDCamber=1.76°/m ≤ 2.0°/m threshold — full gate set exits 0.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | D4 switchback no-arm-flip gate fixture | 21e2e79 | test/spline-continuity.mjs |
| 2 | D3 two-close-arms no-undermine gate fixture | 21e2e79 | test/spline-continuity.mjs |
| 3 | D2 camber-rate slew-limit gate fixture | 21e2e79 | test/spline-continuity.mjs |

*All three tasks committed together (one file, logically inseparable scaffolding — each task's rendering section depended on the previous tasks' new fixture array variables).*

## What Was Built

### Fixture infrastructure additions

Three new fixture mode markers added to the FIXTURES array dispatch loop:
- `switchbackMode: true` → collected into `switchbackModeFixtures`, processed by `computeSwitchbackMetrics()`
- `twoArmsMode: true` → collected into `twoArmsModeFixtures`, processed by `computeTwoArmsMetrics()`
- `camberRateMode: true` → collected into `camberRateModeFixtures`, processed by `computeCamberRateMetrics()`

Each has its own section header, column table, and contrast-line print (parallel to the existing `physicsMode`/`hairpinMode` pattern).

### D4 switchback-no-arm-flip fixture (`switchbackMode: true`)

**Vendored helpers:**
- `buildSwitchbackArms()` — builds arm A (coarse: 5 samples / 60m, z=0) and arm B (dense: 40 samples / 60m, z=SW_ARM_SEP=5m, opposite direction). Coarse arm A gaps + dense arm B ensures brute selector flips between coarse samples.
- `selectArm(armSamples, qx, qz, strategy, footprintHW)` — dual-best tracking: `extBestArm` (global minimum d2) vs `intBestArm` (minimum d2 among samples where |signedLat| ≤ footprintHW). `'footprint'` strategy prefers interior; `'brute'` ignores footprint.
- `computeSwitchbackMetrics()` — marches 61 query points along arm A at z=SW_QUERY_LATERAL=1.5m (inside arm A footprint=2.5m, outside arm B footprint since 5−1.5=3.5>2.5). Counts arm-switch events for both strategies.

**Gate condition:** `armFlipCount_footprint == 0`
**Results:** footprintFlips=0 (PASS), bruteFlips=10 (contrast confirmed — gate catches the real bug).

### D3 two-arms-no-undermine fixture (`twoArmsMode: true`)

**Vendored helper:**
- `computeTwoArmsMetrics()` — evaluates a lateral cross-section over 201 samples spanning both arm footprints. Arm A centered at u=0 (Y=8m), arm B centered at u=24m (Y=0). Each arm's footprint = TA_FOOTPRINT_HW=12m (= TA_ARM_SEP/2 = footprint-bound). Per-sample: if covered by both arms, apply max-floor guard (MAX of carveTargetA=7.5m, carveTargetB=−0.5m = 7.5m); if only one arm, use that arm's floor. Tracks `minFloorUnderA` and `worstUndermineDepth`.

**Gate condition:** `undermineDepth < TA_EPS` (0.001m)
**Results:** minFloorA=7.5000 (= requiredFloorA=7.5000), undermineDepth=0.000000 (PASS).

### D2 camber-rate gate fixture (`camberRateMode: true`)

**Vendored helpers:**
- `applySlewLimit(rawCamberRad, ds, slewRateRadPerM, clampRad)` — forward-march: target = clamp(raw, ±clampRad); delta = clamp(target−prev, ±slewRate·ds); prev = clamp(prev+delta, ±clampRad). Mirrors `_buildCamberProfile` in src/road.js (plan 09-21).
- `computeCamberRateMetrics()` — builds a catmullRomCurve from the S-curve control points, samples curvature at 1m intervals, computes unlimited camber (signed κ × CAMBER_STRENGTH, ±6° clamp), applies slew limit (CR_SLEW_RATE_DEG_M=1.5°/m), measures maxDCamber for both.

**Gate condition:** `maxDCamber_slewed ≤ MAX_DCAMBER_DEG_PER_M` (2.0°/m)
**Results:** unlimited=14.0401°/m (would FAIL), slewed=1.7573°/m (PASS). Contrast confirmed.

## Verification Results

```
node --check test/spline-continuity.mjs  →  syntax OK

node test/spline-continuity.mjs  →  exit=0

  GATE RESULT (spline metrics): PASS — 2 gate fixture(s) (gentle-baseline, tile-seam-mismatch)
  PHYSICS-SAMPLING CONTINUITY: PASS (refine maxDY=0.020 m)
  HAIRPIN INNER-EDGE FOLD GATE: PASS (innerEdgeFolds=0)
  SWITCHBACK NO-ARM-FLIP GATE (D4): footprintFlips=0 PASS | bruteFlips=10 (expected)
  TWO-ARMS NO-UNDERMINE GATE (D3): undermineDepth=0.000000 PASS
  CAMBER-RATE SLEW-LIMIT GATE (D2): slewed=1.7573°/m PASS | unlimited=14.04°/m (would fail)

  Total gate fixtures: 7 — all PASS → exit 0
```

No src/ production files modified. `git diff --stat src/` → empty.

## Deviations from Plan

**1. [Rule 1 - Bug] Initial D4 switchback geometry produced bruteFlips=0 (gate had no contrast)**

- **Found during:** Task 1 implementation
- **Issue:** First geometry (SW_ARM_SEP=24m, two parallel arms, query at z=5.5m) had the query always closer to arm A than arm B — both selectors picked arm A, bruteFlips=0. Gate passed but was vacuous (no contrast proving the fixture catches the bug).
- **Fix:** Redesigned geometry with (a) coarse arm A sampling (5 samples/60m, 12m gaps) + dense arm B sampling (40 samples/60m) to exploit the staircase gap effect; (b) SW_ARM_SEP=5m, SW_FOOTPRINT_HW=2.5m, SW_QUERY_LATERAL=1.5m to ensure query is inside arm A's footprint but outside arm B's; (c) arm B runs in opposite direction (+X/−X). Between arm A coarse samples, arm B's dense sample is geometrically closer → brute flips 10x while footprint selector stays on arm A.
- **Files modified:** test/spline-continuity.mjs
- **Commit:** 21e2e79

## Known Stubs

None — all three gate fixtures fully probe the D4/D3/D2 invariants they are named for.

## Threat Flags

None — test-only file, no new network endpoints or auth paths.

## Self-Check: PASSED

- `test/spline-continuity.mjs` modified: FOUND (commit 21e2e79)
- `node --check test/spline-continuity.mjs` → syntax OK: CONFIRMED
- `node test/spline-continuity.mjs` → exit 0: CONFIRMED
- `switchback-no-arm-flip` PASS in gate table: CONFIRMED (footprintFlips=0, bruteFlips=10)
- `two-arms-no-undermine` PASS in gate table: CONFIRMED (undermineDepth=0)
- `camber-rate` PASS in gate table: CONFIRMED (slewed=1.76°/m ≤ 2.0°/m)
- All pre-existing gate fixtures still PASS: CONFIRMED (gentle-baseline, tile-seam-mismatch, physics-sampling-continuity, hairpin)
- No src/ production files modified: CONFIRMED (`git diff --stat src/` empty)
