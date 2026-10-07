---
id: ASSET-49
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-49: Traffic cones

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A bundle of about 20 orange traffic cones in two or three nested stacks, lying or standing, strapped together. Saturated orange with a white reflective band (geometry, not a texture).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; cone orange a recolour hook |
| Real size | ~0.8 × 0.8 m footprint, ~0.9 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull or box · `mass_kg: 40–80` |

## Acceptance

- `assets/models/traffic-cones.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
