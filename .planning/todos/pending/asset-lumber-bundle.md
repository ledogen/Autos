---
id: ASSET-38
type: asset
status: open
severity: minor
opened: 2026-09-30
relates: FEAT-91 (the sawmill's haul load), FEAT-88 (haul cargo body), ASSET-11 (sawmill — the rack
  it loads from)
---

# ASSET-38: Lumber bundle (cargo)

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
| Collision | hull-from-mesh (a box, effectively); `mass_kg: ~250` |

## Acceptance

- `assets/models/lumber-bundle.glb` exported clean; sources in `assets/models/src/`.
- Drops into the bed with the tailgate shut and lies flat on the floor without wedging.
- Tri count within budget; material names stable.
