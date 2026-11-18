---
id: BUG-213
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not a…"
relates: FEAT-69, FEAT-285, DEC-388, data/parts.js
---
lane: bug (alpha by default)

# BUG-213: Economy scaling does not seem to apply to the labor cost

## Next steps
Check against the cost-level code with two levels.

## Summary
The owner is "pretty sure" the economy scaling (cost level by region/day) is not applied to the labor part of a repair.

## Description
Owner's words, verbatim (inbox 20261118063529-ortt):

> The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not applying to The labor cost.

## Tracker
- [ ] The labor cost scales with the economy exactly as the parts cost does
- [ ] A gate or number check shows labor at two cost levels

## Decisions

## Open questions
- Which labor: shop labour on repairs, or all labour (oil change, tire swap)?

## Links
FEAT-69, FEAT-285, DEC-388, data/parts.js

## Files
data/parts.js · the maintenance cost code (src/service*.js)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118063529-ortt).
