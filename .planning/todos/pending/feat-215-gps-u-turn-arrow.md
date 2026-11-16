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
DEC-303 (owner, 2026-11-16) built on land/gps-flat: the start arrow lies flat 0.3 m over the road (grade + bank), painted-arrow style, same place/vanish/tutorial legs. Pictures wip/gps-flat/. Owner's look next.

DEC-297 (owner, 2026-11-15) built on land/gps-1116b: the start board stands 10 m BEHIND the start (a wrong-way player sees it ahead), and every tutorial leg opens with it. Owner's look next; one caveat in the Log (board is edge-on when you face it dead-on).

DEC-287 (owner, 2026-11-15) dropped the 3D U-turn arrow: fixed start board at accept (20 m), "Wrong way. Turn around" in the alerts area, alerts cycle 2 s each. Built on land/gps-1116; owner's look next.

Owner looked (inbox 2e5a, 2026-11-14): the flat ribbon is unreadable from the chase camera. Spare redraws it as below. Card feat215-look is answered by this note.

## Summary
When the route is behind the truck, the GPS shows an arrow telling the player to turn around. Same style as
the turn indicator arrows; the owner suggests a 3D ribbon arrow that makes a 180.

## Tracker
- [x] A U-turn arrow in the turn arrows' style shows when the guide wants the truck turned around
- [x] It clears once the truck faces the route
- [ ] Owner's look
- [x] DEC-303: start arrow laid flat on the road, following grade and bank (built, not yet looked at by the owner)
- [x] Redesign: a 3D ribbon heading away from the player, then turning upward 180 degrees so the arrowhead faces the player
- [x] Placed on the road about 20 m ahead of the player (not floating, not locked to the car), fits within a 5 m cube
- [x] Wrong way: the player is caught between the U-turn arrow on one side and the GPS chevrons on the other; hidden when heading the correct way

## Log
- 2026-11-16 Lane U (land/gps-flat): DEC-303: _startArrow uses a flat copy of the arrow geometry, START_HOVER 0.3 m, pitch = route grade, roll = camber (route.segs/joinIdx added to bakeRoute for the lookup). Shots wip/gps-flat/. Unverified: dim at night/fog beyond ~60 m is the unchanged additive material; no gate covers the posture.
- 2026-11-15 Lane U (land/gps-1116b): DEC-297: GpsSystem._behind(): 10 m back along the first edge's own centreline (clamped; under 1 m of road = straight back on the first tangent). markStart also in _homeGuide (evening + each morning stop). Real mp-accept clicked; shots wip/gps-1116b/. CAVEAT: the board is a vertical plate in the route's plane, so seen dead-on from the wrong way it is a sliver; broadside when the truck is oblique. Owner call: offset it ~4 m to the road side?
- 2026-11-15 Lane U (land/gps-1116): DEC-287 built: ribbon removed; GpsSystem.markStart() (_acceptOffer, Larry's pp-accept; tutorial legs are not accepts, not covered) stands one junction board 10 m up the route, gone at START_GONE_M 20; src/alerts.js AlertCycle (ALERT_CYCLE_S 2) behind #machine-word; wrong-way flag keeps UT_ON/UT_OFF hysteresis. gps-route gate extended.
- 2026-11-15 Spare (land/gps-1115): DEC-275: arrow floats over the road centreline 20 m ahead ALONG the road at 1.5 m, yaw from the road only, no bob; sliders in the GPS folder.
- 2026-11-14 Spare: redesigned (src/gps.js _uturnGeometry/_placeUturn): vertical 215-degree loop ribbon (R 1.7 m), 3.4 m tall, about 4 m long, 1.6 m wide with a 4 m head, standing on the road 20 m up it from the truck (route s-20; truck line when <20 m of route behind), arrowhead back at the player. Shown under the same cos hysteresis. Shots in wip/feat-218/. Owner look: card feat218-look.
- 2026-11-14 Spare: flat 180° ribbon + head, 7 m ahead of the truck at 2.5 m, bends toward the route's side; on at >120° off the route direction, off inside ~100°. gps-route gate + smoke boot,story green. Not seen in-game; flat (not tilted) so a low chase cam may want a tilt.
- 2026-11-14: scribe recorded the owner's redesign.

## Description
### Owner redesign, 2026-11-14 (inbox 2e5a, verbatim)
> The U-turn GPS arrow Is planer and about camera height so it's virtually impossible to see from third person Could you turn it into a 3D ribbon? i want it headed away from you, then it turns upward 180deg so the arrowhead faces towards you. its a little too close to the car too. put it on the road about 20m ahead of the player instead of floating it locked to the car. When the player is headed the wrong way we want to capture them between a U-turn arrow on one side and the GPS chevrons on the other side. When they're headed the correct way we can hide the U-turn indicator. its too close right now. it should fit within a 5m cube for rough sizing

## Decisions
- 2026-11-16, owner (card feat215-start-arrow-2): "lay it flat over the road, like a painted arrow (recommended)". DEC-303.
- 2026-11-14, owner (inbox 2e5a, answering card feat215-look): the flat arrow is "virtually impossible to see from third person"; redesign as above.
