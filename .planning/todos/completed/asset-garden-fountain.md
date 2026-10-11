---
id: ASSET-62
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), cargo.md (master cargo list)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-62: Garden fountain

## Resolution (2026-10-10) — shipped

`garden-fountain.glb`, **570** tris, 1.04 × 0.89 × 1.04 m, fluted column with finial standing in a nested basin and bowl, two straps over the finial following the rims. Materials CastStone (recolour hook), Strap. Source `src/household-2.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A tiered cast-stone garden fountain, two or three bowls on a pedestal, disassembled into its tiers and strapped. Heavy, and stone chips.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | basin ~1.0 m diameter, tiers stacked ~1.0 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull or box · `mass_kg: 150–300` — **as built 200 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/garden-fountain.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
