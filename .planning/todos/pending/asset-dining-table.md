---
id: ASSET-60
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), ASSET-59 (dining chairs — same set), cargo.md (master cargo list)
---

# ASSET-60: Dining table

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A nice wooden dining table, upside down with its legs up as movers carry one, strapped. Turned legs as faceted geometry.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; wood colour a recolour hook |
| Real size | top ~1.6 × 0.9 m, ~0.75 m tall (inverted) |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 40–70` |

## Acceptance

- `assets/models/dining-table.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
