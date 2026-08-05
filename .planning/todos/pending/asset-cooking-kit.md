---
id: ASSET-25
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-45, SM-1, ASSET-24
---

# ASSET-25: Cooking kit — A-frame + Dutch oven

**Camp gear** — the player's own kit, rendered at their campsite. `items.md`'s **visible-kit rule**:
what you carry is what renders, so *the campsite is the inventory screen*. Shares the camp anchor
convention (ASSET-23), and must fit the **6 m camp pad** (`campPadHalfM 3`, `src/camp.js`).

## Request

An iron A-frame straddling the campfire with a Dutch oven hanging from the crossbar on an S-hook,
soot-blackened. `items.md` specifies this shape exactly — *"renders as an A-frame over the campfire
with a Dutch oven hanging from it"* — and is equally specific that there is **no cooking system**: no
recipes, no ingredients, no minigame. The kit is a visible possession, not a mechanic.

## Spec

| Field | Value |
|---|---|
| Slot | `over-fire` |
| Tri budget | **≤400** |
| Texture | one albedo, **512×512** — soot, heat scale, cast-iron pitting, worn chain links |
| Real size | 1.0 m × 0.8 m footprint × 1.0 m to the crossbar |
| Origin | base-seated and centred: leg feet at y=0, **centred on the same point as ASSET-24** |
| Forward | −Z (A-frame legs span X, so the frame reads open from −Z) |
| Collision | **none** — same reasoning as ASSET-24 |

The pot hangs at ~0.45 m, well clear of the fire geometry. Chain as a 4–6 link stub, not a modelled
chain.

## Acceptance

- `assets/models/cooking-kit.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/cooking-kit.blend` + `cooking-kit.py`.
- **Placed at the `over-fire` slot it straddles ASSET-24's campfire with no intersection** — the two
  are co-centred by convention, so verify them together, not apart.
- Reads correctly *without* the campfire under it too (the kit is carried whether or not a fire is
  laid).
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The most conceptually loaded ~23 kg in the catalog.** `items.md` flags the cooking kit as the
  **first real test case** for whether stowed mass is legible at all: 23 kg on a 1360 kg truck is
  ~1.7% and will almost certainly not be felt, and if its cost is invisible it is a free upgrade
  rather than a decision. That is a *mechanics* question for the item system — recorded here so
  whoever builds the kit's effect finds it, not so this ticket answers it.
- It also depends on **food items, which do not exist** (fish is PROPOSED and sits upstream of a
  fishing minigame nobody has framed — `items.md` gap #1). The asset is buildable today regardless;
  its effect is not.
- Ships cold. Steam, embers, or a simmering pot are VFX.
