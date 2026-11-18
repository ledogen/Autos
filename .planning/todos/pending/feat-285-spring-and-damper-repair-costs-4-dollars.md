---
id: FEAT-285
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not a…"
relates: FEAT-69, FEAT-212, DEC-419, BUG-213, data/parts.js
---
lane: SM-3 (economy)

# FEAT-285: The initial spring and damper repair cost is $4

## Next steps
A lane sets the number.

## Summary
The initial cost to repair springs and dampers is too high: lower it to $4. (The labor-cost half of the message is BUG-213.)

## Description
Owner's words, verbatim (inbox 20261118063529-ortt):

> The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not applying to The labor cost.

## Tracker
- [x] The initial repair cost of springs and dampers is $4
- [x] The labor cost on it is not changed by this ticket

## Decisions

## Open questions
- Is "initial" the base before economy scaling, i.e. $4 at the base cost level?

## Links
FEAT-69, FEAT-212, DEC-419, BUG-213, data/parts.js

## Files
data/parts.js (repair costs)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118063529-ortt).
- 2026-11-18 lane land/numbers-1118: read "initial cost" as the part-priced 0→100% rate; REPAIRS.spring.price and .damper.price null → 4 (was the part's price: stock $7/$6, HD $25), data/parts.js, × day tier like all repairs. REPAIR_SETUP ($5 labour) untouched. test/service.mjs re-pointed to the $4 rate. If the owner meant the $5 setup charge instead, say so.
