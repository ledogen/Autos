---
id: BUG-174
type: bug
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "service station and poi lights should always be on whether or not you're using the poi. i noticed the service station only turns its lights on when i park in there."
---
lane: Spare

# BUG-174: POI and service station lights only come on when you park there

## Next steps
Owner: drive past and into a service station at night and by day (branch `proto/feat-221-exposure`, :3885). Then close.

## Summary
POI lights must be on by the clock, not by the player using the POI. Fix together with BUG-175: lights that are always on never switch on in front of the player.

## Description
The owner's words are in `source`. The POI emissive lamps (FEAT-214, `src/poi-night.js`) already followed the clock only.
The one light gated on use was FEAT-219's bay PointLight, created when the service screen opened and removed on close.

## Tracker
- [x] Built to the owner's words above — the bay light is always in the scene, in the nearest service station's bay
- [ ] Owner has looked / driven it

## Decisions
None governing beyond FEAT-219's. The light is on day and night (the bay is dark by day too, FEAT-219).

## Open questions
- The point light has no shadows, so within its 12 m it also lights the ground just outside the building's walls. Visible at night? (owner's look)

## Links
FEAT-219 (the bay light), FEAT-214 (POI night lamps), BUG-175.

## Files
`src/main.js` (`_bayLight`, `_placeBayLight` on the POI poll)

## Log
- 2026-11-15 (Spare): 403d615d. One light, never added or removed after boot, moved to the station nearest the truck. No gate covers it; needs the owner's look.
