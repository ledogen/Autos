---
id: BUG-114
type: bug
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 (page inbox, playing main) — "first time i tried to use recovery i think the truck was teleported but maybe still upside down or somehow clipping through the ground because it got kinda launched rendering me upside down on the road outside the service center. gotta fix this"
relates: src/recovery.js (the tow / reset placement), FEAT-50 (the tow)
---
lane: B

# BUG-114: a recovery teleport launches the truck and lands it upside down

The first recovery of a run (a tow to a service center, by the description) seated the truck badly. It was
either still upside down or interpenetrating the ground, so the solver threw it, and it landed on its roof on
the road outside the shop.

## Acceptance

- [ ] Reproduce headlessly: tow/reset from a rolled state and from a normal one, to several service centers on random seeds. Report the seat height, orientation and the first-step impulse.
- [ ] Every recovery seats the truck upright (yaw kept, roll and pitch zero), on its wheels at rest height, with zero velocity, clear of POI colliders.
- [ ] A gate pins it.

## Work log

**2026-11-05, Lane B (feature/machine).** Cause found and fixed; the owner's drive is still owed.

**Cause.** The shop tow (`main.js` `_towToShop`) seated the truck at the POI anchor `q.x, q.z`. That is
the pad centre, and an auto shop has no model (`POI_ROSTER` `model: null`), so the pad centre holds
the placeholder marker: a solid 1.6 m cube, in the wheel query AND as a Box3D collider (`PoiPhysics`).
Every shop tow on every seed dropped the truck straddling that cube.

**Repro** (`wip/bug-114/repro.mjs`, flat ground and 2–4 % cross-fall, seven headings; `stepPhysics` +
Box3D + `PoiPhysics`):
- Old pad-centre seat. Seat height 0.90 m, upright. Step 1 already spins it (|ω| 0.10 rad/s). It climbs
  the cube, peaks 1.55 m over ride height and comes to rest perched on its belly 1.18 m over it, wheels
  off the ground. In game, any throttle or slope tips it off a 1.6 m block, which is the owner's roll.
- Seat 2.4–2.7 m toward the road: |ω| 0.00 on step 1, no climb, rest at ride height.
- A rolled truck is not a separate case. `_reseatTruckAtSpawnInner` rewrites the quaternion and both
  velocities, and `stepPhysics` pushes the truck state into the engine body every step (Step 1.5), so
  the seat's pose is upright whatever the truck was doing before the tow.

**Fix.** `poi.js` `towSeat(q)` is the one seat for both tows:
- a pump island: its first pump zone, as before (moved from `main.js`);
- anything else, which today is a keyless auto shop: the pad's road-side strip, centred between the
  cube's face and the pad edge (2.4 m off the centre), heading along the road. That is within the
  10 m interaction radius, so the brake still opens the service screen.

**Gate** `test/tow-seat.mjs` (fast, 5 s), registered:
- the auto shop is still keyless with no yard (the strip assumes the cube is its only solid);
- the shop seat is in reach, and the truck's corners are on the pad (worst 0.75 m inside the edge);
- real physics at every tow destination (a keyless shop at four headings, both pump-zone models at
  two): with the marker's colliders, the truck behaves exactly like bare ground — |ω| 0.003 rad/s,
  up.y 1.0000, at rest, Δy 0.000 m;
- the old seat is printed for contrast.

Not done: a census on real seeds. The seat is a pure function of the pad record, so a seed changes
only its heading and slope, and the gate sweeps heading. Owed: the owner tows to a shop in game.
