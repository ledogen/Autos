---
phase: 07-free-cam-seeded-layered-terrain
plan: 03
subsystem: terrain
tags: [terrain, seeded-noise, ridged-multifractal, analytic-height, worker-sync, p7-2]

# Dependency graph
requires:
  - "src/seed.js: djb2, parseWorldSeed, seedFor, mulberry32 (Plan 02)"
provides:
  - "src/terrain.js: seeded three-layer WORKER_SOURCE; analyticHeight/analyticNormal exported; reinitWorker(worldSeed,params); rebuildAllChunksFromWorker()"
  - "src/terrain-worker.js: byte-identical standalone copy of seeded three-layer worker source"
  - "src/main.js: queryContacts/queryVertexContacts use analyticHeight/analyticNormal (no sampleHeight for physics)"
  - "tests/height-agreement-test.html: P7-2 height-agreement assertions at 5 grid-aligned positions"
  - "data/ranger.js: three-layer terrain params (coarseAmplitude/coarseFreq/coarseOctaves/ridgeSharpness/fineAmplitude/fineFreq/regionalStrength/regionalScale)"
affects:
  - "07-04 (debug sliders + spawn): consumes reinitWorker/rebuildAllChunksFromWorker for Path B rebuild"
  - "08 (road routing): consumes analyticHeight for road height queries (deterministic, no chunk dependency)"
  - "P7-2 exit gate: tests/height-agreement-test.html must pass in browser before wave merge"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ridged-multifractal coarse layer: (1 - |noise|)^ridgeSharpness per octave, accumulated with lacunarity=2 gain=0.5"
    - "Three-layer combined height: coarseHeight + fineHeight * regionalModulator (pure math, no state)"
    - "Worker init message pattern: {type:'init', worldSeed, params} before any {type:'generate'} requests"
    - "Analytic physics sampler: queryContacts/queryVertexContacts call analyticHeight/analyticNormal directly (no chunk lookup)"
    - "WORKER_SOURCE sync discipline: shared function bodies must stay byte-identical between WORKER_SOURCE string and terrain-worker.js; edited in the same commit"
    - "Main-thread noise via _prefixed helpers: _createNoise2D/_mulberry32/_seedFor used only in reinitWorker; distinct from Worker-scope function copies"

key-files:
  created:
    - tests/height-agreement-test.html
  modified:
    - src/terrain.js
    - src/terrain-worker.js
    - src/main.js
    - data/ranger.js

key-decisions:
  - "analyticHeight applies terrainAmplitude and never returns 0 for unloaded chunks — physics contacts use analytic path only; sampleHeight bilinear path retained for P7-2 test"
  - "Main-thread noise closures use _underscore-prefixed helpers (_createNoise2D etc.) to distinguish from Worker-scope copies; same algorithm, separate implementation"
  - "Three-layer params added to data/ranger.js as calibration starting values; interactive tuning via debug sliders in Plan 04"
  - "Worker generate silently skips (console.warn) if init not yet received — no crash on race condition at startup"

requirements-completed: [TERR-01, TERR-02, TERR-03, TERR-04, TERR-05, SEED-05]

# Metrics
duration: 25min
completed: 2026-06-08
---

# Phase 07 Plan 03: Seeded Three-Layer Terrain Summary

**Seeded ridged-multifractal + fine FBM + regional modulator in WORKER_SOURCE and terrain-worker.js; analytic physics sampler in main.js; P7-2 height-agreement test in tests/height-agreement-test.html**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-08T19:04:39Z
- **Completed:** 2026-06-08T19:30:00Z (approx)
- **Tasks:** 3
- **Files modified:** 5 (terrain.js, terrain-worker.js, main.js, data/ranger.js, tests/height-agreement-test.html)

## Accomplishments

### Task 1: Seeded Three-Layer Height in WORKER_SOURCE + terrain-worker.js
- Replaced fixed `createNoise2D(() => 0.5)` with three seeded noise closures (`noiseCoarse`, `noiseFine`, `noiseRegional`) initialized via `{type:'init', worldSeed, params}` Worker message
- Added `djb2`, `seedFor`, `mulberry32` verbatim from `src/seed.js` (no `export` keyword) to both WORKER_SOURCE and terrain-worker.js
- Added pure-math layer functions: `coarseHeight` (ridged-multifractal), `fineHeight` (2-octave FBM), `regionalModulator` (low-freq, returns [1-strength, 1]), `height` (combined)
- Worker `generate` loop now calls `height(wx, wz, noiseCoarse, noiseFine, noiseRegional, _workerParams)` instead of old 3-octave sum
- T-07-03-SYNC mitigated: both files edited in the same commit; automated byte-equality check passes

### Task 2: analyticHeight/analyticNormal + init wiring + physics switch
- Added `analyticHeight(wx, wz)` and `analyticNormal(wx, wz)` to TerrainSystem using main-thread noise closures
- Added `reinitWorker(worldSeed, params)` — builds main-thread noise closures AND sends `{type:'init'}` to Worker
- Added `rebuildAllChunksFromWorker()` — Path B: disposes all chunks, clears pending state, re-requests ring on next update
- TerrainSystem constructor now accepts `worldSeed` arg and calls `reinitWorker` after Worker creation
- `queryContacts` and `queryVertexContacts` in main.js now use `analyticHeight`/`analyticNormal` (never returns 0 for unloaded chunks — fixes RESEARCH §Pitfall 6)
- Spawn reset updated to use `analyticHeight` (seats car on real surface immediately, pre-chunk)
- Added `worldSeed` const to main.js (parsed from URL `?seed=` or defaults to `parseWorldSeed('lone-pine')`)
- Three-layer params added to data/ranger.js with calibration starting values from RESEARCH.md

### Task 3: tests/height-agreement-test.html (P7-2 exit gate)
- Creates a real TerrainSystem with `worldSeed = parseWorldSeed('lone-pine')` and calibration params
- Drives `terrainSystem.update()` in rAF loop until chunks covering all 5 test positions are built
- Asserts `|sampleHeight(wx,wz) - analyticHeight(wx,wz)| < 1e-3` at 5 grid-aligned positions: (0,0), (64,0), (0,64), (32,32), (16,48)
- 5s watchdog prints `P7-2 FAIL: chunk(s) never built` if no chunk arrives
- Prints `P7-2 PASS: height agreement verified` on all-pass

## Task Commits

1. `1c92fc8` — feat(07-03): seeded three-layer height in WORKER_SOURCE + terrain-worker.js
2. `1d78f1f` — feat(07-03): analytic physics height + init wiring + three-layer params in ranger.js
3. `d4588f0` — feat(07-03): P7-2 height-agreement test (tests/height-agreement-test.html)

## Files Created/Modified

- `src/terrain.js` — seeded WORKER_SOURCE; analyticHeight/analyticNormal/reinitWorker/rebuildAllChunksFromWorker; main-thread noise helpers
- `src/terrain-worker.js` — byte-identical standalone copy of seeded Worker source
- `src/main.js` — queryContacts/queryVertexContacts on analytic path; worldSeed const; parseWorldSeed import; TerrainSystem(scene, params, worldSeed)
- `data/ranger.js` — three-layer terrain params (coarseAmplitude through regionalScale)
- `tests/height-agreement-test.html` — P7-2 exit gate test

## Decisions Made

- analyticHeight applies terrainAmplitude so caller code (queryContacts) is consistent with sampleHeight callers
- Main-thread noise closures use `_createNoise2D/_mulberry32/_seedFor` (underscore prefix) to distinguish from the Worker-scope copies inside WORKER_SOURCE string — both implement the same algorithm but as separate code paths
- Worker `generate` silently skips with `console.warn` rather than crashing if `init` hasn't been received yet (defensive guard)
- Three-layer params calibrated to RESEARCH §Calibration starting values; Plan 04 will expose them as debug sliders for interactive tuning

## P7-2 Exit Gate Status

**Browser verification required** — open `tests/height-agreement-test.html` via local HTTP server (`npx serve .` then navigate to `/tests/height-agreement-test.html`). Expected console output:
```
P7-2 PASS: height agreement verified
```
The test constructs a real TerrainSystem (Worker-based, requires HTTP), waits for chunks to build, then asserts bilinear vs analytic agreement at 5 grid-aligned positions within 1e-3 m.

## Deviations from Plan

### Auto-additions (Rule 2)

**1. [Rule 2 - Missing Params] Added three-layer terrain params to data/ranger.js**
- **Found during:** Task 2
- **Issue:** `analyticHeight` reads `coarseAmplitude`, `coarseFreq`, `coarseOctaves`, `ridgeSharpness`, `fineAmplitude`, `fineFreq`, `regionalStrength`, `regionalScale` from `params`. These were absent from `RANGER_PARAMS` in `data/ranger.js`, causing `undefined` values in the height functions.
- **Fix:** Added all eight params with calibration starting values from RESEARCH.md §Calibration.
- **Files modified:** `data/ranger.js`
- **Commit:** `1d78f1f`

**2. [Rule 2 - Missing Input Validation] Worker generate guard**
- **Found during:** Task 1
- **Issue:** If `generate` is received before `init` (race at startup), `noiseCoarse` would be undefined and calling `height(...)` would throw.
- **Fix:** Added `if (!noiseCoarse) { console.warn(...); return }` guard in generate handler.
- **Files modified:** `src/terrain.js` (WORKER_SOURCE), `src/terrain-worker.js`
- **Commit:** `1c92fc8`

**3. [Rule 2 - Architecture] Main-thread noise uses separate _prefix helpers**
- **Found during:** Task 2
- **Issue:** TerrainSystem.reinitWorker needs to call `createNoise2D`, `mulberry32`, `seedFor` in the main thread, but those names are only defined inside WORKER_SOURCE string scope (for the Blob Worker). They cannot be imported from a string literal.
- **Fix:** Added module-scope `_createNoise2D`, `_mulberry32`, `_seedFor`, `_buildPermutationTable` helpers with underscore prefix. These implement the same algorithm but as regular ES6 module-scope functions. The design satisfies the requirement: main-thread and Worker both use the same seeded noise algorithm.
- **Files modified:** `src/terrain.js`
- **Commit:** `1c92fc8`

## Known Stubs

None — all layer functions are fully implemented. `_workerParams = null` and `_noiseCoarse = null` are legitimate initialization states (set on first `reinitWorker` call, which happens in the constructor).

## Threat Flags

No new threat surface introduced. All code paths are same-origin, no network requests, no DOM injection. T-07-03-DET (seeded determinism) and T-07-03-SYNC (Worker source drift) mitigations are in place per the plan's threat register.

## Self-Check: PASSED

- `src/terrain.js` — FOUND and contains `analyticHeight`, `analyticNormal`, `reinitWorker`, `rebuildAllChunksFromWorker`, `coarseHeight`, `fineHeight`, `regionalModulator`
- `src/terrain-worker.js` — FOUND and byte-matches WORKER_SOURCE for all shared functions (automated check passed)
- `src/main.js` — FOUND; `queryContacts`/`queryVertexContacts` use `analyticHeight`/`analyticNormal`; `sampleHeight` not in physics path
- `data/ranger.js` — FOUND with all eight three-layer params
- `tests/height-agreement-test.html` — FOUND with P7-2 assertions, watchdog, `sampleHeight`, `analyticHeight`, `parseWorldSeed`
- Commits `1c92fc8`, `1d78f1f`, `d4588f0` — all exist in git log (verified)

---
*Phase: 07-free-cam-seeded-layered-terrain*
*Completed: 2026-06-08*
