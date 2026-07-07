---
id: QUAL-10
type: quality
status: merged
merged_into: QUAL-11
opened: 2026-06-30
resolved: 2026-07-06
severity: minor
source: user-request
note: "Intersections need a nice visual BLEND. Right now the road ribbons all just terminate at the same
spot — they butt-end into a flat junction pad with no flare/feather/tangent merge, so it reads as ribbons
stopping dead at a patch rather than roads flowing together. The pad mesh exists (buildJunctionFootprint,
roadJunctionFootprints: true) but the fillets are approximate, the legs aren't precisely trimmed to it,
and the pad↔ribbon seam is a hard shading/colour break. Pairs with FEAT-19 (graded junction surface)."
---

# QUAL-10: Nice visual blend at intersections — ribbons should flow together, not butt-end at a pad

> MERGED INTO QUAL-11 2026-07-06 (user: "too similar"). The first-pass pad shipped 2026-07-01
> (9337959: node detect, terrain carve, ribbon cutback, graded apron riding sampleRoadTopY) and
> QUAL-13 (f15c8af) added the sloped pad planes. Everything still outstanding here — true tangent
> fillets landing exactly on the ribbon edges, exact leg trim/weld, pad↔ribbon seam
> shading/colour continuity, lane-markings feather instead of a hard stop — now lives in
> `qual-junction-arc-fill.md` (QUAL-11). This file is kept as the original problem statement.

## Problem

At every intersection the road ribbons **terminate at the same spot** and meet a flat junction pad with
no real blend. It reads as several ribbons stopping dead at a polygon, not as roads flowing together.
The junction pad mesh already exists and is on by default — the issue is the *quality* of the merge:
flares, fillet tangency, leg trim, and seam shading.

## Current state (what's there to improve)

`RoadMeshSystem.buildJunctionFootprint` (`src/road-mesh.js:862`), gated by
`roadJunctionFootprints: true` (`data/ranger.js:287`), renders one polygon per AT_GRADE node:

- **Flat pad.** Vertices all at `Y = node.nodeY`, crown = 0, camber = 0, flat asphalt colour
  `(0.15, 0.15, 0.17)` (`road-mesh.js:978–980`). It's a separate flat patch, not a continuation of the
  crowned/cambered ribbon surface → a visible shading/colour break at the seam.
- **Approximate fillets.** Corner fillets are sampled around the node at the *average* radius `rAvg`
  (`road-mesh.js:938–946`), not a true tangent arc onto each leg's outer edge — so the pad boundary
  doesn't land exactly on the ribbon edges. Acute crossings (< 20°) collapse to a straight bevel
  (`road-mesh.js:917`).
- **Legs not precisely trimmed.** Ribbons are only "trimmed" because tiles beyond the footprint get
  swept; there is no per-ribbon trim to the pad boundary — explicitly deferred (D-13, `road-mesh.js:849–852`).
  Result: ribbon ends and the pad boundary don't coincide → small gaps or overlap, and the abrupt
  square-ish ribbon end the user is seeing.
- **Markings just stop.** Lane markings are suppressed inside the junction (`inJunction`,
  `road-mesh.js:187–189`) with no transition/feather.

## Direction (decide specifics at planning)

Goal: the junction should look like the roads **flow into each other** — a smoothly flared apron with
continuous surface and shading — not ribbons ending at a patch.

- **True tangent fillets.** Build each corner as a real fillet arc tangent to the two adjacent leg outer
  edges (the `R_f = halfWidth·tan(θ/2)` intent at `road-mesh.js:912` done geometrically, not by
  node-centred average-radius sampling), so the pad boundary meets the ribbon edges exactly — no gap,
  no overlap, smooth corner.
- **Precise leg trim / flare.** Trim each ribbon to the pad boundary (close the deferred D-13 trim) and
  optionally **flare** the last span — widen the ribbon as it approaches the node so lanes fan into the
  junction rather than meeting at constant width. Ribbon end and pad edge share vertices (or are welded)
  so there's no seam.
- **Continuous surface + shading across the seam.** Carry the ribbon's crown/camber into the pad edges
  and ease to the pad interior, and match vertex colour/normals at the boundary so the pad doesn't read
  as a separate flat tile. (Coordinate with FEAT-19: the pad Y should follow the *graded* junction
  surface, not a flat `nodeY` — see below.)
- **Marking feather.** Fade/blend markings into the junction instead of a hard cut; consider a junction
  surface treatment (e.g. a subtle apron tint) so the intersection reads as intentional.
- **Keep the invariants.** Pure fn of the network → window-invariant (same junction looks identical
  regardless of which tile/stream order built it); mesh stays coplanar with the collision surface
  (QUAL-07 mesh == collision); `npm test` carve/smoothness gates stay green. No new per-frame cost
  beyond the existing once-per-build cached `_detectJunctions` path.

## Relationship to FEAT-19 (coordinate — same surface)

FEAT-19 makes the junction *surface* follow the road grade instead of flattening to a level `nodeY`
pad. This ticket (QUAL-10) is the *visual mesh blend* — fillets, trim, flare, seam shading — on top of
that surface. They both touch `buildJunctionFootprint` + the junction Y. Sequence so the blend mesh sits
on FEAT-19's graded surface (don't bake the flat-`nodeY` assumption into the new fillet/flare geometry).

## Acceptance

- Intersections read as roads flowing together: flared/feathered ribbon ends, tangent corner fillets,
  no abrupt butt-end, no gap or overlap between ribbon and pad.
- The pad↔ribbon seam is continuous in surface and shading (no flat-patch colour/normal break).
- Holds at T, four-way, and acute crossings; window-invariant (looks identical regardless of approach /
  draw distance / tile that built it); mesh == collision (QUAL-07); `npm test` green.

## Related

- **FEAT-19** graded junctions (`feat-graded-junctions-no-flat-pad.md`) — the surface this blend rides on.
- **FEAT-07** at-grade pad (the `buildJunctionFootprint` this polishes) + [[project_crossing_classifier]].
- **QUAL-07** carve unify (mesh == collision discipline) — [[project_qual07_carve_unify]].
- Ribbon seam/arc history (continuity precedent): [[project_ribbon_seam_arcs]].
