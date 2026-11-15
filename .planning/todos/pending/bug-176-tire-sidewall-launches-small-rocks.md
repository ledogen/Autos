---
id: BUG-176
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "at low speed, below 5 miles per hour, if I rub the sidewall of the truck's tire up against a box 3D small rock ... it launches the rock off the tire at pretty high speed and in some cases even pops the tire. My best guess is this has to do with the spherical box 3d collision solver we use for modeling tire collisions with rigid bodies. I imagine there are also adverse side effects of this at high speeds."
---
lane: B

# BUG-176: Tire sidewall launches small rocks at low speed, can pop the tire

## Next steps
Lane B (Opus), after PERF-49 lands: reproduce headless (debug projectile rock against the sidewall under 5 mph), log the contact impulse, then fix the tire-vs-body contact model.

## Summary
A slow sidewall rub should push a rock aside with about the truck's speed, not fire it. The owner suspects the sphere contact shape used for tire-vs-rigid-body collisions.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked / driven it
