---
id: FEAT-297
type: feature
status: closed
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "For wherever relevant, we should turn the arrow that points from the center of the road out to a POI into one that points down and hovers on top of the POI. Like classic video game floating spinning arrow. It should point straight down and rotate on the y-axis. Turn the arrow that points from the center of the road out to a POI into one that points down from above. Make it rotate on the y-axis and bob slightly up and down. When you're really close to a POI, it's kind of hard to see very high above the building, so make sure the arrow is visible, not Up super high."
relates: DEC-434, FEAT-218, DEC-275, DEC-287, DEC-303, src/gps.js, src/main.js
---
lane: unplaced (scribe: free lane; Sonnet is enough: one mesh in gps.js)

# FEAT-297: The POI arrow floats above the POI: points down, spins on y, bobs

## Next steps
A lane replaces the off-road "turn arrow" at the route end with a hovering arrow, per the owner's three rules. Then the owner looks (owed card, a screenshot close to a POI and from the road).

## Summary
The arrow that goes from the middle of the road out to an off-road objective (a POI, a paper stop, a demolition target) becomes a classic video-game marker: it hovers above the objective, points straight down, spins around the vertical axis and bobs a little up and down. It must stay visible up close: not up high.

Owner's words (two passes in one note):
> For wherever relevant, we should turn the arrow that points from the center of the road out to a POI into one that points down and hovers on top of the POI. Like classic video game floating spinning arrow. It should point straight down and rotate on the y-axis.
> Turn the arrow that points from the center of the road out to a POI into one that points down from above. Make it rotate on the y-axis and bob slightly up and down. When you're really close to a POI, it's kind of hard to see very high above the building, so make sure the arrow is visible, not Up super high.

### What the code has today
FEAT-218 in `src/gps.js` (about line 675, "The route's end"): an objective further than `OFFROAD_M` (3 m) from the route's last road point gets a "turn arrow" at that road point, aimed along the leg to the objective; an objective on the road gets the ring instead. That turn arrow is the thing the owner means. DEC-303's flat start arrow and DEC-275/287 (the U-turn arrow, dropped) are different arrows and stay as they are.

"Wherever relevant": the scribe reads that as every place the turn arrow is used today: POI missions, paper stops, demolition targets.

## Description
(See Summary.)

## Tracker
- [x] The off-road end of the route shows a downward arrow hovering over the objective, not the turn arrow on the road
- [x] It rotates on the y axis and bobs slightly
- [x] Hover height: low enough to see from a few metres away (suggest 2 to 4 m above the roof line; the builder measures from the player's camera at 5, 10, 30 m)
- [x] Visible far away too (fades in like the old arrow: ARROW_IN / ARROW_FULL)
- [ ] Owner has looked

## Decisions
- 2026-11-20, owner: "3 - it shouldnt draw through walls and props." (DEC-462).

## Open questions
- Which arrows count as "wherever relevant"? The scribe reads it as the FEAT-218 off-road turn arrow only; the on-road junction arrow and the start arrow stay. Confirm.
- No conflict with a standing record found: DEC-275 and DEC-287 dropped the U-turn arrow, DEC-303 laid the START arrow flat; neither rules the off-road end arrow.

## Links
DEC-434.

## Files
`src/gps.js` (the route-end arrow, FEAT-218) · `src/main.js` (objective placement) · `test/gps-route.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-19: land/small-1119. gps.js `_placeRing`: two crossed vanes (3 m tall, x1..x3 with distance / 50 m), tip 0.8 m over the roof (poi.js `poiTopY`, the collision boxes; 3 m over the road for a non-POI objective), spin 2 rad/s, bob 0.25 m at 2.4 rad/s. Within 15 m of the objective the tip comes down to 3.5 m over the road (blend out to 45 m) and the material ignores depth, because from the chase camera the roof is out of frame when parked. Start arrow untouched. Sheet: wip/small-1119/arrow.jpg (office, farm; day, night; 60 m, 20 m, parked). Live missions end at 28 m (ARRIVE_RADIUS), so the 20 m / parked frames had distanceToGo stubbed. Owner look open.
- 2026-11-20: owner, card small-1119-look: "(no choice)". Note: "3 - it shouldnt draw through walls and props." DEC-462: the arrow stops drawing through walls and props. The fix is being built by another agent. Other items on the card (BUG-242, FEAT-301) drew no comment.

