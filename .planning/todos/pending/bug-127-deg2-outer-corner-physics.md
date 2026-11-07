---
id: BUG-127
type: bug
status: open
opened: 2026-11-07
severity: minor
source: Spare, the BUG-122 follow-up (reserved by the orchestrator, 2026-11-07)
owner: Spare (road / carve)
relates_to: BUG-122 (fix 2, _ribbonDrawnAt at padded ends), BUG-90 (the deg-2 connector strip), MESH == PHYSICS
---

# BUG-127: at a sharp deg-2 bend, physics rides the trimmed legs' ribbon tops over the gravel outer corner

## What happens

At a deg-2 bend the legs' ribbons are trimmed back (road-mesh trimOf, within cutback of the node), and the connector
strip (`_buildDeg2Ribbon`) draws the turn. At a sharp bend its arc cuts the corner, so the legs' **outer corner is
gravel in the mesh**. Physics still took "on the ribbon" from the lateral distance alone and rode the legs' ribbon
tops there: an invisible surface over the drawn dirt. BUG-122's `_ribbonDrawnAt` fixed the same mismatch at padded
ends and deliberately left deg-2 ends alone.

## Measured (`wip/bug-127/deg2.mjs`)

Random seeds 1717534236, 861989012 and 1107599406, R 1000. 7 deg-2 connector nodes; 4,993 points on a 0.5 m grid
over the legs' trimmed footprint (|lat| < halfWidth), counting points not covered by the connector strip or a pad:

| | points with physics > 5 cm above the drawn dirt | worst |
|---|---|---|
| main | 1,366 (27 %, ~340 m²) | +0.18 m |
| fix | 46 (~12 m², all within the 1 m mouth slack) | +0.16 m |

It is the sharp bends: legs 82° and 90° apart carried 124–171 points per leg; a 13° turn carried 1–2. The top-down
shot of seed 861989012's 98° bend at (−194.3, −409.8) shows the gravel outer corner.

## Fix

`_ribbonDrawnAt` applies the mesh's trim rule at every junction end, deg-2 included (the 1 m mouth slack stays).
Where the connector strip is drawn its own overlay in `_sampleCarveWorld` (`co.lat < halfWidth`) still applies, so
only the undrawn outer corner changes: physics now rides the gravel the mesh shows.

**Two gates assumed the run's line is road all the way into the node,** and at a sharp bend it is not:
- `road-smoothness` flagged the connector's real kerb (16 cm) where seed 6's run line climbs back on from the outer
  corner. A step now counts only between two samples that both stand on drawn asphalt.
- `vertical-curvature` drives a run's lanes only where asphalt is drawn under them (inside a junction end's trim,
  ribbon, connector or pad). 730 of 1.34 M samples dropped, junction kinks 206 → 203, ceiling lowered to 203. The
  connector arcs are driven as before.

## Acceptance

- [x] Measured on random seeds, before/after.
- [ ] Affected gates and `fingerprint-world`, explained.
- [ ] A drive soak over sharp bends, no new flags.
