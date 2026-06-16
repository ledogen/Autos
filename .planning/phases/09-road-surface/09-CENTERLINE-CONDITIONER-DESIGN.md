# 09 Centerline Conditioner — Design & Handoff (BUG-12 + camber discontinuities)

**Status:** DESIGN / jumping-off point. No code yet. Written 2026-06-16 with full context; read this
first when picking up fresh. Companion to `09-31-PLAN.md` (the executable plan) and `09-CONTEXT.md`
(VBC-01..09 decisions). Guiding philosophy: `.planning/todos/pending/qual-road-system-simplify.md` (QUAL-03).

## The thesis (do not violate)

**This refactor must SIMPLIFY the centerline backbone, not add a layer on top of it.** The current
pipeline GENERATES bad geometry then tries to CLEAN it with passes that don't work. If at the end we
have *more* code, we did it wrong. Safety nets (VBC-07) stay only as a transition and are removed once
the result is confirmed crease-free in-sim.

## ARCHITECTURE DECISION v2 (2026-06-16, user steering — SUPERSEDES v1 below)

The v1 "hard curvature gate in the A*" is REJECTED — it would constrain the router's tight-turn
character, which the user LIKES. Final shape:

1. **Router first (most important): fix its COST/CHARACTER, keep its curvature freedom.**
   - KEEP valley-following — `wAlt·toH` valley-bias is CORRECT (roads follow valleys: people/water).
     Do NOT gut it or roads glue to crests. The router may route tight corners — that's liked character.
   - KEEP long straights + variable waypoint spacing, tight turns, switchbacks, traverses (all liked).
   - ADD climb-anticipation: gain altitude SOONER within the valley/traverse when a high pass is coming,
     so the route doesn't wall-out. This is a VERTICAL-progress term (penalize being below the
     start→goal constant-grade ramp), ORTHOGONAL to the lateral valley preference — NOT crest-riding.
   - Improve switchback parallelism (context-dependent turn cost: cheap when a turn dodges over-grade;
     distinct tighter fold-safe apex radius so arms sit ~2×apex apart; note the cleanup passes may be
     EXCISING tight switchbacks as "loops" — deleting them may restore parallelism for free).

2. **Then ONE minimal spline modification of the routed points (the BUG-12 fix):**
   - Enforce MIN TURN RADIUS (HARD) but MINIMALLY: only touch corners that would fold the ±halfWidth
     ribbon; round just to the FOLD-SAFE floor (~halfWidth+clearance ≈ 7–8 m) so tight turns stay
     tight (do NOT gentle them to 15 m); leave straights untouched.
   - Then enforce MAX GRADE (SOFT, "if possible") — occasional grade deviations are FINE, navigable,
     and add character. Do not fight terrain hard on grade.
   - This single surgical pass REPLACES the cleanup stack (`_removeLoops`/`_removeSelfCrossings`/
     `_filletMinRadius`/dead `_limitCurvature`) → they all delete. It is NOT a heavy conditioner and
     NOT uniform resampling.

3. **Camber discontinuity (seed-6): fix WITHOUT uniform resampling.** Variable spacing is liked — do
   NOT uniformly resample the centerline. Instead make the camber/curvature computation
   SPACING-INVARIANT: sample signed curvature at a CONSISTENT ARC-LENGTH scale (a fixed window in
   metres), not per-raw-point. Smooth camber regardless of uneven point spacing; route character intact.

Priority/tolerance: min-radius HARD, max-grade SOFT (occasional violations welcome). Fold-safe floor,
not the 15 m feel value, is the hard radius bound (feel stays a separate slider).

---
## ARCHITECTURE DECISION v1 (SUPERSEDED by v2 above — kept for history)
### fix the SOURCE, do NOT build a conditioner layer

Reject the "conditioner" framing (a post-pass that fixes bad waypoints — it's the generate-then-fix
abstraction the user wants gone). Instead make the geometry valid where it's produced. Two parts:

1. **Router turn-cost → hard curvature constraint.** `_protoConnect` ALREADY carries heading state
   (`state = cell × incoming-dir`, PROTO_CELL=10 m, 8 dirs, soft `wTurn` per-45° penalty, ~line 1209/1256).
   Today sub-radius corners are *allowed* (just penalized). Make them **forbidden**: gate transitions so
   an accumulated turn implying radius < roadMinTurnRadius is infinite-cost. Heading state already exists —
   this is a transition gate, not new machinery. Grade stays SOFT (VBC-01) → the search spends grade to
   hold radius (the user's priority). Result: impossible corners are never routed → `_removeLoops` /
   `_removeSelfCrossings` / `_filletMinRadius` / dead `_limitCurvature` all DELETE.
2. **One clean grid→curve fit.** A 10 m/8-dir grid path inherently zig-zags at 45°, so a single smooth
   fit (grid polyline → drivable curve) is unavoidable AND legitimate — it is the honest "represent the
   routed path as a smooth curve" step, NOT a cleanup layer. Do it ONCE and correctly: curvature-preserving
   (stays ≥ minRadius, no overshoot — arc-spline or low-tension) + UNIFORM arc-length sampling (fixes the
   camber-from-uneven-spacing symptom). This replaces steps 3–6 below.

**Fallback if the 10 m/45° grid fit still isn't clean enough:** replace grid-A* with a **hybrid-A* using
min-radius arc motion-primitives** (continuous heading) — output is curvature-valid natively, ~no fit
needed. The purest form of the vision; bigger change; hold as fallback, not the opening move.

**Risk to verify (taken deliberately):** touching the router affects the VALLEY-EXIT search — a hard
radius constraint can make tight-terrain routes longer/steeper or (rarely) unroutable. Acceptable under
radius-hard/grade-soft, but it's a behavioral change — verify headlessly (router unit test on real seeds,
deterministic via pure coarseHeight) before in-sim. A conditioner was "safe" because it left routing
alone — but that's the layer we're rejecting, so we accept the router risk and de-risk with tests.

Everything below that says "conditioner" = this single grid→curve fit, fed by the now-curvature-valid router.

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

## First steps for the fresh session (v2 sequencing)

1. Read this doc (esp. ARCHITECTURE DECISION v2) + 09-31-PLAN.md + 09-CONTEXT.md (VBC) + QUAL-03.
2. **Headless gates first** (extract the two real dumps as fixtures in `diag-minradius-pipeline.mjs`):
   - (A) MIN-RADIUS: after the minimal spline pass, every corner's DENSE-sampled XZ radius ≥ fold-safe
     floor (~halfWidth+clearance). (B) MINIMAL: straights/gentle curves and overall route shape are
     unchanged (don't over-smooth — measure point displacement off the original where radius was already
     ok). (C) CAMBER: signed curvature sampled at a CONSISTENT ARC-LENGTH window is continuous
     (no spikes) on the real dumps — WITHOUT uniform-resampling the centerline.
   - Router character metrics (for part 1): grade-profile vs start→goal ramp (climb-anticipation),
     switchback arm-spacing, peak grade. Tune to numbers, not screenshots.
3. **Router first (most important):** improve `_protoEdgeCost`/turn model for CHARACTER — keep valley
   bias (`wAlt`), keep straights/tight-turns/switchbacks; add climb-anticipation (penalize being below
   the start→goal altitude ramp); make turn cost context-dependent (cheap when dodging over-grade).
   Do NOT add a hard curvature gate (keep tight-turn freedom). Verify valley-following preserved + climb
   starts earlier on a high-pass seed.
4. **Then minimal spline pass:** modify routed points to enforce min-radius (hard, fold-safe floor,
   ONLY at folding corners, straights untouched) then max-grade (soft, occasional deviation ok). This
   is where filletMinRadius failed — use a constructive arc only at violating corners. Camber fix =
   arc-length-consistent curvature sampling (step 2C), not uniform points.
5. Keep nets (VBC-07); headless gates exit 0; in-sim verify (seed 8 seam + seed 6 camber + rd_minr +
   subjective: valleys/straights/switchbacks still feel right).
6. DELETE `_removeLoops` / `_removeSelfCrossings` / `_filletMinRadius` / dead `_limitCurvature`;
   re-verify. Deletion + smaller road.js is the done-signal, not just "folds gone".
