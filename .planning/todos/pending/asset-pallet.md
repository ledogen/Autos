---
id: ASSET-27
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-36, ASSET-12
---

# ASSET-27: Pallet

**Cargo** — visible load, not scenery. It rides in the bed as **real mass that shifts CoG and
handling** (`items.md` rule 2: *a load, never a stat*), and doubles as set dressing around working
POIs. Per `items.md` §4, cargo is *"mostly a mass value and a fragility flag"* — adding one is a
content act, not a design act, so this ticket adds no scoring axis and no mission type.

## Request

A standard timber stringer pallet — four-way entry, split deck board, nail heads and forklift scars.
The freight primitive: stacked at a lumber yard, strapped in a truck bed, leaning against a shed
wall. `items.md` §4 lists **pallets/freight** as the *"mass does the work"* cargo type, whose fear is
*the truck itself* — sustained load on a long grade against marginal early cooling.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** — empty pallet only |
| Texture | one albedo, **512×512** — sawn pine, grey weathering, nail heads, a stencilled mark |
| Real size | 1.20 m × 0.80 m × 0.145 m (a real stringer pallet; keep it) |
| Origin | base-seated and centred: bottom deck at y=0 |
| Forward | −Z (stringers run along Z, fork entry across X) |
| Collision | `{ shape: 'box', dims: [0.80, 0.145, 1.20], mass_kg: 25 }` |

**Empty, and one piece.** A loaded pallet is a pallet plus ASSET-28 crates plus a strap — composed at
placement, not modelled as a second asset.

## Acceptance

- `assets/models/pallet.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/pallet.blend` + `pallet.py`.
- **Stacks cleanly on itself** — place two and the upper sits flush on the lower with no gap and no
  intersection. This is the acceptance criterion that matters; a pallet that cannot stack is useless.
- Fits a Ranger bed (~1.5 m between arches) in at least one orientation.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- `mass_kg: 25` is the empty pallet and is **inert today**, same rule as ASSET-03 — dynamic props are
  FEAT-36, itself blocked on the FEAT-48 physics-adapter seam. Freight mass that actually shifts CoG
  is an item-system question (`items.md` gap #3: consumables-as-real-mass *"is stated but never
  quantified"*).
- Deck-gap silhouette is the whole read; do not close the deck to save tris.
- Pairs with ASSET-12 (lumber yard) and ASSET-28 (crate).
