---
id: FEAT-263
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "There should be a way to access the vehicle diagnostic screen while in the maintenance menu."
relates: FEAT-212, src/service-screen.js
---
lane: unplaced

# FEAT-263: Open the vehicle diagnostics from the maintenance menu

## Next steps
Owner looks (owed card ui-1117-look); close on "Good".

## Summary
FEAT-212 already put a "Vehicle Diagnostics" row at the top of Maintenance; it opened the damage screen over the shop. It read as a heading, so the row now carries the same arrow as its sibling rows, and the smoke step proves open and return.

## Description
Reached by pad with the D-pad like any row (no new button, no chord, no double-press). Esc or B closes the diagnostics and the shop is still there.

## Tracker
- [x] The row is reachable and opens the screen (already built, FEAT-212)
- [x] Closing returns to Maintenance (smoke step `uiscale`)
- [ ] Owner has looked (was the row simply not seen?)

## Decisions
- 2026-11-17, owner: "There should be a way to access the vehicle diagnostic screen while in the maintenance menu." (DEC-384)

## Files
`src/service-screen.js` · `test/cdp-smoke.mjs`

## Log
- 2026-11-17: found already shipped; added the arrow and the smoke check.
