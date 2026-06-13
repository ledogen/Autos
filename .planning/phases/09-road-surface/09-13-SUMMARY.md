---
phase: 09-road-surface
plan: "13"
subsystem: road-surface
tags: [road, spline, continuity, perf, carve, viz, physics]
dependency_graph:
  requires: [09-06, 09-07, 09-08, 09-10, 09-11, 09-12]
  provides: [continuous-centerline-Y, no-per-tile-smoothing, truthful-viz-toggle]
  affects: [road-mesh.js, road.js, terrain.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns:
    - "spline.getPointAt(u).y for continuous routed centerline Y in ribbon build"
    - "param-gated viz toggle (roadDebugLineOnSurface) for debug vs truth mode"
key_files:
  created: []
  modified:
    - src/road-mesh.js
    - src/road.js
    - src/terrain.js
    - data/ranger.js
    - src/debug.js
decisions:
  - "09-13-D1: Use nr.point.y / spline.getPointAt(u).y as the universal design-grade source — no call to sampleDesignGradeAt or _smoothDesignGrade in any build/stream/physics path"
  - "09-13-D2: roadDebugLineOnSurface defaults false so the cyan line draws the routed spline (truth) by default; true is the legacy carve-surface debug mode"
  - "09-13-D3: Remove rawHW closure from terrain.js _buildCarveTable since sampleDesignGradeAt was its only consumer — dead code removal"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-13T03:33:00Z"
  tasks_completed: 3
  files_modified: 5
---

# Phase 09 Plan 13: Continuous Routed Centerline Y — Surface Regression Fix Summary

**One-liner:** Kill vertical seam steps + terrain-load lag by driving the road ribbon, physics carve, and terrain carve corner targets from the continuous routed spline Y (`nr.point.y` / `spline.getPointAt(u).y`), removing all per-tile `_smoothDesignGrade` / `sampleDesignGradeAt` calls from the build/stream/physics path.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Drive visual ribbon designGradeY from continuous routed centerline Y | 1dbb069 | src/road-mesh.js |
| 2 | Drive physics designY + terrain carve corners from continuous routed Y; truthful viz | f0f4aea | src/road.js, src/terrain.js |
| 3 | Register roadDebugLineOnSurface param + slider; spline-continuity gate | affb180 | data/ranger.js, src/debug.js |

## What Changed

### Task 1 — src/road-mesh.js `_buildRoadTile`

Replaced the `_smoothDesignGrade(spline, terrainRef, params)` call with a direct sampling loop:

```js
const arcLen = spline.getLength ? spline.getLength() : 64
const N = Math.max(2, Math.min(256, Math.ceil(arcLen / 2) + 1))
const points = []
const designGradeY = new Float32Array(N)
for (let _i = 0; _i < N; _i++) {
    const _u = _i / (N - 1)
    const _pt = spline.getPointAt(_u)
    points.push(_pt)
    designGradeY[_i] = _pt.y
}
```

- The slice spline's control points carry the routed network polyline `.y`
- Adjacent tile slices share boundary control points (C0) and tangent (C1) by construction (D-06), so `getPointAt(u).y` is C0-continuous across tile seams
- `sweepRibbon` call signature unchanged

### Task 2 — src/road.js `_sampleCarveWorld`

Changed the `designY` base from the `sampleDesignGradeAt()` branch to:

```js
let designY = nr.point.y
```

- Fill-height cap unchanged: `if (delta > fillHeight) designY = rawAmp + fillHeight`
- Crown/camber/pothole fold-in block (lines ~1373-1407) unchanged

### Task 2 — src/road.js `buildDebugLines`

Added param-gated toggle `roadDebugLineOnSurface`:

```js
const onSurf = this._params?.roadDebugLineOnSurface ?? false
```

- `false` (default): draw spline routed Y + 0.5 m constant lift — draws the continuous spline geometry (truth)
- `true`: legacy `surf(p.x, p.z) + 1.0` behavior for carve-surface debugging

### Task 2 — src/terrain.js `_buildCarveTable` `sampleCorner`

Simplified to:

```js
const sampleCorner = (cx, cz) => {
    const cnr = this._roadSystem.queryNearest(cx, cz, maxExt + 1)
    if (!cnr) return this.rawHeightWorld(cx, cz)
    return cnr.point.y  // continuous routed centerline Y
}
```

- Removed `sampleDesignGradeAt` branch and the now-dead `rawHW` closure

### Task 3 — data/ranger.js + src/debug.js

- `data/ranger.js`: added `roadDebugLineOnSurface: false` in the Plan 09-13 road block
- `src/debug.js`: added checkbox `surfaceFolder.add(params, 'roadDebugLineOnSurface').name('Viz: lift to surface').onChange(fireSurface)` in the Road Surface sub-folder

## Verification Results

### Automated Gates

```
node --check src/road-mesh.js       PASS
node --check src/road.js            PASS
node --check src/terrain.js         PASS
node --check data/ranger.js         PASS
node --check src/debug.js           PASS

grep -v '^[[:space:]]*[/*]' src/road-mesh.js | grep -c "_smoothDesignGrade"   → 0 (PASS)
grep -c "getPointAt" src/road-mesh.js                                          → 3 (PASS, >=1)

grep -v '^[[:space:]]*[/*]' src/road.js | grep -c "sampleDesignGradeAt("     → 1 (the method DEFINITION; 0 call sites remain — PASS)
grep -c "sampleDesignGradeAt(spline" src/road.js                              → 1 (definition present — PASS)
grep -v '^[[:space:]]*[/*]' src/terrain.js | grep -c "sampleDesignGradeAt("  → 0 (PASS)
grep -c "nr.point.y" src/road.js                                              → 2 (PASS, >=1)
grep -c "roadDebugLineOnSurface" src/road.js                                  → 2 (PASS, >=1)

grep -c "roadDebugLineOnSurface" data/ranger.js                               → 2 (PASS, >=1)
grep -c "roadDebugLineOnSurface" src/debug.js                                 → 1 (PASS, >=1)

git diff --stat src/terrain-worker.js                                         → (empty — untouched — PASS)

node test/spline-continuity.mjs exit code                                     → 0 (PASS)
  gentle-baseline : PASS (maxVStep=0.014m, maxDKappa=0.0/m², seam=N/A)
  tile-seam-mismatch: PASS (maxVStep=0.021m, seam=0.0000m)
```

### Spline-Continuity Gate Output

```
GATE RESULT: PASS — 2 gate fixture(s) all within thresholds
Thresholds: maxVStep<0.15m  maxDKappa<0.01/m²  maxDCamber<2°/m  boundaryMismatch<0.05m
gentle-baseline: PASS | tile-seam-mismatch: PASS
demo-expected-fail fixtures informational (tight-turn, steep-grade)
```

## Human Verification Required

This plan ends with a `checkpoint:human-verify`. Per `<autonomous_false_note>` all code has been implemented and committed; human must confirm the following in-browser:

### Prerequisites

Start a local server: `python3 test/nocache-server.py` (or `npx serve .`). Open sim in browser.

### Verification Steps

1. **SEAM STEPS GONE:** Drive (or free-cam follow) the road across several tile boundaries (every 64 m). The road surface should read as a smooth continuous ribbon — no vertical step or felt jolt at tile seams.

2. **LOAD LAG GONE:** Press R to regenerate / fly to fresh terrain while watching the stats.js ms panel (top-left). The old ~1 s terrain-load stall should be gone; tiles stream in without a multi-frame spike.

3. **TRUTHFUL VIZ:** Open the debug panel (backtick) → Roads → Road Surface. Toggle the road centerline viz on (existing centerline checkbox). The cyan line should trace a CONTINUOUS smooth spline (the routed geometry), not a stepped line. Then toggle the new "Viz: lift to surface" checkbox ON — the line should jump up onto the carve surface (legacy debug behavior); toggle it OFF again.

4. **TRUCK SEATS ON RIBBON:** Drive the truck onto the road over rolling terrain — wheels sit on the visible asphalt, not floating or sunk.

### Expected Outcomes

| Check | Expected | Fail Signal |
|-------|----------|-------------|
| Seam steps | None — smooth ribbon across 64 m boundaries | Visible vertical step or jolt at tile edge |
| Load lag | No multi-frame spike on terrain stream | ~1 s freeze during R-regenerate |
| Cyan viz (toggle off) | Continuous smooth line at spline height | Stepped line following analyticHeight |
| Cyan viz (toggle on) | Line lifts onto carve surface (slightly above terrain) | No change when toggled |
| Truck on road | Wheels on asphalt, no float/sink | Wheels above or below visible ribbon |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical removal] Dead `rawHW` closure removed from terrain.js**
- **Found during:** Task 2
- **Issue:** After dropping `sampleDesignGradeAt` from `sampleCorner`, the `rawHW = (wx, wz) => this.rawHeightWorld(wx, wz)` closure had no remaining consumers in `_buildCarveTable`
- **Fix:** Removed the closure and its explanatory comment as directed by the plan ("if `sampleDesignGradeAt` becomes its only consumer here, remove the now-dead `rawHW` closure")
- **Files modified:** src/terrain.js
- **Commit:** f0f4aea

### Methods Not Deleted (Per Plan)

`sampleDesignGradeAt`, `_smoothDesignGrade`, and `invalidateDesignGradeCache` method definitions remain in road.js for harness/back-compat. No call sites remain in any build/stream/physics path (verified by grep gates above).

## Known Stubs

None. All surface consumers are wired to the continuous routed centerline Y.

## Threat Flags

None. This plan removes code (cache-miss lag source, per-tile smoothing) and changes which Y value feeds existing consumers. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check

All commits verified in git log:
- 1dbb069: feat(09-13): drive visual ribbon designGradeY from continuous routed centerline Y
- f0f4aea: feat(09-13): drive physics designY + carve corners from continuous routed centerline Y; truthful viz
- affb180: feat(09-13): add roadDebugLineOnSurface param + slider; spline-continuity gate passes

Files confirmed present:
- src/road-mesh.js — modified
- src/road.js — modified
- src/terrain.js — modified
- data/ranger.js — modified
- src/debug.js — modified

## Self-Check: PASSED
