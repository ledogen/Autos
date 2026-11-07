---
id: ASSET-82
type: asset
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 (relayed verbatim by the orchestrator) — "for the service station asset it should be a big 2 car service bay with a scissor style lift on the ground. We don't have to make the lift actually move, but the shop/service location will be on top of the lift, so the player drives on top of the lift, parks, then the camera snaps to an inside corner of the service bay looking at the car. For the asset we can do a small office attached on the side so it's a big two car service bay with a small office on the side." Burn-down goal, same day: "the goal should be no orange cubes in game."
relates: FEAT-178 (Lane B — the service spot on the lift + the camera snap), src/poi.js autoShop slot (model: null today = the orange cube, two per region), src/service-screen.js
---
lane: C (the model) · B (FEAT-178, the code that consumes the anchors below)

# ASSET-82: The service station — a two-car service bay with a small office

**POI model** — the `autoShop` class, the service center (`src/poi.js`: `model: null`, so two orange cubes
per region today, the most-seen cube in the game). (The orchestrator first named this ASSET-80; that number
is the burger joint, so it is ASSET-82.)

A painted-block garage with two open roll-up doors to the road, a scissor lift in each bay, and a small
office with a lower roof on one end. The player drives into bay A onto its lift and parks. FEAT-178 then
snaps the camera to the inside back corner of the bay, looking at the truck.

## Spec

| Field | Value |
|---|---|
| Tri budget | **~2500** — a POI building (1200–4000), and the player looks at its interior every service visit |
| Materials | flat colours per ART-STYLE.md; one small baked sign atlas (the words AUTO SERVICE: generic, because the shop's name rolls per seed) |
| Real size | about 12.6 m along the road × 8.0 m deep. It fits the **14 × 8 m lay-by** with its back wall in the 1.6 m graded band behind the pad, the barn's precedent. A farm pad is not needed. |
| Origin | base-seated, centred on the wall footprint |
| Forward | −Z (the doors face the road) |
| Collision | per part, so the bays are drivable: back wall, end walls, the pier between the doors, the office, bay B's raised lift. Door headers (3.3 m up) and the slab are not colliders. |

### Why the lay-by, not the farm pad
The auto shop is sited by **coverage** ("never too far from a station"), two per region. A model that needs
the 22 × 11.2 m farm pad would only be placed where a farm pad exists. Everywhere else it would fall back to
the cube on a lay-by, as the gas station and general store do now, and that defeats the burn-down goal.

### The lift (owner: "we don't have to make the lift actually move")
- **Bay A, the player's: a FLUSH-MOUNT scissor lift, lowered.** The runway plates are flush with the slab, a
  couple of cm above the pad. The wheels' ground is the analytic pad surface (physics.js's ground query, not
  engine colliders), so a flush deck needs **no physics work at all**. A raised deck with ramps would need the
  ground query to know about it.
- **Bay B: the same lift, RAISED** to chest height, empty, with the scissor arms showing. It is what sells
  "scissor lift" when yours is down. It is a solid box.

### Anchors for FEAT-178 (registry fields, printed by the generator)
- `lift`: the bay-A deck centre (x, z) in the model frame, its half extents and the truck's parked heading
  (nose away from the road).
- `camera`: the inside back corner of bay A, as an eye point plus a look-at point (the parked truck's centre).

## Acceptance
- [x] `.glb` at `assets/models/service-station.glb`, flat-shaded, 0 inverted first-hits (ray-cast check: 0 of 8453).
- [x] Tri count reported per material and within budget (1558); materials justified if more than 6 (9: see Built).
- [x] Fits the 14 × 8 lay-by (the generator asserts it) and leaves an apron to turn in from the road.
- [x] A Ranger parked on bay A's lift clears both walls, the bench and the door with margin.
- [x] Review renders: from the road, a three-quarter view, and the FEAT-178 camera corner with the truck parked.
- [x] `data/prop-models.js` entry with `collision.boxes`, `seat`, `park` (= the lift deck; `lift` dropped 2026-11-07, Lane B: FEAT-178 triggers on `park`), `camera`. Roster wiring (`autoShop`
      `model: 'serviceStation'`) is FEAT-178's, because `towSeat` and the keyless-marker gate change with it.

## Built (2026-11-07, feature/content 85abff04)

`assets/models/src/service-station.py` (straight into src/, not wip/: wip/ is git-invisible and a lane commits
WIP at every step) → `assets/models/service-station.glb` (150 KB, one mesh, one 1024 × 256 PNG) + `.blend`.
Headless: `Blender -b --python-exit-code 1 --python assets/models/src/service-station.py -- export render`;
renders land in `wip/service-station/out/` (sheet.png: road, three-quarter, rear, the FEAT-178 camera, inside bay B).

- **1558 tris**: ShopSteel 532, ShopDark 528, ShopYellow 176, ShopWall 120, ShopRed 106, ShopBlue 70, ShopConcrete 14,
  ShopLight 8, ShopSign 2. Under the ~2500 budget. The interior carries the detail: the camera looks at it every visit.
- **9 materials**, because each one is a role: wall, brand blue, dark, steel, slab, lift yellow, tool red, the
  emissive strips, the sign atlas.
- Pad check: nothing within 0.35 m of the ground is nearer the road than pad z −2.60. The worst point is 1.51 m past
  the pad's rounded edge (the rim band is 1.6 m).
- Ranger on lift A, CG on the lift centre, nose to +Z:
  - 1.35 m from its nose to the bench, 0.95 m from its tail to the door line;
  - 0.70 m to the tyre rack, 0.87 m to the console, 0.54 m to each jamb guard;
  - 0.65 m of runway ahead of the front tyre and 0.36 m behind the rear tyre.
- **Changes from the plan:**
  - Track 1.43, wheelbase 2.85 and the CG from data/ranger.js and vehicle-models.js. So the camera's look point is
    the truck's bbox centre, z −0.499, not −0.37.
  - `camera.fov` 55 added.
  - The office stack of tyres is a collider.
  - No downspouts.
- Lane B has the printed numbers, with the sign correction (2026-11-07).

## Build plan (agreed with Lane B 2026-11-06, FEAT-178 on feature/machine 78d7f315)

Generator goes in `wip/service-station/service-station.py`, cloned from `assets/models/src/burger-joint.py`
(Part/face/solid/box/tile/relief; ray-cast facing check; headless `-b` export + render). The sign is a
SEPARATE object with UVs and one 1024 x 256 atlas (general-store.py `bake_atlas`, dither 0, stamps off).

Blender frame below (x along the road, +y = toward the road, z up). Three.js model frame = (x, z, -y).
- Bay block x -6.3..2.7, office x 2.7..6.3 (y -1.0..4.0, parapet 3.4), bay block y -4.0..4.0, walls 0.20,
  parapet 4.6, ceiling 4.0, roof deck 4.35. Bays A x -6.1..-1.8 (centre -3.95), B -1.8..2.5 (centre 0.35).
  Doors 3.2 wide x 3.3 tall: A x -5.55..-2.35, B x -1.25..1.95; rolled up (coil + tracks inside).
- **seat 1.4**: the front wall lands on pad z -2.6, where the lay-by turns flat (the 1.4 m road-side
  feather, gas-station.py's SLAB note); the back wall lands 1.4 m past the far edge, in the 1.6 m rim band.
  NO slab outside the walls (the feather strip is not flat). Slab top 0.005 inside the bays only.
- **Lift A (flush, lowered)**: runway plates TILED into the slab plane at y 0.005 (Lane B: <= 5 mm, the
  tire must not draw sunk). Runways centred x -3.95 +- 0.715 (Ranger track 1.43), 0.66 wide, 4.6 long,
  centred y 0.2 (the parked Ranger's wheelbase midpoint; truck bbox centre y 0.367). Yellow, dark 3 cm pit gap.
- **Lift B (raised 1.15 m, empty)**: same runways at x 0.35, scissor X arms visible, end chocks flipped
  up; one collision box.
- **Registry (three.js frame)**: `lift: { x: -3.95, z: -0.2, halfX: 1.05, halfZ: 2.3 }`,
  `camera: { eye: [-5.9, 2.8, 3.6], look: [-3.95, 0.9, -0.37] }`. NB: the first message to Lane B said
  lift z +0.2 and look z 0.0. The sign was wrong (Blender +y toward the road becomes three.js -z). Send them
  the printed values.
- Colliders: back wall, -X end wall, partition, the three piers (full height; header soft), office,
  lift B, bench, tool chest, compressor, tire rack, lift console.
- Dressing: bay A back wall bench + pegboard with tool reliefs; -X end wall tire rack (3 + 3 tires,
  x -6.1..-5.65, y -0.6..1.2, clear of the camera sightline); lift console (yellow post, front corner);
  4 ceiling fluorescent strips (emissive); extinguisher on the centre pier; bay B red tool chest, upright
  compressor, yellow oil-drain caddy; rooftop unit; 3-tire stack beside the office's +X wall (never in front:
  that strip is not flat).
- Office: window with closed pleated blinds (no glass), blue door with a dark pane.
- Materials (9): ShopWall, ShopBlue (brand), ShopDark, ShopSteel, ShopConcrete, ShopYellow, ShopRed,
  ShopLight (emissive), ShopSign (atlas: AUTO SERVICE / TIRES . BRAKES . OIL; the name rolls per seed).
- Renders: from the road, a three-quarter view, the rear, and the FEAT-178 camera (vertical fov 55) with
  the Ranger on lift A (180 deg yaw: nose to -y).
