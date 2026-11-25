---
id: BUG-265
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 (inbox) — "big bug. post mission card i hit rb to park and it closed the card. i think i still got the cash reward but what if i wanted to park and think about the item or the cash."
relates: FEAT-199, FEAT-125, DEC-176
---
lane: SM-3 (economy)

# BUG-265: RB (park) on the post-mission card closes the card

## Next steps
A routine lane (Sonnet): reproduce on the pad (test/pad-e2e.mjs has the pad contract), find which binding closes the result card on RB, and make RB park without choosing. The card closes only on its own explicit choice. Check which reward the closed card paid (the log should show cash) and say so. Add the case to pad-e2e.

## Summary
With the post-mission result card open, pressing RB to set the parking brake closed the card and (the owner thinks) took the cash, so the item-or-cash choice was lost.

## Description
(See Summary and the owner's words in `source:`.)

## Tracker
- [ ] Built
- [ ] Owner's look

## Decisions
None yet.

## Open questions
None.

## Links
FEAT-199, FEAT-125, DEC-176

## Files
`src/main.js` (pad handling, the result card) · `src/offer-board.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-24: minted by the orchestrator from the owner's inbox.
