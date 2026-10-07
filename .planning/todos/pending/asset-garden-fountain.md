---
id: ASSET-62
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), cargo.md (master cargo list)
---

# ASSET-62: Garden fountain

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A tiered cast-stone garden fountain, two or three bowls on a pedestal, disassembled into its tiers and strapped. Heavy, and stone chips.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | basin ~1.0 m diameter, tiers stacked ~1.0 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull or box · `mass_kg: 150–300` |

## Acceptance

- `assets/models/garden-fountain.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
