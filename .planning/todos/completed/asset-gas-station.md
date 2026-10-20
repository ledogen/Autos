---
id: ASSET-13
type: asset
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-10-20
closed: 2026-10-20
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

## Resolution (2026-10-20)

Shipped `assets/models/gas-station.glb` with its sources `assets/models/src/gas-station.py` and
`gas-station.blend`. It is in the game as the `gasStation` slot's model (`data/prop-models.js`
`gasStation`, on a farm pad). Owner reviewed it over five rounds on the wip review page.

**The layout changed from the ticket**, on the owner's rulings of 2026-10-19:

- **One island, not two.** The ticket's 18 × 12 m with two islands was "enormous". The single island
  stands right in front of the store's doors, with a lane either side running ALONG the street. You
  drive straight through and back onto the road.
- **Store at the back.** It is 9 × 5 m: FOOD MART box sign, red mansard, white storefront over dark
  glass, a stoop with an ICE chest and a PROPANE exchange cage.
- **Storefront parking beside the store.** Two nose-in bays, 2.55 × 6.0 m each, on its +X end wall.
  They are the registry's `park` box. They sit 2.3 m along the road from both pump zones, so
  parking for the shop never trips the pump.
- **One slab under everything.** A concrete rectangle runs from the store's back wall to **1.4 m
  short of the road edge**. An L-shaped slab with the store hanging off it read as a building half
  off its pad.
- **The front 1.4 m is a dirt apron, by necessity.** It was found in-game (seed 6). A pad is only
  flat from 1.4 m in: its near edge stands `poiPadGap` 0.6 m past the shoulder, and `_poiPadCarve`
  ramps to full authority over `POI_ROAD_FEATHER` 2.0 m. That is ratified: a pad never moves the
  road. Across that strip the ground follows the road's grade, which measured −0.7 to +0.4 m against
  the pad along the slab. A slab out to the edge floated at one end and was buried at the other.

**Numbers.**

- 1482 tris (budget 3500), 7 materials, one 1024 × 512 atlas, `.glb` 167 kB.
- Overall 15.8 × 12.4 × 5.5 m.
- Canopy 8 × 6 m on two posts on the island, soffit 4.6 m. That clears the Ranger (about 1.8 m tall
  on its wheels) by 2.8 m.

**Pad fit.** It cannot fit a 14 × 8 lay-by, so it stands on a FARM pad (22 × 11.2 m).

- `seat 0.6` puts the slab's road edge on the pad's road edge.
- The back wall then stands 1.2 m past the far edge, inside the 1.6 m `PAD_RIM_HOLD` band. That is
  the barn's precedent.
- `seatAlong -2.4` centres the slab, leaving 3.1 m bare at each end.

No new pad kind was needed.

**It stands on the carved ground.** Placing it exposed BUG-91: every POI model floated 15 cm over its
pad. That is fixed on the same branch.

**Collision is per part**, so the forecourt is drivable. There are six boxes: the store, the island
with its pump, two canopy posts, the ice chest and the propane cage.

**Audit.**

- 0 of 10,123 rays hit an inverted face.
- 0 of 8 lettered faces are mirrored.
- No z-fighting, checked both within the mesh and between parts.
- 0 loose verts. The non-manifold edges are by design: single-sheet walls and open-bottom boxes.
- Re-exported from the promoted generator byte-identical (sha256 `fd2001804fb1f360…`).

**Deliberate choices.**

- **Texture.** The ticket asked for 2048 × 1024 covering signage, storefront, fascia and concrete
  staining. The staining and the surface detail are wear (ART-STYLE rule 1), so they were dropped.
  The atlas carries lettering only.
- **Night hooks.** `StationLamp` (six soffit lenses) and `StationSign` (every lettered face) are
  unlit, addressable materials. Lights or emissive get attached at placement; nothing glows in the file.
- **Brand colours.** `StationFascia` / `StationAccent` are recolourable. No palette is declared yet,
  because nothing passes a variant.
- **Pumps.** One simplified pump with a hose and nozzle at each end. Per the ticket, ASSET-14 is not
  reused.
