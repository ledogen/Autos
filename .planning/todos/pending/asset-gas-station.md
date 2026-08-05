---
id: ASSET-13
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-50, ASSET-14
---

# ASSET-13: Gas station

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A small rural station — flat canopy on four posts over two pump islands, single-storey store behind
with a lit sign and an ice chest by the door. The most *functional* POI in the set: once the fuel
model (FEAT-50) exists, this is where the player stops, which makes it the one players will approach
closely and repeatedly.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤3500** |
| Texture | one albedo, **2048×1024** — signage, store front, canopy fascia, concrete staining |
| Real size | 18 m × 12 m footprint, 5.5 m canopy height |
| Origin | base-seated: forecourt at y=0, centred on the footprint |
| Forward | −Z (forecourt/approach faces −Z) |
| Collision | store `{ box }` + canopy posts `{ 4× box }` + pump islands `{ 2× box }` — **the forecourt must be drivable**, so no single bounding box |

Pumps here are simplified; ASSET-14 is the detailed standalone pump and should **not** be reused at
full detail under the canopy.

## Acceptance

- `assets/models/gas-station.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/gas-station.blend` + `gas-station.py`.
- The player can drive **onto and under** the canopy — collision is per-part, never one box.
- 5.5 m canopy clears the truck with room to spare; confirm against the Ranger's height.
- Tri count within budget; material names stable and distinctive (the sign and canopy fascia will
  want addressing later).
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The canopy underside is the lighting hook.** At night a lit forecourt is the strongest landmark
  in the game. Ship it unlit with the fascia as a stable, addressable material so lights can be
  attached at placement — same rule as ASSET-08's fire pit. Do not bake glow into the texture.
- Refuelling *gameplay* is FEAT-50, not this ticket. This asset must not assume a pump interaction
  point exists, but should place its pumps somewhere a vehicle can plausibly pull alongside.
- **⚠ It does not fit a lay-by pad.** `src/poi.js` sizes the POI pad at **14 × 8 m**
  (`poiPadHalfLen 7.0` / `poiPadHalfWid 4.0`); an 18 × 12 m forecourt is more than twice its area,
  and a station the player drives *onto* needs its own approach besides. Same blocker as ASSET-11:
  a siting mechanism for large POIs has to exist first. Second-largest footprint in the class.
