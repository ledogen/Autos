---
id: FEAT-323
type: feature
status: closed
severity: minor
opened: 2026-11-21
source: owner, 2026-11-21 — owed card notes-1119b-look (see DEC-478, DEC-479, DEC-480)
relates: FEAT-306, FEAT-307, FEAT-310, DEC-478, DEC-479, DEC-480, src/main.js, src/inventory-screen.js
---
lane: unplaced

# FEAT-323: Spoil time on the thumbnail, no sleep warning, tire-service confirm

## Next steps
Orchestrator: land land/notes-1121 and close this ticket.

## Summary
Three owner rulings on FEAT-306/307/310. Rotten food is droppable only (already built). A food's thumbnail shows the time to its soonest spoil in place of the bar, and the sleep card no longer warns. The tire service call gets the tow's confirm face.

## Tracker
- [x] Rotten food cannot be eaten, can be dropped (verified, test/inventory.mjs)
- [x] Time on the food thumbnail, no bar; sleep-card warning and `spoilingWithin` deleted
- [x] Tire service opens the confirm (same code path as the tow's: `_rcAsk` / `towGo`)
- [ ] Owner look at the [DEFAULT] wording

## Decisions
- 2026-11-21, owner: DEC-478, DEC-479, DEC-480.

## Open questions
- DEC-479 replaces DEC-338's food bar; a cooler's ice bar is kept (not food). Right?
- Wording of the tire-service confirm ("call the tire service — $P", "to come out and fit it") is a [DEFAULT].

## Files
`src/main.js` · `src/inventory-screen.js` · `src/inventory.js` · `test/inventory.mjs` · `test/cdp-smoke.mjs`

- 2026-11-21: landed on main. Gates 24/24, pad test OK, smoke 42 steps on the merged branch.
