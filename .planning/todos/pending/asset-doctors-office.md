---
id: ASSET-70
type: asset
status: open
severity: minor
opened: 2026-10-07
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-70: Doctor's office

**POI model** — the `doctor` class. A converted house with a clinic sign and a ramp.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤900** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/doctors-office.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
