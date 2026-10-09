---
id: ASSET-74
type: asset
status: completed
severity: minor
opened: 2026-10-08
closed: 2026-10-08
relates: src/poi.js `generalStore` roster slot · FEAT-105 (the farm pad it shares) · FEAT-104 (the
  shop browse will read the same park box) · pois.md ("Bits & Bobs General Store": class names without a person)
---

# ASSET-74: General store

**POI model.** It anchors the `generalStore` slot.

## Request (owner, 2026-10-08)

Rural, peaked roof, an ice machine outside, and a handwritten-style sign above the door reading
"Country Store". The sign is **generic on purpose, so any named store fits**. Reference: the owner's
photo of the Red Lick Country Store. Rulings: a **painted board, not a cloth banner**, and **no soda
machine**.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1500** |
| Materials | ~6, flat colour + ONE atlas for the lettering (ART-STYLE rule 1 lettering exception) |
| Real size | 7.0 m along the road × 5.5 m deep walls, ridge 5.0 m; must fit the 14 × 8 m pad with its apron |
| Origin | base-seated, centred on the wall footprint |
| Forward | −Z (the gable with the door faces the road); length along the road, so no yawOffset |
| Collision | one box for the body (the ice chest is a candidate second box) |

## Acceptance

- `general-store.glb` exported clean, with sources (`.py` + `.blend`) alongside.
- Tri count within budget, material names stable, lettering not mirrored (proved numerically).

## Resolution (2026-10-08) — SHIPPED, and wired into the roster

`assets/models/general-store.glb`, **1130 tris** (budget 1500), 7 materials, one 512×512 atlas, 129 kB.
Sources: `assets/models/src/general-store.py` + `.blend`. A re-export is byte-identical: the bake turns
off Blender's render-stamp metadata, which otherwise writes the date into the PNG.

**Materials:**

- `StoreWall`, `StoreRed`, `StoreRoof`, `StoreConcrete`, `StoreCurb`, `StoreAsphalt` are flat colours.
- `StoreSign` is the atlas. It carries the sign board, the ICE placard and the ice chest's two flat
  colours, so the chest needs no material of its own.
- `StoreRed` is the palette candidate: siding and frames recolour together. The red "Store" lettering
  is baked, so it stays red.

**The lot (owner, 2026-10-08).** The store moved onto FEAT-105's farm pad (22 × 11.2 m) to get
parking out front:

- Five nose-in stalls, 2.7 m wide, 5.0 m from the curb to the pad's road edge. You pull straight off
  the road into a stall and reverse back out onto it, so the road is the drive aisle.
- The apron's 0.15 m curb is the wheel stop. A pickup's nose overhangs it by about 0.5 m.
- Yellow stall lines are polygons cut into the asphalt top, not decals laid over it, so nothing can
  z-fight.
- The lot is visual only. It stands 3 cm proud of the physics pad, so tyres sink 3 cm into it.
  Thinner would z-fight the terrain at the fog limit.

**Wiring (one commit with the model):**

- `src/poi.js`: big pad kinds are now NAMED (`PAD_KINDS.farm`), so the barn and the store share one
  pool of farm pads. Renaming the kind from `barn` to `farm` reshuffles farm pads once on every seed.
- `src/poi.js`: the `generalStore` slot names the model, with `fallbackModel: null`. With no farm pad
  free it takes a lay-by and shows the placeholder cube (owner ruling).
- **The park box.** The registry's `park` rectangle replaces the 10 m orange ring. You park with the
  truck inside it (0.3 m slack) to be offered work, and it is drawn as an orange box curtain round
  the five stalls. The green 25 m start threshold stays a circle (owner ruling).
- `dropZoneWorld` and `overDropZone` take the box as an optional argument, so the drop zone and the
  park box share one implementation.
- Registry `generalStore`: `seat: 3.85` puts the lot's front on the pad's road edge. The back wall
  stands 1.0 m past the pad's far edge, inside the carve's 1.6 m flat rim band (the barn's
  precedent). There are two collision boxes, the walls and the ice chest.
- `test/poi-yard.mjs` gains five checks:
  - The store takes a farm pad.
  - With no farm pad it falls back to the cube.
  - The box lies wholly on the pad.
  - The box's road edge is the pad's road edge.
  - The trigger is in at the box centre and out 1 m past the stalls.

**Audit:**

- No z-fighting.
- 0 of 3146 rays hit an inverted face.
- 0 of 2 lettered faces are mirrored.
- 746 non-manifold edges, by design: single-sheet walls, trim with no backs, no floor (the barn's
  convention).

**Deliberate choices:**

- **Side windows.** Each side wall carries one window, built proud of a sealed wall (the RV's trick).
  The photo has none, but a blank 5.5 m stucco flank read as a garage.
- **Lettering font.** It uses Bradley Hand Bold with no faux-bold offset. Any offset makes that font's
  strokes self-intersect into spikes.
- **Sign size.** The board is 2.8 × 1.4 m, bigger than the photo's, so it reads at 20 m.
