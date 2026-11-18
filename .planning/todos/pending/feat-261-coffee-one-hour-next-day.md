---
id: FEAT-261
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Coffee should only take an hour of sleepiness the next day."
relates: DEC-378, src/day.js, test/day-clock.mjs
---
lane: C

# FEAT-261: Coffee costs one hour off the next wake-up

## Next steps
Lane C lands it with the food batch (land/food-1117).

## Summary
Coffee was +5 h now, −2 h off the next wake-up per cup (item setup page, 2026-10-20). Now −1 h. The +5 h stands.

## Tracker
- [x] `DAY_PARAMS.coffeeDebtH` 2 → 1
- [x] day-clock gate pins +5 / −1 and the sleep settlements

## Decisions
- 2026-11-17, owner (inbox 20261117101842-j7ue): the source line above. DEC-378.

## Files
`src/day.js` · `test/day-clock.mjs`

## Log
- 2026-11-17: built on land/food-1117 (lane C). day-clock green.
