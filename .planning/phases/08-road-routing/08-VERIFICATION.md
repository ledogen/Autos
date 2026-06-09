---
phase: 08-road-routing
verified: 2026-06-08T12:00:00Z
status: human_needed
score: 4/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Load test/test-road-seam.html via Live Server and check console output for C0 and C1 seam assertions"
    expected: "All D-06 PASS lines visible. Specifically: 6 C0 seam assertions (dist < 0.01m) and 6 C1 seam assertions (angle < 5deg). If any C0 assertions FAIL, note the actual distances reported."
    why_human: "The C0 assertion (getPoint(1.0) vs getPoint(0.0)) checks distances between ghost endpoints from adjacent tiles. Code analysis shows these ghost endpoints are independently-seeded waypoints that could be 4–64m apart, making the < 0.01m threshold unlikely to pass. This needs browser execution to determine actual values."
  - test: "Load test/test-road-seam.html via Live Server and visually inspect debug splines"
    expected: "Road centerlines appear continuous across tile boundaries with no visible 64m-scale gaps or kinks. The visual seam quality is the actual Phase 8 exit gate (ROADMAP SC-2)."
    why_human: "The ghost-point implementation provides C1 tangent continuity at ghost endpoints but the tiles do NOT share a common endpoint at x=tileX*64. Whether the visual result is acceptable requires a human to judge 'visible gaps' in the scene."
  - test: "Load index.html, open debug panel (backtick), Roads folder — toggle 'Show Road Splines'"
    expected: "Orange centerlines appear/disappear. Roads are visible throughout the terrain. Truck spawns on or near a road, facing along it."
    why_human: "ROAD-04 debug viz and spawn behavior are UI/visual outcomes that require browser verification."
  - test: "Load test/test-road.html via Live Server, check all PASS/FAIL output"
    expected: "All assertions pass: ROAD-01 determinism, ROAD-02 grade limit, ROAD-03 switchback X-extent, ROAD-04 query primitives, ensureTile idempotent, queryNearest tangent, setDebugVisible toggle, D-06 seam continuity."
    why_human: "Test harness uses Three.js which requires a browser with HTTP server. No headless runner is available per CLAUDE.md constraints."
---

# Phase 8: Road Routing — Verification Report

**Phase Goal:** Deterministic roads route themselves over the coarse terrain, switchback where the grade is too steep, and are visible as debug splines — the route network is queryable and stable before any ribbon mesh is built.
**Verified:** 2026-06-08T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Same seed produces identical road splines (determinism) | VERIFIED | No `Math.random` in road.js; all RNG uses `mulberry32(seedFor(...))` with seeded inputs. Two-instance determinism test exists in test-road.html. `_coarseH` delegates to seeded simplex closure. |
| SC-2 | Road splines cross tile seams without visible kinks or gaps | UNCERTAIN | Ghost-point C1 mechanism is code-correct. BUT C0 test in exit-gate harness tests ghost endpoint distances (likely fails); C1 test is trivially satisfied at ghost endpoints. Whether visual seam quality is acceptable requires human inspection. See Seam Analysis below. |
| SC-3 | Where grade exceeds max, the road switchbacks visibly | VERIFIED | Hard grade block (`return Infinity`) at line 287 of road.js; quadratic slope penalty at line 290; switchback test uses `mockCoarseHeight` (50% ramp) via constructor injection; ROAD-03 assertion checks X-extent > one cell. Code path is correct. |
| SC-4 | Road centerlines are visible as colored debug lines and can be toggled off | VERIFIED | `buildDebugLines()` + `setDebugVisible()` wired in road.js; Roads folder in debug.js with `Show Road Splines` checkbox; `onRoadVizToggle` callback in main.js at line 755; Three.js `Line` objects with orange material. |

**Score:** 4/6 truths verified (SC-2 uncertain; 2 human-verification items)

---

### Seam Continuity Analysis (SC-2 Detail)

The ghost-point approach in `_buildTileSpline` is structurally sound for C1 tangent continuity at the ghost endpoints. However, two issues with the exit-gate test design raise uncertainty:

**C0 assertion analysis:**
The D-06 test checks `tileA.spline.getPoint(1.0).distanceTo(tileB.spline.getPoint(0.0)) < 0.01m`.

- `tileA.getPoint(1.0)` = `ghostRight` of tile A = `tile(tX+1,tZ).waypoints[0]` (first A* cell of tile B, wx ≈ `(tX+1)*64 + 2` = x≈66 for tX=0)
- `tileB.getPoint(0.0)` = `ghostLeft` of tile B = `tile(tX,tZ).waypoints[last]` (last A* cell of tile A, wx ≈ `tX*64 + 62` = x≈62 for tX=0)

The X-axis gap alone is 4m (grid cell width = `CHUNK_SIZE/routeGridSize = 64/16 = 4m`), plus independently-seeded Z offsets. The 0.01m threshold CANNOT pass. This is a test design issue — it tests a guarantee the implementation intentionally does not make.

**C1 assertion analysis:**
The D-06 C1 test checks `angleBetween(tileA.getTangentAt(1.0), tileB.getTangentAt(0.0)) < 5°`.

For open `CatmullRomCurve3`, the boundary tangent at t=1 is the direction `(pts[n-1] - pts[n-2])` = `(ghostRight_A - lastRealWaypointOf_A)` = `(tileB.wpts[0] - tileA.wpts[last])`. The boundary tangent at t=0 for tile B is `(pts[1] - pts[0])` = `(tileB.wpts[0] - tileA.wpts[last])`. These are the **same vector** — the C1 test is trivially 0° and does not validate continuity at the actual tile boundary x=tileX*64.

**Implication:** SC-2 requires human visual inspection in browser to verify "no visible gaps or kinks." The test infrastructure does not correctly capture this guarantee. If the visual debug lines show acceptable continuity, SC-2 passes; otherwise it fails and the exit gate has not been met.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/road.js` | RoadSystem core: A*, splines, query API | VERIFIED | 649 lines; MinHeap, RoadSystem class, `_routeTile`, `_buildTileSpline`, `queryNearest`, `ensureTile`, `setDebugVisible`, `buildDebugLines` all present and substantive |
| `test/road-test-harness.js` | assert, mockCoarseHeight, TEST_PARAMS | VERIFIED | All 3 exports present; `mockCoarseHeight` returns `wz * 0.5` (50% ramp) |
| `test/test-road.html` | Browser test harness for ROAD-01..04 | VERIFIED | All 6 original suites + 3 new 08-02 extension suites + D-06 seam fold; importmap matches index.html |
| `test/test-road-seam.html` | D-06 exit-gate seam test | VERIFIED (code exists) | Correct structure; C0/C1 assertions exist with 5° threshold; see seam analysis above for test design concern |
| `data/ranger.js` | 5 road routing params | VERIFIED | `maxRoadGrade: 0.12`, `routeGridSize: 16`, `roadSlopePenalty: 50`, `roadAltWeight: 0.1`, `spurProbability: 0.15` present at lines 195-217 |
| `src/debug.js` | Roads folder with viz toggle + grade slider | VERIFIED | `roadFolder`, `_roadState`, `Show Road Splines`, `Max Grade (ratio)`, `Slope Penalty`, `Alt Weight` sliders at lines 196-210; callbacks guarded |
| `src/main.js` | RoadSystem import, init, callbacks, debouncedRoadRebuild | VERIFIED | Import at line 27; `let roadSystem = null` at line 42; instantiated at line 771; `onRoadVizToggle`/`onRoadParamChange` at lines 755-756; `debouncedRoadRebuild` at line 240 with 150ms timeout |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `debug.js` Roads folder | `main.js` callbacks | `onRoadVizToggle(v)`, `onRoadParamChange()` | WIRED | `debug.js` line 199: `callbacks.onRoadVizToggle(v)`; `main.js` line 755: wired to `roadSystem.setDebugVisible(v)` |
| `main.js` debouncedRoadRebuild | `road.js` invalidateCache + buildDebugLines | `roadSystem.invalidateCache()`, `roadSystem.buildDebugLines()` | WIRED | main.js lines 244-245 |
| `main.js` resolveSpawn | `road.js` ensureTile + queryNearest | `roadSystem.ensureTile(...)`, `roadSystem.queryNearest(...)` | WIRED | main.js lines 140-143; 3×3 tile pre-warm before query |
| `resolveSpawn` road path | Phase 7 terrain fallback | `console.warn` + terrain grid sweep | WIRED | Lines 153-206; fallback preserved verbatim |
| `road.js` seed derivation | `seed.js` | `seedFor(worldSeed, 'roads', tileX, tileZ)` | WIRED | road.js line 242; no `Math.random` anywhere in road.js |
| `road.js` noise closure | `seed.js` + `simplex-noise` | `createNoise2D(mulberry32(seedFor(worldSeed, 'coarse')))` | WIRED | road.js line 197; byte-identical to terrain.js coarse closure |
| `road.js` A* | `coarseHeight` | `this._coarseH(wx, wz)` (never sampleHeight/analyticHeight) | VERIFIED | Only `_coarseH` used in routing; forbidden patterns absent from road.js (comments only use paraphrases) |

---

### Decision Verification

| Decision | Claim | Status | Evidence |
|----------|-------|--------|---------|
| D-03 | Max grade exposed as live debug slider | VERIFIED | debug.js line 201: `roadFolder.add(params, 'maxRoadGrade', 0.04, 0.20, 0.01)`; fires `onRoadParamChange` |
| D-05 | Debug viz = splines only, toggled via lil-gui checkbox | VERIFIED | `Show Road Splines` checkbox in Roads folder; `setDebugVisible` auto-builds on first enable |
| D-06 | Seam continuity is exit gate | PARTIAL | Exit gate test EXISTS and has the C0/C1 structure. However, C0 threshold (< 0.01m) tests ghost endpoint distance not actual seam position. C1 test is trivially satisfied. Visual verification required. |
| D-07 | resolveSpawn signature unchanged; body swapped to road probe | VERIFIED | `function resolveSpawn(wseed, params)` at line 126; `_reseatTruckAtSpawn` call at line 255 unchanged; road probe at lines 132-154; Phase 7 fallback preserved at lines 156-206 |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| ROAD-01 | Deterministic tile-able graph over coarse height, same seed = same roads | VERIFIED | `seedFor` + `mulberry32` for all RNG; no `Math.random`; two-instance determinism tests in test-road.html; byte-identical coarse height closure |
| ROAD-02 | Slope-weighted cost + hard maximum-grade limit | VERIFIED | `_edgeCost`: hard `Infinity` return at grade > maxRoadGrade (line 287); quadratic penalty `grade*grade*roadSlopePenalty` (line 290); valley-seeking `altCost` (line 291) |
| ROAD-03 | Switchbacks where direct line exceeds max grade | VERIFIED (code path) | `mockCoarseHeight` injection for test isolation; ROAD-03 test asserts X-extent > 4m on 50% ramp; browser execution required to confirm pass |
| ROAD-04 | Queryable splines + debug lines | VERIFIED | `queryNearest` returns `{point, tangent}`; `ensureTile` public; `buildDebugLines`/`setDebugVisible` implemented; Roads folder in debug panel |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/road.js` | (n/a) | Spur generation: `spurProbability` param exists but no `_generateSpur()` method | INFO | Acknowledged stub (D-01 in CONTEXT); trunk routing complete; spurs deferred. Does not affect ROAD-01..04. |

No TBD/FIXME/XXX markers found. No Math.random in routing path. No forbidden terrain calls (`sampleHeight`, `analyticHeight`) in routing.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED (no headless runner available; Three.js requires browser per CLAUDE.md constraints).

---

### Probe Execution

Step 7c: No probe scripts found in `scripts/` for this phase. Browser-based HTML harnesses are the test infrastructure.

---

### Human Verification Required

#### 1. C0 Seam Distance Verification (Exit Gate D-06)

**Test:** Load `test/test-road-seam.html` via Live Server (e.g., `npx serve .` then open `http://localhost:3000/test/test-road-seam.html`). Open DevTools console.
**Expected:** All 12 seam assertions PASS (6 C0 + 6 C1). If the C0 assertions show "FAIL" with distances > 0.01m, the exit gate is not met and the seam design needs correction.
**Why human:** Code analysis identifies that the C0 test checks ghost endpoint distances (inherently >= 4m apart), not true tile seam position continuity. The test may systematically fail, requiring a design fix before Phase 9 starts.

#### 2. Visual Seam Continuity (ROADMAP SC-2)

**Test:** Load `index.html` via Live Server. Open debug panel (`backtick`). In Roads folder, enable "Show Road Splines." Free-cam (Shift+C) to view the terrain from above. Inspect road centerlines at the 64m tile boundaries.
**Expected:** Road centerlines appear visually continuous — no visible jumps or gaps at tile seams. Tangent direction is smooth through the boundary.
**Why human:** The ghost-point mechanism provides C1 tangent continuity at ghost endpoints, but C0 position continuity at x=tileX*64 is not explicitly enforced. Whether this produces visually acceptable roads is a judgment call requiring human inspection.

#### 3. Full Test Suite Pass (test-road.html)

**Test:** Load `test/test-road.html` via Live Server. Open DevTools console.
**Expected:** All assertions show `PASS:`. Critical items: ROAD-01 determinism (both instances), ROAD-02 grade limit, ROAD-03 switchback X-extent > 4m, ROAD-04 spline/tangent, 08-02 ensureTile idempotent, 08-02 queryNearest tangent, 08-02 setDebugVisible toggle, D-06 seam assertions.
**Why human:** Three.js ES modules require an HTTP server. No headless runner available.

#### 4. Spawn on Road (D-07)

**Test:** Load `index.html`. Reload with `?seed=lone-pine`. Observe truck spawn position.
**Expected:** Truck spawns on or very near a visible road centerline, facing along the road direction. Reloading same seed produces same spawn.
**Why human:** spawn position is a visual runtime outcome. The `queryNearest` fallback (terrain-only if no road nearby) means the truck may not always spawn on a road — depends on whether the spawn region has road tiles generated.

---

### Gaps Summary

No hard blockers found in the codebase. The implementation is complete and substantive for all four requirements (ROAD-01..04). All artifacts exist and are wired. The determinism, grade-limiting, and query API implementations are correct at the code level.

The uncertainty is concentrated in one area: **D-06 exit gate test design**. The C0 assertion checks ghost-endpoint distances which are structurally unable to be < 0.01m (minimum 4m gap). The C1 assertion is trivially satisfied and does not test continuity at the actual x=64 tile boundary. The tests need to pass in a browser to confirm SC-2. If they systematically fail, the seam design needs revision before Phase 9 begins.

The `spurProbability` parameter exists with no spur generation — this is an acknowledged, intentional stub (D-01) that does not affect the phase goal.

---

_Verified: 2026-06-08T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
