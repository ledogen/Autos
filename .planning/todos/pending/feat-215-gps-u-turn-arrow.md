---
id: FEAT-215
type: feature
status: open — built and on main (abf84352); owner looked 2026-11-14 and asked for a redesign (inbox 2e5a)
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 — "gps u turn arrow: same style as the turn indicator arrows but pointing you to turn around. a 3d ribbon arrow making a 180 would be a nice way to draw this i think."
relates: FEAT-211
---
lane: Spare

# FEAT-215: GPS U-turn arrow

## Next steps
Owner looked (inbox 2e5a, 2026-11-14): the flat ribbon is unreadable from the chase camera. Spare redraws it as below. Card feat215-look is answered by this note.

## Summary
When the route is behind the truck, the GPS shows an arrow telling the player to turn around. Same style as
the turn indicator arrows; the owner suggests a 3D ribbon arrow that makes a 180.

## Tracker
- [x] A U-turn arrow in the turn arrows' style shows when the guide wants the truck turned around
- [x] It clears once the truck faces the route
- [ ] Owner's look
- [x] Redesign: a 3D ribbon heading away from the player, then turning upward 180 degrees so the arrowhead faces the player
- [x] Placed on the road about 20 m ahead of the player (not floating, not locked to the car), fits within a 5 m cube
- [x] Wrong way: the player is caught between the U-turn arrow on one side and the GPS chevrons on the other; hidden when heading the correct way

## Log
- 2026-11-14 Spare: redesigned (src/gps.js _uturnGeometry/_placeUturn): vertical half-loop ribbon, 4 m tall x 4.4 m long x 3 m wide, standing on the road 20 m up it from the truck (route s-20; truck line when <20 m of route behind), arrowhead back at the player. Shown under the same cos hysteresis. Shots in wip/feat-218/. Owner's look: card feat218-look.
- 2026-11-14 Spare: flat 180° ribbon + head, 7 m ahead of the truck at 2.5 m, bends toward the route's side; on at >120° off the route direction, off inside ~100°. gps-route gate + smoke boot,story green. Not seen in-game; flat (not tilted) so a low chase cam may want a tilt.
- 2026-11-14: scribe recorded the owner's redesign.

## Description
### Owner redesign, 2026-11-14 (inbox 2e5a, verbatim)
> The U-turn GPS arrow Is planer and about camera height so it's virtually impossible to see from third person Could you turn it into a 3D ribbon? i want it headed away from you, then it turns upward 180deg so the arrowhead faces towards you. its a little too close to the car too. put it on the road about 20m ahead of the player instead of floating it locked to the car. When the player is headed the wrong way we want to capture them between a U-turn arrow on one side and the GPS chevrons on the other side. When they're headed the correct way we can hide the U-turn indicator. its too close right now. it should fit within a 5m cube for rough sizing

## Decisions
- 2026-11-14, owner (inbox 2e5a, answering card feat215-look): the flat arrow is "virtually impossible to see from third person"; redesign as above.
