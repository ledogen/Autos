---
id: ASSET-56
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh), ASSET-15 (produce stall — same produce palette), cargo.md (master cargo list)
---

# ASSET-56: Pallet of produce — tomatoes / squash / peppers

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Open slatted produce crates stacked on the ASSET-27 pallet, the top course showing its contents. **Three variants**: tomatoes (red), squash (yellow / orange, larger lumps), peppers (green and red). The crates are one mesh; only the produce lumps change.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted; produce colour a recolour hook |
| Real size | 1.2 × 1.0 m pallet footprint, ~0.9 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 200–350` |

## Acceptance

- `assets/models/produce-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
