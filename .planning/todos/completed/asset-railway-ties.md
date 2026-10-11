---
id: ASSET-52
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-52: Railway ties

## Resolution (2026-10-10) — shipped

`railway-ties.glb`, **72** tris, 0.75 × 0.36 × 2.69 m, five ties 3 + 2, hull straps to the tie-downs. Materials TieWood (recolour hook), TieEnd, Strap. Source `src/freight.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Four or five creosoted railway ties (sleepers) stacked flat, dark brown-black, faceted ends, strapped. Real ties are 2.6 m long.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | 2.6 × 0.9 m footprint (ties 2.6 × 0.23 × 0.18 m), ~0.4 m tall |
| Fits the bed | longer than the 1.8 m bed floor: it rides on the **lowered tailgate**, ≤ 1.4 m wide |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 300–450` |

## Acceptance

- `assets/models/railway-ties.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
