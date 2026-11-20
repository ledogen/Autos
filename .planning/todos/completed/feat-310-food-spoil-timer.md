---
id: FEAT-310
type: feature
status: closed
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 — "Food spoiling should have a timer so you know how long you can sleep and not lose it."
relates: FEAT-230, FEAT-306, DEC-338, DEC-449, src/inventory.js, src/main.js
---
lane: unplaced

# FEAT-310: Food shows a time-to-spoil

## Next steps
Owner: look at the card notes-1119b-look. Built on branch land/notes-1119b, not landed.

## Summary
The inventory line of a fresh-clock food reads "spoils in 5h 00m" (the next unit to go; a cooler's slower rate is counted). The sleep card adds "the packed lunch spoils in 5h 00m" for each food the chosen sleep would outlast.

## Description
`InventorySystem.spoilH(entry)` is read from the same chill assignment `tick` uses (`_chill()`), so the timer and the rule cannot disagree. It reads null while the clock is held (the tutorial). Both strings are [DEFAULT] wording.

## Tracker
- [x] Inventory row shows time-to-spoil
- [x] Sleep card lists food the sleep outlasts
- [x] Gate assertion (test/inventory.mjs)
- [ ] Owner look

## Decisions
- 2026-11-19, owner: see DEC-449.

## Open questions
- The sleep card lists the food only when the sleep outlasts it. Always show the soonest instead?
- Wording of both lines is a [DEFAULT].

## Files
`src/inventory.js` · `src/inventory-screen.js` · `src/main.js` (_syncSleepRow) · `test/inventory.mjs`

## Log
- 2026-11-19: built on land/notes-1119b (not landed).
