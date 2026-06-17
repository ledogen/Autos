# 09 Road Centerline Rewrite — Design & Plan

**Read this first when picking up fresh.** Status: DESIGN, no code yet. Authoritative plan for the
next gaps-only execution. Companions: `09-31-PLAN.md` (executable), `09-CONTEXT.md` (VBC-01..09),
`.planning/todos/pending/qual-road-system-simplify.md` (QUAL-03 philosophy),
`.planning/todos/pending/bug-road-rebuild-determinism.md` (BUG-11). (Filename says "conditioner" for
history; the conditioner-as-a-layer framing was REJECTED — see Decisions.)

## Thesis (do not violate)

**Simplify the centerline backbone; do not add a layer on top of it.** Today the pipeline GENERATES
bad geometry then tries to CLEAN it with passes that don't work. We fix the geometry where it's
produced and DELETE the cleanup stack. **If we end with more code, we did it wrong.** Safety nets stay
only as a transition (VBC-07), removed once confirmed crease-free in-sim. The deletion + a smaller
`road.js` is the done-signal — not just "folds gone."

## What this fixes (one generation layer, three symptoms)

- **BUG-12** — ribbon folds / seam kink + carve tear at sharp corners (seeds 6, 7, 8).
- **BUG-11** — non-deterministic road: slider 12→15→12 ≠ fresh reload; geometry depends on stream
  history, not purely (seed, params). (Spawn-off-road half already fixed. Determinism was WONTFIX-for-now
  per a 2026-06-13 call the user has now REVERSED — we want deterministic routing.)
- **Camber discontinuities** (seed 6) — folds in `bug-camber-discontinuity.md`.

All three share ONE root: the centerline generation. `mx0/mx1 = floor(center.x / PROTO_ANCHOR_SPACING)
± CANONICAL_HALF_WIDTH` (road.js ~1301) follow the stream center, so the canonical run re-shapes when
the center crosses a 256 m band (→ BUG-11 non-determinism, and the band-shift is the same root as
BUG-14's stale-cache teleport). The router emits sub-min-radius corners that `filletMinRadius` fails to
round (→ BUG-12 folds). Points are unevenly spaced (1.25–98 m), making per-point curvature noisy
(→ camber discontinuities).

## Plan — ordered steps (foundation → character → validity → cleanup)

### Step 0 — Determinism foundation (FIRST; prerequisite for verifiable everything-else)
Make the generated centerline **window-invariant**: identical (seed, params) → identical geometry at a
world position, regardless of stream center. Today it's only invariant *within* a 256 m band.
- Build each row-run over a **world-anchored span + margin** beyond the rendered region, and consume
  only the interior — so the rendered geometry (incl. local fillet end-effects) is identical across
  stream centers. (`bug-road-rebuild-determinism.md` "proper fix".)
- **Headless window-invariance probe:** stream the same world region from two different centers → assert
  identical run geometry. This gate is the foundation that makes Steps 2–3 testable against a *stable*
  target (otherwise the min-radius/camber gates chase a moving road).
- Tradeoff accepted (user, 2026-06-16): gives up the old "sticky across param-tweaks" behavior — same
  (seed, params) is now reproducible; changing params re-routes deterministically (road may shift).
  By-seed reproducibility (stable spawns, shareable seeds) is the win.

### Step 1 — Router character (cost only; KEEP its curvature freedom)
Improve `_protoEdgeCost` / turn model in `_protoConnect` for road CHARACTER. Do NOT add a hard curvature
gate — tight turns are liked character; min-radius is enforced minimally at Step 2.
- **KEEP valley-following** — `wAlt·toH` valley bias is correct (roads follow valleys: people/water).
  Do NOT gut it or roads glue to crests.
- **KEEP** long straights + variable waypoint spacing, tight turns, switchbacks, traverses (all liked).
- **ADD climb-anticipation** — penalize being below the start→goal constant-grade altitude ramp, so the
  route gains altitude SOONER within the valley/traverse and doesn't wall-out. Vertical-progress term,
  ORTHOGONAL to the lateral valley preference — NOT crest-riding.
- **Improve switchback parallelism** — context-dependent turn cost (cheap when a turn dodges over-grade,
  costly on flat ground); a distinct, tighter FOLD-SAFE switchback apex radius so arms sit ~2×apex apart.
  NOTE: the cleanup passes may be EXCISING tight switchbacks as "loops" — deleting them (Step 4) may
  restore parallelism for free; verify before adding cost complexity.

### Step 2 — Minimal spline pass (the BUG-12 fix)
ONE surgical modification of the routed points, integrated into spline/curve generation (NOT a cleanup
stack, NOT uniform resampling):
- **Min turn radius (HARD), minimally:** only touch corners that would fold the ±halfWidth ribbon;
  round just to the **fold-safe floor (~halfWidth + clearance ≈ 7–8 m)** so tight turns stay tight (do
  NOT gentle to 15 m); leave straights untouched. This is where `filletMinRadius` FAILED (leaves a
  hairpin at ~2 m) — use a constructive arc only at violating corners, not relaxation.
- **Max grade (SOFT, "if possible"):** occasional grade deviations are fine, navigable, characterful —
  don't fight terrain hard.

### Step 3 — Camber fix (no uniform resampling)
Make camber/curvature SPACING-INVARIANT: sample signed curvature at a **consistent arc-length window**
(fixed metres), not per-raw-point. Smooth camber regardless of uneven spacing; route character intact.

### Step 4 — Delete the cleanup stack (the simplification)
Remove `_removeLoops`, `_removeSelfCrossings`, `_filletMinRadius`, dead `_limitCurvature`. Re-verify
crease-free in-sim, then remove the transition nets. Confirm `road.js` shrank.

## Decisions (locked)

- D-det: deterministic, window-invariant generation is the FOUNDATION (Step 0). Reverses BUG-11's prior
  WONTFIX. Reproducible by (seed, params); per-tweak stickiness given up.
- D-src: fix at the source + ONE minimal spline pass. NO conditioner-as-a-layer, NO hard A* curvature
  gate (keep tight-turn character), NO uniform resampling (keep variable spacing).
- D-char: keep valley-following, long straights/variable spacing, tight turns, switchbacks, traverses.
  Router work = cost/character (climb-anticipation + switchback parallelism).
- D-rad: min turn radius is HARD but enforced MINIMALLY at the spline, only at folding corners, to the
  FOLD-SAFE floor (~7–8 m). Feel value (15 m) stays a separate slider, not the hard bound.
- D-grade: max grade is SOFT ("if possible"); occasional deviations welcome/navigable.
- D-del: success = the cleanup stack DELETED + smaller road.js, not just folds gone.
- D-arc (CHOSEN 2026-06-16, reverses "hybrid-A* = fallback only"): replace the 8-grid `_protoConnect`
  inner planner with an **arc-primitive hybrid-A\*** (state = pos-cell + heading-bin ~32; primitives =
  {straight=curv-0, gentle±, hard±}; hardest radius = **8 m** floor → min-radius-valid BY CONSTRUCTION).
  KEEP the 256 m valley-descended macro-anchor skeleton + goal-directed heuristic (the "goes somewhere"
  intentionality). Cost biases toward straight/large-radius (curvature cost) so long near-straights are
  cheap; grade + climb-anticipation make tight switchbacks emerge deterministically up steep passes (the
  terrain is the "noise", NOT random). TRUE straights = the curvature-0 primitive (no large-radius approx).
  This makes the whole cleanup stack deletable (arcFillet/_filletMinRadius/_removeLoops/_removeSelfCrossings/
  _limitCurvature + Step-2 spline fillet) — CR only smooths between already-valid arc points. Determinism +
  window-invariance preserved (lattice, no randomness, still per-anchor-pair cached). Supersedes the per-corner
  fillet approach (relaxation undershoots → ruled out; folds confirmed in-sim at HEAD e50484d).
- Carried (VBC/D-16): pure `coarseHeight`, determinism, single `height(x,z)`, no asset files/deps,
  `terrain-worker.js` stays byte-synced; junctions (VBC-08) and vertical/3D radius (VBC-02) OUT of scope.

## Verification (headless-first, then in-sim)

Gates in `test/diag-minradius-pipeline.mjs` (+ promote to `test/spline-continuity.mjs`):
- **WINDOW-INVARIANCE** (Step 0): same world region from two stream centers → identical geometry.
- **MIN-RADIUS** (Step 2): dense-sampled XZ radius ≥ fold-safe floor at every corner on the real dumps.
- **MINIMAL** (Step 2): straights/already-ok geometry unchanged (bounded point displacement).
- **CAMBER** (Step 3): signed curvature at a consistent arc-length window is continuous (no spikes) on
  the real dumps — without uniform resampling.
- **CHARACTER** (Step 1): grade-profile vs start→goal ramp (climb starts earlier); switchback arm-spacing;
  peak grade. Tune to numbers, not screenshots.
- **ROUTER** (Step 1): `_protoConnect` on real seeds stays valley-following + reproducible.
In-sim: seed 8 seam (no kink/tear), seed 6 camber smooth, seed reproducible across reloads + param
tweaks, `rd_minr` holds ≥ floor, and subjectively valleys/straights/switchbacks still feel right.

## Real fixtures
`Logs/road-run-dump-1781627151455.json` (seed 8, run -1:1), `-1781627245285.json` (seed 6, run 0:0).
Dump tool: press `p` in-sim (`road.js debugDumpNearestRun` + main.js). Optional prep: extend it to also
emit raw A* waypoints (`rowWps`, pre-CR) to build against true router input.

## GOTCHAS / DO-NOT (each cost a wrong turn)
1. **Never measure corner radius on raw network points** — sparse/uneven spacing makes a 3-point
   circumradius read a false ~14 m across a real ~1.5 m vertex. Measure on dense/uniform samples.
2. **The ribbon (sweepRibbon) sweeps slice CONTROL POINTS** (frame from runProfile tangent), not spline
   samples — sharp/cluster control points fold it directly. Fixing the centerline points fixes the ribbon.
3. **THREE `getPoints(n)` is uniform-PARAMETER, not arc-length** — bunches samples; false ~0 radius. Use
   arc-length sampling to judge curvature.
4. **Ruled-out (do not retry):** midpoint relaxation (undershoots), wide-stencil relaxation (collapses),
   global pure-pursuit (corrupts gentle curves), uniform-resample-alone (preserves sharp vertices + kills
   the liked variable spacing).
5. Don't gut `wAlt` (→ crest-glued roads). Don't add a hard A* curvature gate (→ kills tight character).
   Don't uniformly resample (→ kills variable spacing). Don't over-smooth at Step 2 (minimal only).
6. `terrain-worker.js` is a byte-identical mirror — keep synced if generation touches worker-shared code.

## First steps (fresh session)
1. Read this doc + 09-31-PLAN.md + 09-CONTEXT.md (VBC) + QUAL-03 + BUG-11.
2. Build the headless gates + the window-invariance probe + router metrics first (TDD); wire the two real
   dumps as fixtures.
3. **Step 0 (determinism)** → assert window-invariance green; valley-following + reproducibility preserved.
4. **Step 1 (router character)** on the now-stable base → climb-anticipation + switchback metrics.
5. **Step 2 (minimal min-radius + soft grade)** → MIN-RADIUS + MINIMAL gates green on real dumps.
6. **Step 3 (camber)** → CAMBER gate green. Keep nets; in-sim verify.
7. **Step 4 (delete cleanup stack + nets)** → re-verify; confirm road.js shrank (done-signal).
8. Fallback if the grid fit can't hit the gates: hybrid-A* with min-radius arc primitives.
