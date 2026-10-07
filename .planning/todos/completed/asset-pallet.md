---
id: ASSET-27
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-10-07
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
| Texture | **none** — one flat material `PalletWood` (owner 2026-10-06, see Notes) |
| Real size | **1.20 m × 1.00 m × 0.145 m** — US GMA 48×40 in stringer pallet, rounded (owner 2026-10-06) |
| Origin | base-seated and centred: bottom deck at y=0 |
| Forward | −Z (stringers run along Z, fork entry across X) |
| Collision | `{ shape: 'box', dims: [1.00, 0.145, 1.20], mass_kg: 25 }` |

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

- **2026-10-06 (owner): footprint 1.20 × 1.00, not 1.20 × 0.80.** 1.20 × 0.80 is the EUR *block*
  pallet; a stringer pallet is the GMA 48×40 in (1.22 × 1.02). Rounded to 1.2 × 1.0 to match the five
  load tickets that reuse this base (ASSET-46/47/48/55/56) and so the ASSET-28 crate's 2 × 2 layout
  fits (0.90 m of crate across the 1.00 side; the 1.20 side is exactly 2 × 0.60 — **zero margin**,
  ASSET-28 must shrink a hair to get its "with margin").
- **2026-10-06 (owner): untextured**, same ruling as ASSET-28 — the texture row predated ART-STYLE.
  Nail heads / weathering are wear; a stencil is unreadable at range. Deck gaps, notched stringers, a
  split top board with a broken end and one forklift-chewed stringer corner carry it as geometry.
- **Built 2026-10-06:** 268 tris, 1 material, 0 images, 20 kB. Per-board colour variation is a
  vertex-colour tint (owner 2026-10-06, the new ART-STYLE rule-1 paragraph), still one draw call. 

- Own work → no `CREDITS.md` entry needed.
- `mass_kg: 25` is the empty pallet and is **inert today**, same rule as ASSET-03 — dynamic props are
  FEAT-36, itself blocked on the FEAT-48 physics-adapter seam. Freight mass that actually shifts CoG
  is an item-system question (`items.md` gap #3: consumables-as-real-mass *"is stated but never
  quantified"*).
- Deck-gap silhouette is the whole read; do not close the deck to save tris.
- Pairs with ASSET-12 (lumber yard) and ASSET-28 (crate).

## Resolution (2026-10-07)

Shipped `assets/models/pallet.glb` (268 / 300 tris, 1 material `PalletWood`, 0 images, 20 kB) with
sources `assets/models/src/pallet.py` + `pallet.blend`, registered as `pallet` in
`data/prop-models.js`. Generator asserts flush stacking (z span exactly [0, 0.145], every bottom
board bears on a top board) and casts 400 rays for winding — both clean. Footprint 1.20 × 1.00 and
the untextured / vertex-colour-tint look are the owner's 2026-10-06 rulings (Notes). Placing it in
the world is FEAT-96 (freight) / FEAT-71, not this ticket.

