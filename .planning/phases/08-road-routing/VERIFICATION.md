# Phase 08 — road-routing — VERIFICATION

**Verified:** 2026-06-09
**Method:** Goal-backward static analysis (code reading). Browser-console test harnesses
were NOT executed (browser-only project, no headless runner) — execution is the user's UAT step.
**Verdict:** ⚠ **FAIL — exit gate (D-06) will not pass as built**

---

## Requirement coverage

| Req | Status | Evidence |
|-----|--------|----------|
| ROAD-01 deterministic tile-able graph | ✅ Satisfied | `road.js` routes purely from `seedFor(worldSeed,'roads',tileX,tileZ)` + `mulberry32`; no `Math.random` in route path (grepped clean). Tile caches are memoization only (`_getTile` doc, road.js:483-512). |
| ROAD-02 slope-weighted cost + hard max grade | ✅ Satisfied | `_edgeCost` (road.js:276-294): hard block `grade > maxRoadGrade → Infinity`; quadratic `grade²·roadSlopePenalty`; valley term `h·roadAltWeight`. `maxRoadGrade: 0.12` in data/ranger.js. |
| ROAD-03 switchback above max grade | ✅ Plausible (untested) | A* with hard over-grade edge rejection (road.js:382 `if (!isFinite(edgeCost)) continue`) forces lateral detours = emergent switchbacks. Asserted only by browser harness (test-road.html) — not executed. |
| ROAD-04 queryable splines + debug lines | ✅ Satisfied | `queryNearest` / `ensureTile` (road.js:514-573); `buildDebugLines` / `setDebugVisible` (road.js:591-632); lil-gui Roads folder (debug.js:196-205). |

## Decision coverage

| Dec | Status | Evidence |
|-----|--------|----------|
| D-03 max-grade live slider | ✅ | debug.js:201 `roadFolder.add(params,'maxRoadGrade',0.04,0.20,0.01)` → `onRoadParamChange` → debounced re-route. |
| D-05 centerline-only viz, clean default | ✅ | `_debugVisible=false` default (road.js:171); Show Road Splines checkbox (debug.js:198). |
| D-07 resolveSpawn → road probe, signature/call-site unchanged | ✅ | main.js:126-154 — body swapped to `ensureTile` 3×3 + `queryNearest` + `atan2(tangent)`; Phase 7 terrain fallback preserved verbatim (main.js:156-198) with `console.warn` on null. Signature `(wseed,params)→{position,heading}` intact. |
| **D-06 seam continuity = EXIT GATE** | ❌ **Fails as built** | See blocking finding below. |

## Byte-identity check (grade-math correctness)
`road.js:_coarseHeight` (63-79) is byte-identical to `terrain.js coarseHeight` (183-200) — confirmed by diff. Road grade math uses the same raw pre-amplitude heights as terrain. ✅

---

## 🔴 BLOCKING — D-06 exit gate will not pass

**The C0 assertion in `test/test-road-seam.html` (lines 76-79) cannot pass given the current
spline construction.**

The test asserts, for each east-west adjacent tile pair:
```
tileA.spline.getPoint(1.0)  ≈  tileB.spline.getPoint(0.0)   (< 0.01 m)
```

For an open (`closed=false`) interpolating `CatmullRomCurve3`, `getPoint(1.0)` returns the
**last** control point and `getPoint(0.0)` the **first**. From `_buildTileSpline` (road.js:463-481)
the control-point arrays are:

- Tile A: `[ghostLeft, ...waypointsA, ghostRight]`  where `ghostRight = firstWaypoint(B)`
  → `getPoint(1.0)` of A = **firstWaypoint(B)**
- Tile B: `[ghostLeft, ...waypointsB, ghostRight]`  where `ghostLeft = lastWaypoint(A)`
  → `getPoint(0.0)` of B = **lastWaypoint(A)**

So the assertion compares `firstWaypoint(B)` against `lastWaypoint(A)`. These are different
grid cells and never coincide:
- `lastWaypoint(A)`  = route grid column 15 → world x = tileX·64 + **62**
- `firstWaypoint(B)` = route grid column 0  → world x = (tileX+1)·64 + **2** = tileX·64 + **66**

They are ≥ 4 m apart in x (plus a seed-dependent z offset, since A's east edge and B's west
edge are seeded from different `seedFor` keys). `distanceTo` ≥ ~4 m ≫ 0.01 m → **C0 fails**.

**Root cause:** ghost control points yield C1 tangent continuity only at a *shared* junction
waypoint (where both tiles pass through the same point P_i with the same neighbors P_{i-1},
P_{i+1}). The current design never inserts a shared seam waypoint — adjacent tiles' route
endpoints are independent cell centers ~4 m apart, so the two splines overlap/cross in the
ghost region rather than meeting at a point. There is no actual C0 join at the 64 m boundary.

**Confidence:** High (static — based on standard Three.js endpoint semantics). Decisive
confirmation = open `test/test-road-seam.html` in a browser and read the console; the C0
lines are expected to print FAIL.

**Fix direction (for a gap-closure plan):** make adjacent tiles share a single deterministic
seam waypoint S on the boundary x=(tileX+1)·64 (derived once from a seam-keyed `seedFor` so
both tiles agree), include S as the terminal route waypoint of A and the initial route
waypoint of B, and use the true cross-tile neighbors as ghosts. Then `getPoint(1.0)_A` and
`getPoint(0.0)_B` both equal S (C0), and the shared ghosts give matching tangents (C1).
Re-run test-road-seam.html as the exit gate.

---

## Other notes (non-blocking)
- ROAD-03 switchback emergence and the test-road.html assertion suite were not executed
  (browser-only). Recommend running test-road.html alongside the seam fix.
- `spurProbability` (D-01 sparse spurs) is present in params (data/ranger.js:217) but spur
  branching is a documented stub (road.js:19 "spur seeding stub"); trunk-only routing is
  shipped. Acceptable for the phase boundary (D-01 says "occasional spurs") but worth a
  follow-up if spurs are expected visible now.

## What to do
1. Confirm the C0 failure by opening `test/test-road-seam.html` in a browser (decisive).
2. Create a gap-closure plan to introduce shared seam waypoints (fix direction above).
3. Re-verify with the seam exit gate green before declaring Phase 8 complete / starting Phase 9.
