---
phase: 08-road-routing
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - data/ranger.js
  - src/debug.js
  - src/main.js
  - src/road.js
  - test/road-test-harness.js
  - test/test-road-seam.html
  - test/test-road.html
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 8 introduces `src/road.js` (a 1008-line RoadSystem) plus wiring in `main.js`/`debug.js`, road params in `data/ranger.js`, and three test artifacts. The module ships TWO independent road networks: a per-tile A* router (`_routeTile` / `ensureTile` / `queryNearest`) and a "PROTOTYPE" valley-following streaming trunk (`updateProto` / `_protoConnect`). The most serious problem is that these two networks are not the same geometry, yet the spawn logic queries one while the renderer draws the other — the truck can be spawned on a road that is never visible. There are also several robustness gaps (empty-heap deref, test-harness param-name mismatch that silently no-ops the proto sliders in tests, a dead `wDist` slider, and documentation that asserts C1 continuity "by construction" that is not actually guaranteed). No injection/secret/crypto issues — this is browser-local deterministic math.

## Critical Issues

### CR-01: Spawn queries the per-tile router but the player drives the proto trunk — truck spawns on an invisible/nonexistent road

**File:** `src/main.js:143` (query) vs `src/main.js:1014` (render); `src/road.js:596` (`queryNearest`) vs `src/road.js:899` (`updateProto`)
**Issue:** `resolveSpawn` calls `roadSystem.ensureTile(...)` + `roadSystem.queryNearest(...)`, which build and search the **per-tile A\* network** (`_tileCache`, `_routeTile`, `_buildTileSpline`). The geometry actually rendered to the screen comes from `updateProto` → `_protoConnect` → `_proto.lines` (the "valley-trunk PROTOTYPE"), which is a **completely different routing algorithm over a different grid** (`PROTO_CELL=10` vs `routeGridSize=16`/4 m cells, soft cost vs hard grade block, anchor chain vs tile seams). The two networks do not coincide. Consequently the truck is spawned on a spline (`nearest.point`) that no debug line draws and that the player cannot see, and `heading` faces "down" a road that is not the visible one. When the proto is disabled (default `enabled:false`, `setProtoEnabled` only flips on via the debug checkbox) nothing is rendered at all, yet spawn still snaps the truck to the per-tile spline. This is a behavioral defect: the core feature (spawn on the road) places the vehicle on phantom geometry.
**Fix:** Pick one network as canonical for Phase 8 ship. Either (a) route `queryNearest`/spawn against the same proto trunk that is rendered (expose a `queryNearestProto` that searches `_proto.segs`/`_proto.lines`), or (b) render the per-tile `_tileCache` splines that spawn queries (call `buildDebugLines()` and drop the proto from the shipped path). Do not ship a spawn probe and a renderer that disagree.
```js
// Option (a): make spawn query the rendered network
const nearest = roadSystem.queryNearestProto(baseX, baseZ, 200) // searches _proto.segs
// Option (b): render what spawn queries
roadSystem.ensureTile(...); roadSystem.buildDebugLines() // draw _tileCache splines, drop proto
```

## Warnings

### WR-01: Proto cost-weight sliders are dead in the test harness (param-name mismatch) and `wDist` has no slider at all

**File:** `test/road-test-harness.js:67-75`, `src/road.js:727-729`, `src/debug.js:219`
**Issue:** `TEST_PARAMS` defines road weights as `roadWDist / roadWAlt / roadWGrade / roadWOver / roadWTurn`, but `setProtoParam(key, value)` only accepts keys that exist in `this._proto.params`, whose keys are `wDist / wAlt / wGrade / wOver / maxGrade / wTurn` (no `road` prefix). Any test path that tried to drive the proto via those `roadW*` names would silently no-op (the `if (key in this._proto.params)` guard fails closed with no warning). The proto params are instead hardcoded in `_protoInit` (`src/road.js:702-710`) and never read from `TEST_PARAMS`, so `TEST_PARAMS.roadWAlt` etc. are inert — tests claiming to exercise "D-09 locked cost model" actually run the hardcoded defaults. Separately, `wDist` exists in `_proto.params` but is exposed by no slider in `debug.js` (`_protoState` at `debug.js:219` omits it), so it can never be tuned at runtime.
**Fix:** Either read proto defaults from params (`this._proto.params.wAlt = params.roadWAlt ?? 0.85`, …) so `TEST_PARAMS` actually drives the router, or rename `TEST_PARAMS` fields to match and document that the proto is hardcoded. Add a `wDist` slider or remove the unused param. At minimum, make `setProtoParam` `console.warn` on an unknown key instead of silently dropping it.

### WR-02: `MinHeap.pop()` dereferences `this._data[0]` with no empty-heap guard

**File:** `src/road.js:142-150`
**Issue:** `pop()` does `const top = this._data[0].item` unconditionally. If called on an empty heap it throws `TypeError: Cannot read properties of undefined (reading 'item')`. Current call sites guard with `while (open.size > 0)` / `while (open.size)`, so it is not triggered today, but the class is a reusable primitive with no contract enforcement; a future caller (or a refactor that pops the goal twice) crashes the frame.
**Fix:**
```js
pop() {
    if (this._data.length === 0) return undefined
    const top = this._data[0].item
    ...
}
```

### WR-03: `_buildTileSpline` C1 continuity is documented "by construction" but is not guaranteed

**File:** `src/road.js:496-503`
**Issue:** The doc comment states tangents stay aligned at the seam "by construction" because adjacent tiles share the boundary crossing point. C0 is genuinely by construction (shared `_seamPoint`). C1 is NOT: the tangent at `getPointAt(1.0)` of tile A is determined by the seam point plus tile A's **last interior A\* waypoint**, while `getPointAt(0.0)` of tile B uses the seam point plus tile B's **first interior A\* waypoint**. Those interior waypoints come from two independent per-tile A\* runs over different grids and are not shared, so the tangents are only coincidentally close. The seam test (`test-road-seam.html`) enforces `< 5°` empirically, which can fail on real noise even though the comment promises it cannot. Misleading "by construction" language invites a future maintainer to delete the test as redundant.
**Fix:** Soften the comment to "C0 holds by construction; C1 is enforced empirically by the seam test and is not guaranteed for arbitrary terrain," or actually share a one-cell ghost waypoint across the boundary so the tangent is shared.

### WR-04: A\* in `_routeTile` can route to a goal cell that is not the seam point, breaking C0 silently

**File:** `src/road.js:391-395`, `461-462`
**Issue:** Entry/exit grid cells are derived by snapping the seam Z to the nearest cell (`Math.round((edges.entry.z - ... ) / cellSize)`). The A\* path therefore starts/ends at a **cell centre**, not at the seam point. `_buildTileSpline` then prepends/appends the true seam point, so the spline still passes through the shared crossing (C0 preserved). BUT in the degenerate fallback branch (`src/road.js:457-464`) the waypoints become `[entry, exit]` (the raw seam points) with no interior cells, and `_buildTileSpline` prepends/appends the seam points again → the control list de-dups to `[westSeam, eastSeam]` (two points). A two-point CatmullRom is a straight line ignoring grade — a road that the hard-grade block was supposed to prevent. The fallback can thus emit an over-grade straight segment with no warning beyond the single `console.warn` at route time.
**Fix:** In the fallback, sample intermediate points along the entry→exit line and grade-check them, or mark the tile as having no spline (`spline: null`) so consumers skip it rather than driving a straight over-grade ramp.

### WR-05: `updateProto` reads `Date.now()` for debounce — wall-clock dependency makes the "pure function of seed" claim false and can stall regen

**File:** `src/road.js:728`, `src/road.js:902`
**Issue:** `setProtoParam` stamps `paramDirtyAt = Date.now()` and `updateProto` early-returns while `Date.now() - paramDirtyAt < PROTO_PARAM_DEBOUNCE`. If the user changes a slider and then never moves the camera, `dirty` stays true but `moved` is false; once the debounce window passes, regen only happens on the next frame that also satisfies `moved || dirty`. That path works, but the wall-clock gate means the rendered network is a function of (seed, coords, params, **real time**), contradicting the module-level "pure function of (worldSeed, coords, params)" contract (`src/road.js:184-189`) and making the proto non-reproducible in headless/test contexts where `Date.now()` is uncontrolled. The per-tile router is pure; the proto is not.
**Fix:** Document the proto as explicitly impure, or drive the debounce from a frame counter / injected clock so deterministic tests can exercise it. Do not let the "pure" contract comment cover the proto path.

### WR-06: `_removeLoops` is O(n²) per pass × up to 200 passes with no early arc-length reuse — can hitch the render frame

**File:** `src/road.js:804-823`, called from `updateProto` at `src/road.js:949`
**Issue:** (Correctness-adjacent, not pure perf.) `_removeLoops` runs inside `updateProto`, which the module header explicitly forbids being heavy on the render path ("re-stream the trunk once the view center moves"). For a long row polyline it recomputes the full `arc` prefix array and a nested `i,j` scan every iteration, up to 200 guard iterations. On a dense row (`spline.getPoints(rowWps*2)` can be hundreds of points across many anchors) this is a multi-hundred-point O(n²) loop executed on the main thread every `PROTO_REGEN_MOVE = 96 m` of travel. At speed that fires often enough to drop frames, violating the 60fps target the project mandates. The 200-iteration guard also means a pathological fold can silently leave loops in (guard exits with loops still present).
**Fix:** Cap row length before loop removal, or move proto streaming off the per-render hot path (regen on a throttled cadence). At minimum, break the guard loop with a `console.warn` when it hits 200 so undetected residual loops surface.

### WR-07: New road params in `data/ranger.js` are partially dead / inconsistent with the shipped router

**File:** `data/ranger.js:191-217`
**Issue:** The committed router params describe the **per-tile hard-block** model (`maxRoadGrade`, `routeGridSize`, `roadSlopePenalty`, `roadAltWeight`, `spurProbability`), but the network actually rendered (proto) uses a **separate hardcoded soft-cost model** (`_proto.params` in `road.js:702-710`) that ignores all of these except via the unrelated `_coarseH`. `spurProbability` (`data/ranger.js:217`) is referenced nowhere in `road.js` (grep confirms only the D-01 stub comment) — it is a dead exported param. `roadSlopePenalty`/`roadAltWeight` drive only the per-tile router, which only the (phantom) spawn path consumes. This is the maintainability hazard the project's CLAUDE.md warns about: sliders that imply they tune the visible road but do not.
**Fix:** Remove `spurProbability` until D-01 spurs are implemented (it is an explicit deferred-scope stub per the commit log). Add a comment on the per-tile params noting they drive spawn-only routing, not the rendered proto — or unify the models per CR-01.

## Info

### IN-01: Dead/decorative module constant section never exercised by shipped default

**File:** `src/road.js:56-79`
**Issue:** The large block of `PROTO_*` constants (`PROTO_COVER_*`, `PROTO_LOOP_*`, `PROTO_RUN_MIN`, etc.) is only reachable when the proto is toggled on via debug (`enabled:false` default). On the default load path none of this executes. Fine as a spike, but it is ~40% of the file's logic guarded behind a debug checkbox.
**Fix:** None required for v1; consider extracting the prototype into a separate `road-proto.js` so the shipped router is not 1000 lines of mostly-inert spike code.

### IN-02: Leftover tombstone comment

**File:** `src/road.js:1008`
**Issue:** `// (removed: _segIntersectXZ — replaced by proximity-based _removeLoops)` is a commented-out-history marker. Git already records this.
**Fix:** Delete the tombstone line.

### IN-03: `console.warn` fallbacks fire from inside routing with no rate limit

**File:** `src/road.js:459`, `src/road.js:531`
**Issue:** Both `_routeTile` no-path and `_buildTileSpline` <2-control-points warn unconditionally. If terrain produces many degenerate tiles, the console floods (one warn per tile per re-route). Not a correctness bug.
**Fix:** Aggregate or throttle the warning, or downgrade to a debug-gated log.

### IN-04: `queryNearest` allocates two Vector3 per call despite the "allocation guard" docstring

**File:** `src/road.js:622-626`
**Issue:** The header (`src/road.js:33-38`) emphasizes avoiding per-call allocation, and the search loop correctly reuses `_scratchPt`. But the return path allocates `getPointAt(bestU)` and `getTangentAt(bestU)` (two new Vector3) every call. The docstring acknowledges this ("still allocated once per call"), so it is intentional, but the contrast with the forbidden-pattern note ("Do NOT allocate new THREE.Vector3 per frame in queryNearest") is contradictory — a per-frame caller still allocates two vectors per frame.
**Fix:** If Phase 9 calls this per-frame, accept caller-provided out-params (`queryNearest(wx, wz, radius, outPoint, outTangent)`). For now, reconcile the docstring with the forbidden-pattern note.

### IN-05: `_protoConnect` cache key rounds coords to integer metres — distinct anchors can collide

**File:** `src/road.js:830`
**Issue:** The segment cache key is built from `a.x.toFixed(0),a.z.toFixed(0)>...`. Two anchors whose X (or Z) differ by < 1 m round to the same key and return a stale cached connection. Anchor snapping (`PROTO_SNAP_CAP`) makes sub-metre-distinct anchors unlikely, so this is low-risk, but it is a silent correctness hazard if anchor spacing ever tightens.
**Fix:** Key on the macro-cell indices `(mx,mz)` that produced the anchors rather than rounded world coords.

### IN-06: Magic numbers in proto pipeline lack named constants

**File:** `src/road.js:756` (`s < 48`, `step = 8`), `road.js:949` (`Math.max(24, rowWps.length * 2)`), `road.js:964` (`+ 1.0` line lift), `road.js:890` (`12` simplify angle)
**Issue:** Several tuning magic numbers (gradient-descent iteration cap 48, descent step 8 m, sample density, 1 m visual lift, 12° simplify threshold) are inline literals. The project's CLAUDE.md calls for explicit, drift-resistant conventions.
**Fix:** Promote to named `PROTO_*` constants alongside the existing block at `road.js:59-79`.

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
