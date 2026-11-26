---
id: BUG-264
type: bug
status: done
severity: minor
opened: 2026-11-24
source: owner, 2026-11-24 (inbox) — "the campfire point light is above the cooking kit pot so it illuminates the pot from above which looks weird. either move pot higher or move light lower"
relates: FEAT-230, FEAT-66
---
lane: free lane

# BUG-264: The campfire's light sits above the cooking kit's pot

## Next steps
A routine lane (Sonnet): lower the fire's point light below the pot's base, or raise the pot, whichever keeps the fire lighting the ground and the camp as now. One before/after screenshot.

## Summary
The camp fire's point light is higher than the cooking kit's pot, so the pot is lit from above instead of from the fire under it.

## Description
(See Summary and the owner's words in `source:`.)

## Tracker
- [x] Built
- [ ] Owner's look

## Decisions
None yet.

## Open questions
None.

## Links
FEAT-230, FEAT-66

## Files
the camp fire light in `src/` (camp gear / fire code) · `data/prop-models.js` cookingKit

## Log
- 2026-11-24: minted by the orchestrator from the owner's inbox.
- 2026-11-25: built (lane c, land/ui-small-1125). Light was 0.685 m above the ground (anchor 0.085 + lightHeight 0.6), inside the pot (kit pot spans 0.59-0.99 m). `CAMPFIRE_PARAMS.lightHeight` 0.6 -> 0.4 (0.485 m, 0.1 m under the pot base); intensity/reach unchanged, ground pool visibly the same. Sheet: `wip/bug-264/sheet.jpg` (top before/after near, bottom far). Plain fire shares the height; flames top out at 0.5 m so the light stays in them.
- 2026-11-25: closed on the owner's look (card landed-1125b-look, no change asked).
