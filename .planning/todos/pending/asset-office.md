---
id: ASSET-69
type: asset
status: open
severity: minor
opened: 2026-10-07
updated: 2026-10-29
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-69: Small office

**POI model** — the `office` class. A single-storey office: flat roof, glass door, a sign board.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** — raised from ≤800 (owner, 2026-10-29: match the trailer home and the barn, the lay-by buildings at 1200; simple is fine) |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/office.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
