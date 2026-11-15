---
id: FEAT-215
type: feature
status: open — built and on main (abf84352); waiting on the owner's look (owed card feat215-look)
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 — "gps u turn arrow: same style as the turn indicator arrows but pointing you to turn around. a 3d ribbon arrow making a 180 would be a nice way to draw this i think."
relates: FEAT-211
---
lane: Spare

# FEAT-215: GPS U-turn arrow

## Next steps
Built on feature/spare (src/gps.js `_placeUturn`); waits on the owner's look and a landing.

## Summary
When the route is behind the truck, the GPS shows an arrow telling the player to turn around. Same style as
the turn indicator arrows; the owner suggests a 3D ribbon arrow that makes a 180.

## Tracker
- [x] A U-turn arrow in the turn arrows' style shows when the guide wants the truck turned around
- [x] It clears once the truck faces the route
- [ ] Owner's look

## Log
- 2026-11-14 Spare: flat 180° ribbon + head, 7 m ahead of the truck at 2.5 m, bends toward the route's side; on at >120° off the route direction, off inside ~100°. gps-route gate + smoke boot,story green. Not seen in-game; flat (not tilted) so a low chase cam may want a tilt.
