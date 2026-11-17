---
id: FEAT-244
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "In the repair menu we do a good job of marking the category with damaged parts by color. Red indicates where a flat tire is. However, when you go into the list, the front left corner and the tire itself are not marked with red. I think every menu should be colored by the worst condition component that is within it at all levels."
relates: FEAT-216
---
lane: unplaced

# FEAT-244: Every repair menu level is coloured by its worst component

## Next steps
Spare lane builds it.

## Summary
The repair menu marks a category red when it holds a flat tire, but inside the list the corner and the tire are not marked. Every menu level takes the colour of the worst-condition component inside it.

## Description
Applies at all levels: category, group (e.g. front left corner), and the part row itself. Use the existing condition colours (UI-STYLE tokens).

## Tracker
- [ ] Category, group and part rows all show the worst condition beneath them
- [ ] A flat tire is red at every level down to the tire
- [ ] Gate or smoke check
