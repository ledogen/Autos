---
phase: 08-road-routing
plan: 07
subsystem: road-routing
tags: [road, routing, valley-trunk, viz, debug, spawn, seam-gate, gap-closure]
requires:
  - "src/road.js this._tiles / this._network (08-05/08-06): streamed + sliced valley-trunk geometry"
  - "src/road.js ensureTile(tileX,tileZ)→{spline,waypoints} / queryNearest(wx,wz,r)→{point,tangent}|null (08-06)"
  - "src/road.js _streamNetwork(center) / _sliceNetwork() (08-05/08-06): the streaming + slicing pipeline update(center) drives"
  - "data/ranger.js D-09 cost-weight params: roadWAlt/roadWGrade/roadWOver/roadWTurn/maxRoadGrade"
provides:
  - "src/road.js update(center): unified per-frame streamer (_streamNetwork + _sliceNetwork + optional viz rebuild); setRadius(r); centerline-only buildDebugLines/setDebugVisible from this._tiles; proto-only API (setProtoEnabled/setProtoParam/setProtoRadius/updateProto) removed"
  - "src/debug.js Roads folder: Show Road Splines + maxRoadGrade + D-09 cost sliders (roadWAlt/roadWGrade/roadWOver/roadWTurn); Valley Trunk (proto) folder + retired sliders removed"
  - "src/main.js roadSystem.update(streamCenter) in render loop + debounced invalidate/re-stream; setRadius(640); preserved resolveSpawn queryNearest+atan2 heading (D-07); proto wiring retired"
  - "test/test-road-seam.html D-06 EXIT GATE retargeted to dynamically discovered E-W road joints (totalSeams>=1 satisfiable on lone-pine); C0/C1 thresholds unchanged"
affects:
  - "Phase 9: builds the ribbon mesh on this._tiles per-tile sliced splines; the D-06 seam gate is now green over real road joints"
  - "08-VERIFICATION: closes truths 6 (shipped viz) and 7 (re-route + spawn) + makes the D-06 exit gate PASS"
tech-stack:
  added: []
  patterns:
    - "Single shipped viz path (D-05): setDebugVisible toggles line.visible (no per-toggle GC), lines built from this._tiles centerlines lifted onto the rendered surface; proto scaffolding retired"
    - "Debounced deterministic re-route (D-03): D-09 cost sliders → onRoadParamChange → invalidateCache (marks dirty) → next update(center) re-streams + re-slices (roads are pure fns of seed+coords+params)"
    - "Seam-gate measures one consistent stream: ensureTile re-streams per call and clears this._tiles, so a true slice-of-one-curve seam reads BOTH adjacent tiles from ONE stream (fresh RoadSystem per pair) — the harness retarget honors this"
key-files:
  created:
    - ".planning/phases/08-road-routing/08-07-SUMMARY.md"
  modified:
    - "src/road.js — Task 1 (commit bb65501): centerline viz from this._tiles + update(center)/setRadius; proto-only viz API retired"
    - "src/debug.js — Task 2 (commit 6dd6970): Roads folder D-09 sliders; proto folder/sliders retired"
    - "src/main.js — Task 2 (commit 6dd6970): render-loop update(); debounced re-route; resolveSpawn queryNearest+atan2 heading preserved"
    - "test/test-road-seam.html — Task 3 (commit a9e90c6, USER-APPROVED DEVIATION): D-06 seam gate retargeted to discovered E-W joints"
decisions:
  - "D-06 seam gate retargeted (user-approved at checkpoint): the hardcoded -1..1 grid is unsatisfiable on lone-pine (trunk never crosses an E-W boundary there → totalSeams=0). The harness now dynamically discovers real E-W spanning seam pairs; C0/C1 thresholds UNCHANGED — only WHERE seams are found moved."
  - "Each seam is measured from ONE consistent stream (fresh RoadSystem per pair, ensureTile both adjacent tiles) because ensureTile re-streams per call and clears this._tiles; eager-fill-then-compare freezes splines from DIFFERENT stream windows and falsely fails near the stream edge (C0=0.237 m on (-7,-7)→(-6,-7))."
  - "Determinism probe retargeted from tile(0,0) (no spline on lone-pine) to tile(3,-7) (west side of a real seam) so the determinism assertion exercises an actual spanned spline on the locked seed."
metrics:
  duration: ~20 min
  completed: 2026-06-10
---

# Phase 8 Plan 07: Productionize Viz/Re-route/Spawn + Green the D-06 Seam Gate Summary

Finished productionization of the valley-trunk road system: shipped the centerline-only, checkbox-toggled, clean-by-default viz from `this._tiles` (D-05); replaced the retired per-tile sliders with the D-09 cost-weight sliders wired to a debounced deterministic re-stream (D-03); retired ALL prototype scaffolding (`Valley Trunk (proto)` folder, `setProto*`/`updateProto`); switched the render loop to `roadSystem.update(streamCenter)`; PRESERVED the correct `resolveSpawn` queryNearest + `atan2` heading wiring (D-07); and made the D-06 seam exit gate green by retargeting `test/test-road-seam.html` to the tiles where the road actually crosses an east-west boundary on `lone-pine`. Closes 08-VERIFICATION truths 6 and 7 and the D-06 exit gate. The valley trunk is now simply the road system.

## What Was Built

### Task 1 — Shipped centerline viz from `this._tiles` + `update(center)`/`setRadius`; retire proto API (commit `bb65501`, MERGED before this run)
- `src/road.js`: rebuilt `buildDebugLines()`/`setDebugVisible(visible)` to render the network centerlines from `this._tiles` (one `THREE.Line` per tile segment spline, surface-lifted via the `this._proto.surfaceY` sampler or `+1.0`), toggling `line.visible` rather than dispose/recreate (no per-toggle GC); `this._debugVisible` defaults false (clean by default).
- Added a single per-frame entry point `update(center)` = `_streamNetwork(center)` + `_sliceNetwork()` + (if visible) line rebuild, respecting the existing move-threshold/dirty gating. Added `setRadius(r)`; kept `setSurfaceSampler`. **Removed** `setProtoEnabled`/`setProtoParam`/`setProtoRadius`/`updateProto` (and the proto-only line drawing) — ONE viz path now, toggled by `setDebugVisible`, tuned by `this._params`.

### Task 2 — debug.js Roads folder (D-09 sliders) + main.js render-loop/re-route; retire proto wiring; PRESERVE resolveSpawn (commit `6dd6970`, MERGED before this run)
- `src/debug.js`: kept `Show Road Splines` (→ `onRoadVizToggle`) + `maxRoadGrade` (→ `onRoadParamChange`); replaced the retired `roadSlopePenalty`/`roadAltWeight` sliders with the D-09 dominant cost-weight sliders `roadWAlt`/`roadWGrade`/`roadWOver`/`roadWTurn` (each → `onRoadParamChange`, D-03); DELETED the entire `Valley Trunk (proto)` subfolder + `_protoState` + `onProtoToggle`/`onProtoParam` wiring.
- `src/main.js`: render loop now calls `roadSystem.update(streamCenter)`; init uses `setRadius(640)` + `setSurfaceSampler(...)`; `debouncedRoadRebuild` fires `invalidateCache()` (marks dirty → next `update` re-streams with new D-09 weights, deterministic re-route) then `buildDebugLines()` if visible; **PRESERVED** `resolveSpawn` (ensureTile 3×3 + `queryNearest(baseX,baseZ,200)` + `heading = atan2(tangent.x, tangent.z)`, D-07); seed-change re-instantiation uses the new API. No `updateProto`/`setProto*`/`onProto*` remain.

### Task 3 — Run + green the D-06 seam exit gate (commit `a9e90c6`, THIS run; USER-APPROVED DEVIATION)
The Task 3 checkpoint surfaced that the seam exit gate `test/test-road-seam.html` (last touched by 08-04) hardcoded a `-1..1` tile grid and asserted `totalSeams >= 1`. On the locked `lone-pine` seed the valley trunk never crosses an east-west boundary inside `-1..1` (its 256 m macro-row anchors place E-W crossings out in tile rows like `(3,-7)→(4,-7)` and `(4,6)→(5,6)`), so `totalSeams = 0` there and the gate was **unsatisfiable as written** — even though the slicing mechanism is proven correct (08-06: 12 network-wide spanning pairs, maxC0=0.00000 m, maxC1=0.019°).

The user reviewed and chose **"Move the test to the road"** — approving an edit to the harness to retarget WHERE it looks for seams (not weakening the gate). Implemented:
- **Discovery phase** — warm a `±8`-tile region with one `RoadSystem` (memoized `ensureTile`), recording every tile that exposes a full E-W-spanning `.spline`; a candidate seam is any `(tX,tZ)→(tX+1,tZ)` where both tiles span. On `lone-pine` this deterministically finds 3 pairs: `(-7,-7)`, `(3,-7)`, `(4,6)`.
- **Measurement phase** — for each candidate, build a **fresh** `RoadSystem` and `ensureTile` BOTH adjacent tiles so they slice the SAME streamed network (their centers are 64 m apart, inside the move-threshold), then assert C0 `< 0.01 m` and C1 `< 5°` on `endA = spline.getPoint(1.0)` vs `startB = spline.getPoint(0.0)`. This is required because `ensureTile` re-streams per call and clears `this._tiles`; reading the seam from one consistent stream is what makes the slice-of-one-curve invariant hold.
- **Determinism probe** retargeted from `tile(0,0)` (no spline on lone-pine) to `tile(3,-7)` (west side of a real seam) — same seed → same boundary tangent (diff `< 1e-9`).
- **C0/C1 thresholds UNCHANGED** and the `EXIT GATE D-06: PASS/FAIL` reporting contract preserved — only the seam targets moved.

## Verification

Headless run of the harness's `<script type="module">` body against the **real** Three.js r184 `CatmullRomCurve3` (and `simplex-noise@4.0.3`), fetched from the same CDN the importmap uses into a throwaway `/tmp` dir symlinked as `node_modules` for the run only, removed before committing (`git status` clean — no repo file added for testing). Using the real curve makes the C0/C1 measurements authoritative.

```
  D-06 discovery: 3 E-W spanning seam pair(s) on lone-pine within ±8 tiles: [[-7,-7],[3,-7],[4,6]]
PASS: D-06 seam C0 (-7,-7)→(-6,-7): dist=0.0000m < 0.01m
PASS: D-06 seam C1 (-7,-7)→(-6,-7): angle=0.01° < 5°
PASS: D-06 seam C0 (3,-7)→(4,-7): dist=0.0000m < 0.01m
PASS: D-06 seam C1 (3,-7)→(4,-7): angle=0.01° < 5°
PASS: D-06 seam C0 (4,6)→(5,6): dist=0.0000m < 0.01m
PASS: D-06 seam C1 (4,6)→(5,6): angle=0.01° < 5°
PASS: D-06 EXIT GATE: at least one seam was checked (network not fully sparse)
  Seams checked: 3  (candidates discovered: 3)
  Max C0 dist at seam: 0.00000 m
  Max tangent angle at seam: 0.01°
  EXIT GATE D-06: PASS
PASS: D-06 EXIT GATE: all checked seams pass C0 (<0.01 m) and C1 (<5°)
PASS: D-06 determinism: tile(3,-7) spline exists on both instances
PASS: D-06 determinism: same seed → same boundary tangent on tile(3,-7) (diff < 1e-9)
```

| Check | Result |
|-------|--------|
| `EXIT GATE D-06` | **PASS** (real three r184) |
| `totalSeams` | 3 (>= 1 satisfied) |
| max C0 distance at seam | 0.00000 m (< 0.01 m) |
| max C1 tangent angle at seam | 0.01° (< 5°) |
| FAIL lines | 0 |
| Determinism (same seed → same tangent, diff < 1e-9) | PASS |
| Discovery deterministic run-to-run on lone-pine | PASS (`-7,-7 | 3,-7 | 4,6`) |
| `git status` after run (no testing artifact) | clean — only `test/test-road-seam.html` modified |

**Discovery diagnostic (why the retarget is correct, not a weakening):** the naive "eager-fill a Map over a wide grid, then compare adjacent pairs" approach FALSELY fails `(-7,-7)→(-6,-7)` at C0 = 0.237 m — because each `ensureTile` re-streams and clears `this._tiles`, so the memoized west/east splines came from DIFFERENT stream windows whose boundary points diverge near the stream edge. Measuring each seam from one consistent stream (the implemented approach) yields C0 = 0.00000 m on all 3 pairs. The slicing mechanism was already correct; the harness now reads it correctly.

## Deviations from Plan

### User-approved deviation — edited a file outside 08-07's declared `files_modified`

**`test/test-road-seam.html` is NOT in 08-07's declared `files_modified`** (`src/road.js`, `src/debug.js`, `src/main.js`). Editing it was a **user-approved deviation made at the Task 3 (`checkpoint:human-verify`) checkpoint**, resolving the 08-04 harness/seed grid staleness logged as a Known Issue in 08-06. The plan's Task 3 said "Do NOT edit the harness", but the harness's hardcoded `-1..1` grid made the gate unsatisfiable on `lone-pine` (trunk doesn't cross an E-W boundary there → `totalSeams = 0`), while the slicing mechanism itself is correct (08-06: 12/12 spanning pairs, maxC0 = 0.000 m). At the checkpoint the user chose **"Move the test to the road"** and explicitly approved editing the harness. The edit only retargets WHERE seams are found (dynamic discovery of real E-W joints); the C0 (`< 0.01 m`) / C1 (`< 5°`) thresholds and the `EXIT GATE D-06: PASS/FAIL` contract are unchanged, so the gate is not weakened — it now measures real road joints instead of an empty grid. Deterministic on the locked seed.

### Tasks 1 & 2 — no deviations
Tasks 1 (`bb65501`) and 2 (`6dd6970`) were executed and merged to main before this continuation run; this agent did not re-execute them. No deviations reported for them here.

## Known Stubs

None introduced by this plan. (Spurs / D-01 remain deferred to post-functional polish per 08-07's `success_criteria`.)

## Deferred Items (pre-existing, out of scope)

- **`test/test-road.html`** still references the deleted `_tileCache` (08-06 removed the per-tile router map); logged in `.planning/phases/08-road-routing/deferred-items.md` (lines 63/113/118). That harness was already broken by the 08-05 router removal; it is NOT the live seam gate (`test/test-road-seam.html`) and is out of scope here. Recommend deleting/rewriting it in a cleanup plan (WR-01).

## Self-Check: PASSED
- `test/test-road-seam.html` modified — FOUND (commit `a9e90c6`)
- `.planning/phases/08-road-routing/08-07-SUMMARY.md` — written
- Commit `bb65501` (Task 1) — present in git log
- Commit `6dd6970` (Task 2) — present in git log
- Commit `a9e90c6` (Task 3) — present in git log
- D-06 EXIT GATE — PASS headless against real three r184 (totalSeams=3, all C0<0.01m, C1<5°, zero FAIL)
- `git status` clean after run — no testing artifact committed
