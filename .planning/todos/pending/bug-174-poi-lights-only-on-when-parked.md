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
Spare (lighting bundle, queued behind FEAT-221): find what gates the lights on parking and remove it.

## Summary
POI lights must be on by the clock, not by the player using the POI. Fix together with BUG-175: lights that are always on never switch on in front of the player.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked / driven it
