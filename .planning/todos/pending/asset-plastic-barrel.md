---
id: ASSET-29
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-15
blocked-by: FEAT-59
relates: FEAT-46, FEAT-36, ASSET-30
---

# ASSET-29: Blue 55-gallon plastic barrel

**Cargo** — visible load, not scenery. It rides in the bed as **real mass that shifts CoG and
handling** (`items.md` rule 2: *a load, never a stat*), and doubles as set dressing around working
POIs. Per `items.md` §4, cargo is *"mostly a mass value and a fragility flag"* — adding one is a
content act, not a design act.

## Request

The ubiquitous blue HDPE drum — closed head, two bungs, moulded rolling hoops, sun-faded on one side.
Water, feed, fuel, or nothing at all: it is the single most recognisable "rural working property"
object there is, and it costs almost nothing. Sits by a cabin, a stall, a sawmill, or rolls loose in
a truck bed.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤350** — built at **348** |
| Texture | **none** — flat colours per ART-STYLE (supersedes the 512² spec, same ruling as ASSET-23/09); seams/hoops are geometry, fade and algae dropped |
| Real size | 0.58 m diameter × 0.89 m tall (a real 208 L drum) |
| Origin | base-seated: base at y=0, centred |
| Forward | −Z (bungs face −Z) |
| Collision | `{ shape: 'cylinder', radius: 0.29, height: 0.89, mass_kg: 9 }` — **empty** |

Rolling hoops are geometry — they are the silhouette. Do not smooth the barrel into a plain cylinder.

## Acceptance

- [x] `assets/models/barrel-plastic.glb` exists, export-clean (348 tris, 2 materials —
  `BarrelBlue` recolour hook + `BarrelBung` — 0 images, base z=0, 0.585×0.892 m, 2026-08-15).
- [x] Sources committed: `assets/models/src/barrel-plastic.blend` + `barrel-plastic.py`.
- Reads correctly **upright and on its side** — it will be placed both ways, and a barrel on its side
  is the cheapest bit of disorder in the class.
- Tri count within budget; material names stable and distinctive (the blue is the identity; keep it
  addressable in case a second colour is ever wanted **as a material tint, not a second model**).
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- `mass_kg: 9` is the **empty** drum and is **inert today** (FEAT-36 / FEAT-48), same rule as
  ASSET-03. A full one is ~210 kg — that difference is enormous and belongs to whatever fills it,
  not to this asset.
- **Deliberately a separate model from ASSET-30 (steel drum), not a variant of it.** Plastic and
  steel differ in profile, hoop shape, chime, and how they age — a shared mesh would look like a
  recolour of the wrong object. They are siblings, not variants.
- Its best trick is being **wrong-side-up, dented, or half-buried**; the placement layer gets that for
  free from a symmetric, yaw-randomisable model. Do not bake a single "correct" presentation into it.
