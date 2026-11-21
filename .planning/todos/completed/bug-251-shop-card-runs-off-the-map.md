---
id: BUG-251
type: bug
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "not sure when this happened, but the auto shop card is too big on the map. you cant read all the stock it runs off the page."
relates: FEAT-137, FEAT-165, FEAT-168, FEAT-211, DEC-408, DEC-455, src/map2d.js
---
lane: unplaced

# BUG-251: The auto shop's map card runs off the bottom of the map

## Next steps
None: closed on land/wave2-1120; lands with it.

## Summary
The map's hover card for an auto shop carries the shelf form under the card body. The card's size bound
counted only the body, so a shop's card (10 shelf rows today) ran off the bottom of the sheet.

## Description
### When it regressed
- FEAT-137 (b597df55) drew the shelf under the card: 4 slots.
- FEAT-165 (cf385fba) added the ALWAYS rows after the slots; FEAT-168 (0f94f69f, 2026-11-05) took the slots 4 → 6.
  Today: 6 slots + 4 always rows = 10 rows, a shelf form of 28 + 16 + 10 x 17 = 214 base units.
- The scale `k` (FEAT-211) was bounded by `0.62 x sheet height / (body + bonus)`: the shelf never entered it.
  Measured at a 1280 x 720 window: the sheet is 790 x 560 px (UI size small) and 619 x 531 px (big, 1.4x). A shop card
  with one plain offer is 312 base units, 500 px at k = 1.6: it just fits. With a bonus item, two trait lines, a load
  verdict, a deed and the clocks it is 470 base units, 752 px at k = 1.6: 190 px off the bottom.
### Fix
`_drawOfferCard` bounds k also by `sheet height / (every row of the card, bonus and shelf included + 24)`, so the whole
card fits the sheet with its 12-unit margins, shrinking below k = 1 only when it must. The 470-unit card now draws at
k = 1.13 (small) and 1.07 (big). No words changed.
Pad players read every item as its own D-pad row in the Shopping list (unchanged, FEAT-211); the card is read-only.

## Tracker
- [x] Find the regression (FEAT-165 + FEAT-168 shelf growth vs the FEAT-211 bound)
- [x] The card's scale counts the shelf and every row
- [x] Shots at 1280 x 720, UI size small and big: the whole card on the sheet (wip/feat-318/after-518337-card-*.png)

## Files
`src/map2d.js`

## Log
- 2026-11-20: c2, land/wave2-1120, 4c4c01db. Shots at 1280 x 720 small and big: the card ends inside the sheet. Gates and smoke: see FEAT-318's log.
