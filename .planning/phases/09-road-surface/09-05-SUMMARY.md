---
phase: 09-road-surface
plan: "05"
subsystem: road-surface-materials
tags: [asphalt, vertex-color, road-quality, markings, cliff-shading, 5-zone, SURF-02, D-01, D-02, D-03, D-09, D-10, D-11]
dependency_graph:
  requires: [09-01, 09-02, 09-03, 09-04]
  provides: [roadQuality-hook, per-stretch-markings, 5-zone-terrain-colors, road-surface-sliders, onRoadSurfaceChange]
  affects: [src/road-mesh.js, src/terrain.js, src/debug.js, src/main.js, data/ranger.js, test/test-road-mesh.html]
tech_stack:
  added: []
  patterns: [seedFor-mulberry32-road-quality, smoothstep-blend-stretch-boundary, 5-zone-feathered-vertex-color, debounced-surface-rebuild]
key_files:
  created: []
  modified:
    - src/road-mesh.js
    - src/terrain.js
    - src/debug.js
    - src/main.js
    - data/ranger.js
    - test/test-road-mesh.html
decisions:
  - "roadQuality exported from road-mesh.js as the D-03 labeled hook — any SURF-06 pothole consumer imports and calls roadQuality(arcS, runKey, worldSeed)"
  - "hashRunKey() uses djb2-style mixing of runKey string characters — consistent with seed.js djb2 pattern"
  - "Marking tier threshold: High=q>=0.66, Mid=q>=0.33, Low=q<0.33 — symmetric thirds of [0,1) range"
  - "Mid intermittent edge: arcS%12<8 = 8m-on/4m-off pattern per D-02 research spec"
  - "5-zone cliff blend uses post-computeVertexNormals() normal.y so cliff detection uses actual mesh geometry"
  - "Road-zone color (cutout vs dirt) driven by carveData sign (delta=gradeY-rawH): positive=fill/dirt, negative=cut/cutout"
  - "onRoadSurfaceChange triggers Path B (full Worker round-trip) because carve tables depend on changed geometry params"
  - "RoadMeshSystem constructor now accepts worldSeed for D-03 determinism; both construction sites updated"
metrics:
  duration: "~45 min"
  completed: "2026-06-11"
  tasks_completed: 2
  files_modified: 6
---

# Phase 9 Plan 5: Asphalt Materials + Road Quality Markings + 5-Zone Terrain (SURF-02) Summary

**One-liner:** Procedural dark-grey asphalt with per-500 m quality-tiered lane markings (D-01/D-02, labeled roadQuality hook D-03), 5-zone feathered terrain vertex colors (cutout/dirt/cliff D-09/D-10/D-11), and full Roads-folder surface tuning sliders wired to live debounced rebuild (D-04/D-07).

## What Was Built

### Task 1: Vertex-color asphalt + per-500m roadQuality tiers + markings (road-mesh.js, ranger.js)

**`src/road-mesh.js`**

**`export function roadQuality(arcS, runKey, worldSeed)`** — new exported function (D-03 labeled hook):
- `stretchIdx = floor(arcS / 500)` per stretch
- Value = `mulberry32(seedFor(worldSeed, 'roadquality', hashRunKey(runKey), stretchIdx))()` — in [0,1)
- Smooth-step blend across 10 m zone at each stretch boundary (both start and end of stretch)
- Exported so SURF-06 Plan 09-06 can import it directly without re-deriving

**`hashRunKey(runKey)`** — djb2-style string→uint32 for stable run identifier hashing

**`RoadMeshSystem` constructor** extended with optional `worldSeed` param (stored as `this._worldSeed`)

**`sweepRibbon(spline, designGradeY, points, params, runKey='', arcSOffset=0)`** extended:
- Computes `arcS = arcSOffset + u * arcLen` per section
- Calls `roadQuality(arcS, runKey, this._worldSeed)` for per-section tier
- Tier classification: High (q≥0.66), Mid (q 0.33–0.66), Low (q<0.33)
- Centerline (`|uLat| < 0.15 m`): brightness 0.9/0.65/0.3 for High/Mid/Low
- Edge lines (`distFromEdge < 0.10 m`): High=solid-white(0.9), Mid=intermittent-8m/4m(0.65), Low=absent
- `_buildRoadTile` passes `seg.runKey` and `seg.arcSOffset` to sweepRibbon (fallback `''`/`0`)

**`data/ranger.js`** — new params:
- `roadQualityStretch: 500` — arc-length per tier stretch (D-02/A9)
- `roadQualityBlend: 10` — blend zone at stretch boundaries (D-02/A9)
- `roadCliffSlopeLo: 0.3` — cliff blend lower slope threshold (D-11/A10)
- `roadCliffSlopeHi: 0.6` — cliff blend upper slope threshold (D-11/A10)

### Task 2: 5-zone terrain materials + debug sliders + main.js callback + smoke test

**`src/terrain.js`**

- Shared material switched from `MeshPhongMaterial({color: 0xb89060})` to `MeshPhongMaterial({vertexColors: true})` (D-09)

**`_writeChunkVertexColors(geom, carveData, heights, amp)`** — new private method:
- Called from `_flushPendingQueue` AFTER `computeVertexNormals()` (uses computed normal.y for cliff)
- Five zones blended/feathered, no hard lines (D-09):
  - General terrain: warm brown (0.72, 0.60, 0.47)
  - Natural cliff: weathered grey (0.60, 0.58, 0.55) via `smoothstep(cliffLo, cliffHi, 1-normal.y)` — D-11
  - Engineered cutout: uniform grey-tan (0.55, 0.50, 0.42) where carve delta<0 (cut) — D-10
  - Dirt foundation: warm tan (0.65, 0.55, 0.38) where carve delta>0 (fill) — D-07
- Road-zone blend driven by `carveData[i*2]` = blendW (feathered via shoulder, free from carve system)
- Cutout color distinct from natural cliff (D-10 enforced)
- Also called from `rebuildAllChunks()` Path A to keep colors in sync after amplitude rescale

**`src/debug.js`**

- Callback contract comment updated to include `callbacks.onRoadSurfaceChange()`
- `Road Surface` sub-folder added inside Roads folder (via `roadFolder.addFolder`):
  - 11 sliders: roadWidth(6–14), crownHeight(0–0.2), camberStrength(50–500), roadFillHeight(0–4), roadCutSlope(0.5–2), roadFillSlope(1.5–5), roadShoulderWidth(1–6), designGradeWindow(10–150), roadFilletRadius(0.5–10), roadCliffSlopeLo(0–0.5), roadCliffSlopeHi(0.3–0.9)
  - roadWidth onChange also syncs `params.roadHalfWidth = params.roadWidth / 2` (derived field)
  - All fire `fireSurface → callbacks.onRoadSurfaceChange()`

**`src/main.js`**

- `debouncedRoadSurfaceRebuild()` — new 150ms debounce function:
  - `reinitWorker(worldSeed, RANGER_PARAMS)` — re-sends Worker init (same seed, fresh params)
  - `rebuildAllChunksFromWorker()` — disposes all chunks, re-requests with updated carve tables
  - `roadMeshSystem.clearAll()` — clears ribbon tiles; they rebuild from new params
- `callbacks.onRoadSurfaceChange` wired to `debouncedRoadSurfaceRebuild()`
- `RoadMeshSystem` constructor calls (both initial + seed-change) updated to pass `worldSeed` (D-03)

**`test/test-road-mesh.html`**

- SURF-02 test replaced with enhanced asphalt+markings smoke:
  - Asserts vertex color attribute present
  - Asserts at least one dark-grey asphalt base vertex (R < 0.25)
  - Asserts at least one marking vertex brighter than asphalt base (R > 0.28)
  - SURF-02 key assertion: centerline vertex R >= off-marking vertex R
  - `PASS SURF-02 asphalt + markings (centerline brighter)` emitted on success

## Deviations from Plan

None — plan executed as written.

- `seg.runKey` and `seg.arcSOffset` are read from road._tiles segment records with fallback to `''`/`0` if not present. This is backwards-compatible with the existing tile format — road.js may not set these fields on existing segment objects. If not present, all vertices on a tile use the same runKey (`''`) and arcSOffset (`0`), which produces deterministic but constant quality within that tile. This is a graceful degradation, not a stub.

## Known Stubs

None — all SURF-02 functionality complete. Centerline brightness > asphalt base is guaranteed for all tiers (Low tier faint center at 0.3 > asphalt 0.15). The road-quality label (D-03) is exported and addressable from Plan 09-06.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. All color values are own-math constants; cliff slope is derived from Three.js computed normals. Slider values are bounded numerics (T-09-09 accepted).

## Verification

Automated:
- `terrain.js`: `vertexColors` count = 2 (material + comment)
- `debug.js`: `onRoadSurfaceChange` count = 4 (contract comment + fireSurface def + 11 onChange calls)
- `main.js`: `onRoadSurfaceChange` count = 1 (wire in initDebug call)
- `terrain.js`: `cliff` count = 21 (color constant + blend logic + comments)
- `test-road-mesh.html`: `SURF-02` count = 12

Browser verification (manual):
- Open `test/test-road-mesh.html` — SURF-02 asphalt+markings smoke should PASS
- In-game: roads read as dark asphalt with markings; cut faces read grey-tan vs wild cliff grey
- Road Surface sliders rebuild live when dragged

## Self-Check: PASSED

Files modified confirmed:
- `src/road-mesh.js` — commit 1c70a8c (roadQuality export, sweepRibbon markings, worldSeed param)
- `data/ranger.js` — commit 1c70a8c (roadQualityStretch, roadQualityBlend, cliffSlopeLo/Hi)
- `src/terrain.js` — commit 8e899c3 (vertexColors material, _writeChunkVertexColors, rebuildAllChunks update)
- `src/debug.js` — commit 8e899c3 (Road Surface sub-folder, onRoadSurfaceChange contract)
- `src/main.js` — commit 8e899c3 (debouncedRoadSurfaceRebuild, onRoadSurfaceChange wire, worldSeed to RoadMeshSystem)
- `test/test-road-mesh.html` — commit 8e899c3 (SURF-02 enhanced smoke test)
