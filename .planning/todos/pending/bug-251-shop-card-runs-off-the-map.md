---
id: BUG-251
type: bug
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "not sure when this happened, but the auto shop card is too big on the map. you cant read all the stock it runs off the page."
relates: FEAT-137, FEAT-165, FEAT-168, FEAT-211, DEC-408, DEC-455, src/map2d.js
---
lane: unplaced

# BUG-251: The auto shop's map card runs off the bottom of the map

## Next steps
Lane c2: prove at 1280 x 720, UI size small and big, then close on land/wave2-1120.

## Summary
The map's hover card for an auto shop carries the shelf form under the card body. The card's size bound
counted only the body, so a shop's card (10 shelf rows today) ran off the bottom of the sheet.

## Description
### When it regressed
- FEAT-137 (b597df55) drew the shelf under the card: 4 slots.
- FEAT-165 (cf385fba) added the ALWAYS rows after the slots; FEAT-168 (0f94f69f, 2026-11-05) took the slots 4 → 6.
  Today: 6 slots + 4 always rows = 10 rows, a shelf form of 28 + 16 + 10 x 17 = 214 base units.
- The scale `k` (FEAT-211) was bounded by `0.62 x sheet height / (body + bonus)`: the shelf never entered it.
  At k = 1.6 the card body (129 + 17 base) plus the shelf is 360 base = 576 px, on a sheet ~514 px tall at a 720 px window.
### Fix
`_drawOfferCard` bounds k also by `sheet height / (every row of the card, bonus and shelf included + 24)`, so the whole
card fits the sheet with its 12-unit margins, shrinking below k = 1 only when it must. No words changed.
Pad players read every item as its own D-pad row in the Shopping list (unchanged, FEAT-211); the card is read-only.

## Tracker
- [x] Find the regression (FEAT-165 + FEAT-168 shelf growth vs the FEAT-211 bound)
- [x] The card's scale counts the shelf and every row
- [ ] Shots at 1280 x 720, UI size small and big: the whole card on the sheet

## Files
`src/map2d.js`

## Log
- 2026-11-20: c2, land/wave2-1120.
