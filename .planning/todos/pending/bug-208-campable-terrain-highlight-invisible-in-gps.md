---
id: BUG-208
type: bug
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "You can't really see the campable terrain yellow highlight through the GPS."
relates: FEAT-164, FEAT-210, FEAT-72
---
lane: bug (alpha by default)

# BUG-208: The yellow campable-terrain highlight is not visible through the GPS

## Next steps
Check the highlight's colour and blend against the GPS's road line and background.

## Summary
The yellow highlight that marks campable terrain is hard to see through the GPS (map).

## Description
Owner's words, verbatim (inbox 20261118061907-sgl1):

> You can't really see the campable terrain yellow highlight through the GPS.

## Tracker
- [ ] The campable highlight reads clearly on the GPS and the map, day and night

## Decisions

## Open questions
- Which GPS view: the minimap, the full map, or both?

## Links
FEAT-164, FEAT-210, FEAT-72

## Files
the camp zone highlight (src/camp*.js, src/map*.js)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118061907-sgl1).
- 2026-11-17 ui-1117b: the route halo alpha 0.95 -> 0.5 so the 6 px camp casing shows through the 7 px halo. Only the full map has this line (not the minimap). Not screenshotted. Look pending.
