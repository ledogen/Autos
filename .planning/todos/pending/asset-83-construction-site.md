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
| Collision | per part, so the yard is drivable: walls, mixer, pallets, lumber, toilet. The slab edge (0.15 m), the scaffold (inside the walls) and the wheelbarrow are soft. |
| `park` | one truck alongside the road on the gravel, inside the flat part of the pad (from 1.4 m in from the road edge) |

## Acceptance
- [x] `.glb` at `assets/models/construction-site.glb`, flat-shaded, 0 inverted first-hits (ray-cast check: 0 of 6063).
- [x] Tri count reported per material and within budget (1548); materials justified if more than 6 (9: see Built).
- [x] Fits the 14 × 8 lay-by: nothing touching the ground nearer the road than the flat line, nothing past the rim band
      (the generator asserts it, as service-station.py's pad_check does).
- [x] The park box clears every collider with a Ranger in it (0.90 m, nearest the front wall).
- [x] Review renders: from the road, a three-quarter view, the rear, and the truck in the park box.
- [x] `data/prop-models.js` entry `constructionSite` with `collision.boxes`, `seat`, `park`. Roster wiring (`workSite`
      `model: 'constructionSite'`) is a one-line follow-up in src/poi.js (it also retires the slot's keyless cube).

## Built (2026-11-07, feature/content 0892fa28 + f89b4fb8)

`assets/models/src/construction-site.py` → `assets/models/construction-site.glb` (88 KB, one mesh, no images) + `.blend`.
Headless: `Blender -b --python-exit-code 1 --python assets/models/src/construction-site.py -- export render`.
The renders land in `wip/construction-site/out/` (sheet.png: road, three-quarter, rear, aerial; the truck is in the park box).

- **1548 tris**: SiteBlock 388, SiteSteel 238, SiteConcrete 216, SiteRust 200, SiteYellow 152, SiteWood 132, SiteDark 118,
  SiteRed 93, SiteBlue 16.
- **9 materials**, one per thing that reads as its own stuff: block, concrete/mortar, dark, steel, wood, rebar rust,
  the red mixer, the blue toilet, the yellow bags. **No orange anywhere**, because the placeholder it replaces is an
  orange cube.
- **seat 2.7** (the slab's back edge is 1.2 m into the rim band). Nothing touching the ground is nearer the road than
  pad z −1.64. The worst point is 1.20 m past the pad's rounded edge (the rim band is 1.6 m).
- **park** `{ x: 0, z: -4.6, halfX: 3.2, halfZ: 1.5 }`: one truck alongside the road, pad z −3.4..−0.4. It follows the
  general store's convention: main.js tests the CG inside the box, so the box is drawn round the truck's body.
- **The walls**:
  - 8-inch block on 0.2 m courses, with a mortar bed joint cut into both faces.
  - The back-left corner stands 14 courses (2.95 m with the slab).
  - Racked leads step back half a block per course along the back and −X walls.
  - The front wall is 3 courses with a 0.9 m door gap, too narrow for the truck. The +X wall is 2 courses.
  - Rebar stands every ~0.8 m out of each wall's top course.
- **Colliders**: 18 boxes. The racked leads come out as a few steps, each to the tallest course over it.
- **Not wired**: the roster slot (`workSite` `model: 'constructionSite'` in src/poi.js) is a code change. It also
  retires the slot's keyless orange cube.
