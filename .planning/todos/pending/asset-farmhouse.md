---
id: ASSET-65
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (the farm POI — source of produce freight), ASSET-15 (the produce stall, the farm's
  placeholder until this set ships), ASSET-65 farmhouse · ASSET-66 barn · ASSET-67 tractor (the farm set)
---

# ASSET-65: Single-storey farmhouse

**POI model** — the farm's anchor building. Placed as part of the farm yard (FEAT-96), not alone.

## Request

A plain single-storey farmhouse: gable roof, a covered front porch with posts, a brick chimney, a few windows. Per ART-STYLE rule 7, windows show drawn curtains or blinds rather than an interior. It should read as lived-in and modest, not as a showpiece.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1500** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~13 × 9 m footprint, eave ~3 m, ridge ~5.5 m |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | boxes for the walls; the porch roof is not collidable |

## Acceptance

- `assets/models/farmhouse.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Composites cleanly into the farm-yard model with the other two and the produce stall (FEAT-96
  "The farm"), the way `splitting-yard.glb` composites the awning.
