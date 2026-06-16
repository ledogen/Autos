---
slug: bug14-road-teleport-tile-seam
status: resolved
trigger: "BUG-14: on-road truck teleports ~+20m up (position step, NOT a velocity launch) when crossing a tile border. Off-road never teleports. Not fixed by Phase 9 plans 09-25..30 despite their headless gates passing."
created: 2026-06-16
updated: 2026-06-16
phase: 09-road-surface
related_plan: 09-30
---

# Debug: BUG-14 road teleport at tile seam

## Symptoms

- **Expected:** Driving on the road across a tile border is smooth — ground height (and truck Y) continuous, no jump.
- **Actual:** On-road, crossing a tile border, the truck's Y position teleports ~+20 m UP in a single physics frame. Position step, NOT a velocity launch (vy stays ~0 through the jump). Happens "maybe every time." Never happens off-road.
- **Errors:** none (no exception; silent height jump).
- **Timeline:** Pre-existing BUG-14; Phase 9 plans 09-25..30 (continuous-profile refactor) were meant to close it and their headless gates pass, but in-sim it still reproduces.
- **Reproduction:** Drive on a road across a tile boundary (CHUNK_SIZE=64). Repro scenario: seed 7, Coarse Amp 150, drive across the seam behind spawn.

## Evidence (confirmed)

- timestamp: 2026-06-16 — Log `Logs/rangersim-log-1781588600577.json`, frame t=35.100: driving −x at ~23 m/s on-road, `py` jumps 118.47 → 138.96 (+20.5 m) in one 17 ms frame; vy goes 2.27 → −0.08 (NO vertical velocity gained → position SET, not impulse). Occurs at px=−193.54 (3 frames after tile boundary crossing at px=−192.03 at t=35.033). After the jump `py` sits flat at 138.96 for ~5 frames, then gradually decreases. Steer ~0, throttle 1.0 throughout.
- timestamp: 2026-06-16 — Off-road never teleports → the discontinuity is in the ROAD carve path, not raw terrain. (analyticHeight `raw` is a window-invariant pure analytic function.)

## Root Cause (confirmed)

**`queryNearest` intBest arm-flip on streaming window shift (D5 missing)**

The fix in plan 09-27 replaced `nr.point.y` (per-slice spline Y) with `runProfile(nr.arcS, nr.runKey).gradeY` (continuous arc-indexed profile). This is correct IF `queryNearest` returns the same `runKey` on both sides of the tile seam. It does not.

When `roadSystem.update()` fires (PROTO_REGEN_MOVE=96m threshold), `_streamNetwork` clears and rebuilds `this._tiles`. If a competing road arm enters the streaming window (a different mz row, or a road whose slice is now in the search block), its slices appear in `this._tiles`. `queryNearest` with `blk=ceil(11.5/64)=1` searches a 3×3 tile block. The competing arm at gradeY≈139 has DENSER discrete samples (shorter slice → more samples/m), so its nearest discrete sample is geometrically closer to the truck than the current road arm's coarser samples — even though the competing arm's true centerline is FARTHER away.

Result: `intBest` flips to the competing road arm (runKey B at gradeY=139), `runProfile` correctly reads gradeY≈139 for that arm, `analyticHeight` returns 139, `queryContacts` sees gd=(139+r−118)>>0 (deep penetration), physics solver pushes the truck +20m in one step.

**Why 09-30 seam-grade gate missed it:** The gate tested `runProfile(arcS, 'nearest' vs 'continuous')` with a direct arcS probe — it never called `queryNearest` and never simulated a streaming window shift that changes which arm `queryNearest` selects.

**Mechanism confirmed headlessly:** `test/spline-continuity.mjs` `window-shift-arm-flip` gate:
- Arm A (gradeY=118, 5 coarse samples) vs Arm B (gradeY=139, 40 dense samples), both within footprintHW=7.5m
- Without hysteresis (D4 only): 25 flips, max gradeY jump = 21m
- With hysteresis (D5): 0 flips, 0m jump

## Fix Applied

**D5 hysteresis in `queryNearest` (`src/road.js`)**

- `queryNearest(wx, wz, radiusM=200, preferRunKey='')` — new 4th parameter
- Inside `probeSpline`: tracks `prefBest*` parallel to `intBest*`, only updating when `runKey === preferRunKey` AND the sample is interior (|signedLat| <= footprintHW)
- Final selection: if `prefBestSpline` was found (preferred run still interior), use it before `intBest`/`extBest` (D4/09-17 priority order preserved for non-hysteresis callers)
- `_sampleCarveWorld`: stores `this._lastPhysicsRunKey`, passes it to `queryNearest` as `preferRunKey`, updates after successful query

**Secondary: `runProfile` desync warning**
- Added `console.warn` when `_buildRunProfile(runKey)` returns null (runKey not in `this._network`) — fails loud instead of silently returning gradeY=0

**Gate extension (`test/spline-continuity.mjs`)**
- New `window-shift-arm-flip` gate fixture and `computeWindowShiftMetrics()` function
- Vendors the D4+D5 arm selector (scalar, zero-install, no Three.js)
- Gate: with-hysteresis flipCount==0; no-hysteresis flipCount>0 (contrast confirms BUG-14 mechanism)
- All 10 gate fixtures pass, exit 0

## Eliminated

- hypothesis: per-run profile (runProfile/_buildRunProfile) is discontinuous in arcS — ELIMINATED
- hypothesis: raw terrain (analyticHeight without carve) steps at the seam — ELIMINATED
- hypothesis: velocity/penetration LAUNCH — ELIMINATED (log shows vy≈0)
- hypothesis: _reseatTruckAtSpawn re-seat fires on stream — ELIMINATED

## Resolution

- root_cause: `queryNearest` intBest arm-flip when a competing road arm (denser discrete samples, gradeY=139) enters the streaming window tile set; D5 hysteresis was missing so the preferred (current) road arm lost to sample-density bias.
- fix: D5 `preferRunKey` hysteresis in `queryNearest` + `_lastPhysicsRunKey` tracking in `_sampleCarveWorld` (src/road.js). Gate extended in test/spline-continuity.mjs.
- files_changed:
  - src/road.js — queryNearest D5 hysteresis, _sampleCarveWorld lastPhysicsRunKey, runProfile desync warn
  - test/spline-continuity.mjs — window-shift-arm-flip gate fixture + computeWindowShiftMetrics
