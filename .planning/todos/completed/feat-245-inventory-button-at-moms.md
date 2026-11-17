---
id: FEAT-245
type: feature
status: closed
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "At mom's house add an inventory button so that you can eat And use items right from there"
relates: FEAT-229
---
lane: unplaced

# FEAT-245: An inventory button at mom's house

## Next steps
Closed.

## Summary
At mom's house the player cannot eat or use items without leaving the menu. Add an inventory button there.

## Description
Follow how other place menus open the inventory, and the pad's button budget (fewest buttons).

## Tracker
- [x] Mom's house menu has an inventory button, keyboard and pad
- [x] Eating and using items works from there and returns to her menu

## Resolution
`#cp-item` (the camp's inventory button) now shows on every home face (camp, truck, mom's), so keyboard Tab/click and pad focus both reach it, with no new pad binding; closing the inventory leaves her menu up. The button exists only when her menu does, so the DEC-308 gate covers the tutorial. Smoke `camp` step asserts button, open, close-returns. Screenshot wip/small-1117/moms-menu.png.
