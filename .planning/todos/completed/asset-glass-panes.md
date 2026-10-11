---
id: ASSET-40
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-40: Panes of glass on an A-frame

## Resolution (2026-10-10) — shipped

`glass-panes.glb`, **284** tris, 1.40 × 1.14 × 1.20 m. Five panes a side leaning against the OUTSIDE of the A-frame legs on felt strips, cross ties, hull straps over the ridge. Materials CrateWood, GlassPane, GlassEdge, Plinth, Strap. Source `src/household-3.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

Several large sheet-glass panes leaning against both sides of a timber A-frame rack, strapped. The glass is one clear material (ART-STYLE rule 7) with pale edges. The most fragile item in the game.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | A-frame ~1.4 × 0.8 m footprint, panes ~1.2 × 1.0 m leaning both sides |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull or box · `mass_kg: 60–120` |

## Acceptance

- `assets/models/glass-panes.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
