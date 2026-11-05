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
