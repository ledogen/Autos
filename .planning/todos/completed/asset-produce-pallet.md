---
id: ASSET-56
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh), ASSET-15 (produce stall — same produce palette), cargo.md (master cargo list)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-56: Pallet of produce — tomatoes / squash / peppers

## Resolution (2026-10-10) — shipped

All three: `produce-pallet-tomatoes.glb` **2880** tris, `produce-pallet-squash.glb` **2916**, `produce-pallet-peppers.glb` **2954**; 1.0 × 0.72–0.79 × 1.2 m. Eight slatted crate shells in two courses over ONE solid fill block in the fruit's shadow colour; the top is 52 whole tomatoes/peppers (13 cm) or 32 butternuts (12 × 20 cm) at uniformly random orientations and heights, each clipped to what shows above the fill (the owner's method, 2026-10-10: build whole, delete the buried faces). Materials Produce (recolour hook; per-piece tints via COLOR_0), ProduceStem, CrateWood, PalletWood, Strap. Source `src/freight-3.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


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
