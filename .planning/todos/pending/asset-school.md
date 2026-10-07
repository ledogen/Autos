---
id: ASSET-73
type: asset
status: open
severity: minor
opened: 2026-10-07
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-73: Country school

**POI model** — the `school` class. A one-room schoolhouse: clapboard, bell cupola, flagpole.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1000** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/school.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
