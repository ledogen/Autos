---
id: ASSET-46
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-46: Pallet of soft drinks

## Resolution (2026-10-10) — shipped

`soft-drink-pallet.glb`, **1706** tris, 1.0 × 0.65 × 1.2 m load. Kraft trays two wide, four long, three layers, one brand (owner), every perimeter can an octagon, a slip sheet over the top layer. Materials SodaCase (recolour hook), SodaCan, SodaCanTop, PalletWood, Strap — the clear wrap of the spec was dropped (owner: no wrap). Source `src/freight-3.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A pallet of shrink-wrapped soda cases, stacked about waist high. Bright case colours show through the
wrap (saturated man-made, ART-STYLE), and the wrap is one clear material (rule 7). Sits on the
ASSET-27 pallet. A full pallet is about a tonne, which is over the Ranger's payload, so build a
**short stack**.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** (pallet included) |
| Materials | flat colours per ART-STYLE.md, faceted; clear wrap per rule 7; case colours a recolour hook |
| Real size | 1.2 × 1.0 m pallet footprint, ~0.9 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 350–450` — **as built 240 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/soft-drink-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
