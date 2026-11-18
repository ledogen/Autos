---
id: BUG-209
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Cooking a potato at camp with your inventory full doesn't warn you that your inventory is full, it just passes time without doing anything."
relates: FEAT-230, FEAT-122, FEAT-264
---
lane: bug (alpha by default)

# BUG-209: Cooking with a full inventory passes time and warns nothing

## Next steps
Add the room check before the cook starts (and before time runs).

## Summary
At camp, cooking a potato with a full inventory shows no warning and just passes the time without producing anything.

## Description
Owner's words, verbatim (inbox 20261118061918-0bvh):

> Cooking a potato at camp with your inventory full doesn't warn you that your inventory is full, it just passes time without doing anything.

## Tracker
- [x] Cooking with no room for the result warns that the inventory is full, before any time passes
- [x] No time passes when nothing can be produced

## Decisions

## Open questions
- Should the cooked item drop, or should the cook refuse? He asked only for the warning.

## Links
FEAT-230, FEAT-122, FEAT-264

## Files
src/camp*.js · the cook flow in src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118061918-0bvh).
- 2026-11-17 ui-1117b: InventorySystem.canConvert refuses before the fade; camp card shows "inventory full" (.cp-warn). Gate inventory extended. Look pending.
