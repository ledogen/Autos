---
id: ASSET-60
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), ASSET-59 (dining chairs — same set), cargo.md (master cargo list)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-60: Dining table

## Resolution (2026-10-10) — shipped

`dining-table.glb`, **534** tris, 0.90 × 0.75 × 1.60 m, top down, legs up, its 1.6 m length DOWN the bed (owner, 2026-10-10 — it is wider than the 1.4 m bed the other way), two straps crossing the bed over the slab and long aprons between the legs, out to the bed-wall tie-downs. Materials FurnWood (recolour hook), Strap. Source `src/household.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A nice wooden dining table, upside down with its legs up as movers carry one, strapped. Turned legs as faceted geometry.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; wood colour a recolour hook |
| Real size | top ~1.6 × 0.9 m, ~0.75 m tall (inverted) |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 40–70` — **as built 45 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/dining-table.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
