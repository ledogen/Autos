---
id: BUG-213
type: bug
status: closed
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not a…"
relates: FEAT-69, FEAT-285, DEC-388, data/parts.js
---
lane: bug (alpha by default)

# BUG-213: Economy scaling does not seem to apply to the labor cost

## Next steps
None. Closed 2026-11-21: already fixed, proven at every difficulty cost level.

## Summary
The owner is "pretty sure" the economy scaling (cost level by region/day) is not applied to the labor part of a repair.

## Description
Owner's words, verbatim (inbox 20261118063529-ortt):

> The initial cost to repair springs and dampers is too prohibitive, let's lower it to 4 dollars. I'm also pretty sure that the economy scaling is not applying to The labor cost.

## Tracker
- [x] The labor cost scales with the economy exactly as the parts cost does
- [x] A gate or number check shows labor at two cost levels

## Decisions

## Open questions
- Which labor: shop labour on repairs, or all labour (oil change, tire swap)?

## Links
FEAT-69, FEAT-285, DEC-388, data/parts.js

## Files
data/parts.js · the maintenance cost code (src/service*.js)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118063529-ortt).
- 2026-11-18 lane land/numbers-1118: NOT REPRODUCED in code. Every labour price in src/service.js (REPAIR_SETUP in _quote, fitLabour, _jobs hub/bead, align, patch, oil) already multiplies `this.tier()`; recovery's roadside tire service multiplies at the end. Added a check in test/service.mjs: labour = setup × tier and a spring repair = (setup + 4×gap) × tier at tiers 1 and 2. Labour HOURS do not scale (by design, the clock). If the owner saw a flat $ somewhere, a screenshot of which screen is needed.
- 2026-11-21 lane s2 (land/bugs-1121): CLOSED, already fixed. test/service.mjs now applies DEC-475's cost rows through applyRules + dayTier: day 1 → day 12, spring fit labour $2 → $2 (off) / $2.92 (low) / $4 (normal), oil $6 → $6 / $8.76 / $12, same ratio as the part ($3 → $3 / $4.38 / $6). Hours do not scale (the clock).
