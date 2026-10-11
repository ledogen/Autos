---
id: ASSET-45
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-45: Security x-ray machine

## Resolution (2026-10-10) — shipped

`xray-machine.glb`, **440** tris, 0.89 × 1.74 × 2.36 m incl. conveyor stubs and console, rides lengthwise. Materials ScanBeige (recolour hook), ScanDark, LeadCurtain, Screen, Strap. Source `src/household-3.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

An airport-style baggage x-ray scanner: boxy beige-grey housing, lead-curtained tunnel, short conveyor stubs, a console. Heavy and delicate.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤500** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | ~1.6 × 0.8 m footprint, ~1.3 m tall, conveyor stub at each end |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 300–400` — **as built 450 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/xray-machine.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
