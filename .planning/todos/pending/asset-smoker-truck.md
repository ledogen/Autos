---
id: ASSET-17
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, ASSET-19, ASSET-06
---

# ASSET-17: Truck with smoker trailer

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A work truck hitched to a barrel smoker on a single-axle trailer — offset firebox, stack chimney,
prep shelf, a cooler and a folding table alongside. Roadside barbecue: a POI that is clearly *open
for business* and clearly mobile, which no building in the set can be.

## Spec

**Two `.glb` files**, so the pair can be placed together or the smoker parked alone:

| Piece | Tris | Real size | Forward | Collision |
|---|---|---|---|---|
| `smoker-trailer` | ≤1400 | 3.6 × 1.8 × 2.2 m | −Z (tongue points −Z) | box, full dims |
| truck | — | — | — | **reuse ASSET-19**, do not re-author |

| Field | Value |
|---|---|
| Texture | one albedo, **1024×1024** — soot, heat-blued steel, hand-painted signage on the barrel |
| Origin | base-seated: tyre contact patches and jack wheel at y=0 |

## Acceptance

- `assets/models/smoker-trailer.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/smoker-trailer.blend` + `smoker-trailer.py`.
- The trailer's tongue/hitch geometry lines up with ASSET-19's tow point when the two are placed at
  their documented offset — **record that offset in the registry entry**, since nothing enforces it.
- The smoker reads correctly parked **alone**, without the truck.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Depends on ASSET-19 landing first** for the truck half. If ASSET-19 slips, this ships as a
  standalone smoker trailer and the pairing follows — do not fork a second truck model.
- **The chimney is the particle attach point.** Ships cold and unlit; a smoke plume is a VFX ticket
  citing this asset, same rule as ASSET-08's fire pit and ASSET-13's canopy.
- Pairs naturally with ASSET-06 (awning) as its lawn furniture — a stall that is open has shade.
