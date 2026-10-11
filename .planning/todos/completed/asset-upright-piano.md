---
id: ASSET-42
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-42: Upright piano

## Resolution (2026-10-10) — shipped

`upright-piano.glb`, **482** tris, 0.62 × 1.28 × 1.54 m, rides lengthwise with the keyboard to the side, fallboard OPEN (the ticket asks for the keys showing), nameboard between the key cheeks. Materials PianoWood (recolour hook), KeysWhite, KeysBlack, Brass, Strap. Source `src/household.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

An upright piano, lid closed, standing lengthways in the bed with straps over the top. Heavy and fragile at once: the hardest fragile job.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤500** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | ~1.5 × 0.6 m footprint, ~1.25 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 200–270` |

## Acceptance

- `assets/models/upright-piano.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
