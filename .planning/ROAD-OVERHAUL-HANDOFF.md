# Road System Overhaul — Handoff & Plan (2026-06-22)

> **For the next agent.** Read this top-to-bottom before touching `src/road.js`. It captures a deep
> BUG-12 investigation, *why a major rewrite is justified*, the industry-standard architecture to
> rewrite toward, and a phased plan. A large rewrite is explicitly sanctioned by the project owner
> ("a major rewrite is acceptable if we can accurately pathfind").

---

## 1. The mandate from the owner

> "We have a road file twice as big as any other section of code, yet roads are broken, don't load
> quickly enough for smooth gameplay, and are not granularly refinable, expandable, or future-proofed."

So the goals, in priority order:
1. **Correct** — no ribbon tears/folds; centerline curvature bounded by construction (BUG-12).
2. **Fast** — cold-stream a region without a visible hitch (current: routing ~80 connections lags).
3. **Simple & future-proof** — a road *model* that supports junctions, variable width, LOD, and
   refinement without the current 2,700-line tangle of re-interpolation + cleanup passes.

`src/road.js` is ~2,800 lines — by far the largest file. Much of it exists to *patch* a structural
mismatch (see §3). The rewrite should make most of it deletable.

---

## 2. What was just done (uncommitted, branch `road-invariance`)

State: working tree at a **clean Phase-2 baseline** — 6/7 gates green, the new gate 2/4. Nothing
committed. See [[project_bug12_execution_status]] in memory for the blow-by-blow.

- **`test/road-minradius.mjs` (NEW, registered in run-all):** the BUG-12 gate. Measures **per-slice**
  min 3-pt circumradius, sampled **arc-spaced** (`getSpacedPoints`, matching `road-mesh.js`
  `sweepRibbon`'s `getPointAt`). This is the *only* faithful fold metric — see §6 "measurement
  pitfalls." Keep this gate; it's the success criterion.
- **`src/road-carve.js`:** `arcPrimitiveConnect` gained `startHeading`/`goalHeading`; added
  `dubinsPath()` (module fn); the segment terminal is now a Dubins connector into a canonical heading.
- **`src/road.js`:** `_protoAnchorHeading(mx,mz)` (canonical per-anchor heading, chord through row
  neighbors — pure fn of world anchors → window-invariant); threaded through both `_protoConnect`
  call sites.

**Result:** the routed **control polyline is now valid-by-construction** (min radius 0.5–2 m → 6–8 m).
**This Phase-2 work is correct and worth keeping/porting** — it's the canonical-heading + analytic-join
idea the rewrite needs anyway. The residual failure is *downstream of the centerline* (see §3).

---

## 3. Root cause — an architectural mismatch (why patching failed)

The pipeline today is: **arc-router (valid) → simplify → `_removeLoops`/`_removeSelfCrossings` →
grade → per-tile slice → re-interpolate each slice with centripetal Catmull-Rom → sweep ribbon.**

The killer is the **re-interpolation**. The router already emits a *valid, curvature-bounded* arc path.
Then `_assignSlice` throws that away and fits a **centripetal Catmull-Rom** through sampled points.
Catmull-Rom **does not bound curvature** — it *bulges* between control points at every curvature
discontinuity (arc→straight, switchback/Dubins apex), folding the ribbon below `halfWidth` (5 m) even
though the control points are ≥ 6 m. Centripetal only *reduces* overshoot; it cannot eliminate it.

Three compounding problems, all stemming from "sample then re-interpolate then patch":
- **Catmull-Rom overshoot** (the fold). Verified: 8 m control turn → 2.77 m spline.
- **`_removeLoops`/`_removeSelfCrossings` splices** stamp *new* sharp corners (a 119° corner via a
  10.94 m chord) into the polyline — patching geometry the router got right.
- **Window-invariance fragility (D-16).** Run identity/arcS depend on polyline arc-lengths and
  density-dependent cleanup splices. Anything that changes point density (e.g. finer emission) flips
  ownership decisions near a threshold and **breaks invariance** (the BUG-14 class). This is why you
  *cannot* just "densify the polyline."

Every local fix is whack-a-mole because the representation is wrong: **a sampled polyline that gets
re-interpolated and patched, instead of an exact curvature-bounded curve carried end-to-end.**

---

## 4. Research — how this is actually solved (sources at bottom)

**Geometry (the fold):** the standard primitives for "smooth path through waypoints, bounded curvature,
no overshoot" are **arc-splines and clothoids (Euler spirals) with G1/G2 continuity** — *not*
Catmull-Rom. Roads, railways, and car-like-robot paths are built from **line + circular-arc + clothoid**
segments. A clothoid has curvature **linear in arc length** → C2/G2 continuity, the real-road feel, and
*provably bounded* curvature. Catmull-Rom/Bézier are interpolation curves that "naturally reflect" nothing
about curvature limits.

**Pathfinding (already mostly right here):** **hybrid-A\* over arc/Dubins primitives** with an
**analytic expansion** (a Dubins or clothoid "shot" to the goal pose) is *the* standard for
kinematically-feasible paths with a minimum turning radius. Our `arcPrimitiveConnect` is exactly this
and is valid-by-construction — **keep it.** Upgrade the join/terminal connector from Dubins (G1) to a
**clothoid pair (G2)** so curvature is continuous (no arc→straight bulge for *any* downstream sampler).

**Game architecture (perf + future-proofing):**
- Roads are either a **swept mesh ribbon along a spline** (our approach — fine) or a **decal/
  terrain-conforming overlay**. Either way the *centerline is a parametric curve*; geometry is sampled
  from it on demand.
- **Streaming = chunks + LOD.** The centerline/primitive list is cheap to stream; you sample at the
  density each consumer (ribbon, carve, physics, minimap) needs. Don't store/re-process dense polylines
  per stream — that's the current perf sink.
- The industry road model is **a list of typed primitives (line/arc/clothoid) with offsets/widths**
  (cf. OpenDRIVE). It composes cleanly into junctions, lanes, variable width, and LOD — i.e. exactly the
  "refinable/expandable/future-proof" the owner wants.

---

## 5. Recommended target architecture

**One curvature-bounded centerline representation, carried from routing to every consumer. Never
re-interpolate. Never patch.**

```
Anchors (valley-snapped, per macro-cell, deterministic)         [KEEP _protoAnchor]
   │  canonical per-anchor heading H(mx,mz) = chord thru neighbors  [KEEP _protoAnchorHeading]
   ▼
Router: hybrid-A* over arc primitives, per anchor-pair           [KEEP arcPrimitiveConnect]
   │  start at H(mx), analytic CLOTHOID-pair terminal into H(mx+1)  [UPGRADE Dubins→clothoid, G2]
   ▼
Centerline = ordered list of PRIMITIVES {type:line|arc|clothoid, length, κ0, κ1, pose0}
   │  arc-length parameterised, curvature known analytically, ≥ minR by construction
   │  per anchor-pair → pure fn of (anchors, canonical headings) → window-invariant, cacheable
   ▼
Consumers SAMPLE the primitive curve at their own density (no re-spline):
   • ribbon mesh   — position + exact tangent + exact curvature (camber straight from κ, no estimation)
   • carve table   — same curve, physics surface
   • physics query — nearest-point on primitives (closed-form per primitive)
   • minimap/LOD   — coarse sampling
```

**What this deletes from `road.js`:** the Catmull-Rom slice spline, `_removeLoops`,
`_removeSelfCrossings`, `_protoSimplify` (the cleanup stack the router made unnecessary), per-tile
re-slicing-as-resampling, signed-curvature *estimation* (curvature is now exact), and the
cumulative-XZ seam machinery (seams are free when consecutive tiles sample one continuous primitive
curve). Expect `road.js` to roughly halve.

**Why it's faster:** routing is the only real cost and is already cached per anchor-pair. Streaming
carries a primitive list (tiny), not dense polylines reprocessed every frame. Sampling is closed-form.

**Why invariance survives:** identity/arcS come from primitive arc-lengths, which are exact functions
of the anchor pair + canonical headings — independent of sampling density and of any cleanup pass
(there are none). This removes the BUG-14-class fragility at the source.

---

## 6. Hard constraints the rewrite MUST preserve (don't relearn these the hard way)

- **Window-invariance (D-16)** — `test/invariance.mjs` + `test/restream-invariance.mjs` must stay
  green. For a fixed world region, runKeys/geometry/arcS/gradeY must be byte-identical regardless of
  stream center. **Mechanism:** every centerline primitive is a pure fn of its anchor pair + canonical
  neighbor-derived headings; nothing depends on stream center, window extent, or sampling density.
- **Determinism (no Math.random/Date/session state).**
- **No build system / no physics lib / Three.js r184 ES-modules / 60 fps target / GitHub-Pages static.**
- **CARVE SYNC** — carve bodies in `road-carve.js` are copied verbatim into `terrain.js`
  `WORKER_SOURCE`; edit both together (search `CARVE SYNC`). `arcPrimitiveConnect`/`dubinsPath` are
  NOT synced (main-thread routing only).
- **Measurement pitfalls (cost me an entire session — heed these):**
  - The ribbon folds on **true curvature**, radius < `halfWidth` (5 m). Fold-safe floor =
    `halfWidth + clearance` = 5.5 m.
  - Measure curvature **arc-spaced** (`getSpacedPoints`/`getPointAt`), the way the ribbon samples.
    Uniform-*parameter* `getPoints` piles near-coincident samples at slice ends → meaningless tiny
    circumradii (a *measurement* artifact, not a fold).
  - The ribbon is swept **per slice**; measure per-slice. Concatenating across tile seams injects
    false kinks from independent Catmull-Rom endpoint tangents (cross-seam C1 is a *separate* concern).
  - The in-game probe `minRadius` and `debugDumpNearestRun.minTurnRadius` are **not** the fold metric
    (they reported 16.9 m where the dense ribbon folded at 0.2 m). Trust `test/road-minradius.mjs`.

---

## 7. Phased plan for the rewrite

> Keep the existing headless harness as the quality gate at every step. Build the new path beside the
> old, switch consumers over, then delete the old. Don't big-bang.

**Phase A — Primitive centerline model.**
- Define `CenterlinePrimitive {type, length, kappa0, kappa1, x0,z0,theta0}` and a `Centerline`
  (ordered primitives) with closed-form `pointAt(s)`, `tangentAt(s)`, `curvatureAt(s)`, `length`,
  `nearest(x,z)`.
- Make `arcPrimitiveConnect` *return primitives* (it already searches them — stop flattening to points).
- Replace the Dubins terminal with a **G2 clothoid-pair** terminal into the canonical heading (clothoid
  fitting: see the clothoid-spline refs). Fall back to the existing Dubins (G1) if a clothoid pair has
  no solution — it's already correct and bounded.
- Gate: a new headless test asserts `min over s of |1/curvatureAt(s)| ≥ minR` for every connection on
  real seeds (this *replaces* the polyline circumradius approximation with the exact value).

**Phase B — Consumers sample the primitive curve.**
- Ribbon (`road-mesh.js sweepRibbon`): position/tangent/curvature from the primitive curve; camber from
  exact `curvatureAt(s)` (delete signed-curvature estimation). `test/road-minradius.mjs` and
  `ribbon-carve.mjs` go green.
- Carve table + physics `queryNearest`: nearest-point against primitives (closed-form per primitive).
- Verify `invariance.mjs` / `restream-invariance.mjs` stay green throughout (identity from primitive
  arc-length).

**Phase C — Delete the patch stack.**
- Remove Catmull-Rom slices, `_removeLoops`, `_removeSelfCrossings`, `_protoSimplify`, per-tile
  resample-slicing, cumulative-XZ seam fix (now structural). Re-run all gates.

**Phase D — Streaming/perf.**
- Stream the primitive lists (small), sample per consumer at needed density + LOD by distance.
- Consider offloading the cold-route search to the terrain Web Worker (see existing
  `perf-terrain-worker-offload.md` / PERF-03) — routing is the spawn-lag cost. Primitive lists
  postMessage cheaply (unlike dense polylines / RANGER_PARAMS — see [[project_terrain_worker_constraints]]).

**Phase E — Future-proofing (optional, now easy on the new model).**
- Junctions, variable width, lane offsets compose as offset curves on the primitive centerline.

---

## 8. What to keep vs. delete

**Keep / port forward:** `_protoAnchor` (valley anchors), `_protoAnchorHeading` (canonical headings —
the invariance keystone), `arcPrimitiveConnect`'s hybrid-A* search + cost model (valley/grade/curvature),
`dubinsPath` (as the G1 fallback terminal), the whole headless harness (`run-all.mjs` gates), and the
capture/replay bug-repro tooling.

**Delete (the patch stack):** centripetal Catmull-Rom slice spline, `_removeLoops`,
`_removeSelfCrossings`, `_protoSimplify`, per-tile resample-slicing, cumulative-XZ seam fix, signed-
curvature estimation. These exist only to patch the re-interpolation mismatch.

**Decide:** whether the routed *body* should also be clothoid/arc primitives end-to-end (cleanest) or
keep arc body + clothoid joins. Cleanest is all-primitive.

---

## 9. Pitfalls I already hit (do NOT repeat)

- Finer network emission (`emitDs`) to smooth the spline → **breaks window-invariance** (density-
  dependent splice/ownership). Don't densify the *network*; carry exact primitives instead.
- Sweeping the raw polyline directly → **faceted** at control points unless densified (and densifying
  the network breaks invariance — catch-22 that the primitive model dissolves).
- Quadratic-Bézier corner-rounding in `_assignSlice` → invariant and kills overshoot, but trips
  `ribbon-carve.mjs` FIX-ENGAGED (a 2× *ratio* threshold; SEAM-BOUNDED still fine). A symptom of
  patching, not fixing.
- `_removeLoops` splices create the sharp corners you're trying to remove — but disabling them lets
  real Dubins loops through. Root fix: a terminal connector that never loops (clothoid pair) → then the
  cleanup passes are deletable.
- Larger Dubins terminal radius → wide-loop artifacts (worse). Don't.

---

## 10. Quick start for the next agent

```
git status                      # clean Phase-2 baseline, uncommitted
npm test                        # 6/7 green; road-minradius.mjs 2/4 (the residual)
node test/road-minradius.mjs    # the BUG-12 gate (per-slice arc-spaced min radius)
node test/replay.mjs Logs/rangersim-capture-1782102756225.json   # capture-1 repro (the 119° splice corner)
```
Decide first: **commit/stash the Phase-2 work** (canonical heading + Dubins are keepers) or branch
fresh. Then start Phase A. Keep every commit green; build new beside old; delete old last.

---

## Sources
- Clothoid / G2 road & path geometry: [Sketching Piecewise Clothoid Curves (McCrae & Singh)](https://www.dgp.toronto.edu/~mccrae/projects/clothoid/sbim2008mccrae.pdf) · [Interpolating clothoid splines with curvature continuity](https://www.researchgate.net/publication/321943188_Interpolating_clothoid_splines_with_curvature_continuity) · [Smooth Interpolating Curves with Local Control and Monotone Alternating Curvature (EG 2022)](https://alexandrebinninger.com/assets/publications/local_interpol_spline_mono_curvature/local_interpol_spline_mono_curvature.pdf)
- Polyline smoothing with G1 + bounded curvature: [Fast Shortest Path Polyline Smoothing With G1 Continuity and Bounded Curvature (arXiv:2409.09816)](https://arxiv.org/pdf/2409.09816)
- Hybrid-A* + Dubins/clothoid analytic smoothing: [Trajectory Generation using Sharpness-Continuous Dubins-like Paths (arXiv:1801.08995)](https://arxiv.org/pdf/1801.08995) · [Clothoids Composition Method for Smooth Path Generation (Springer)](https://link.springer.com/article/10.1007/s10846-017-0531-8) · [3D Dubins-Path-Guided Continuous Curvature Path Smoothing (MDPI)](https://www.mdpi.com/2076-3417/12/22/11336)
- Game road/terrain architecture & streaming: [Spline-Based Procedural Terrain/Road Generation (J. Peire)](https://jarnepeire.be/splinebasedprocterraingen/) · [Finding Junctions in Spline-based Road Generation (DiVA)](https://www.diva-portal.org/smash/get/diva2:1675311/FULLTEXT02) · [3D Decals for roads on terrain (GameDev.net)](https://www.gamedev.net/forums/topic/691182-3d-decals-for-roads-on-terrain/) · [Asset Streaming Techniques for Open World Games](https://daydreamsoft.com/blog/asset-streaming-techniques-for-open-world-games-building-seamless-and-immersive-experiences)
