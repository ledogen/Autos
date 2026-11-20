---
id: BUG-234
type: bug
status: open
severity: major
opened: 2026-11-18
source: BUG-232 census, 2026-11-18
relates: BUG-232, FEAT-19, FEAT-40, src/corridor-router.js, src/road.js
---
lane: Engine & world

# BUG-234: Two different runs cross with no junction there, and the at-grade lift builds a ramp

## Next steps
- Trace the cause on the worst sites (not traced yet). Several involve shoved or T-node runs.
- Wait for BUG-232's fix first: it touches the same code, and its rung test may cover part of this class.

## Summary
Two different road runs cross in plan view where the network has no junction. The FEAT-19 at-grade crossing lift then raises the lower deck onto the upper one. Where the solved decks were far apart that makes a ramp far over the grade cap.

## Description
BUG-232's census on 300 random seeds (main e4251ee1), inside the story region: 30 sites on 21 seeds (7 %). The worst is seed 1960791808 at (617.8, −1722.5): solved decks 55.2 m apart, shipped grade 279 %. 8 of the 30 sites ship a grade over 45 %; 21 ship over 30 %. The full list is `wip/bug-232/summary.txt` in the main checkout (git-ignored), from `wip/bug-232/census.mjs` in CarGame-land-feat180.

## Tracker
- [ ] Cause traced on the three worst sites.
- [ ] Fix options, simplest first.
- [ ] Gate, fingerprint, 400-seed sweep.
- [ ] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner (card bug232-spiral-tunnels): "No spirals: refuse the loop". Recorded as DEC-446: the router refuses a path that crosses itself; no grade separation (no tunnel under, no bridge over) is added for spirals or for BUG-234's no-junction crossings. The same card covered this ticket ("BUG-234 over/under passes"): no over/under passes.
None yet.

## Open questions
- Should a crossing with enough vertical gap become an over/under pass? That is the same owner question as BUG-232's option 3 (card `bug232-spiral-tunnels`).

## Links
BUG-232 (the same lift, one run crossing itself).

## Files
`src/road.js` (`_addCrossingByRun`), `src/corridor-router.js`.

## Log
- 2026-11-18: minted from BUG-232's census. Cause not traced.
- 2026-11-19: owner answered "No spirals: refuse the loop" on the BUG-232 card (DEC-446), which blocked "BUG-234 over/under passes": no grade separation. Fix options for the no-junction crossings stay open (junction or refuse), simplest first.
