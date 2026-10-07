---
id: ASSET-71
type: asset
status: open
severity: minor
opened: 2026-10-07
relates: FEAT-98 (Places and Missions — replaces the placeholder marker), FEAT-103 (job site)
---

# ASSET-71: Job site

**POI model** — the `workSite` class. A site trailer, a fence run, a stack of materials.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~12 × 7 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/job-site.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
