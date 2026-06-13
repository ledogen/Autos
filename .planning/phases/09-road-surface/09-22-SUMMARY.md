---
phase: 09-road-surface
plan: 22
subsystem: road/terrain
tags: [D3, carve, crown, camberProfile, crownProfile, footprint-bound, max-floor-guard, SURF-04, SURF-05]
dependency_graph:
  requires: ["09-20", "09-21"]
  provides: [D3-carve-cross-section, D3-footprint-bound, D3-max-floor-guard, carve-invalidation-wiring]
  affects: [src/terrain.js, src/road.js, data/ranger.js, src/debug.js, src/main.js]
tech_stack:
  added: []
  patterns:
    - D3 carve-inherits-ribbon-cross-section (ny + crownProfile + camberTilt - clearanceMargin)
    - D3 footprint bound (carveHalfWidth capped at roadMinTurnRadius)
    - D3 max-floor guard (MAX over covering arms' carveTargets)
    - collectChunkSplinePoints returns { pts, sampleArcS, sampleRunKeys } (extended return shape)
key_files:
  created: []
  modified:
    - src/terrain.js
    - src/road.js
    - data/ranger.js
    - src/debug.js
    - src/main.js
decisions:
  - D3: carveTargetY = ny + crownProfile(signedLat, halfWidth, crownHeight) + signedLat*sin(camberProfile(arcS, runKey)) - clearanceMargin — identical cross-section to ribbon, lowered by clearance; trough tilts with ribbon → uniform clearance on banked turns
  - D3: collectChunkSplinePoints extended from flat array return to { pts, sampleArcS, sampleRunKeys } — parallel arrays indexed by sample number (pts[i*5] aligns with sampleArcS[i] and sampleRunKeys[i])
  - D3: carveHalfWidth capped at roadMinTurnRadius (footprint bound ≤ ½ min inter-arm separation); NEW COUPLING: carve footprint ↔ roadMinTurnRadius — must size together
  - D3: max-floor guard fires when intBi != extBi (two arms cover vertex); computes carveTarget for extBi and applies MAX — higher arm wins, lower arm cannot undermine upper arm's support
  - D3: debouncedRoadRebuild updated to also call rebuildAllChunksFromWorker so roadMinTurnRadius changes re-bake the carve footprint cap immediately
metrics:
  duration: ~30m
  completed: 2026-06-13
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 9 Plan 22: D3 Carve Inherits Ribbon Cross-Section + Multi-Arm Footprint/Undermine Handling — Summary

**One-liner:** Terrain carve target now equals `roadY + crownProfile(uLat) + signedLat*sin(camberProfile(arcS)) - clearanceMargin` — the SAME cross-section as the ribbon, lowered by the clearance margin — so the trough tilts with the ribbon and clearance is uniform on banked turns; switchback arms' footprints are bounded by roadMinTurnRadius with a max-floor guard preventing a lower arm from undercutting a higher arm's support.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Carve target inherits crown + camber cross-section | f8eb5cf | src/terrain.js, src/road.js |
| 2 | Multi-arm footprint bound + max-floor guard | c2afd00 | src/terrain.js |
| 3 | Wire carve-footprint coupling to slider + invalidation | 2367d9b | data/ranger.js, src/debug.js, src/main.js |

## What Was Built

### `collectChunkSplinePoints` extended return shape (src/road.js)

Previously returned a flat `number[]` at stride 5. Now returns `{ pts, sampleArcS, sampleRunKeys }`:
- `pts` — unchanged stride-5 flat array `[x,y,z,tx,tz]` (D4 arm disambiguation unchanged)
- `sampleArcS[i]` — arc-length along the spline at sample i (metres, = arcSOffset + u * splineLen)
- `sampleRunKeys[i]` — canonical run key (string) for sample i

The loop now destructures `seg` to read `seg.runKey` and `seg.arcSOffset` alongside `seg.spline`. Both default gracefully (`runKey = seg.runKey ?? ''`, `arcSOffset = seg.arcSOffset ?? 0`). The existing O(N) pre-loop structure is unchanged.

### D3 carve cross-section (src/terrain.js `_buildCarveTable`)

**Import restored:** `crownProfile` from `./road-carve.js` re-imported (was removed in 09-11 when pothole/curvature were removed; crown is now needed again for D3).

**Pre-loop additions:**
- `crownHeight = p.crownHeight ?? 0.05` extracted alongside the other pre-loop consts
- `const { pts: samples, sampleArcS, sampleRunKeys } = this._roadSystem.collectChunkSplinePoints(...)`

**Per-vertex inner loop (after selecting `bi`):**
```
biIdx   = bi / STRIDE
biTx/tz = samples[bi+3], samples[bi+4]
sdxBi/sdzBi from samples[bi], samples[bi+2]
signedLat = (-sdxBi)*biTz - (-sdzBi)*biTx   // same sign convention as D4
arcS    = sampleArcS[biIdx]
runKey  = sampleRunKeys[biIdx]
camberAngle = this._roadSystem.camberProfile(arcS, runKey)  // O(log N), cached D2 profile
crownY  = crownProfile(signedLat, halfWidth, crownHeight)
tiltY   = signedLat * Math.sin(camberAngle)
carveTargetY = ny + crownY + tiltY - clearanceMargin
```

**PERF CONTRACT preserved:** `camberProfile` is an O(log N) binary search on the pre-built D2 per-run cache (no per-vertex spline eval). The `crownProfile` call is two arithmetic operations. Zero closures, zero allocations in the inner loop.

### D3 refinement — footprint bound (src/terrain.js)

```
const minRadius      = (this._roadSystem._params?.roadMinTurnRadius ?? 12)
const carveHalfWidth = Math.min(halfWidth + carveExtraWidth, minRadius)
```

At hairpins (D0 arc-fillet), arms separate by ~2·minRadius. Each arm's trough is bounded to minRadius wide → the two footprints just meet in the middle with no overlap. Documented with a NEW COUPLING comment: `carve footprint ↔ roadMinTurnRadius`.

### D3 refinement — max-floor guard (src/terrain.js)

After computing the primary `carveTargetY` (from `bi = intBi`), when `intBestD2 < Infinity && extBi !== intBi` (two different arms cover the vertex), the guard computes the extBi arm's carveTarget using the same cross-section formula and applies:
```
if (maxFloor > carveTargetY) carveTargetY = maxFloor
```
The higher arm wins — the lower arm's cut cannot remove the upper arm's support. A managed steep bank between arms is accepted (only degenerate vertical seams are disallowed per SURF-05).

### Carve invalidation wiring (src/main.js)

`debouncedRoadRebuild` now also calls `terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)` + `terrainSystem.rebuildAllChunksFromWorker()`. This ensures that changing `roadMinTurnRadius` (which adjusts the carve footprint cap) re-bakes the carve immediately, not just on the next natural chunk cycle.

### Comments + coupling documentation (data/ranger.js, src/debug.js)

- `roadCarveExtraWidth` in ranger.js updated with D3 coupling note
- `roadClearanceMargin` in ranger.js updated noting D3 uniform clearance on banked turns
- `roadCarveExtraWidth` slider in debug.js gains D3 coupling note
- `roadMinTurnRadius` slider in debug.js gains D3 note about carve re-bake on change

## Verification Results

```
node --check src/terrain.js src/road.js data/ranger.js src/debug.js src/main.js  →  ALL OK

node test/spline-continuity.mjs  →  Exit: 0

  GATE RESULT (spline metrics): PASS — 2 gate fixture(s) all within thresholds
    gentle-baseline    → PASS
    tile-seam-mismatch → PASS
  PHYSICS-SAMPLING CONTINUITY: PASS (refine maxDY=0.020 m <= 0.05 m)
  HAIRPIN INNER-EDGE FOLD GATE: PASS (innerEdgeFolds=0)

git diff --stat src/terrain-worker.js  →  (empty — untouched)
```

## Deviations from Plan

**1. [Rule 2 - Missing functionality] debouncedRoadRebuild now also rebuilds carve**

- **Found during:** Task 3
- **Issue:** `roadMinTurnRadius` fires `debouncedRoadRebuild`, which previously only called `invalidateCache` + `roadMeshSystem.clearAll()` — it did NOT call `rebuildAllChunksFromWorker()`. Since D3's footprint cap reads `roadMinTurnRadius` directly from `_roadSystem._params`, changing the slider would leave carve tables stale until chunks cycled out of the ring.
- **Fix:** Added `terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)` + `terrainSystem.rebuildAllChunksFromWorker()` to `debouncedRoadRebuild` so the carve re-bakes on every road rebuild path (not just the surface-rebuild path).
- **Files modified:** src/main.js
- **Commit:** 2367d9b

**2. collectChunkSplinePoints return shape change**

- **Found during:** Task 1
- **Issue:** The plan said "reuse per-sample data" for arcS/runKey, but the existing flat stride-5 array only carried `[x,y,z,tx,tz]`. arcS and runKey are not representable as floats alongside position data without breaking stride-5 compatibility (runKey is a string).
- **Fix:** Changed return type to `{ pts, sampleArcS, sampleRunKeys }` — flat `pts` array unchanged (D4 compatibility preserved), two parallel arrays added. Callers destructure with `const { pts: samples, sampleArcS, sampleRunKeys } = ...`.
- **Files modified:** src/road.js, src/terrain.js
- **Commit:** f8eb5cf

## Known Stubs

None — the D3 carve cross-section is fully wired. No placeholders.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- `src/terrain.js` modified: FOUND (commits f8eb5cf, c2afd00) — crownProfile import, carveTargetY cross-section, footprint bound, max-floor guard
- `src/road.js` modified: FOUND (commit f8eb5cf) — collectChunkSplinePoints returns { pts, sampleArcS, sampleRunKeys }
- `data/ranger.js` modified: FOUND (commit 2367d9b) — D3 coupling comments on roadCarveExtraWidth, roadClearanceMargin
- `src/debug.js` modified: FOUND (commit 2367d9b) — D3 coupling notes on two sliders
- `src/main.js` modified: FOUND (commit 2367d9b) — debouncedRoadRebuild carve rebuild added
- `src/terrain-worker.js` untouched: CONFIRMED (git diff --stat empty)
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- `camberProfile` referenced in terrain.js: CONFIRMED (grep shows 10 occurrences)
- `crownProfile` imported in terrain.js: CONFIRMED (import from road-carve.js)
- `maxFloor` pattern in terrain.js: CONFIRMED (grep shows 15 occurrences of footprint/maxFloor/inter-arm keywords)
- `roadMinTurnRadius` footprint cap in terrain.js: CONFIRMED
