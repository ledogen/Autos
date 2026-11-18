---
id: FEAT-282
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Right now the paper delivery accuracy is shown as "distance - $x.xx" . I think instead it should say "good accuracy - $x.xx" We should break the accur…"
relates: FEAT-266, FEAT-276, FEAT-277, DEC-416
---
lane: Places and Missions

# FEAT-282: Paper accuracy reads as four tiers with colours, not a distance

## Next steps
A lane builds the tiers; owner sets the great/ok/bad ranges (Open questions).

## Summary
A paper delivery shows "distance - $x.xx" today. Instead show an accuracy word and the pay: bad, ok, great or bullseye, in red, yellow, green or blue. A bullseye is within 0.5 m of the centre and reads "bullseye - $x.xx".

## Description
Owner's words, verbatim (inbox 20261118054206-85qa):

> Right now the paper delivery accuracy is shown as "distance - $x.xx" . I think instead it should say "good accuracy - $x.xx"
> We should break the accuracies up into bad, ok, great, or bullseye. Blue for bullseye, green for great, yellow for ok, red for bad. Bullseye is within half a meter from the center. For bullseye, instead of it reading "bullseye accuracy," it should just say "bullseye - $x.xx"

## Tracker
- [x] Four tiers: bad (red), ok (yellow), great (green), bullseye (blue)
- [x] Bullseye is within 0.5 m of the centre
- [x] The line reads "good accuracy - $x.xx" style for the first three and "bullseye - $x.xx" for the top tier

## Decisions

## Open questions
- Distance bands for great, ok and bad: he gave only the bullseye (0.5 m).

## Links
FEAT-266, FEAT-276, FEAT-277, DEC-416

## Files
src/paper-route.js · the result line in src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118054206-85qa).
- 2026-11-17 ui-1117b: accuracyTier() in paper-route.js: bullseye <= 0.5 m (blue), great q >= 0.75 (green), ok q >= 0.5 (yellow), bad rest (red); gate paper-route extended. Look pending.
