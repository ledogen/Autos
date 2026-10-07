---
id: ASSET-58
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-58: Persian rugs, rolled

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

One or two large rugs rolled up and tied, the ends showing a coloured border pattern as **flat-coloured geometry rings**, not a texture (ART-STYLE). Light, but valuable.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤200** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | rolls ~2.7 m long, ~0.35 m diameter |
| Fits the bed | longer than the 1.8 m bed floor: it rides on the **lowered tailgate**, ≤ 1.4 m wide |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box (per roll) · `mass_kg: 30–60 per roll` |

## Acceptance

- `assets/models/persian-rugs.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
