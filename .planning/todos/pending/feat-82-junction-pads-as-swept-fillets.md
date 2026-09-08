---
id: FEAT-82
type: feature
status: pending
severity: high
---

# FEAT-82 — junction pads as swept fillet surfaces, not a plane painted on the terrain

**Owner, 2026-09-08:** junction pads "1. don't look great (when they are circular in shape, convex.
I would prefer fillets) 2. resemble the road surface being 'painted onto' the terrain whereas the
incoming roads are smooth swept curves. It often feels like you drop 50 cm off the road into the
intersection and then have to climb back out … a combination of insufficient earthwork (but needs
to be nuanced) and us building the pad from the terrain instead of a separate swept curve between
each road drop-off. Make intersections smooth, continuous and driveable."

## Where it stands

- The vertical half is on the UNMERGED `feature/junction-stitch` branch (deck hold, per-leg pad
  reach BUG-59, BUG-61): a leg rides the pad plane until its pavement has parted from its sibling's.
  Ruling: bring that in FIRST; this ticket stacks on it.
- The pad ring ladder is weld → circle → hull (`_junctionRingWeld` / `_junctionRingLegacy`). The
  convex circle the owner dislikes is the fallback, firing on ~22 of ~200 nodes where the mouths are
  so close the weld self-intersects.
- The pad SURFACE is a plane fitted to the terrain neighbourhood (`_junctionPadPlane`), grade-capped
  at `roadJunctionPadMaxGrade` 0.07, with the leg decks blended onto it. The legs are swept ribbons;
  the pad is not.

## Direction (QUAL-11's plan, now ruled)

Between each pair of adjacent legs, join the leg EDGES with a tangent fillet arc (the deg-2
connector already does this for two legs, `_buildDeg2Ribbon`); the pad surface is then swept /
lofted between the leg cross-sections and those fillets so its height is a continuation of the
incoming decks, and the terrain is carved to THAT surface. The plane becomes a fallback, not the
definition.

## Acceptance

- [ ] no circle-fallback pads in the seed 6/7/11 battery; every ring is fillet-bounded.
- [ ] `junction-stitch` gate: max lip at any pad mouth < 0.05 m; the "drop in and climb out" is gone.
- [ ] pad mesh == pad physics (the pad-census / carve-mesh-smoothness gates stay green).
- [ ] owner drive-through at speed: no bump entering or leaving a junction.
