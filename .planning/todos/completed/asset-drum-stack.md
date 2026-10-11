---
id: ASSET-48
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-30 (55-gal drums — reuse drum-closed),
  ASSET-27 (pallet)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-48: Stack of 55-gallon drums

## Resolution (2026-10-10) — shipped

`drum-stack.glb`, **1444** tris, 1.2 × 0.99 × 1.2 m: ASSET-30's closed drum × 4, 2 × 2 on a pallet, banded with a double-sided ribbon around the drums' convex hull. Materials DrumPaint (recolour hook), DrumSteel, PalletWood, Strap. Source `src/drum-stack.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Four closed 55-gallon drums standing 2 × 2 on the ASSET-27 pallet, strapped together as a block.
**Reuse ASSET-30's `drum-closed` mesh and its `DrumPaint` recolour hook.** Don't remodel the
drum. This ticket is the arrangement and the band strap. A full drum of oil is about 190 kg, so the
mass range assumes partly filled or light contents to stay inside the payload.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1500** (4 × drum-closed at 328, plus the pallet and the strap) |
| Materials | the shared `DrumPaint` / `DrumSteel`; pallet wood; strap flat colour |
| Real size | 1.2 × 1.2 m footprint (drums ~0.58 m diameter, 0.88 m tall), ~1.0 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 120–450` — **as built 804 (four full drums, no pallet — an overload) kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/drum-stack.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable; drum geometry identical to ASSET-30's.
- Reads as what it is from the chase camera with the truck moving.
