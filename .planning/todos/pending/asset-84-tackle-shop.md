---
id: ASSET-84
type: asset
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 (tackle-slot on the tracker page, relayed by the orchestrator) — "1 — model it". Burn-down goal (2026-11-06): "the goal should be no orange cubes in game."
relates: src/poi.js tackleShop slot (model: null today = the last orange cube, one per region), data/offers.js (the tackle shop's deliveries + fetches), ASSET-80/82/83 (the lay-by POI precedents)
---
lane: C

# ASSET-84: The tackle shop — a bait-and-tackle shack on a lay-by

**POI model** — the `tackleShop` class (`src/poi.js`: `model: null`, so one orange cube per region, the
last one in the game once ASSET-82/83 are wired).

A small board-and-batten shack with a galvanised gable roof whose front slope runs on, flatter, over a
plank porch. A lettered board on the porch roof says BAIT & TACKLE (generic: the shop's name rolls per
seed from data/offer-names.js). A big fish, a leaping bass built as geometry, stands on the ridge so
the place reads as fishing from down the road, like the burger joint's burger. On the porch: a white
LIVE BAIT fridge and a bench. A red canoe lies upside down on two sawhorses at one end, and a
fish-cleaning table stands at the other.

## Spec

| Field | Value |
|---|---|
| Tri budget | **~1600**: a POI building (1200–4000), one per region, seen mostly from the road |
| Materials | flat colours per ART-STYLE.md, 8 (burger joint precedent); one small baked atlas for the two lettered faces (the board and the fridge label) |
| Real size | shack 6.0 m along the road × 3.6 m deep, plus a 1.4 m porch; the canoe and the table stand beside it |
| Origin | base-seated, centred on the shack's wall footprint |
| Forward | −Z (the porch faces the road) |
| Collision | per part: the shack, the porch (deck to roof, so it is not driven under), the canoe on its sawhorses, the cleaning table. The fish, the board and the porch step are not colliders. |

### On a 14 × 8 lay-by, not the farm pad
The tackle shop is sited `any`, one per region. A farm-pad model falls back to the cube wherever no farm
pad is free. That is the case the burn-down is removing, so the shop fits the standard lay-by.
- The back wall stands about 1.3 m past the pad's far edge. That is inside poi-yard's collider-corner rule:
  every box corner within PAD_RIM_HOLD − 0.25 = 1.35 m of the pad's rounded outline.
- Nothing touching the ground is nearer the road than pad z −2.6, where the lay-by turns flat.
- No `park` box. The shop is an ordinary giver, so the ring at the pad centre works, and the porch step
  ends near it (the burger joint's awning covers its centre the same way).

## Acceptance
- [x] `.glb` at `assets/models/tackle-shop.glb`, flat-shaded, 0 inverted first-hits (ray-cast check: 0 of 6377), 0 mirrored sign UVs (of 2).
- [x] Tri count reported per material and within budget (1627, 2 % over ~1600: see Built); 8 materials justified.
- [x] Fits the 14 × 8 lay-by: the generator applies poi-yard's collider-corner rule (1.30 m, limit 1.35) and the flat line.
- [x] Headless generator in its own checkout (`assets/models/src/tackle-shop.py`, paths from `__file__`),
      re-export byte-identical (sha1 e1e36189…).
- [x] Review renders: from the road, a three-quarter view, the rear, the porch close up, the canoe end, and from 30 m
      down the road (`wip/tackle-shop/out/sheet.png`).
- [x] `data/prop-models.js` entry `tackleShop` with `collision.boxes` and `seat`; the roster's `tackleShop`
      slot gets `model: 'tackleShop'`; poi-yard and the POI gates stay green.
- [ ] The owner's look (on the tracker page).

## Built (2026-11-07, feature/content)

`assets/models/src/tackle-shop.py` → `assets/models/tackle-shop.glb` (174 KB, one mesh, one 1024 × 512 PNG) + `.blend`.
Headless: `Blender -b --python-exit-code 1 --python assets/models/src/tackle-shop.py -- export render`;
renders land in `wip/tackle-shop/out/`.

- **1627 tris**: TackleWall 332, TackleTrim 331, TackleRoof 278, TackleWood 222, TackleDark 204, TackleFish 136,
  TackleRed 120, TackleSign 4. The canoe's second pass (a 6-segment section, fine ends: it read as a red plank
  at 4 segments) took it from 1567 to 1627.
- **8 materials**, one per role: teal wall, cream trim, galvanised roof, wood, dark, the fish's olive, the canoe's
  red, the atlas. Teal because the other POIs are red, cream, yellow or blue; the galvanised roof is lighter than
  every other POI roof, so the silhouette is its own from the road.
- **The atlas**: the board (top half, 1024 × 256: BAIT & TACKLE / LIVE BAIT · RODS · REELS) and the fridge label
  (448 × 224: LIVE / BAIT), laid out in atlas pixels. Dither and render stamps off.
- **Pad**: seat 3.5. The back wall stands 1.30 m past the pad's far edge (poi-yard allows 1.35). The porch step's
  nose is the nearest ground contact to the road, at the pad centre; the lay-by is flat from pad z −2.6.
- **Colliders** (4): the shack to the ridge, the porch from the deck to its roof, the canoe on its sawhorses, the
  cleaning table with the buckets. The fish, the board, the porch step and the stovepipe are soft.
- The fish: a largemouth bass, head to +X, tilted 14° up, 2.7 m long, on two posts from the ridge cap. Belly,
  lateral stripe, gill and eye are reliefs 1.5–4 cm proud of the body, so nothing z-fights.
