---
id: FEAT-178
type: feature
status: blocked
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
