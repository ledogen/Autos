---
id: ASSET-83
type: asset
status: open
severity: major
opened: 2026-11-07
source: owner burn-down goal, 2026-11-06 — "the goal should be no orange cubes in game." Minted by Lane C on the orchestrator's word (2026-11-07, "no owner call needed").
relates: src/poi.js workSite slot (model: null = an orange cube, one per region), ASSET-71 (was this slot's model until FEAT-103 split the expedition camp off, 2026-10-24), data/offers.js (cinderBlockPallet, concretePallet, jobBox → workSite; reqCrew; the oldSignLine demolition)
---
lane: C

# ASSET-83: The construction site — a block building going up

**POI model** — the `workSite` class, "the {last} job site" (data/offer-names.js). One per region, sited `any`,
on the ordinary 14 × 8 m lay-by. Today it is the orange cube.

A small concrete-block building half built on a fresh slab, the back corner up to full height and the rest racked
down course by course, rebar standing out of the block cells. One bay of tube scaffolding, a mixer, the pallets of
block and bagged concrete the site is waiting on, a lumber stack, a portable toilet, a wheelbarrow. The road half of
the pad is open gravel: that is where you park to drop a load.

**Why block, not a timber frame.** The site's freight is cinder blocks and bagged concrete (data/offers.js: generalStore →
workSite). A block building in progress is built from what you bring it.

## Spec

| Field | Value |
|---|---|
| Tri budget | **~3000** — a POI with a dozen separate pieces of kit |
| Materials | flat colours per ART-STYLE.md, faceted, **0 images** (no lettering: the site's name rolls per seed) |
| Real size | fits the 14 × 8 m lay-by; the slab at the back, its back edge in the 1.6 m graded rim band (the barn's precedent) |
| Origin | base-seated, centred on the slab |
| Forward | −Z (the road side) |
| Collision | per part, so the yard is drivable: walls, scaffold, mixer, pallets, lumber, toilet. The slab edge (0.15 m) and the wheelbarrow are soft. |
| `park` | one truck alongside the road on the gravel, inside the flat part of the pad (from 1.4 m in from the road edge) |

## Acceptance
- [ ] `.glb` at `assets/models/construction-site.glb`, flat-shaded, 0 inverted first-hits (ray-cast check).
- [ ] Tri count reported per material and within budget; materials justified if more than 6.
- [ ] Fits the 14 × 8 lay-by: nothing touching the ground nearer the road than the flat line, nothing past the rim band
      (the generator asserts it, as service-station.py's pad_check does).
- [ ] The park box clears every collider with a Ranger in it.
- [ ] Review renders: from the road, a three-quarter view, the rear, and the truck in the park box.
- [ ] `data/prop-models.js` entry `constructionSite` with `collision.boxes`, `seat`, `park`. Roster wiring (`workSite`
      `model: 'constructionSite'`) is a one-line follow-up in src/poi.js (it also retires the slot's keyless cube).
