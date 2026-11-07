---
id: FEAT-178
type: feature
status: closed
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: ASSET-82 (Lane C's service station, feature/content .planning/todos/pending/asset-82-service-station.md), the service center POI (src/poi.js), src/service.js, the chase camera
blocked-by: ASSET-82 (Lane C)
---
lane: B (the code) · Lane C (the model)

# FEAT-178: The service center is a two-car bay; you park on the lift and the camera snaps inside

> for the service station asset it should be a big 2 car service bay with a scissor style lift on the ground. We
> don't have to make the lift actually move, but the shop/service location will be on top of the lift, so the player
> drives on top of the lift, parks, then the camera snaps to an inside corner of the service bay looking at the car.

Lane B's part is the code, after the model ships: the service spot sits on the lift (the lift's deck is a collider the
truck drives up onto, MESH == PHYSICS), and parking there snaps the camera to an inside corner of the bay looking at
the truck while the service screen is open (back to the chase camera when it closes).

## Acceptance
- [ ] The service screen opens when parked on the lift, and only there.
- [ ] The lift deck is drivable (ramps or flush), its collider matches the mesh.
- [ ] Parked on the lift with the service screen open, the camera holds an inside corner of the bay framed on the truck; it returns on close.

## Contract agreed with Lane C (2026-11-06)

Model frame (three.js: +X along the road, −Z toward the road, y up, base-seated at y 0, origin at the centre of the walls'
footprint); the generator prints the final numbers into the `data/prop-models.js` entry.
- **Pad:** the ordinary 14 × 8 m lay-by (coverage-sited, two per region). Footprint x −6.3..6.3, z −4.0..4.0 (bay block
  x −6.3..2.7, office x 2.7..6.3); seat ≈ 1.3.
- **Lift:** bay A (x −6.1..−1.8) has a FLUSH scissor lift, lowered: the runway plates are ≤ 5 mm above y 0 (the carved pad
  the wheels already ride: no ramps, no collider, MESH == PHYSICS). Bay B has the same lift raised ~1.2 m, a plain
  collision box. Registry field `lift: { x: -3.95, z: 0.2, halfX: 1.05, halfZ: 2.3 }`: the service spot is "parked with
  the truck's centre inside it" (no heading).
- **Camera:** `camera: { eye: [-5.9, 2.8, 3.6], look: [-3.95, 0.9, 0.0] }` — the inside back corner of bay A on the end-wall
  side, framing the truck's front three-quarter with the open door behind. Snapped while parked on the lift with the
  service screen open; the chase camera returns on close.
- **Colliders:** back wall, both end walls, the pier between the doors, the office block, bay B's raised lift. Door headers
  from 3.3 m, soft.
- **Roster wiring is Lane B's:** autoShop `model: null` → 'serviceStation', towSeat (BUG-114 / test/tow-seat.mjs hold the
  auto shop keyless today), the service trigger.

## Work log

**2026-11-07, Lane B — built on feature/machine, not landed.** ASSET-82 landed on main 85f3c8f7 with the final
registry (Lane C): `park: { x: -3.95, z: -0.2, halfX: 1.045, halfZ: 2.3 }` — bay A's lift deck; the `lift` field was
dropped in favour of it — and `camera: { eye: [-5.9, 2.8, 3.6], look: [-3.95, 0.9, -0.499], fov: 55 }`, seat 1.4.

- **Roster** (src/poi.js): the auto shop is `model: 'serviceStation'`. Its park box gets the orange box curtain like
  the general store's lot (main.js, no new code). `q.camera` comes off the model like `q.park`.
- **The service trigger** (`_serviceInReach`): the brake opens the service screen only parked in the park box — on the
  lift — through the same `_inPoiSpot` test the givers use. Before, anywhere within 10 m of the shop did.
- **The camera snap** (the service screen's `onView`): the model's eye and look go to world (the model frame, seat
  and yaw, `baseY` for height) and become the existing focus orbit's bearing, pitch and radius about the look point.
  `snapCamera()` makes it a snap, not a glide through the bay's wall. A drag still orbits from there; closing hands
  back to the chase cam, as before. camera.js `setCameraFocus` takes a `phi` (the pitch) for it. The model's `fov`
  (55°) is NOT applied: the game keeps its own field of view (Lane C: "ignore it if you use the game's own fov").
  A shop without a `camera` keeps the old front three-quarter orbit.
- **The tow** (`towSeat`): a POI with a park box seats in it — its centre, nose along the box's long side (into the
  bay, model +Z, for the lift). So a tow to the shop lands on the lift, and the service screen opens there.
- **Gates:** test/tow-seat.mjs now holds the shop to a park box (not keyless): the seat is in reach and in the box,
  the corners on the pad, and real physics with the station's 14 colliders at four road headings — no spin, upright,
  at rest, at bare-ground height, not shoved. A keyless pad's strip is still checked. Green.
- **Smoke:** `PAD_SEAT` seats a park-box POI where a tow would (dev handle `window.__towSeat`), heading included. The
  service step checks the view lands within 0.3 m of the bay's camera eye. boot,story,tires,service,offer,pad PASS.
- Owed: the owner's look in game (the framing; the fov question); a screenshot probe is at wip/feat-178/shot.mjs.

## Resolution

**Closed on evidence (Lane B, 2026-11-07).** Landed e3feee76 with ASSET-82's seat fix. The brake opens the
service screen only parked on bay A's lift (the park box, _inPoiSpot); the lift is flush (5 mm plates, no collider);
the view snaps to the model's camera corner and returns on close. Pinned: test/tow-seat.mjs (the tow seats on the
lift, 14 colliders, four headings) and cdp-smoke's service step (camera within 0.3 m of the eye; truck upright).
The lift screenshot also caught a shared seat bug, fixed in the same landing (main.js _groundSampleY takes the road
top only on the road's footprint). Left for the owner, not blocking: a look at the framing in game, and whether to
use the model's 55° fov (not applied — the game keeps its own).
