---
id: ASSET-66
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (the farm POI — source of produce freight), ASSET-15 (the produce stall, the farm's
  placeholder until this set ships), ASSET-65 farmhouse · ASSET-66 barn · ASSET-67 tractor (the farm set)
---

# ASSET-66: Barn

**POI model** — the farm's big silhouette, the thing you spot from the road. Placed as part of the farm yard (FEAT-96).

## Request

A classic gambrel-roof barn in barn red with white trim, big double doors on the gable end (closed, or open onto a dark interior that hides everything past the threshold), and a hayloft door above.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~12 × 9 m footprint, ~8 m to the ridge |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/barn.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Composites cleanly into the farm-yard model with the other two and the produce stall (FEAT-96
  "The farm"), the way `splitting-yard.glb` composites the awning.
