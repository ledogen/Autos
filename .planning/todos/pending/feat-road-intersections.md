---
id: FEAT-07
type: feature
status: open
opened: 2026-06-11
rewritten: 2026-06-21
severity: major
source: user-observation
supersedes: FEAT-05 (road intersections, folded) ← BUG-09
phase_origin: 08-road-routing
note: "Rewritten 2026-06-21 per user: intersections must be a TRUE single merged mesh emerging from the interaction of the adjacent road splines — not two overlapping ribbons, not a decal/patch laid on top. Un-folded from Phase 9 (the at-grade-junction fold never shipped). NOT being addressed yet — request only."
---

# FEAT-07: Road intersections — one mesh meshed from the interaction of adjacent splines

> **PREREQUISITE: FEAT-10 (2026-06-25).** This renders a merged mesh at junctions; it cannot fix a
> network that generates *parallel-duplicate* ribbons + spirals (current state — see screenshot in
> FEAT-10). FEAT-10 (robust route merge + exclusion) produces the clean, deduplicated junction NODES
> this ticket consumes. Design the merge-node/junction record once across both. See
> `feat-robust-route-merge.md`.

## Goal

Where two roads cross or meet (two runs converging at an angle, an X- or a T-crossing), the surface must
be a **single continuous road mesh that is generated from the interaction of the adjacent centerline
splines** — the junction surface is *derived* from how those splines overlap and blend, so it reads as
one paved intersection. Explicitly NOT:

- two independent crowned ribbons overlapping / z-fighting at the crossing,
- a separate decal or patch "intersection prop" dropped on top of the ribbons,
- a flat polygon that hides the seam.

The intersection geometry, crown/camber blend, and the terrain carve under it should all fall out of the
combined spline footprint at the junction — the same construction philosophy as the rest of the road
surface (mesh == physics-felt surface, by construction).

## Acceptance (what "done" looks like)

- A crossing produces **one connected mesh** through the junction: walk the surface from any incoming road
  arm to any other and there is no overlap edge, no z-fight, no decal seam — continuous geometry.
- The junction surface is **a function of the participating splines** (their crossing point, angles, and
  widths), not hand-placed: change a road's route and the intersection re-forms correctly.
- Crown/camber blend smoothly to flat (or a sensible priority profile) through the junction — no ridge
  where two crowns intersect, no lateral step (cf. BUG-15 shoulder discontinuity).
- The terrain carve under the junction matches the merged surface (no airborne/sink-through across it).
- **Window-invariant & deterministic**: the junction is a pure function of `(seed, world-coords, params)`
  and identical across stream centers / re-streams — it must not pop. (The harness invariance gates that
  retired BUG-08 should extend to cover junction nodes too.)

## Why crossings already occur (current behavior)

- The network is one east-west run per macro-row (`mz`), each routed independently (`_protoConnect`),
  allowed to detour N/S (`PROTO_MARGIN`) around peaks — so runs from different rows cross.
- `_removeSelfCrossings` only de-crosses *within* one polyline; it never compares two runs.
- Overlap suppression (`PROTO_COVER_*`) is same-direction only and deliberately preserves angled
  crossings (road.js:85). So crossings survive untreated — there is no junction concept and no merged mesh.

## Design sketch (enabler — not a committed plan)

1. **Detect** inter-run crossings: pairwise XZ segment intersection across all runs in `this._network`
   (plus T-meets when an endpoint lands on another run, and future spur joins).
2. **Insert a shared junction node**: split both runs at the exact crossing vertex so the network is a
   connected graph and both centerlines pass through one point — the hook the mesh builds on.
3. **Generate the merged surface from the incident splines**: build the junction footprint from the union
   of the arms' swept cross-sections, blending crown→flat and carving the terrain to the same surface.
   This is the core of the request — the mesh is *interacted from the splines*, not stamped.
4. Keep all of the above a pure function of `(seed, coords, params)` and stable across re-streams.

## Open questions (decide during planning, not now)

- Junction footprint model: convex hull of arm cross-sections, a swept blend, or a parameterized fillet?
- At-grade only, or eventually grade-separated (one road ducks under)? Assume flat at-grade first.
- Priority/crown handling: symmetric flatten, or a through-road keeps its crown and the minor road yields?
- Design the junction model **once** to cover both X-crossings and T-junctions (spurs, deferred D-01,
  will create T's).

## Relationships

- **QUAL-03** (road re-architecture to constrained-spline + swept cross-section): a junction-aware,
  graph-based road model is exactly what QUAL-03 proposes — these likely want to be designed together, so
  the swept-cross-section model handles junctions natively rather than bolting them on after.
- **BUG-15 / BUG-14** (carve↔surface discontinuities): the junction merge must not reintroduce the same
  crown/seam steps; share the unified cross-section + carve approach.
- **BUG-08** (closed): junctions inherit the window-invariance contract — extend those gates.

## Files

- `src/road.js` — `_streamNetwork` / `this._network` (add an inter-run crossing + junction-node pass);
  `PROTO_MARGIN` / `PROTO_COVER_*` / `_removeSelfCrossings` context.
- Ribbon mesh + carve (Phase 9 surface code) — the merged-junction surface treatment driven by junction nodes.

---

## Implementation Plan (2026-06-24) — flatten-to-flat at-grade merge

**Decision (this session):** crown/camber resolve by **flattening to a flat junction pad** through the
crossing (both arms ease crown→0 to a common flat plane at the node grade). At-grade only — grade
separation is FEAT-08, which shares the detection foundation in step 1.

### What already exists (this is a FINISH, not a from-scratch build)
- **Detection:** `road.js _detectJunctions()` (~road.js:1627) already does pairwise inter-run XZ crossing
  detection via module-scope `_segXZ`, building `this._junctions` (nodeKey → `{ pos, legs (sorted by
  bearing), nodeY = avg of the 4 segment-endpoint Ys, simpleMerge }`), memoized by `_junctionsFrom`,
  cleared on re-stream. Near-parallel (<10°) or >4 legs ⇒ `simpleMerge`.
- **Mesh stub:** `road-mesh.js buildJunctionFootprint(node, params)` exists and is wired into tile
  building (~road-mesh.js:731-758: a node is assigned to the tile containing its XZ, then a footprint
  mesh is built). This is the "never-shipped at-grade fold" the ticket note refers to — it emits a
  footprint but NOT a correct single merged surface, and **nothing carves the terrain under it**.

### Gaps to close
1. **Shared crossing record (also the FEAT-08 foundation).** Extend `_detectJunctions` to also catch
   (a) SELF-crossings (a run crossing itself — only `ri<rj` DIFFERENT-run pairs are tested today) and
   (b) T-meets (an endpoint landing on another run). For each crossing store `{ runA, arcA, runB, arcB,
   point, angle, dYrouted }` (routed-Y gap of the two strands). **Classify:** `|dYrouted| < clearance`
   and not arc-separated ⇒ **at-grade junction (FEAT-07)**; arc-length-separated / large dY ⇒
   **overpass (FEAT-08)**. One detection pass feeds both features.
2. **Node-grade continuity.** Pad plane Y = node grade. Today `nodeY` is only the 4-point average and
   never feeds back into the run grade profiles, so the arms can arrive at different Ys. Feed the node
   grade into `_buildRunProfile` so each incident arm's `gradeY` converges to the pad plane near the
   node (same spirit as the anchor-join grade continuity already in `_streamNetwork`).
3. **Crown/camber → flat blend.** Within a junction blend radius `Rj` (≈ halfWidth + shoulder + margin),
   ramp the `crownProfile`/`camberProfile` contributions to 0 so all arms meet ONE flat pad — no
   crown-vs-crown ridge, no lateral step. Apply the SAME per-vertex blend `f(distToNode)` in both the
   ribbon sweep (road-mesh.js) and the carve (terrain.js) so surface == physics by construction.
4. **Single merged pad surface.** Finish `buildJunctionFootprint` into ONE triangulated pad = the
   union/hull of the incident arms' cross-section edges at the pad plane (road-carve.js already exports
   `isConvexPolygon` / `triangulateConvexFan` / `earClip`). Arms sweep up to the pad boundary; the pad
   fills the interior → walk any arm → pad → any other arm with no overlap edge / z-fight.
5. **Carve the pad (the missing physics half).** `terrain.js _buildCarveTable`: for vertices within `Rj`
   of a junction node, target the **flat pad Y** (crown/camber blended to 0) with the normal shoulder
   ramp out, so the carved ground == the pad mesh (no airborne/sink-through across the intersection).
   Junction nodes are a pure fn of `_network`, read like `runProfile`/`camberProfile` are today.

### Determinism / gates
- Junctions are a pure fn of `(seed, the two runs' geometry, params)` → window-invariant by transitivity.
  Add `test/junction-invariance.mjs`: sample node position + pad Y + footprint across two stream centers,
  assert identical (the BUG-08 contract extended to nodes) + a surface-agreement check (ribbon pad Y ==
  carve pad Y at sampled points, like `ribbon-carve`; no crown ridge). Register in `run-all.mjs`.
- `route-worker-sync` unaffected — junctions are post-network, not in the routed primitives.

### Files
- `src/road.js` — extend `_detectJunctions` (self/T-cross + classify + crossing records); node-grade
  feedback into `_buildRunProfile`; a `junctionsForCarve()` accessor (akin to `collectChunkSplinePoints`).
- `src/road-mesh.js` — finish `buildJunctionFootprint` (single merged pad); crown/camber→flat blend.
- `src/terrain.js` — carve the pad flat within `Rj` in `_buildCarveTable` (main-thread; no ROUTE SYNC).
- `data/ranger.js` — `roadJunctionBlendRadius`, pad margin.
- `test/junction-invariance.mjs` (+ register).

### Risks / hard parts
- Pad triangulation for T (3-leg), X (4-leg), and the `simpleMerge` (>4 / near-parallel) fallback.
- Crown→flat blend without a seam at `Rj` (BUG-15 class) — must blend in ribbon AND carve identically.
- Node-grade feedback without breaking grade C1 or window-invariance.
- Interaction with QUAL-05 (gentler routing → fewer/cleaner crossings) and COVER suppression (don't drop
  a run that participates in a junction).
