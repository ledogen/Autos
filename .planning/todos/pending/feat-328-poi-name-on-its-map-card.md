---
id: FEAT-328
type: feature
status: open
severity: minor
opened: 2026-11-24
source: owner, 2026-11-24 (inbox) — "we should display the poi name on its map card at the top."
relates: FEAT-327, DEC-492
---
lane: free lane

# FEAT-328: The POI's name at the top of its map card

## Next steps
A routine lane (Sonnet): read .planning/research/UI-STYLE.md first; put the POI's name as the card's title line. Sheet for the owner's look.

## Summary
A POI's card on the map does not show the POI's name. It should, at the top.

## Description
(See Summary and the owner's words in `source:`.)

## Tracker
- [x] Built
- [ ] Owner's look

## Decisions
None yet.

## Open questions
None.

## Links
FEAT-327, DEC-492

## Files
`src/map2d.js` and the map card code

## Log
- 2026-11-24: minted by the orchestrator from the owner's inbox.
- 2026-11-25: built (lane c, land/ui-small-1125). Name = board.name(poiId) (the Missions list's source) as the card's first line: uppercase bold story blue (DEED_INK), ellipsis when long; offer, multi-offer, no-work and shop shelf cards checked at Small and Big. Sheet wip/feat-328/sheet.jpg.
