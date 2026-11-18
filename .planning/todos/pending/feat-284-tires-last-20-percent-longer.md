---
id: FEAT-284
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "All tires should last 20% longer. I'm just spending too much time thinking about tires In a run."
relates: FEAT-51, FEAT-259, DEC-033, DEC-375, DEC-418, data/parts.js
---
lane: SM-3 (economy)

# FEAT-284: All tires last 20 % longer

## Next steps
A lane scales the tire life constants (LIFE_H and equivalents).

## Summary
Every tire's life is 20 % longer, because the owner spends too much time thinking about tires in a run.

## Description
Owner's words, verbatim (inbox 20261118063341-mkc4):

> All tires should last 20% longer. I'm just spending too much time thinking about tires In a run.

## Tracker
- [ ] Every tire's wear life is 20 % longer than today
- [ ] The change applies to all tire models, spares included

## Decisions

## Open questions
- Is the multiplier on the wear rate (÷1.2) or on the shelf's hours; and do the two agree? A lane states which.

## Links
FEAT-51, FEAT-259, DEC-033, DEC-375, DEC-418, data/parts.js

## Files
data/parts.js · src/damage.js · data tire tables

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118063341-mkc4).
