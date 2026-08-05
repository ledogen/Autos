---
id: ASSET-05
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46, ASSET-04
---

# ASSET-05: Propane tank

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A standard ~20 lb exchange propane cylinder — squat steel body, collar handle, valve. Camp dressing
that pairs with the barbecue grill (ASSET-04) and the awning (ASSET-06); also the most plausible
piece of *cargo* in this set, so it should survive being placed in a truck bed as well as on ground.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤350** |
| Texture | none preferred — off-white/grey steel body + brass valve as material slots |
| Real size | 0.31 m diameter × 0.46 m tall (excl. collar) |
| Origin | base-seated: foot ring at y=0 |
| Forward | −Z (valve outlet faces −Z) |
| Collision | `{ shape: 'cylinder', radius: 0.16, height: 0.46, mass_kg: 17 }` |

The collar is 3 arcs, not a swept ring — it is the tri sink otherwise. No gauge, no hose.

## Acceptance

- `assets/models/propane-tank.glb` exists, export-clean under ASSETS.md settings.
- Sources committed: `assets/models/src/propane-tank.blend` + `propane-tank.py`.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- `mass_kg: 17` (full cylinder) is carried for future physics/cargo and is **inert today**, same rule
  as ASSET-03.
- Do **not** build hazard/explosion behaviour into this ticket. If the tank ever becomes a hazard
  that is a gameplay ticket citing this asset, not an asset change.
