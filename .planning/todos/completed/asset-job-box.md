---
id: ASSET-57
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-57: Job box (jobsite tool chest)

## Resolution (2026-10-10) — shipped

`job-box.glb`, **378** tris, 1.30 × 0.66 × 0.69 m. Green chest with a darker lower band, five ribs a side, lid lip and ribs, two hasps with padlocks, end handles, corner bumpers, skids. Materials JobBoxPaint (recolour hook), JobBoxDark, JobBoxSteel. Source `src/freight-2.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A steel jobsite box: a long, low, lockable chest on skids, lid with gas struts, painted a saturated brand-neutral colour. The valuable end of freight.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; paint a recolour hook |
| Real size | ~1.2 × 0.6 m footprint, ~0.7 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 150–250` — **as built 175 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/job-box.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
