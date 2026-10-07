---
id: ASSET-53
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-53: Steel car rims

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Bare steel car rims (no tyres), painted, with the lug holes and the dished centre as geometry, stacked flat and strapped. **Two variants:** a stack of 4 and a stack of 8 (two stacks of 4 side by side). They share one rim mesh (owner, 2026-10-06: car rims, 4 or 8).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted; rim paint a recolour hook |
| Real size | ~0.4 m diameter rims (15–16 in), ~0.18 m wide; a stack of 4 is ~0.75 m tall; the 8-stack footprint is ~0.85 × 0.45 m |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull or box · `mass_kg: 4-stack 40–50, 8-stack 80–100` |

## Acceptance

- `assets/models/steel-wheels.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
