---
phase: 07-free-cam-seeded-layered-terrain
plan: 04
subsystem: terrain
tags: [terrain, seeded-noise, debug-panel, spawn, regeneration, lil-gui, seed-field]

# Dependency graph
requires:
  - "src/seed.js: parseWorldSeed, seedFor (Plan 02)"
  - "src/terrain.js: reinitWorker, rebuildAllChunksFromWorker, analyticHeight, analyticNormal (Plan 03)"
  - "src/camera.js: getCameraMode, getFreecamPosition (Plan 01)"
  - "data/ranger.js: coarse/fine/regional defaults (Plan 03)"
provides:
  - "data/ranger.js: terrainAmplitude reset to 1.0 (P7-3 lock — coarse outputs metres)"
  - "src/debug.js: World Seed text field + Coarse/Fine/Regional sub-folders wired to Path-A/Path-B callbacks"
  - "src/main.js: worldSeed (let, URL-parsed), resolveSpawn, _reseatTruckAtSpawn, debouncedRebuildFull, rebuildTerrainFull + changeSeed callbacks"
affects:
  - "07-05+ (Phase 8 road routing): resolveSpawn call site documented as Phase 8 road-graph probe seam"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lil-gui string text field: gui.add(obj,'strKey') renders <input> automatically for string value"
    - "Two-tier terrain rebuild: Path A (terrainAmplitude slider → rebuildAllChunks, instant Y-rescale), Path B (shape/seed sliders → 150ms debounced reinitWorker + rebuildAllChunksFromWorker)"
    - "resolveSpawn pattern: seedFor('spawn') → expanding candidate search → analyticNormal grade check → Phase 8 road-graph seam at this call site"
    - "_reseatTruckAtSpawn: canonical zero-state + analytic ground-probe seat; used at initial load, R-reset, and every Path-B regenerate"
    - "worldSeed as let: URL-parsed at module top, mutated by debug panel seed field onChange"

key-files:
  created: []
  modified:
    - data/ranger.js
    - src/debug.js
    - src/main.js

key-decisions:
  - "terrainAmplitude reset from 0.1 to 1.0: coarse layer outputs metres directly; Y-rescale default of 1.0 means no distortion"
  - "resolveSpawn uses analyticNormal grade threshold (normal.y > cos(15 deg)) not analyticHeight delta — grade check is more relevant than absolute height"
  - "_reseatTruckAtSpawn replaces the entire inline reset block in main.js reset handler — single canonical seat function for all three sites"
  - "No new vehicleState fields added — spawn position/heading flow through existing position and quaternion fields"

requirements-completed: [TERR-06, SEED-04]

# Metrics
duration: ~4min
completed: 2026-06-08T19:21:45Z
---

# Phase 07 Plan 04: Terrain Debug Sliders, Seed Field, and Canonical Spawn Summary

**Live terrain layer sliders (Coarse/Fine/Regional) + World Seed text field in debug panel, wired to Path-A/Path-B rebuild callbacks; canonical resolveSpawn + _reseatTruckAtSpawn seating truck on low-slope spawn via analyticHeight ground-probe**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-08T19:17:45Z
- **Completed:** 2026-06-08T19:21:45Z
- **Tasks completed (autonomous):** 2 of 3 (Task 3 is human-verify checkpoint — TERR-05)
- **Files modified:** 3

## Accomplishments

### Task 1: P7-3 defaults lock in data/ranger.js + World Seed + layer sliders in debug.js (commit `3e8b780`)

**data/ranger.js:**
- `terrainAmplitude` changed from `0.1` to `1.0` with updated comment explaining it is the Path-A Y-rescale multiplier; coarse layer already outputs values in metres so default 1.0 requires no additional compensation

**src/debug.js:**
- Extended `terrainAmplitude` slider range from `0–1.0` to `0–3.0` (calibration range)
- Added `World Seed` text field (lil-gui string input `_seedState.seed`) wired to `callbacks.changeSeed(v)` (Path B)
- Added `Coarse Layer` sub-folder: `coarseAmplitude` (50–500, step 10), `coarseFreq` (0.0005–0.005, step 0.0001), `coarseOctaves` (1–6, step 1), `ridgeSharpness` (1.0–4.0, step 0.1) — all wired to `rebuildTerrainFull` (Path B)
- Added `Fine Layer` sub-folder: `fineAmplitude` (0–10, step 0.1), `fineFreq` (0.01–0.2, step 0.005) — all wired to `rebuildTerrainFull` (Path B)
- Added `Regional Modulator` sub-folder: `regionalStrength` (0–1, step 0.05), `regionalScale` (500–10000, step 100) — all wired to `rebuildTerrainFull` (Path B)
- `terrainAmplitude` slider keeps `rebuildTerrain` (Path A, instant) — no Worker churn
- Debounce (~150ms) lives in `main.js.debouncedRebuildFull`; debug.js fires callbacks unconditionally on onChange

### Task 2: worldSeed + resolveSpawn + _reseatTruckAtSpawn + debouncedRebuildFull in main.js (commit `069f9ad`)

**src/main.js:**
- Added `seedFor` to the `import { parseWorldSeed, seedFor }` from seed.js
- `worldSeed` changed from `const` to `let`; URL parsed via `_urlSeed ?? 'lone-pine'` (D-11 default)
- `resolveSpawn(wseed, params)` function: seeds offset from `seedFor(wseed, 'spawn')`, searches up to 50 candidates via `analyticNormal` grade check (normal.y > cos(15 degrees) = 0.966), falls back to seeded offset with `console.warn`, returns `{ position: THREE.Vector3, heading }` — Phase 8 road-graph probe seam documented in function comment
- `debouncedRebuildFull()`: 150ms debounce via `clearTimeout/setTimeout` — calls `terrainSystem.reinitWorker(worldSeed, RANGER_PARAMS)` + `terrainSystem.rebuildAllChunksFromWorker()` + `_reseatTruckAtSpawn()` (T-07-04-ROB: one rebuild per settle, not per drag pixel)
- `_reseatTruckAtSpawn()`: canonical zero-state + analytic ground-probe; called at (1) initial load after TerrainSystem construction, (2) R-reset, (3) every Path-B regenerate; free-cam position unaffected (D-15)
- `initDebug` callbacks extended: `rebuildTerrainFull: () => debouncedRebuildFull()` and `changeSeed: (v) => { worldSeed = parseWorldSeed(v); debouncedRebuildFull() }`
- R-reset block replaced with `_reseatTruckAtSpawn()` call (simpler, consistent with regenerate)
- Initial load: `_reseatTruckAtSpawn()` called immediately after `terrainSystem = new TerrainSystem(...)` (analyticHeight available pre-chunk)

## Task Commits

1. `3e8b780` — feat(07-04): P7-3 lock defaults in ranger.js + seed/layer sliders in debug.js
2. `069f9ad` — feat(07-04): seed parse + resolveSpawn + debounced Path-B rebuild in main.js

## Files Created/Modified

- `data/ranger.js` — terrainAmplitude: 0.1 → 1.0 (P7-3 Y-rescale default corrected)
- `src/debug.js` — World Seed field + Coarse/Fine/Regional sub-folders; all shape sliders wired to Path B
- `src/main.js` — worldSeed (let, URL-driven), resolveSpawn, _reseatTruckAtSpawn, debouncedRebuildFull, new initDebug callbacks

## Decisions Made

- terrainAmplitude changed from 0.1 to 1.0: Plan 03 committed coarse params that output height in metres; the old 0.1 value was a pre-calibration placeholder that would have scaled the coarse terrain to ~10% of intended height
- resolveSpawn uses expanding grid search (5-column x 10-row) rather than pure random walk — ensures coverage of different terrain zones while remaining deterministic from the spawn seed
- 3-places rule not triggered: no new vehicleState fields added; spawn position/heading flow through existing `position` (THREE.Vector3 mutation) and `quaternion` (setFromAxisAngle)
- `_reseatTruckAtSpawn` references `vehicleState` (defined after the function in module scope) — safe because the function body only executes at call time, after vehicleState is initialized

## Checkpoint Required (Task 3 — TERR-05)

Task 3 is a `checkpoint:human-verify` gate requiring:
1. Serve the repo and open `index.html` with the `lone-pine` seed
2. Press Shift+C, fly the free-cam, tune Coarse/Fine/Regional/terrainAmplitude sliders to match Eastern-Sierra character (escarpments + valleys per `references/km elev ref.png`)
3. Drive the truck on open ground: Fine layer should visibly unsettle the suspension at speed (D-10)
4. Confirm FPS HUD holds >= 55 fps with ~25 chunks + physics sampling analyticHeight (TERR-05)
5. Report approved slider values — agent will hand-write them into `data/ranger.js` (D-12, no export button) and commit, finalizing P7-3 lock

The P7-3 lock is not fully finalized until user-approved calibration values are committed after this checkpoint.

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as written. No Rule 1/2/3 auto-fixes needed.

## Known Stubs

None. All sliders are wired to real callbacks. `resolveSpawn` returns a real analyticHeight-probed position (not a placeholder). `_reseatTruckAtSpawn` zeros all real vehicleState fields.

The P7-3 lock is partially complete: `terrainAmplitude: 1.0` is committed, but coarse/fine/regional calibration values remain at RESEARCH.md starting points pending Task 3 human-calibration approval.

## Threat Surface Scan

T-07-04-INJ: Seed string flows only through `parseWorldSeed(v)` — `djb2()` arithmetic — assigned to `worldSeed` (number). Never passed to `innerHTML`, `eval`, URL sink, or DOM. lil-gui renders the seed field as a plain `<input type="text">` with no HTML interpolation. Mitigated.

T-07-04-ROB: Path-B rebuild debounced at 150ms (`clearTimeout/setTimeout`); one rebuild per slider-settle, not per drag pixel. `djb2` handles empty/oversized strings deterministically. Mitigated.

T-07-04-SPAWN: `resolveSpawn` bounded at 50 tries with `console.warn` + origin fallback; no infinite loop, no remote data. Accepted per plan threat register.

No new threat surface beyond the plan's threat register.

## Self-Check: PASSED

- `data/ranger.js` — FOUND; `terrainAmplitude: 1.0` and all 8 three-layer params confirmed
- `src/debug.js` — FOUND; contains `World Seed`, `rebuildTerrainFull`, `changeSeed`, `coarseAmplitude`, `coarseFreq`, `coarseOctaves`, `ridgeSharpness`, `fineAmplitude`, `fineFreq`, `regionalStrength`, `regionalScale`
- `src/main.js` — FOUND; contains `resolveSpawn`, `_reseatTruckAtSpawn`, `debouncedRebuildFull`, `rebuildTerrainFull`, `changeSeed`, `URLSearchParams`, `parseWorldSeed`, `let worldSeed`, `seedFor`
- Commit `3e8b780` — FOUND in git log
- Commit `069f9ad` — FOUND in git log

---
*Phase: 07-free-cam-seeded-layered-terrain*
*Tasks completed: 2/3 (Task 3 awaiting human calibration checkpoint — TERR-05)*
*Completed: 2026-06-08*
