---
id: FEAT-13
type: feature
status: open
opened: 2026-06-28
severity: major
source: user-observation (in-sim 2026-06-28 — roads run parallel, few intersections, unnatural)
builds_on: FEAT-10 (merge graph + smooth navigable junctions + COVER deletion — the rendering foundation)
relates: FEAT-12 (earthwork routing — lets cross-roads climb ridges), QUAL-03 (graph re-architecture), FEAT-08 (overpasses)
---

## STATUS 2026-06-28 — v2 FOUNDATION LANDED (committed 85970fa), follow-up deferred

The lattice-graph first draft (§ handoff) was replaced by the **locked v2 generator**: an URQUHART graph
(Delaunay − each triangle's longest edge) over a window-invariant **BLUE-NOISE** anchor set
(`src/road-graph.js` + `road.js` site sampler/`_buildUrquhart`/`_nodePos`/`_graphDegreeOf`). Node
identity generalised grid-cell `[mx,mz]` → site id `[cmx,cmz,k]`. Kills parallel rows + lattice
artifacts; connected by construction (Urquhart ⊇ MST). 23 gates green (rows untouched, still default);
in-browser seed 6 = organic varied-direction network with real T/X hubs, 0 console errors.
**DEFERRED follow-up (next pass):** (1) T/X secondary-node PROMOTION of routed mid-span crossings
(the remaining surface steps live only in crossing zones — gate excludes them); (2) NEAR_PARALLEL /
connectivity-safe PRUNE of residual close strands; (3) switchback + centerline-divergence retune
(handoff §5C). See `.planning/ROAD-GRAPH-HANDOFF.md` and memory `project_feat13_v2_foundation`.

## STATUS 2026-06-28 — RESEQUENCED behind a crossing-model rework (user reframe)

Before adding N-S roads, the existing crossing handling needs work: the network already makes abundant
NON-merged mid-span crossings (adjacent-row curved arcs crossing away from any shared anchor — the case
FEAT-10 doesn't handle) that render as undriveable messes. `_resolveRoadSurface` returns one Y per (x,z),
so two strands at one XZ fight over one height. User wants **overpasses as a valid intersection strategy**
(MERGE flat pad vs GRADE-SEPARATE bridge, by elevation gap) + tunnels (cut-side). FEAT-13 N-S roads come
LAST, after crossings are robust. Full sequence + status: [[project_crossing_classifier]].

**Step 1 LANDED (uncommitted, 20 gates green):** the crossing CLASSIFIER. `road.js _detectJunctions()`
reworked → bounded tile-bucket broad phase (Design D, once-per-build, self-aware) emitting classified
records `kind ∈ {NEAR_PARALLEL, AT_GRADE, GRADE_SEP}` + deterministic over/under, via `crossingList()`.
Knobs `roadCrossMergeDY`/`roadCrossAngleMin`/`roadCrossOverpassClearance` in ranger.js. Gate
`test/crossing-classifier.mjs`. Data-only — no mesh/carve/physics change yet.

**FINDING:** at current earthwork params crossings spread up to ~10 m dY (the 90/10 in the original plan
was stale capture params — overpasses are a MAJOR fraction). `roadCrossMergeDY` set to **4.5 m** (coupled
to the truck+deck overpass clearance — below it you can't grade-separate, so flatten; service roads need
the pad to clear a large truck) ⇒ ~24% of crossings grade-separate.

**Remaining steps:** 2) at-grade pad surface (FEAT-07 finish), 3) grade-sep visual-first
(FEAT-08 overpass + FEAT-11 tunnel), 4) multi-layer surface query (FEAT-08b), 5) THIS ticket's N-S graph.

# FEAT-13: 2D road-network GRAPH — real intersections, varied directions, not parallel rows

## The reframe (why this is the actual goal)

The road work this milestone has been chasing one underlying objective: **a natural, navigable
forest-road network** — connected, with real intersections, roads running in varied directions, separated
by reasonable distances; a mostly-tree structure with a few deliberate loops. (This is the
long-stated FEAT-10/QUAL-03 aspiration: "connected, mostly-tree, a few loops — a condensed forest-road
system.")

Everything landed so far is **foundation, not the goal**:
- **FEAT-12** (earthwork) killed the spiral and lets roads fill/cut across terrain.
- **FEAT-10** (merge + run-join seal + junction flatten) killed duplicate/degenerate ribbons, sealed the
  tears, and made junctions render smooth + navigable.

But the network is still generated as **one east-west run per macro-row** (`anchor(mx,mz) → anchor(mx+1,mz)`,
road.js `_streamNetwork`/`_connRouteSpec` — **east connections ONLY, zero north-south**). So:
- every road runs W→E ⇒ **parallel by construction**;
- parallel lines don't cross ⇒ **almost no intersections** (the only "junctions" are adjacent rows whose
  anchors valley-snap together — which reads as a road *bending*, not a crossing);
- observed in-sim (2026-06-28): roads run roughly parallel, converge where anchors pull together, spread
  back out. Working as designed — but the design is a stack of parallel lines, not a network.

**The cleanup is done; the topology is the remaining problem.** The junction-rendering machinery FEAT-10
built (merged-node flatten, run-join seal, dormant crossing detection/pad) is exactly what's needed to
render a real graph cleanly — it's currently sitting idle because the topology produces nothing to render.

## Goal

Generate the network as a **2D graph** over the macro-anchor lattice instead of independent rows:
roads in varied directions, **real T/X intersections** where roads meet and cross, perpendicular character
(not all parallel), reasonable spacing, connected with a few loops. Drivable and believable.

## Approach (phased — resolve the design in plan mode)

The anchors are already a 2D lattice (`_protoAnchor(mx,mz)`). Today only **E** edges exist. Add the other
axis and select edges to form a sparse, connected, window-invariant graph.

### Phase 1 — North-south connectors (fastest path to crossings)
Add seeded N-S connections `anchor(mx,mz) → anchor(mx,mz+1)` alongside the E rows, routed by the SAME
`arcPrimitiveConnect` (earthwork lets them climb ridges as passes/switchbacks at a legal grade). Keep the
E rows as the connectivity backbone, so reachability is guaranteed; N-S density is a tunable param. Where
an N-S road crosses an E-W road **mid-span** (not at a shared anchor) → a **true X-crossing**. This is the
first time the network produces real crossings, and it directly exercises:
- **crossing detection** — the dormant `_detectJunctions` (geometric inter-run XZ crossing), now needed
  for real and made graph-aware/bounded (Design D: emit nodes once per build, tile-bucket broad-phase —
  NOT the per-frame O(N²) rescan);
- **crossing surface** — flatten grade/camber to a shared node at the crossing (reuse
  `_applyJunctionBlend`) + the flat junction **pad mesh** (`buildJunctionFootprint`, currently a gated-off
  placeholder) so the two roads read as one paved intersection (the FEAT-07 residual, now actually
  exercised — "intersection of meshes" / coplanar arms + pad is acceptable per the FEAT-07 fold).

### Phase 2 — Generalize to a real graph (break the E-W dominance)
If Phase 1 still feels too grid/parallel, replace per-row generation with **per-anchor edge selection**
over the lattice (E/N/S/W + optional diagonals): a deterministic, window-invariant rule picks a sparse
subset per cell with a **connectivity guarantee** (a local spanning rule — e.g. each cell links to a
hashed "parent" neighbour, cycle-broken — plus seeded extra edges for loops/crossings), targeting average
degree ~2–3. The per-row grade-smoothing pipeline becomes **per-edge grade + junction-node grade
reconciliation** (the FEAT-10 flatten already does the node reconciliation, so this transition is
supported).

## Key challenges / constraints

- **Connectivity, no orphans** — the hard part of any graph rule. Phase 1 sidesteps it (E backbone stays);
  Phase 2 needs a provable local spanning rule. Add a reachability gate.
- **Window-invariance (non-negotiable)** — every edge-selection + crossing decision a pure fn of
  `(seed, cell, params)` + the deterministic priority; identical from any stream center. Extend
  `invariance`/`restream-invariance`; crossings must not pop.
- **True X-crossings** — roads crossing mid-span (different runKeys, not sharing an anchor) need the
  geometric crossing detector + a junction node + the pad. This is the part FEAT-10's same-anchor
  T/Y handling does NOT cover yet.
- **Grade at crossings** — the two crossing roads arrive at independent Ys; flatten to one pad Y (or, for
  large dY / arc-separated, classify as an **overpass** → feeds FEAT-08). Keep mesh == collision (QUAL-07).
- **Perf** — adding N-S ~doubles routed edges; route via the same Worker pre-warm (ROUTE SYNC). Crossing
  detection bounded + once-per-build, not per-frame.
- **Tuning for "natural"** — N-S density, target degree, loop fraction, min crossing spacing. Aim:
  varied directions, reasonable separation, a few loops — not a dense grid, not parallel lines.

## Acceptance

- The network has **real intersections** (T and X) at a believable density; roads run in **varied
  directions**, not all parallel; reasonable spacing; connected with a few loops. (In-sim eyeball + a
  metric: crossing count per unit area, direction-variance / parallelism index, connectivity.)
- Crossings render as **smooth navigable intersections** (flatten + seal + pad), mesh == collision, no
  tear/step — reusing FEAT-10's junction surface.
- **Window-invariant + deterministic**: the graph (nodes + edges + crossings + surfaces) is identical
  across stream centers and re-streams. No orphaned anchors (reachability gate).
- No regression on the 18 existing gates.

## Files (anticipated)

- `src/road.js` — `_streamNetwork`/`_connRouteSpec` (N-S edges + edge selection), `_protoAnchorHeading`
  for N-S anchors, per-edge vs per-row grade, **graph-native + bounded `_detectJunctions`** (Design D),
  crossing-node record, `_applyJunctionBlend` at crossings.
- `src/road-mesh.js` — finish `buildJunctionFootprint` (flat pad at crossings; re-enable
  `roadJunctionFootprints`).
- `src/terrain.js` — carve the crossing pad (mesh == collision).
- `data/ranger.js` — N-S density / graph-degree / loop / crossing-spacing knobs.
- `test/` — graph-invariance + reachability + crossing-density/parallelism gates; extend
  `route-merge.mjs`; `route-worker-sync` if N-S routing enters the ROUTE SYNC region.

## Open questions (plan mode)
- Phase 1 (additive N-S) sufficient, or go straight to Phase 2 (per-anchor graph)?
- Edge-selection rule that guarantees connectivity AND window-invariance over an infinite lattice.
- Crossing surface: flat pad mesh vs coplanar-arm seal (FEAT-07 fold says either is acceptable).
- Overpass vs at-grade classification at crossings (hands arc-separated ones to FEAT-08).
