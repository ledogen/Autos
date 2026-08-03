---
id: QUAL-24
type: quality
status: completed
opened: 2026-08-03
closed: 2026-08-03
severity: major
source: user-capture (rangersim-capture-1785652557957.json) + follow-up driving
relates_to: BUG-40 (closed — the partial fix that shipped), QUAL-16 deg-2 kink connectors,
  junction-flow stage 5 (_connectorDesignAt), QUAL-23 (wigglier regions breed more of these kinks)
branch: feature/road-feel (worktree /Users/ledogen/CodeShit/CarGame-road-feel)
---

# QUAL-24: a deg-2 join should BE road, not two roads plus an overlay

## Why this is still open

BUG-40 shipped on main (`37f24f1`) and is a real improvement, but it is **not** the fix. It removed
two fictions from the connector's grade blend. Measured on one metric (`scratch-runline`, worst
vertical demand at 20 m/s within ±60 m of the captured mark, seed 6):

| state | worst vertical demand |
|---|---|
| before any fix | 3.37 g |
| **main today** (`37f24f1`, BUG-40) | **1.97 g** |
| branch (chain merge) | **0.59 g** |

Anything above 1 g means the wheels leave the ground, so main still launches the truck there — the
player's report after that fix, that deg-2 junctions are not fixed yet, is correct. The chain merge
on `feature/road-feel` is the actual fix; it is unfinished for three specific reasons, recorded below.

(A second metric, `deg2-launch-metric` over the true through-line restricted to the high-speed
approach, reads 2.86 g → 1.25 g for the same before/after. Different span, same conclusion — quote one
or the other, never mix them.)

## The root cause (unchanged, and worth restating)

A degree-2 site is a CONTINUING PATH, not a junction — `_graphDegreeOf` says exactly that in its own
comment, and a player reads it as plain road. But the implementation puts **two independently-graded
runs** there plus a connector overlay (`_connectorDesignAt`) that averages them in world space. Each
leg was graded correctly *for itself*; the joint is where their disagreement gets dumped, compressed
into ~10 m. BUG-40's 0.43 m launch ramp was one symptom, the fillet-apex ridge a second, the
shoulder-lateral step a third. Patching the blend treats symptoms.

The launcher is **vertical**, and it does not correlate with the plan kink. Survey across seeds
6/0/3/42 (`test/scratch-deg2-pop.mjs` on the branch):

| seed | node | plan deflection | vertical break |
|---|---|---|---|
| 6 | 554,−876 | **89.1°** (sharpest) | 3.8% (harmless) |
| 6 | 41,619 (the captured bump) | 27.8° | 19.8% |
| 42 | −119,757 | 18.3° (near-straight) | **−35.8%** (worst) |

So plan-tangency alone fixes the wrong nodes. What kills the launch is giving the joint **one profile
domain** so the standard earthwork window (120 m) spreads the grade change, instead of ~10 m of joint.

## What is built on the branch

Merge each deg-2 CHAIN into ONE run, after the cull:

- `_deg2Chains(inBand)` — groups runs into maximal chains through degree-2 sites.
- `_mergeChainCenterline(chain)` — orients each member run, trims both sides of every internal joint,
  and Dubins-fillets the exposed frames **in primitive space**, so the merged run is still a
  `Centerline` of typed primitives (curvature bounded by construction, `nearest` refine intact).
- `_registerRun()` — factored out of `_assembleGraphEdges` so a merged centerline is sampled, graded
  and tunnel-passed by exactly the same path an ordinary edge is.
- `_chainEdgeSpans` / `_chainMembers` — each swallowed edge's arc window in the run that ate it, so
  `networkGraph()` still reports the ABSTRACT edges and `edgeParData()` hands back an edge-local view.
- `centerline.js`: `slicePrimitives`, `reversePrimitives`, `primitivePose`.
- `road-carve.js`: `dubinsFillet` — an exported wrapper OUTSIDE the ROUTE SYNC region (the mirrored
  copy may not carry an `export`, and the sync gate only strips it from `arcPrimitiveConnect`).

Runs after the cull deliberately: deg-2 sites are largely cull-CREATED, and the cull, crossing
classifier, map and POI placement all reason about a run as a graph edge. Merging before them broke
four gates for that reason alone.

### Two traps already paid for — do not re-introduce

1. **Solve the joint by SEARCH, never closed form.** The tangent construction `t = R·tan(δ/2)` models
   two STRAIGHT legs meeting at a point. Real legs curve into the node, so trimming exposes frames
   that are laterally DISPLACED, not merely rotated (seed 6: 4.4° apart in heading, 11.3° off the
   bearing = 8.6 m sideways over 44 m, where an S-curve at R=75 manages only L²/4R ≈ 6.5 m).
   Also, converging on the EXACT tangent point lands on the degenerate Dubins case where the LSL/RSR
   discriminant p² is 0, rounds a few ulps negative, fails `p2 >= 0`, and the solver returns a 360°
   word — shipped as literal 75 m circles in the road. Search R × trim depth, BUILD the path, accept
   only if it turns by about the deflection plus a quarter turn. A length-based guard does not catch
   this (4πR ≈ 940 m never fired on a 504 m circle).
2. **A chain merge regroups GEOMETRY; topology must not move.** `networkGraph()` derives the abstract
   graph from the runs, so a merged 3-edge chain reported as one edge and the world's edge count fell
   22 → 14 on seed 6 — POI siting rolls once per edge, so the lay-bys visibly vanished. POI placement
   is keyed on the abstract edge deliberately (`poi.js:16`), because a runKey-derived roll would not
   be window-invariant.

## What is left — the three open problems

### 1. Run identity becomes window-dependent (`graph-cull-radius-invariance` red)
Chain membership is gated on `inBand`, so a 320 m radius merges fewer chains than a 1500 m one and
the post-cull runKey sets legitimately differ. This is inherent to merging on a windowed degree, not
a slip. Decide: derive chain membership from a window-invariant source (settled Urquhart adjacency
over band+margin, independent of what is streamed), or accept identity churn and audit everything
keyed on runKey (save data, mission anchors, route bundle, road-quality's runKey hash).

### 2. A merged chain can approach itself (`graph-topology` SELF-CLEARANCE + CROSSINGS-CULLED red)
Two member edges legitimately come close near their shared node — `roadCorridorExempt` (50 m) permits
exactly that BETWEEN edges. Merged, it becomes one run overlapping itself. Both rules assume run ==
edge. Either make them chain-aware, or refuse to merge chains whose legs come within some distance.

### 3. A 1.77 m lateral step (`shoulder-lateral-continuity` seed 7 red) — the real defect
At (251,198), lat 5.8 m, tol 0.50 m. Same root as (2): self-clearance finds two parts of one merged
run **0.3 m apart**, so `_resolveRoadSurface` has two valid arcS candidates with different grades at
the same place and picks between them. RULED OUT: the Dubins fillet's curvature step (0.10 1/m) moves
camber only 0.02 rad = 0.11 m, so this is not a G2/clothoid problem.

## Acceptance

- [ ] `npm run test:all` green — especially graph-cull-radius-invariance, graph-topology and
      shoulder-lateral-continuity, the three that are red now
- [ ] Launch demand on the captured bump < 1.0 g at 20 m/s (main today 1.97 g, branch today 0.59 g
      on `scratch-runline`; quote one metric consistently — see the table above)
- [ ] Zero deg-2 connector nodes within loaded geometry (branch already achieves this — they survive
      only at the band edge ~1 km out, well beyond the ~160 m draw distance)
- [ ] No loop windows: no 120 m stretch of any run turning > 300°, across seeds 6/0/3/42/7
- [ ] Abstract edge count unchanged by merging, per seed — POI density must not move
- [ ] Once green, the connector overlay is DEAD CODE and gets deleted, not parked:
      `_connectorCarve`, `_connectorDesignAt`, `_deg2ArcTiles`, `_projectOntoDeg2Arc`,
      `_buildDeg2Ribbon`, the connector composition in `_nodeSurfaceTop` (~400 lines across
      road.js / road-mesh.js / terrain.js)

## Resolution (2026-08-03) — all 45 gates green

Two of the three "open problems" above were **stale** when the ticket was written: they came from a
gate run at `a734cf9`, before the circle fix and the POI fix. Re-running the suite showed
`graph-topology` (self-clearance + crossings-culled) and `shoulder-lateral-continuity` both passing —
the 1.77 m lateral step was a downstream symptom of the looping fillet, not an independent defect.
Lesson: re-measure before working from a recorded failure list.

That left two real failures, both fixed here:

**`mission-network` — the sliced-centerline copy.** `edgeParData` was returning a NEW `Centerline`
built by `slicePrimitives` for a swallowed edge, and the gate asserts object identity so the GPS blue
line cannot drift off the drawn white road. It was right to: centerline.js's premise is that ONE exact
curve travels from router to consumer and is SAMPLED, never re-derived — a copy is the class of thing
BUG-12 came from. Now the REGISTERED object is returned and the edge's extent rides alongside as an
arc RANGE (`arcOffset` / `arcLength`) in that run's own domain. Consumers (`poi.js` `_placeOnEdge`,
`mission.js` path + anchor blocks) work in that global domain, which is what the pad record,
`tunnelSpanAt` and the mission anchor already expected. Unmerged edges report `off=0, L=len`, so it is
identity for them.

**`graph-cull-radius-invariance` — the wrong unit.** The gate collected `_network` runKeys. Pre-
chaining a run WAS an edge, so that faithfully expressed its claim ("a road drawn on the map must be
there when you drive up"). Post-chaining, run GROUPING legitimately depends on the streamed band while
the roads do not, so comparing runKeys failed on grouping alone and said nothing about phantom roads.
It now compares abstract edges via `networkGraph()`. Not a weakening — the `compared` counts are
identical to main's (20/16/20), so the same set of roads is under test, and an edge culled at play
radius but kept at map radius is still caught. Run identity *within a drive* stays guarded by
`restream-invariance`, which passes.

### The connector overlay is NOT deleted — and should not be

The acceptance item above called for deleting it once green. That was wrong: it is not dead code. A
deg-2 node still forms at the streaming FRONTIER, where a site's adjacency is clipped by the band and
`through()` therefore declines to merge. Measured at the origin: ≤ 1 such node per seed across
6/0/3/42/7, and **zero within 400 m of the player** (draw distance ~160 m). The connector is now a
frontier-only fallback rather than the primary path — reachable, just never seen. It becomes truly
dead only if chain membership is made fully window-invariant, which is the open thread below.

### Open thread (not blocking)

Chain membership is gated on `inBand`, so which runs a chain groups still depends on the streamed
band. That is invisible in play — flips happen at the band edge, hundreds of metres beyond anything
drawn, and `restream-invariance` confirms nothing moves during a drive. Making it a pure function of
the site's own neighbourhood would retire the frontier fallback and let the overlay be deleted.

## Diagnostics on the branch

- `test/deg2-launch-metric.mjs <capture>` — vertical g-demand along the true through-line (on main too)
- `test/deg2-hump-census.mjs <seed> <radius>` — connector hump distribution (on main too)
- `test/route-character.mjs <capture>` — routing character, incl. the QUAL-23 forcing ratio (on main too)
- `test/scratch-deg2-pop.mjs` — deg-2 population survey: plan deflection vs vertical break, trim
  feasibility per radius (branch only)
- `test/scratch-runline.mjs <capture>` — launch metric along the run through a mark (branch only)
