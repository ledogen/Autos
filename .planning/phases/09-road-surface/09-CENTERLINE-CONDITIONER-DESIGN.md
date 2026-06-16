# 09 Centerline Conditioner — Design & Handoff (BUG-12 + camber discontinuities)

**Status:** DESIGN / jumping-off point. No code yet. Written 2026-06-16 with full context; read this
first when picking up fresh. Companion to `09-31-PLAN.md` (the executable plan) and `09-CONTEXT.md`
(VBC-01..09 decisions). Guiding philosophy: `.planning/todos/pending/qual-road-system-simplify.md` (QUAL-03).

## The thesis (do not violate)

**This refactor must SIMPLIFY the centerline backbone, not add a layer on top of it.** The current
pipeline GENERATES bad geometry then tries to CLEAN it with passes that don't work. The fix is ONE
constructive conditioner that produces correct geometry by construction, and DELETES the cleanup
passes. If at the end we have *more* code, we did it wrong. Safety nets (VBC-07) stay only as a
transition and are removed once the conditioner is confirmed crease-free in-sim.

## Converged root cause (measured on real dumps — trust this, not the earlier detours)

ONE root cause, TWO reported symptoms:
- The routed centerline has **real ~1.5 m sharp corners** (XZ) that `filletMinRadius` fails to round.
  The ribbon places cross-sections directly at centerline/slice **control points** (see Gotcha #2),
  so a sharp vertex folds the ±halfWidth ribbon → **seam kink + carve tear (seed 8)**.
- The centerline points are **wildly unevenly spaced (1.25 m … 98 m)**. Camber is built per-point
  from `signedCurvature`, which goes noisy on uneven spacing → **camber discontinuities (seed 6)**
  (201 curvature-jump spikes; folds `bug-camber-discontinuity.md` into this fix).

Both are cured by a centerline that is **curvature-bounded (≥ minRadius XZ) AND uniformly arc-length
spaced**. Real fixtures: `Logs/road-run-dump-1781627151455.json` (seed 8, run -1:1),
`Logs/road-run-dump-1781627245285.json` (seed 6, run 0:0).

## Current pipeline (what exists) and what COLLAPSES

`src/road.js _streamNetwork` per row → `this._network[runKey] = {points}`, then `_sliceNetwork` /
`_assignSlice` → `this._tiles` per-tile slice splines. The centerline path is built as:

1. `_protoConnect` — A* on 8-dir grid → sparse 45°-step waypoints. **KEEP** (this is the valley
   routing / the genuinely hard search QUAL-03 says to isolate, not rewrite).
2. concat row segments → `rowWps`.
3. `new CatmullRomCurve3(rowWps).getPoints(...)` → dense pts.        ⟵ REPLACE
4. `_removeLoops(pts)`                                              ⟵ DELETE (target)
5. `_removeSelfCrossings(pts)`                                      ⟵ DELETE (target)
6. `_filletMinRadius(pts, minTurnRadius)` (broken; undershoots)     ⟵ DELETE (target)
   (`_limitCurvature` is already dead code — delete too.)
7. COVER suppression → split into runs → emitRun.                   KEEP
8. slicing `_assignSlice`: cut at tile boundaries, per-slice CR spline. KEEP, add sliver guard.

**Replace steps 3–6 with ONE `conditionCenterline(waypoints, params)`** that returns a
curvature-bounded, uniformly-spaced polyline. If output curvature ≤ 1/minRadius by construction,
loops and self-crossings **cannot form on tight corners** → steps 4–5 become unnecessary → delete.
That is the QUAL-03 line-count win (≈4 functions + the generate-then-clean dance gone).

## Conditioner contract

- **Input:** the A* waypoint polyline for a run (sparse, sharp, possibly self-approaching). Pure
  {x,y,z}. (Consider also dumping raw `rowWps` — see Prep — to build against true INPUT; the existing
  dumps are post-pipeline OUTPUT.)
- **Output:** a polyline that is
  - (A) **ENFORCE** — every XZ turn radius ≥ roadMinTurnRadius (no fold; verified on DENSE samples).
  - (B) **PRESERVE** — curves already ≥ minRadius keep their shape (do NOT tighten gentle curves).
  - (C) **UNIFORM** — ~constant arc-length spacing (e.g. ~2–3 m) → stable signedCurvature → smooth camber.
- **Invariants:** pure & deterministic, window-invariant (D-16) — function of waypoints only, no seed
  re-derivation, no chunk-load state. THREE-free (live in `src/road-carve.js`) so it is headless-gateable.
  XZ-only radius (VBC-02); radius is HARD, grade is SOFT (VBC-01 — may exceed max-grade to hold radius).

## Candidate approaches (the one real open decision — pick empirically against the harness)

Ruled OUT already (verified): midpoint relaxation (collapses/undershoots), wide-stencil relaxation
(collapses points), global pure-pursuit (corrupts gentle curves), uniform-resample-alone (preserves
sharp vertices). Do NOT retry these.

Candidates to evaluate (TDD against `test/diag-minradius-pipeline.mjs` + real fixtures):
- **Arc-spline / biarc fit** (recommended starting point): replace the polyline with tangent-continuous
  circular arcs (radius ≥ minRadius) joined by straight segments; sample at uniform arc length.
  Guarantees (A)+(C) by construction; (B) falls out (gentle arcs keep their radius). Hard case: a
  near-180° corner whose legs are < 2·minRadius apart can't fit an arc — must spread the legs
  (path deformation) or treat as the valley-exit/switchback case (QUAL-03's flagged hard part; isolate it).
- **Constrained smoothing on a uniformly-resampled polyline:** resample to uniform spacing FIRST, then
  a stable curvature clamp ONLY where radius < minRadius, with a collapse guard (min point spacing).
  Simpler; re-test whether it converges on uniform input (it failed on uneven input).
- Clothoid/Euler-spiral transitions — smoothest, most complex; likely overkill.

Decide by which passes (A)+(B)+(C) on the real dumps with the least code.

## Verification (headless-first, then in-sim)

- `test/diag-minradius-pipeline.mjs` already encodes synthetic ENFORCE/PRESERVE. Extend it to:
  load the real dumps, run the conditioner, assert (A) DENSE-sampled minR ≥ minRadius,
  (B) gentle-R40 preserved, (C) spacing within tolerance, and curvature-jump (camber proxy) below a threshold.
- Promote to `test/spline-continuity.mjs` as real gates once green.
- In-sim: seed 8 seam (no kink/tear), seed 6 (smooth camber), `rd_minr` holds ≥ minRadius. Then delete
  the safety-net passes (VBC-07) and re-confirm.

## GOTCHAS / DO-NOT (each cost a wrong turn this session)

1. **Never measure corner radius on the raw network points** — they're sparsely/unevenly spaced, so a
   3-point circumradius reads ~14 m across a real ~1.5 m vertex. Always measure on dense/uniform samples.
2. **The ribbon (road-mesh.js sweepRibbon) sweeps the slice CONTROL POINTS for positions** (frame from
   the continuous runProfile tangent), NOT the spline samples. So sharp/cluster control points fold it
   directly. Fixing the centerline points fixes the ribbon.
3. **THREE `Curve.getPoints(n)` samples uniform PARAMETER, not arc-length** — for centripetal CR this
   bunches samples and makes a 3-sample circumradius read false ~0 m. Use arc-length sampling to judge.
4. Don't reopen junctions (VBC-06/08 — separate effort) or the vertical/3D radius (VBC-02 — not wanted).
5. Don't add the conditioner ON TOP of filletMinRadius/_removeLoops/_removeSelfCrossings as a permanent
   layer — they must be DELETED once the conditioner lands (the thesis).
6. `src/terrain-worker.js` is a byte-identical mirror — if generation touches worker-shared code, keep it synced.

## Prep that would help the build (optional, cheap)

Extend the 'p' dump (`road.js debugDumpNearestRun` + main.js handler) to ALSO emit the raw A* waypoints
(`rowWps` pre-CR) for the run, so the conditioner is built/verified against its true INPUT, not the
already-conditioned output. Drive to a sharp corner, press p, that becomes a fixture.

## First steps for the fresh session

1. Read this doc + 09-31-PLAN.md + 09-CONTEXT.md (VBC) + QUAL-03.
2. Extract the two real dumps' networkPoints into `diag-minradius-pipeline.mjs` as fixtures; add the
   (A)/(B)/(C)+camber gates.
3. Prototype `conditionCenterline` (arc-spline first) in `src/road-carve.js`; iterate until all gates green.
4. Wire into `_streamNetwork` replacing steps 3–6; keep nets (VBC-07); verify headless gate exits 0.
5. In-sim verify (seed 8 + seed 6 + rd_minr). Then DELETE the cleanup passes + re-verify (the simplification).
