---
id: FEAT-273
type: feature
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for,…"
relates: FEAT-271, FEAT-272, FEAT-274, FEAT-210, DEC-131, data/map-icons.js
---
lane: Places and Missions

# FEAT-273: Larry yellow and firewood vendor purple, with their letters on the diamonds

## Next steps
Closed 2026-11-20. Owner looked and said good.

## Summary
Give Larry and the firewood vendor their own diamond background colours, yellow and purple. Put Larry's P on his diamond up top on the mission card, and the firewood one keeps saying haul, so the style is consistent across the map.

## Description
Owner's words, verbatim (inbox 20261118010708-kmdu):

> We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for, I think it should say new stock in. Since Firewood is always available, even after that timer expires. I also think we should change Larry and the firewood vendor to yellow/purple Backgrounds so they each get their own color. Then put the P in Larry's diamond up top on the mission card and the firewood one can still say haul so we have a consistent style across the map.

Part of one owner message (inbox 20261118010708-kmdu) split into three asks: FEAT-271, FEAT-272, FEAT-273.

## Tracker
- [x] Larry's diamond background is yellow and the firewood vendor's purple (which is which: see Open questions)
- [x] The P (paper) is on Larry's diamond up top on the mission card
- [x] The firewood diamond reads haul
- [x] Map, card and list share the one style

## Decisions

## Open questions
- The owner wrote "yellow/purple ... so they each get their own color": Larry yellow and firewood purple in that order? Not stated outright.
- Do the chosen colours collide with existing mission-type colours (DEC-131)?

## Links
FEAT-271, FEAT-272, FEAT-274, FEAT-210, DEC-131, data/map-icons.js

## Files
data/map-icons.js · the mission card · src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118010708-kmdu).
- 2026-11-17 ui-1117b: STOPPED. Yellow is free (--key / --camp) but the palette has no purple (only the proposed epic #9b5fd1 and the camp-vibe view purple #b98ae0). Choice on the owed card.
- 2026-11-18 ui-1117b: owner ruled (DEC-421): Larry yellow (--key #ffcf3c), haul purple (new --haul #9b5fd1; was white, as was papers); P in Larry's diamond (jobBadge). Map, legend, list rows, hover card and offer panel read FAMILY_COLOR. Look pending.
- 2026-11-20: owner, card ui-1117b-look: "Good: close them". Closed. On main (aa0009cc).

