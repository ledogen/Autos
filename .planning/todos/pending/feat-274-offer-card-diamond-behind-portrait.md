---
id: FEAT-274
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Can I get the colored diamond with letters in it associated with the mission type to show on the POI's offer in person? Tuck it behind the profile pic…"
relates: FEAT-273, FEAT-210, DEC-131, data/map-icons.js
---
lane: Places and Missions

# FEAT-274: The mission-type diamond with its letter shows on the in-person offer, behind the portrait

## Next steps
A lane reuses the map's diamond on the offer card.

## Summary
The map shows each giver's portrait over a coloured diamond with the mission type's letter. Show the same diamond on the offer card when talking to the POI in person, tucked behind the profile picture.

## Description
Owner's words, verbatim (inbox 20261118011206-xuk1):

> Can I get the colored diamond with letters in it associated with the mission type to show on the POI's offer in person? Tuck it behind the profile picture like you do in the map view.

## Tracker
- [x] The in-person offer shows the mission type's coloured diamond with its letter
- [x] It sits behind the profile picture, as on the map
- [x] Same colours and letters as the map (data/map-icons.js)

## Decisions

## Open questions

## Links
FEAT-273, FEAT-210, DEC-131, data/map-icons.js

## Files
the offer card (src/main.js, index.html) · data/map-icons.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118011206-xuk1).
- 2026-11-17 ui-1117b: the offer panel head carries the family diamond (FAMILY_COLOR) with its letter behind the portrait; Larry gets a plain white diamond until FEAT-273 gives papers a letter. Look pending.
