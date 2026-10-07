---
id: ASSET-61
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-61: Eight tyres, strapped

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Eight car tyres (no rims) in two stacks of four, strapped down. Faceted tread as geometry. Freight,
not fragile (owner, 2026-10-06).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | tyres ~0.65 m diameter, two stacks ~1.4 × 0.7 m, ~0.85 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box (per stack) · `mass_kg: 80–100` |

## Acceptance

- `assets/models/tire-stack.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
