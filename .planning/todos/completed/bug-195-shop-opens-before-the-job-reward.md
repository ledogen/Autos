---
id: BUG-195
type: bug
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "I was able to open the shop menu before taking my job reward when I stopped directly at the POI. I'm concerned that if you have an item choice, this could allow the player to overspend by buying something in the store before choosing their reward. For the record, I didn't try it."
relates: DEC-022, DEC-176, DEC-051, DEC-291, src/main.js
---
lane: SM-3 missions

# BUG-195: The shop could open over the result card

## Next steps
Owner: stop at a shop-POI destination (owed card).

## Summary
`_serviceInReach` returns null while a result card is up, and the shop opens the moment it is put away if the truck is still parked.

## Description
Reasoned from the code, not reproduced in a browser. The item choice is priced off the job's pay (`itemCost(rewardId, payout)`, capped at the pay, DEC-022/DEC-176/DEC-204), not off the wallet, so buying first cannot change its price or overspend: `_takeItem` is `economySystem.spend(cost)` and refuses when the wallet is short. What it could do: drain the wallet below the cost (the button then does nothing while its text still reads "+$x") and fill the truck so the item has "no room". Fixed at the root: result card first. A job is still not a gate on shops in general (DEC-051): only the 'done' state blocks.

## Tracker
- [x] Shop cannot open while a result card is up
- [x] Opens on Continue if still parked
- [ ] Owner look

## Files
`src/main.js` (`_serviceInReach`, `_shopAfterCard`)

## Log
- 2026-11-17: no gate covers the brake flow; main.js smoke owed at landing.

- 2026-11-17 CLOSED by the orchestrator on the owner's card answer ("Good: close them", card missions-1117-look). On main, in the play build.
