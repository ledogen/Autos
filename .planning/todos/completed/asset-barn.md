---
id: ASSET-66
type: asset
status: completed
severity: minor
opened: 2026-10-06
closed: 2026-10-07
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

## Resolution (2026-10-07) — SHIPPED

`assets/models/barn.glb`, **708 tris** (budget 1200), 4 materials (`BarnRed`, `BarnTrim`, `BarnRoof`,
`BarnBase`), zero images, no UVs. Sources: `assets/models/src/barn.py` + `.blend`. Registered as
`barn` in `data/prop-models.js` (one body box, 9.1 x 8.0 x 12.1), with no pool tag.

- Doors CLOSED (owner): sliding pair 4.0 x 3.3 m under a white track header, plus a 1.6 m hayloft
  door; both with the white frame-and-X. That is bigger than the reference photo's doors scaled to a
  9 m gable (~3.2 x 2.6 m). The choice is deliberate: tractor-door size, and it reads better at range.
- Ribbed metal siding = inward V-grooves (the trailer's siding trick, turned vertical). The
  long walls are plain; ~500 tris of headroom remain if they want windows or a man door.
- Audit: no clipping, no z-fight, 0/2474 inverted ray hits. 524 non-manifold edges by design
  (single-sheet walls, backless trim). No floor, like the trailer.
- **For FEAT-96:** 10.0 x 12.7 m overall does NOT fit the 14 x 8 m lay-by pad. The farm yard needs
  a bigger pad. `BarnRed` is the candidate if farms want a `palette`.
