---
id: ASSET-38
type: asset
status: done
severity: minor
opened: 2026-09-30
relates: FEAT-91 (the sawmill's haul load), FEAT-88 (haul cargo body), ASSET-11 (sawmill — the rack
  it loads from)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-38: Lumber bundle (cargo)

## Resolution (2026-10-10) — shipped

`lumber-bundle.glb`, **678** tris, 0.56 × 0.38 × 1.85 m, 54 boards under three bands, board tints via COLOR_0 (split per material for the Blender 5.2 exporter). Plus, per the owner 2026-10-09 ("haul cargo is loose single boards"), three loose-board variants `board-2x4.glb` / `board-2x6.glb` / `board-2x8.glb` (12 tris each, 1.80 m, **origin at the bbox centre** for the rigid body). The treated/weathered bundle colourways were scrapped (owner wanted a third board, not a third bundle). Source `src/lumber.py` + `lumber.blend`, shared with ASSET-12. **Fit (owner, 2026-10-10):** the first export measured 1.849 m with its ragged ends against a 1.835 m bed, so the boards were shortened to 1.73 m with the stagger kept — 1.78 m overall, 5.5 cm to spare with the tailgate shut.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). Placement: the bundle is freight (FEAT-96); the boards are haul (FEAT-88).


**Cargo** — visible load, real mass, never a scoring axis. The sawmill's haul (region 2, FEAT-91):
one banded bundle of 6 ft dimensional lumber, carried as a single rigid body.

## Request

A bundle of ~70 boards (2×4 and 2×6 mixed or uniform), banded with two or three steel straps. Board
ends visible and slightly ragged so it reads as individual boards, not a beam. One piece.

**Length: 6 ft boards, tailgate shut (owner, 2026-09-30).** The Ranger bed is 1.835 m inside and a
6 ft board is 1.829 m, so model the bundle at **~1.80 m** — it has to drop in off the rack without
wedging between the front wall and the tailgate.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted — board face, end grain, banding (saturated/metal) |
| Real size | ~0.60 × 0.35 m section × **1.80 m** |
| Origin | bbox centre |
| Forward | −Z along the boards |
| Collision | hull-from-mesh (a box, effectively); `mass_kg: ~250` — **as built 170 kg** (cargo.md, 2026-10-11) |

## Acceptance

- `assets/models/lumber-bundle.glb` exported clean; sources in `assets/models/src/`.
- Drops into the bed with the tailgate shut and lies flat on the floor without wedging.
- Tri count within budget; material names stable.
