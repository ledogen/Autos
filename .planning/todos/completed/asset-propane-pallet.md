---
id: ASSET-72
type: asset
status: done
severity: minor
opened: 2026-10-07
relates: FEAT-96 (freight — the job this rides in), ASSET-05 (20 lb propane cylinder — reuse it),
  ASSET-27 (pallet)
---

# ASSET-72: Propane 4-pack on a pallet

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass. The player sees it in the mirror for the whole job, so the silhouette has to say what it
is from the chase camera.

## Request

Four 20 lb propane cylinders standing 2 × 2 in the middle of the ASSET-27 pallet, held together by
one band strap. **Reuse ASSET-05's `propane-tank` mesh and materials.** Don't remodel the cylinder.
This ticket is the arrangement and the strap. The same model serves both legs of the job: full
cylinders going out, empties coming back to be refilled (cargo.md, owner 2026-10-07). Only the mass
differs, so there is no separate "empty" model.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1800** (4 × propane-tank at ≤350, plus the 268-tri pallet and the strap) |
| Materials | ASSET-05's cylinder slots; `PalletWood`; strap flat colour |
| Real size | pallet 1.20 × 1.00 m; cylinder block ~0.62 × 0.62 m (0.31 m diameter each); ~0.61 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the pallet must sit inside it |
| Origin | base-seated, centred on the pallet |
| Forward | −Z (valve outlets face −Z, as in ASSET-05) |
| Collision | box · `mass_kg: 50` (empties) – `90` (full): 4 × 8 or 4 × 17 kg, plus the ~20 kg pallet |

## Acceptance

- `assets/models/propane-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable; cylinder geometry identical to ASSET-05's.
- Reads as propane from the chase camera with the truck moving.

## Notes

- The cab version (one cylinder, courier) is text on the card only and needs no model.
- Own work → no `CREDITS.md` entry needed.

## Closed — 2026-10-07

Shipped `assets/models/propane-pallet.glb` (1692 tris / 1800, 4 materials, 0 images), sources
`assets/models/src/propane-pallet.{py,blend}`, registry key `propanePallet`.

- **Reuse by construction.** The generator imports `propane-tank.py` and `pallet.py` as modules,
  so the cylinders are ASSET-05's geometry exactly (acceptance) and the pallet keeps its per-board
  tints, which a `.glb` round trip would have dropped. Re-export after changing either source.
- **Small pallet, not the ASSET-27 one** (owner, 2026-10-07: the 4-pack looked lost on the full
  1.20 x 1.00). `pallet.py` became a two-variant kit; `pallet-small.glb` is 0.80 x 0.80 m, shipped
  separately (`palletSmall`) as the base for small freight. `pallet.glb` re-exported byte-identical.
- **Two straps, not one band** (owner, 2026-10-07): one per tank column, over both collars, down
  the tank ends, round the deck's end boards and back under the top deck through the fork tunnels.
  Each loop is the convex hull of the real tank profile + collar rim + deck corners, offset 2 mm,
  so it follows the parts if they change. Measured clearance to tanks and pallet: exactly 2 mm.
  Reuses `TankDark` — no material of its own.
- One mesh: the join gives the tank corners the pallet's `COLOR_0`, set to white so glTF's multiply
  is neutral on them. The exporter's "multiple materials with different Vertex Color" warning is
  this, and expected.
- Bounds 0.80 x 0.81 x 0.61 m — fits the Ranger bed. Placement in the bed is FEAT-96.
