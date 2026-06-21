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
