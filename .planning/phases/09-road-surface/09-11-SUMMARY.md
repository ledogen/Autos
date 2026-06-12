---
phase: 09-road-surface
plan: "11"
subsystem: terrain-carve
tags: [perf, terrain, road-surface, carve, below-margin]
dependency_graph:
  requires: [09-10]
  provides: [cheap-below-margin-carve]
  affects: [terrain.js, road.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns: [bilinear-precompute, below-margin-carve, O1-per-vertex-loop]
key_files:
  created: []
  modified:
    - src/terrain.js
    - data/ranger.js
    - src/debug.js
decisions:
  - "D-11a: Crown/camber/pothole removed from terrain mesh carve; terrain only carries trough floor below clearanceMargin. Physics ribbon (road.js) and visual ribbon (road-mesh.js) retain full fold-in."
  - "D-11b: 4 tile-corner sampleDesignGradeAt calls precomputed before loop; bilinear interpolation eliminates per-vertex binary search entirely."
  - "D-11c: carveHalfWidth = halfWidth + carveExtraWidth widens the blendW=1 core so trough is wider than ribbon + skirt apron."
metrics:
  duration: ~30min
  completed: 2026-06-12
  tasks: 2
  files: 3
---

# Phase 09 Plan 11: Cheap Below-Margin Terrain Carve Summary

**One-liner:** Gutted the O(N²) carve loop — replaced per-vertex sampleDesignGradeAt + 2nd queryNearest + closure with 4 precomputed tile-corner targets bilinearly interpolated, terrain now carves to ribbonY − clearanceMargin under a footprint widened by carveExtraWidth.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Below-margin carve params + cheap per-tile design-grade scaffold | 633747e | data/ranger.js, src/debug.js, src/terrain.js |
| 2 | Simplify _buildCarveTable inner loop to cheap below-margin carve | fbc5393 | src/terrain.js |

## What Was Built

### Task 1 — Params, sliders, and pre-loop corner target scaffold

- `data/ranger.js`: added `roadClearanceMargin: 0.5` (terrain stays 0.5 m below ribbon) and `roadCarveExtraWidth: 3.0` (extra footprint width beyond halfWidth + shoulderWidth).
- `src/debug.js`: added two sliders in the Road Surface folder — "Clearance Margin (m)" (0–1.5, step 0.05) and "Carve Extra Width (m)" (0–8, step 0.5), both wired to `fireSurface` for full road rebuild on change.
- `src/terrain.js _buildCarveTable`: reads `clearanceMargin` and `carveExtraWidth` from params; widens `maxExt` by `carveExtraWidth`; precomputes `g00/g10/g01/g11` (4 tile-corner design-grade targets via `sampleDesignGradeAt`) once before the zi/xi vertex loop; exposes `bilinearGrade(u,v)` helper for O(1) in-loop target lookup.

### Task 2 — Simplified loop body

- Removed from `_buildCarveTable` inner loop: `sampleDesignGradeAt(...)` call (was binary search per vertex), crown fold-in (`crownProfile`), camber fold-in (2nd `queryNearest` for ahead-probe + `signedCurvature`), pothole fold-in (`potholeNoise`, `roadQuality`). Total removals: ~60 lines of hot-path code.
- Replaced with: `bilinearGrade(u,v) - clearanceMargin` as `carveTargetY` — a few multiplies, no allocation, no search.
- Widened blendW=1 core to `carveHalfWidth = halfWidth + carveExtraWidth` so the flat trough bed is wider than the ribbon + skirt.
- Retained: single per-vertex `queryNearest` for footprint test, fillToe/cutToe/toeExt toe distances, shoulder carveBlend ramp — SURF-05 continuity preserved.
- Removed dead imports: `crownProfile`, `potholeNoise`, `signedCurvature`, `roadQuality` — terrain.js no longer imports from road-carve.js or road-quality.js.
- `road.js _sampleCarveWorld`: NOT modified — physics still samples the full ribbon surface (crown + camber + pothole + designGrade) on-road. The truck drives the ribbon, not the carved trough floor.
- `src/terrain-worker.js`: NOT modified — 0 new symbols; worker stores RAW heights only.

## Verification Results (Static / Grep Gates)

All awk/grep acceptance checks:

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| sampleDesignGradeAt in loop (awk) | 0 | 0 | PASS |
| queryNearest IN loop body (awk) | 1 (per-vertex only) | 1 | PASS |
| per-vertex closures in loop (awk) | 0 | 0 | PASS |
| clearanceMargin count in terrain.js | >=1 | 3 | PASS |
| fillToe/cutToe/toeExt count | >=3 | 5 | PASS |
| road.js diff (untouched) | 0 changes | 0 | PASS |
| terrain-worker.js new symbols | 0 | 0 | PASS |
| node --check src/terrain.js | PASS | PASS | PASS |
| node --check data/ranger.js | PASS | PASS | PASS |
| node --check src/debug.js | PASS | PASS | PASS |
| roadClearanceMargin in data/ranger.js | >=1 | 4 | PASS |
| roadClearanceMargin in src/debug.js | >=1 | 2 | PASS |

### Deviation: file-wide queryNearest grep = 3

The plan's acceptance check `grep -v '^...' src/terrain.js | grep -c "queryNearest("` expected `<= 2`. Actual result: **3**.

Reason: the pre-loop corner sampling uses a `sampleCorner(cx, cz)` helper whose body contains one `queryNearest(cx, cz, ...)` call on a non-comment source line. This adds a 3rd source line beyond the bounding-box check (line 835) and the per-vertex check (inside the loop). The helper is called exactly 4 times **before** the zi/xi loop — never inside it.

The critical perf intent is fully satisfied: there is exactly **1** `queryNearest` call inside the loop body (verified by awk). The 2nd camber probe that caused the regression is gone. The grep-count deviation is an artifact of the precompute helper pattern the plan itself specified.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified with one minor grep-count artifact (documented above).

### Crown/Camber/Pothole Removal

The plan explicitly drops crown/camber/pothole from the terrain mesh carve. These are now exclusively:
- **Physics:** `road.js _sampleCarveWorld` (crown + camber + pothole + designGrade — unchanged)
- **Visual ribbon:** `road-mesh.js sweepRibbon` (unchanged)

The terrain mesh only carries the `below-margin trough floor`. This is the intended architecture for Plans 09-10/09-11 combined.

## Known Stubs

None. The clearanceMargin and carveExtraWidth are wired end-to-end: params → sliders → _buildCarveTable → carveTargetY = bilinearGrade - clearanceMargin.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Human Verification Required

The operator is asleep and cannot run the browser now. Perform the following steps when available:

### Steps

1. Start a local server: `python3 test/nocache-server.py` or `npx serve .` then open the sim in a browser.

2. **PERF — load hang gone:** On first load or after pressing R to regenerate, watch the stats.js ms panel in the top-left corner. The old ~1 s terrain-build stall (per-vertex binary search) should be gone. Road tiles should stream in without a multi-frame spike.

3. **VISUAL — no pokethrough:** Fly the free camera over a road on rolling terrain. The asphalt ribbon should sit above the terrain (the carved trough floor is 0.5 m below the ribbon surface). The dark skirt apron (from Plan 09-10) should close the gap at the ribbon edges. No terrain triangles should poke up through the asphalt.

4. **SLIDERS:** Open the debug panel → Roads → Road Surface. Confirm two new sliders: "Clearance Margin (m)" and "Carve Extra Width (m)". Drag Clearance Margin up (e.g., to 1.0 m) — terrain should sink further below the ribbon, more apron visible. Drag it toward 0 — terrain should rise to just under the ribbon. Change triggers a full road rebuild.

5. **PHYSICS — truck rides ribbon, not trough floor:** Drive the truck slowly onto the road over rolling terrain. The wheels should sit ON the visible asphalt surface (the ribbon), not on the carved trough floor ~0.5 m below it, and not floating above it. The ribbon Y is still driven by `road.js _sampleCarveWorld` (unchanged).

6. **CONTINUITY — no seam step:** Drive across a tile boundary while on the road (every 64 m of road). The carved trough should have no visible vertical step or felt jolt at the seam. The bilinear corner interpolation guarantees shared corner targets at tile boundaries.

### Expected Outcome

- Stats ms panel shows no spike during road tile load (was 15–30 ms per tile; should now be < 5 ms)
- Terrain stays below the ribbon everywhere (no pokethrough even on steep terrain)
- Clearance Margin slider is responsive
- Truck wheels sit on asphalt at the ribbon height
- No seam step in the carved depression at tile boundaries

## Self-Check: PASSED

- src/terrain.js: exists and modified
- data/ranger.js: exists and modified
- src/debug.js: exists and modified
- Commit 633747e: verified in git log
- Commit fbc5393: verified in git log
