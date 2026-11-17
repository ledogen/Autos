---
id: FEAT-244
type: feature
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "In the repair menu we do a good job of marking the category with damaged parts by color. Red indicates where a flat tire is. However, when you go into the list, the front left corner and the tire itself are not marked with red. I think every menu should be colored by the worst condition component that is within it at all levels."
relates: FEAT-216
---
lane: unplaced

# FEAT-244: Every repair menu level is coloured by its worst component

## Next steps
Closed.

## Summary
The repair menu marks a category red when it holds a flat tire, but inside the list the corner and the tire are not marked. Every menu level takes the colour of the worst-condition component inside it.

## Description
Applies at all levels: category, group (e.g. front left corner), and the part row itself. Use the existing condition colours (UI-STYLE tokens).

## Tracker
- [x] Category, group and part rows all show the worst condition beneath them
- [x] A flat tire is red at every level down to the tire
- [x] Gate or smoke check

## Resolution
Root cause: the service screen's `node()` already carried a condition per level, but the label band was skipped for any row with its own bar/info (corner, tire). Now ONE `worstUnder(own, kids)` feeds every level and every label wears its band. Gate: `test/service.mjs` (worstUnder); smoke `service` step asserts a flat RR tire is red at category, group, corner and tire. Screenshot wip/small-1117/repair-flat.png. The V damage screen has no tree (pictogram + worst-parts list), unchanged.
