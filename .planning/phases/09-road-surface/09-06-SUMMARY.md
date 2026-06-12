---
phase: 09-road-surface
plan: "06"
subsystem: road-surface-pothole
tags: [pothole, micro-noise, road-quality, height-agreement, SURF-06, D-03]
dependency_graph:
  requires: [09-05]
  provides: [potholeNoise, road-quality-module, queryNearest-runKey]
  affects: [src/road-carve.js, src/road-quality.js, src/road-mesh.js, src/road.js, src/terrain.js, data/ranger.js, test/test-road-carve.html]
tech_stack:
  added: []
  patterns: [value-noise-hash-lattice, 2-octave-combined-noise, road-quality-module-split]
key_files:
  created:
    - src/road-quality.js
  modified:
    - src/road-carve.js
    - src/road-mesh.js
    - src/road.js
    - src/terrain.js
    - data/ranger.js
    - test/test-road-carve.html
decisions:
  - "potholeNoise keyed on (wx, wz) world position rather than (arcS, uLat) — enables identical calls at all three sites without propagating arcS through _buildCarveTable"
  - "road-quality.js extracted from road-mesh.js to break terrain.js→road-mesh.js→terrain.js circular dependency SURF-06 would otherwise create"
  - "queryNearest extended to return runKey + arcS (tile-local bestU*arcLen) for D-03 quality consumers; backward-compatible (all existing callers ignore extra fields)"
  - "arcS is tile-local (0 to spline arc length) consistent with sweepRibbon arcSOffset=0 default — no global offset stored on _tiles segments"
  - "potholeEnabled master toggle in ranger.js allows A/B physics comparison; defaults true"
metrics:
  duration: "~25 min"
  completed: "2026-06-12"
  tasks_completed: 1
  files_modified: 6
  files_created: 1
---

# Phase 9 Plan 6: Pothole / Crack Micro-Noise (SURF-06 Stretch Goal) Summary

**One-liner:** Deterministic 2-octave value-noise pothole perturbation on road surface only, severity from the same per-stretch roadQuality hook as markings (D-03), applied identically in mesh build and physics sampler via road-quality.js extraction to avoid circular imports.

## What Was Built

### Task 1: potholeNoise, road-quality.js module, 3-site identical application, test assertions

**`src/road-carve.js`**

New exported function `potholeNoise(wx, wz, rq, params)`:
- Pure, no imports, no Math.random/Date — Worker-safe (though not currently synced to Worker since carve is main-thread only)
- Returns signed Y perturbation (metres) at world position `(wx, wz)`
- Deterministic hash lattice: `_h(ix, iz)` using Math.imul prime mixing, >>> 0 normalization
- Two-octave value-noise: pothole layer (freq1) + crack layer (2x freq, 0.4x amplitude)
- Smoothstep interpolation between lattice nodes
- Severity = `1 - clamp(rq, 0, 1)` — high quality → near zero; low quality → full amplitude
- Returns 0 immediately when `params.potholeEnabled` is falsy (master toggle)

**`src/road-quality.js`** (new file)

Extracted from `road-mesh.js` to break the `terrain.js → road-mesh.js → terrain.js` circular dependency:
- `hashRunKey(runKey)` — djb2-style string→uint32
- `roadQuality(arcS, runKey, worldSeed)` — per-stretch blended quality [0,1)
- `ROAD_QUALITY_STRETCH = 500`, `ROAD_QUALITY_BLEND = 10` constants
- `road-mesh.js` re-exports all four for backward compatibility with existing callers

**`src/road.js`**

- `queryNearest` now tracks `bestRunKey` and `bestArcLen` alongside `bestSpline`/`bestU`
- Returns `{ point, tangent, runKey, arcS }` (arcS = bestU * bestArcLen, tile-local)
- Fallback (network polyline path) returns `runKey: '', arcS: 0`
- `_sampleCarveWorld`: adds `potholeNoise(wx, wz, rq, p)` to `designY` inside the `latDist < halfWidth` block (on-ribbon only); uses `roadQuality(nr.arcS, nr.runKey, this._worldSeed)`

**`src/terrain.js`**

- Imports `potholeNoise` from `./road-carve.js`, `roadQuality` from `./road-quality.js`
- `_buildCarveTable`: adds `potholeNoise(wx, wz, rq, p)` to `designY` inside the `latDist < halfWidth` block; uses `roadQuality(nr.arcS ?? 0, nr.runKey ?? '', this._worldSeed)`
- `this._worldSeed` already available from TerrainSystem constructor

**`src/road-mesh.js`**

- Imports `potholeNoise` from `./road-carve.js`, `roadQuality` from `./road-quality.js` (via re-export)
- Removed local `hashRunKey`, `roadQuality`, and constants (moved to road-quality.js)
- Removed `import { seedFor, mulberry32 }` (no longer needed directly)
- `sweepRibbon`: computes `pY = potholeNoise(vx, vz, q, params)` for on-ribbon vertices (`|uLat| < halfWidth`), adds to vertex Y: `vy = gradeY + crownY + tiltY + pY`

**`data/ranger.js`**

Three new Phase 9 Plan 06 params with decision tags:
- `potholeEnabled: true` — master on/off toggle (D-03 / SURF-06)
- `potholeAmplitude: 0.04` — m, peak perturbation at lowest quality
- `potholeFrequency: 0.3` — /m, noise lattice frequency (~3.3 m cell spacing)

**`test/test-road-carve.html`**

SURF-06 test block (6 assertions):
1. Non-zero perturbation at rq=0 (low quality)
2. Near-zero perturbation at rq=1 (high quality)
3. Returns exactly 0 when potholeEnabled=false
4. **Height-agreement gate**: `potholeNoise(wx, wz, rq, params)` is deterministic — same call from mesh path and physics path produces identical Y perturbation
5. Severity scales monotonically: low ≥ mid ≥ high
6. Amplitude bounded within 2× potholeAmplitude (sanity)

## Deviations from Plan

### Auto-adjusted: potholeNoise(wx, wz, ...) rather than potholeNoise(arcS, uLat, ...)

**Found during:** Task 1 implementation

**Issue:** Plan specified `potholeNoise(arcS, uLat, roadQuality, params)` but `_buildCarveTable` in terrain.js iterates a grid of `(wx, wz)` vertices and does not track `arcS`. Using `arcS` would require propagating it through the carve table pipeline or approximating it per-vertex.

**Fix:** Use world position `(wx, wz)` as the hash lattice key instead of `(arcS, uLat)`. This achieves the same determinism guarantee (same world position → same bump) and is the only coordinate available at all three application sites. The deviation from the plan's signature is documented but the functional requirement (deterministic, no Math.random, keyed to road surface) is fully satisfied.

### Auto-adjusted: road-quality.js extracted from road-mesh.js

**Found during:** Task 1 — circular import analysis

**Issue:** `terrain.js` imports from `road-mesh.js` would create `terrain.js → road-mesh.js → terrain.js` (road-mesh.js imports `CHUNK_SIZE` from terrain.js). This would cause ES module circular dependency failures.

**Fix:** Moved `hashRunKey`, `roadQuality`, and the quality constants to new `src/road-quality.js` that imports only from `seed.js`. `road-mesh.js` re-exports all four for backward compatibility. `terrain.js` and `road.js` import directly from `road-quality.js`.

### Auto-adjusted: queryNearest extended to return runKey + arcS

**Found during:** Task 1 — D-03 integration in physics path

**Issue:** `_sampleCarveWorld` and `_buildCarveTable` needed `runKey` and a local arc position to call `roadQuality()` with the same arguments as `sweepRibbon`. `queryNearest` previously returned only `{ point, tangent }`.

**Fix:** Added `bestRunKey` and `bestArcLen` tracking to `queryNearest`'s probe loop. Returns `{ point, tangent, runKey, arcS }` where `arcS = bestU * bestArcLen` (tile-local, 0 to spline arc length). This is backward-compatible — all existing callers destructure only `{ point, tangent }` and silently ignore extra fields. The fallback network path returns `runKey: '', arcS: 0`.

## Known Stubs

None — SURF-06 stretch goal is complete. `potholeEnabled: true` default means potholes are on by default. Can be toggled to false in ranger.js or via a debug slider (not added to debug menu — out of scope for this stretch goal, can be added in a follow-up quick task).

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. Pothole noise is own-math (Math.imul hashing of local constants); no external input or user data involved (T-09-10 accepted).

## Verification

Automated:
- `road-carve.js`: `potholeNoise` count = 2 (comment + definition)
- `ranger.js`: `pothole` count = 7
- `test-road-carve.html`: `SURF-06` count = 12
- `road-carve.js`: no top-level `import` statements (Worker-safe discipline maintained)
- `potholeNoise` unit tested: nonzero at rq=0, zero at rq=1, disabled returns 0, deterministic

Browser verification (manual):
- Open `test/test-road-carve.html` — SURF-06 pothole height-agreement PASS; carve-continuity (SURF-04/05) still PASS
- In-game: drive slowly on low-quality road stretch (dark markings, faint centerline) — slight vertical jolts; high-quality stretch (solid white markings) feels smooth

## Self-Check: PASSED

Files confirmed:
- `src/road-carve.js` — commit 3d61c2a (potholeNoise function added)
- `src/road-quality.js` — commit 3d61c2a (new module, hashRunKey + roadQuality extracted)
- `src/road-mesh.js` — commit 3d61c2a (imports refactored, potholeNoise in sweepRibbon)
- `src/road.js` — commit 3d61c2a (queryNearest extended, potholeNoise in _sampleCarveWorld)
- `src/terrain.js` — commit 3d61c2a (potholeNoise in _buildCarveTable)
- `data/ranger.js` — commit 3d61c2a (potholeEnabled, potholeAmplitude, potholeFrequency)
- `test/test-road-carve.html` — commit 3d61c2a (SURF-06 assertions)
