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
- [ ] `.glb` at `assets/models/service-station.glb`, flat-shaded, 0 inverted first-hits (ray-cast check).
- [ ] Tri count reported per material and within budget; materials justified if more than 6.
- [ ] Fits the 14 × 8 lay-by (the generator asserts it) and leaves an apron to turn in from the road.
- [ ] A Ranger parked on bay A's lift clears both walls, the bench and the door with margin.
- [ ] Review renders: from the road, a three-quarter view, and the FEAT-178 camera corner with the truck parked.
- [ ] `data/prop-models.js` entry with `collision.boxes`, `seat`, `lift`, `camera`. Roster wiring (`autoShop`
      `model: 'serviceStation'`) is FEAT-178's, because `towSeat` and the keyless-marker gate change with it.
