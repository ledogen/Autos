---
id: FEAT-178
type: feature
status: blocked
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: Lane C's service-bay asset (the orchestrator named it ASSET-80, but ASSET-80 on main is the burger joint — number to confirm), the service center POI (src/poi.js), src/service.js, the chase camera
blocked-by: the service-bay model (Lane C)
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
