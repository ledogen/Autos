---
id: ASSET-63
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), cargo.md (master cargo list)
---

# ASSET-63: Wardrobe (high centre of gravity)

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A tall, heavy wooden wardrobe standing upright, doors closed, strapped to the front bedside. **This is the high-CG job:** the top sits about 2.5 m off the road, so it pulls the truck's centre of gravity up and makes it roll.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; wood colour a recolour hook |
| Real size | ~1.2 × 0.6 m footprint, ~2.0 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 100–180` |

## Acceptance

- `assets/models/wardrobe.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
