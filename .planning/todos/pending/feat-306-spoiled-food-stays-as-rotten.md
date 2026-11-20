---
id: FEAT-306
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 — "When food expires we shouldn't delete it from the player's inventory. We should just change the name to say "rotten packed lunch." That way the player is reminded that they waited too long and the food went bad"
relates: FEAT-230, FEAT-310, DEC-338, DEC-379, DEC-448, src/inventory.js, data/items.js
---
lane: unplaced

# FEAT-306: Spoiled food stays in the inventory as "Rotten <name>"

## Next steps
Owner: look at the card notes-1119b-look. Built on branch land/notes-1119b, not landed.

## Summary
At its fresh time a food unit used to vanish. Now that unit becomes a "Rotten packed lunch" (any food, same thumbnail, mass and stack), one unit at a time, so one old unit never spoils the stack.

## Description
`data/items.js` mints a `rotten<Id>` twin for every food with a `freshH` (kind 'consumable', no `use`, no `freshH`). `InventorySystem.tick` swaps a spoiled unit for it. Its description "It sat too long." is a [DEFAULT]. The unit already held a slot, so the swap is never refused for room: a split stack can sit one slot over until something is dropped. Ice still melts away (not food).

## Tracker
- [x] A spoiled unit becomes "Rotten <name>", not deleted
- [x] Gate assertion (test/inventory.mjs)
- [ ] Owner look

## Decisions
- 2026-11-19, owner: see DEC-448.

## Open questions
- Built as the least surprising thing, owner's call: a rotten item CANNOT be eaten, CAN be dropped like any item, and is not sold anywhere. Should eating it ever be allowed (food poisoning), or should it be sellable or useful (bait, fertiliser)?
- Do rotten items keep their thumbnail? Built so, no art change.

## Files
`data/items.js` · `src/inventory.js` · `test/inventory.mjs`

## Log
- 2026-11-19: built on land/notes-1119b (not landed).
