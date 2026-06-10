---
phase: 08-road-routing
verified: 2026-06-10T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/7
  gaps_closed:
    - "RoadSystem builds a continuous valley-following trunk from macro-anchors via soft-cost A*, no per-tile west-east A*, no hard grade block"
    - "Every routed edge cost is finite — router never returns 'no path' (hard Infinity grade block removed)"
    - "Trunk polyline post-processed into canonical network store this._network keyed deterministically"
    - "Continuous trunk sliced at 64 m boundaries into per-tile Catmull-Rom splines (C0/C1 free) via _sliceNetwork / this._tiles"
    - "ensureTile warms+returns a tile object exposing .spline/.waypoints; queryNearest returns nearest point + unit tangent or null over this._tiles"
    - "Shipped viz is centerline-only single-checkbox-toggled clean-by-default; proto folder + retired sliders gone; main.js drives roadSystem.update(); no updateProto/setProto*/onProto* remain"
    - "maxGrade/D-09 cost-weight sliders re-stream deterministically (debounced); truck spawns on nearest road facing down it; D-06 seam gate PASS"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Serve the repo over HTTP (npx serve .) and open test/test-road-seam.html in a browser (real Three.js r184 via CDN importmap); read the DevTools console."
    expected: "Console reports 'EXIT GATE D-06: PASS' with every checked seam C0 < 0.01 m and C1 < 5°, totalSeams >= 1, and the determinism assertion (tile 3,-7 same-seed tangent diff < 1e-9) passing. No FAIL lines."
    why_human: "Repo ships no node_modules (CDN importmap, browser-only per CLAUDE.md). The verifier cannot run the browser gate in this environment. The harness assertion logic and thresholds were verified by source inspection (C0<0.01m / C1<5° / totalSeams>=1, unchanged from the original contract); only a live browser run produces the authoritative PASS."
  - test: "Open index.html over HTTP, enable the 'Show Road Splines' checkbox in the Roads debug folder, drive/free-cam around the lone-pine world."
    expected: "Cyan centerline splines appear (and are OFF by default before the checkbox), follow the valleys, wrap around high ground rather than climbing it, and stream continuously as the view moves. Moving the Max Grade / wAlt / wGrade / wOver / wTurn sliders re-streams the network after a short debounce."
    why_human: "Visual appearance, valley-wrapping behavior, streaming feel, and live-slider re-route are render/real-time behaviors that cannot be confirmed by static code inspection."
  - test: "Spawn the truck (initial load + R-reset) on lone-pine."
    expected: "The truck spawns sitting on a road, oriented facing down the road (heading from the road tangent), not floating or buried, and not on bare terrain when a road is within 200 m of the seeded spawn offset."
    why_human: "Spawn placement on the rendered surface and heading-down-the-road orientation are visual/runtime outcomes; the wiring (resolveSpawn → ensureTile 3×3 → queryNearest → atan2 heading) is verified in code but the on-screen result needs a human."
---

# Phase 8: Road Routing — Verification Report (Gap-Closure Re-verification)

**Phase Goal:** Deterministic roads route themselves over the coarse terrain, switchback where the grade is too steep, and are visible as debug splines — the route network is queryable and stable before any ribbon mesh is built.
**Verified:** 2026-06-10
**Status:** human_needed
**Re-verification:** Yes — prior status was gaps_found (score 2/7); gap plans 08-05/08-06/08-07 executed and merged.

---

## Goal Achievement

### The Central Finding: The Gap Was Closed

The prior verification (gaps_found, 2/7) found the valley-trunk core had never been built — `src/road.js` was still the retired per-tile west→east A* router with a hard `return Infinity` grade block at line 336, and the valley-trunk model existed only as a disabled `_proto` prototype. Gap plans 08-05 (core), 08-06 (slicing/query), 08-07 (viz/wiring) have now been executed and merged.

The current `src/road.js` is a complete rewrite around the valley-trunk streaming model. The per-tile router (`_routeTile`, `_seamPoint`, `_deriveEdgeWaypoints`, `_buildTileSpline`, `_getTile`, `SEAM_SAMPLES`, `_edgeCost` with the Infinity block) is GONE — zero non-comment occurrences. `_streamNetwork`, `this._network`, `_sliceNetwork`, `this._tiles` are present and load-bearing. `data/ranger.js` carries the locked D-09 cost defaults. `debug.js` has the D-09 cost-weight sliders and no proto folder. `main.js` drives `roadSystem.update(streamCenter)` each frame with no proto references.

All 7 truths are VERIFIED by code inspection and headless-equivalent logic. Status is **human_needed** (not passed) solely because three outcomes are inherently visual/runtime/browser-only: the D-06 seam exit gate must be run in a real browser (no node_modules in this repo — CDN importmap, per CLAUDE.md), and the road appearance + spawn placement are render-time behaviors. The verifier confirmed the gate's assertion logic and thresholds, the spawn wiring, and the viz wiring in source; the live confirmation belongs to the human.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RoadSystem builds a continuous valley-following trunk from seeded macro-anchors via soft-cost A*, with NO per-tile west-east A* and NO hard grade block (`return Infinity` on grade) anywhere in road.js | ✓ VERIFIED | `_streamNetwork` (road.js:770) concatenates per-row east `_protoConnect(_protoAnchor(mx,mz),_protoAnchor(mx+1,mz))` into one polyline, centripetal-samples, `_removeLoops`, splits into runs. Non-comment grep for `return Infinity`/`_routeTile`/`_seamPoint`/`_deriveEdgeWaypoints`/`_buildTileSpline`/`SEAM_SAMPLES`/`_tileCache`/`_getTile` = 0 hits. The only `Infinity` in road.js (lines 704, 729) is the A* g-cost array init `new Float64Array(S*9).fill(Infinity)` and cheapest-goal-state scan — standard A*, not a grade block. |
| 2 | Every routed edge cost is finite — router NEVER returns 'no path' on locked lone-pine | ✓ VERIFIED | `_protoEdgeCost` (road.js:624-628) = `wDist·horiz + wAlt·toH + wGrade·grade² + wOver·max(0,grade−maxGrade)` — a finite sum; the over-cap term is a soft finite penalty, never Infinity. `_protoConnect` always returns endpoints (anchored, line 740) even if the goal cell isn't popped (cheapest-direction fallback, lines 728-731). 08-05 headless smoke: NET_OK (5 runs at origin/lone-pine). |
| 3 | Trunk polyline post-processed into canonical store this._network keyed deterministically | ✓ VERIFIED | `this._network` Map declared in `_protoInit` (road.js:558); populated only by `_streamNetwork`, keyed `"<mz>:<runIndex>"` (road.js:845) after dedupe (`_protoSimplify`), collinear-simplify, and `_removeLoops`. Keys are pure functions of macro-row + run index → deterministic. |
| 4 | Continuous trunk sliced at 64 m boundaries into per-tile Catmull-Rom splines matching C0/C1 — one curve sliced, no shared-seam-waypoint machinery | ✓ VERIFIED | `_sliceNetwork` (road.js:897) walks each network polyline, `_collectCrossings` finds every x/z multiple-of-CHUNK_SIZE(64) crossing, and `_lerpVec3(a,b,t).clone()` is pushed to BOTH the closing and opening sub-polyline (lines 935-938) → identical shared C0 point by construction; both slices are `CatmullRomCurve3(...,false,'centripetal',0.5)` of the same parent geometry → aligned C1. No `_seamPoint`/ghost machinery (grep = 0). 08-06 reports 12/12 network-wide spanning pairs maxC0=0.000 m. |
| 5 | ensureTile warms the network + returns a tile object exposing .spline/.waypoints; queryNearest returns nearest point + unit tangent or null beyond radius, over this._tiles | ✓ VERIFIED | `ensureTile` (road.js:293) calls `_streamNetwork`+`_sliceNetwork`, memoizes per `"tileX,tileZ"`, returns `{spline,waypoints}` (full E-W-spanning representative, spanScore===2) or `{spline:null,waypoints:[]}` (no throw). `queryNearest` (road.js:353) searches the 3×3 `this._tiles` block, samples splines with the reused `_scratchPt`, returns `{point, tangent}` with `getTangentAt` (unit) or null beyond radius; falls back to raw `this._network` polylines. No `_tileCache`/`_getTile` referenced. 08-06 headless: SLICE_OK, QN_OK (unit tangent + finite point), null out-of-radius. |
| 6 | Shipped viz is centerline splines only, single lil-gui checkbox, off by default; proto folder + retired per-tile sliders gone; main.js drives roadSystem.update() each frame; no updateProto/setProto*/onProto* remain | ✓ VERIFIED | debug.js Roads folder (185-213): `Show Road Splines` checkbox (default false) + `Max Grade` + `roadWAlt/roadWGrade/roadWOver/roadWTurn` sliders; non-comment grep for `Valley Trunk (proto)`/`onProtoToggle`/`onProtoParam`/`roadSlopePenalty`/`roadAltWeight`/`_protoState` = 0. road.js `buildDebugLines`/`setDebugVisible`/`update`/`setRadius` present; non-comment `setProtoEnabled`/`setProtoParam`/`setProtoRadius`/`updateProto` = 0. main.js render loop (1025) calls `roadSystem.update(streamCenter)`; non-comment `updateProto`/`setProto*`/`onProto*` = 0. |
| 7 | maxGrade/D-09 cost-weight sliders re-stream deterministically (debounced); truck spawns on nearest road facing down it via queryNearest (resolveSpawn); D-06 seam gate reports PASS | ✓ VERIFIED (gate via human/source) | debug.js sliders fire `onRoadParamChange` → main.js `debouncedRoadRebuild` (249) → `invalidateCache` (clears network+tiles+lines, marks dirty) + conditional `update` → deterministic re-stream (roads pure fn of seed+coords+params). `resolveSpawn` (main.js:126) ensureTiles 3×3 + `queryNearest(baseX,baseZ,200)` + `heading=atan2(tangent.x,tangent.z)` (D-07). Seam gate (test/test-road-seam.html) asserts C0<0.01m, C1<5°, totalSeams>=1 — thresholds verified unchanged in source; 08-07 SUMMARY records EXIT GATE D-06: PASS (totalSeams=3, maxC0=0.00000m, maxC1=0.01°). Browser run routed to human verification. |

**Score:** 7/7 truths verified (truth 7's seam-gate browser run + the visual viz/spawn behaviors routed to human verification — code, wiring, and gate logic verified in source).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/road.js` | Valley-trunk streaming core; per-tile router removed; `_streamNetwork`/`_sliceNetwork`/`this._network`/`this._tiles` | ✓ VERIFIED | Full rewrite. All four load-bearing symbols present; old per-tile router + hard grade block removed (0 non-comment hits). Imports cleanly as ES module (08-05/08-06 IMPORT_OK). |
| `data/ranger.js` | D-09 defaults (roadWDist 1 / roadWAlt 0.85 / roadWGrade 400 / roadWOver 8000 / roadWTurn 120 / maxRoadGrade 0.15); retired per-tile params gone | ✓ VERIFIED | Lines 190-225: all six D-09 params present + documented; spurProbability 0.15 retained (deferred D-01); routeGridSize/roadSlopePenalty/roadAltWeight absent. |
| `src/debug.js` | Roads folder: Show Road Splines + maxGrade + D-09 cost sliders; proto folder + retired sliders removed | ✓ VERIFIED | Lines 196-213 as expected; proto folder/`_protoState`/retired sliders = 0 non-comment hits. |
| `src/main.js` | `roadSystem.update(streamCenter)` in render loop; debounced re-route; resolveSpawn queryNearest preserved; proto wiring retired | ✓ VERIFIED | Render loop 1025; `debouncedRoadRebuild` 249-259; `resolveSpawn` 126-208 (queryNearest + atan2 heading); `onRoadVizToggle`/`onRoadParamChange` callbacks 768-769; proto wiring = 0 non-comment hits. |
| `test/road-test-harness.js` | TEST_PARAMS with D-09 weights | ✓ VERIFIED | Lines 69-74: maxRoadGrade 0.15, roadWDist 1, roadWAlt 0.85, roadWGrade 400, roadWOver 8000, roadWTurn 120. |
| `test/test-road-seam.html` | C0/C1 seam exit gate over sliced valley-trunk splines | ✓ VERIFIED (source) | Discovers real E-W spanning seam pairs, measures each from one consistent stream (fresh RoadSystem per pair), asserts C0<0.01m / C1<5° / totalSeams>=1 — thresholds unchanged. Retarget to real joints is a documented user-approved deviation (file outside 08-07's declared files_modified). Browser run = human verification. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| road.js `_protoEdgeCost` | data/ranger.js roadW* params | `this._proto.params` seeded from `this._params` D-09 defaults; `_refreshParams` on each re-stream | ✓ WIRED | `_protoInit` (538-547) seeds from `p.roadWDist/roadWAlt/...`; `_refreshParams` (581-590) re-reads `this._params` each re-stream. 08-05: constructing with roadWAlt 0.42 → `_proto.params.wAlt===0.42` (WIRED). |
| road.js `_streamNetwork` | `_protoAnchor`/`_protoConnect` | streamed macro-anchor chain → continuous polyline → this._network | ✓ WIRED | road.js:820-845. |
| road.js `queryNearest` | this._tiles / this._network | samples sliced splines for nearest point + unit tangent | ✓ WIRED | road.js:377-417; `getTangentAt` unit; fallback to raw polylines. |
| road.js `ensureTile` | `_streamNetwork`/`_sliceNetwork` | warms + slices network, returns representative spline | ✓ WIRED | road.js:301-302. |
| debug.js Roads sliders | main.js `debouncedRoadRebuild` | onRoadParamChange callback → invalidate + re-stream | ✓ WIRED | debug.js fireRoadParam → onRoadParamChange (209-213); main.js 769 → debouncedRoadRebuild (249). |
| main.js `resolveSpawn` | roadSystem.queryNearest | nearest road point + atan2(tangent) heading (D-07) | ✓ WIRED | main.js:144-152. |
| main.js render loop | roadSystem.update(streamCenter) | streamed around same center as terrain each frame | ✓ WIRED | main.js:1025. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No unreferenced TBD/FIXME/XXX debt markers in road.js/debug.js/main.js/ranger.js/test-road-seam.html | ℹ️ Info | Clean. |
| `src/road.js` | 704, 729 | `Float64Array(...).fill(Infinity)` / `let best = Infinity` | ℹ️ Info (not a finding) | Standard A* g-cost initialization and cheapest-state scan — NOT a grade block. The grade penalty (`_protoEdgeCost`) is finite. D-02 REVISED satisfied. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ROAD-01 | 08-05/06/07 | Roads routed deterministically as a tile-able graph, seamless across chunks | ✓ SATISFIED | `_streamNetwork`/`_sliceNetwork` pure fn of seed+coords+params; `this._tiles` keyed by tile coords; seam C0/C1 free by construction. Determinism asserted in seam harness (same seed → same tangent, diff<1e-9). |
| ROAD-02 | 08-05/07 | Routing uses slope-weighted cost with max-grade limit | ✓ SATISFIED (revised) | Slope-weighted soft cost (wGrade·grade² + wOver·over-cap against maxGrade 0.15). D-02 REVISED: the hard-Infinity max-grade block was deliberately replaced with a finite over-cap penalty (the hard block caused the original "no path" failure). The "hard limit" wording is superseded by the approved D-02 REVISED soft-cap. |
| ROAD-03 | 08-05/07 | Route switchbacks where grade would exceed max | ✓ SATISFIED | Turn-penalty A* (state = cell+heading, wTurn per-45°) over a bbox+margin grid lets the route detour/switchback instead of exceeding grade; over-cap penalty makes steep direct lines expensive. `_protoConnect` (679-745). |
| ROAD-04 | 08-06/07 | Road centerlines queryable as splines + visualized as debug lines | ✓ SATISFIED | `ensureTile`→{spline,waypoints}, `queryNearest`→{point,tangent}; `buildDebugLines`/`setDebugVisible` render centerline THREE.Line per slice, toggled by the Show Road Splines checkbox. |

### Human Verification Required

1. **D-06 seam exit gate (browser).** Serve over HTTP and open `test/test-road-seam.html`; confirm `EXIT GATE D-06: PASS` (every seam C0<0.01m, C1<5°, totalSeams>=1, determinism diff<1e-9, no FAIL). Why human: repo has no node_modules (CDN importmap, browser-only); the verifier confirmed the gate's assertion logic + thresholds in source but cannot run the browser gate.
2. **Road viz + valley-wrapping (browser).** Enable Show Road Splines; confirm centerline splines appear (off by default), wrap around high ground, stream continuously, and that maxGrade/wAlt/wGrade/wOver/wTurn sliders re-stream after debounce. Why human: visual/real-time behavior.
3. **Spawn on road (browser).** Confirm the truck spawns on the road facing down it (not floating/buried) on initial load + R-reset. Why human: render-time placement/orientation outcome.

### Deferred / Known Items (informational, non-blocking)

- `test/test-road.html` references the deleted `_tileCache` (broken by the 08-05 router removal). Documented in `deferred-items.md` as a harness-staleness cleanup item (WR-01) — it is NOT the live exit gate (that is `test/test-road-seam.html`) and does not block goal achievement. Recommend deleting/rewriting in a cleanup plan.
- Spurs (D-01) explicitly deferred to post-functional polish; `spurProbability` retained in params. The phase goal is trunk-only and does not require spurs.

### Gaps Summary

No gaps. All five previously-failed truths and the previously-partial truth are now closed. The valley-following streaming-anchor trunk IS the live RoadSystem core: the per-tile A* router and hard grade block are gone, `_streamNetwork`/`this._network` is the canonical store, `_sliceNetwork`/`this._tiles` provides C0/C1-free per-tile splines, `ensureTile`/`queryNearest` operate over the sliced network, the shipped viz is centerline-only checkbox-toggled, and the render loop + spawn + cost sliders are wired through the valley-trunk network. Status is human_needed (not passed) because the D-06 seam gate is browser-only and the viz/spawn outcomes are visual/runtime — all verifiable code, wiring, and gate logic check out in source.

---

_Verified: 2026-06-10_
_Verifier: Claude (gsd-verifier)_
