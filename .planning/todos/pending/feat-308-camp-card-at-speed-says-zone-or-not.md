---
id: FEAT-308
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox 20261119222608-6jlo) — "While driving above the minimum speed, the camp indicator should tell you if you're in a camp zone or not. Only once you're in a camping zone should it suggest that you slow down in order to get the details."
relates: DEC-451, FEAT-45, FEAT-309, FEAT-299, src/main.js, src/camp.js
---
lane: unplaced

# FEAT-308: Above the camp prompt speed, the camp card says whether you are in a camping area

## Next steps
Owner: look at `wip/camp-1119/sheet.jpg` (owed card camp-1119-look) and write the copy if the [DEFAULT] words should change.

## Summary
While looking for a campsite (the tent on, Z) above 20 km/h, the card used to say "slow down to look for a campsite"
everywhere. Now it says whether this is camping ground: in a camping area it asks you to slow down for the graded
site; outside one it says so and does not ask you to slow down.

## Description
Reading: "the camp indicator" is the camp card shown while the hunt is on (the tent lit). The tent alone (hunt off)
is unchanged: it still scans nothing. The minimum speed is `CAMP_PROMPT_KPH` = 20 km/h (main.js). Below it the card
is as before (graded site, or "no camping here" off the zones).

At speed, `_campPromptState` now runs the zone test (`campSystem.zoneAt`, a loop over the zone discs, no ray, no
grading) before its speed return and hands the answer on as `fastZone`. The line is `campFastLine(inZone)` in camp.js:
- in a camping area: "camping area / slow down to look for a campsite" [DEFAULT]
- not: "no camping here" [DEFAULT] (the same words the card uses off a zone when slow)

FEAT-299 (a camping area becomes one continuous road run, not built) only changes what `zoneAt` answers; this card
reads it and needs no change then.

## Tracker
- [x] At speed the card has two states: in a camping area (asks to slow down) and not (says no camping, no slow-down)
- [x] Below the speed the card is unchanged; the tent with the hunt off is unchanged
- [x] Gate `test/camp-fast-card.mjs` registered
- [ ] Owner look (sheet) and copy

## Open questions
- The words are [DEFAULT]; the owner writes copy.

## Files
`src/main.js` (`_campPromptState`, the card line) · `src/camp.js` (`campFastLine`) · `test/camp-fast-card.mjs`

## Log
- 2026-11-19 (lane ai, land/camp-1119): built; gate camp-fast-card, smoke step campCard drives 26+ km/h in and out of a
  zone and reads the card. Cost at speed: one zone-disc loop per 10 Hz poll (no ray, no grading).
