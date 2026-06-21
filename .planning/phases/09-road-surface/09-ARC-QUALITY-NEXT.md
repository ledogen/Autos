# 09-31 Arc-Router — Quality Pass (handoff after perf fix)

**Read first on pickup.** Companion: memory `project_arc_road_defects`, `project_arc_primitive_router`,
design doc `09-CENTERLINE-CONDITIONER-DESIGN.md` (D-arc). Status: arc-primitive router is LIVE + fast;
3 quality defects diagnosed from real dumps (`Logs/06-19 bumps/`, `Logs/06-19 kinks/`), NOT yet fixed.

## State (HEAD 855eba3, tree clean)
Arc-primitive router replaces the old 8-grid `_protoConnect`. DONE + working: valid-by-construction
min-radius (8m hard floor), determinism/window-invariance, **fast cold route** (typed-array gen-stamped
A*, 73.6→~21ms/conn — fixed the 5.7s spawn load). Headless gate `test/arc-router.mjs` 9/9 green.

## KEEP (real fixes — do NOT revert)
- `src/road-carve.js` `arcPrimitiveConnect` — the whole router incl. typed-array `_apc*` scratch + gen-stamp, `hbins` default 24, `emitDs` 4, height cell-cache, weighted-A* `wHeur`.
- `src/road.js` `_protoConnect` wiring + the `getPoints` densify removal (uses arc points directly) + cleanup-stack (`_filletMinRadius`/arcFillet) removed from call site.
- `src/road-mesh.js` `_buildRoadTile` now `this._road._sliceNetwork()` instead of `ensureTile()` (killed the per-tile re-stream thrash — big load win).
- `data/ranger.js` + `src/debug.js` arc sliders (`roadArcHardRadius/GentleRadius/HeurWeight`).

## REMOVE (temp perf probes — all 5 src files) before/with the quality work
- DELETE `src/perf.js`.
- `src/main.js`: `import {perfAdd...}`, `_perfFrame`/`_firstFrameMarked`, the 4 `frame.*` buckets in the loop, `frame.render` bucket, the `_perfFrame===180/600` auto-dump, the `perfMark('init:...')` ×4 + `resolveSpawn` ×2 marks.
- `src/terrain.js`: `import {perfAdd}`, `update()` ring/flush buckets, `flush.{buildCarveTable,computeVertexNormals,writeVertexColors}` buckets, `dispatch.buildCarveTable` bucket, `carve.collectSplines` bucket, `rebuildAllChunksFromWorker` console.log. **DECIDE** on the `_maxToe`/`_maxDelta` carve early-skip (lines ~933+, "PERF (D-arc)") — it's loss-free but never fired in mountainous terrain (bound too conservative); either delete or make per-region. Low priority.
- `src/road.js`: `import {perfAdd}`, `road.streamNetwork`/`road.sliceNetwork` buckets, `road.arcPrimitiveConnect` bucket.
- `src/road-mesh.js`: `import {perfAdd}`, `ribbon.sliceNetwork`/`ribbon.sweepRibbon` buckets (keep the `_sliceNetwork()` call itself — that's the real fix).

## Defects + fixes (see memory `project_arc_road_defects` for the numbers)
1. **Kinks/overlaps (A)** — anchor-join discontinuity: `arcPrimitiveConnect` appends exact goal `b` as a stub then next connection departs at a new bearing → paired sharp deflections (50°+108°) ~8m apart at every 256m seam. **Fix:** window-invariant heading continuity — deterministic through-heading per anchor from prev→anchor→next bearing, fed as incoming goal-approach + outgoing start heading; drop the exact-`b` stub. (NOT band-dependent — that rebroke BUG-11.)
2. **Vertical airborne peaks (B) — DONE (this session, unverified in-sim).** Centerline `Y = coarseHeight(x,z)` at every ~4m → road rode raw ridged terrain. **OPEN QUESTION RESOLVED: it was BYPASSED.** Both consumers read raw centerline Y, not the `designGradeWindow` smoother:
   - physics/carve: `terrain.js:1029` + `road.js:1822` → `runProfile().gradeY` → `_buildRunProfile` (road.js ~2290) sets `gradeY[i]=pts[i].y`.
   - ribbon: `road-mesh.js:684 _buildRoadTile` sets `designGradeY[_i]=_pt.y` from the slice spline (same network polyline).
   - `_smoothDesignGrade` reachable ONLY via `sampleDesignGradeAt`, which has NO live caller (test harness only) → dead.
   **Fix shipped:** new pure `smoothGradeInPlace(pts, window)` in `road-carve.js`; called in `road.js _streamNetwork` right after `_removeSelfCrossings` (before the COVER split) on the canonical row polyline → grades the SINGLE `this._network` source both consumers read → height-agreement by construction. Y-only (XZ untouched → arc min-radius VBC + camber unaffected). Window = `designGradeWindow` (50m, existing orphaned slider — now reconnected). Window-invariant: band margin (±1024m vs R=640m → ≥128m) ≫ 50m window. Gate: `test/defect-b-grade.mjs` (4/4: grade-flips 100→0, window-invariance 0 diff, ramp preserved, determinism). arc-router 9/9 unaffected. **STILL TODO: in-sim re-dump bumps, confirm no launch.**
3. **Lateral wander (C)** — heading-bin dither (worsened by hbins24). **Fix:** post-route line-of-sight straightening (collapse dither to straights; keeps low hbins for perf). B+C can be one post-route 3D smoothing pass.

### Defect B follow-up — tile-seam VISUAL step (09-32, FIXED this session, in-sim verify pending)
After B's grade smoothing, the collision mesh is smooth/driveable but the rendered ribbon had a visual
height STEP at tile seams (user dumps 06-20 `road-run-dump-178193061/2*.json`). Root cause (NOT the carve):
`road-mesh.js sweepRibbon` computed each section's `arcS = arcS0+(arcS1-arcS0)*u` with **uniform u**
(= `points[i]` from `spline.getPointAt(u)`, parameterised by 3D arc-length). Where the Catmull-Rom
**overshoots at a boundary cut**, uniform-u hands the overshot vertex an arcS (→ gradeY) that doesn't
match its true XZ position → a sharp ribbon triangle. The CARVE never shows it: `collectChunkSplinePoints`
also uses uniform-u, but the carve assigns each terrain-grid vertex the **nearest-XZ** sample's arcS,
diluting the lone overshoot sample → smooth driven surface. Hence "smooth to drive, stepped to look at."
**Fix (key BOTH sites to cumulative XZ arc-length — they're ONE invariant):**
(1) `road-mesh.js sweepRibbon` arcS (rendered ribbon Y); (2) `road.js collectChunkSplinePoints` sampleArcS
(feeds `terrain.js _buildCarveTable` → `analyticHeight` = the physics ground the wheels contact). Endpoints
still map to arcS0/arcS1 → seam-weld kept. Left `queryNearest` at uniform-u (NOT in the wheel-contact path —
only spawn+logger — so BUG-14-safe). **GOTCHA:** changing only the ribbon (first attempt) made it diverge
from the still-uniform-u carve by **9.24 m** → truck sank through the road + multi-meter visual tear w/ sky
through gaps (user image). The ribbon Y and analyticHeight MUST read the same arcS at the same XZ.
Gate `test/seam-grade.mjs`: tile-seam step **0.906→0.256 m (3.5×)** AND **ribbon↔carve gap 9.24→0.000 m**;
0.256 m residual = real hairpin-apex stacking. **STILL TODO: in-sim re-dump, confirm seam gone + no sink-through.**

## Sequence
~~Confirm B's grade path~~ ✓ → ~~fix B (grade smoothing)~~ ✓ (in-sim verify pending) → fix A (anchor heading continuity) →
fix C (LOS straightening) → remove temp probes → in-sim verify (re-dump bumps+kinks, compare) →
delete transition nets (`_removeLoops/_removeSelfCrossings`) if crease-free → SUMMARY.
Gate each step on `test/arc-router.mjs` + a new headless check on the real dumps (max vertical grade-flip,
max XZ deflection at seams).
