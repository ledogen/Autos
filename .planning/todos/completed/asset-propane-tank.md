---
id: ASSET-05
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-10-07
relates: FEAT-06, FEAT-46, ASSET-04, ASSET-72 (freight 4-pack that reuses this mesh)
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
- **Also cargo** (owner 2026-10-07): ASSET-72 reuses this mesh for the freight 4-pack on a pallet,
  so keep the mesh and material names stable. The single cylinder is also a courier thing in the
  cab, which is text only (cargo.md).
- Do **not** build hazard/explosion behaviour into this ticket. If the tank ever becomes a hazard
  that is a gameplay ticket citing this asset, not an asset change.

## Closed — 2026-10-07

Shipped `assets/models/propane-tank.glb` (330 tris / 350, 3 materials, 0 images), sources
`assets/models/src/propane-tank.{py,blend}`, registry key `propaneTank` (tag `lawnFurniture`).

Deviations from the spec, both owner rulings 2026-10-07:

- **0.46 m is OVERALL, collar included** — a real 20 lb cylinder. "Excl. collar" would have stood
  it 0.56 m tall, 1.8x its diameter, which stops reading squat. The collision cylinder now covers
  the whole tank; the registry records it as its bounding box `[0.31, 0.46, 0.31]` (box/capsule
  convention).
- **White only, no palette.** `TankPaint` is fixed off-white.

Build notes: the collar is the ticket's 3 arcs plus a short rim bridge over each gap, so the gaps
read as hand-hole windows in one ring (full-height gaps read as a crown); one window is centred on
the outlet. The bridges were paid for by not emitting faces buried in the dome or the brass, so
the mesh has 60 deliberate open edges, all hidden. `TankDark` (foot ring + handwheel) is the third
material — the dark base that sits it down. Facing proven by ray cast and by the exported
accessor bounds (brass reaches z −0.068).

Placement is FEAT-71 (POI-satellite scatter), per the 2026-08-24 posture: an asset ticket closes
when the `.glb` ships.
