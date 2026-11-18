---
id: BUG-212
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "I feel like the GPS map line gets kind of confused especially for missions with multiple stops"
relates: FEAT-266, FEAT-257, BUG-204, DEC-398
---
lane: bug (alpha by default)

# BUG-212: The GPS route line gets confused, especially on multi-stop missions

## Next steps
Needs a repro: the owner is asked for a capture, or a lane drives the paper route and a courier multi-stop headless.

## Summary
The GPS line seems to get confused, most on missions with several stops. Stated as a feeling: no specific stop or seed was named.

## Description
Owner's words, verbatim (inbox 20261118062617-1pat):

> I feel like the GPS map line gets kind of confused especially for missions with multiple stops

## Tracker
- [ ] The GPS line follows the intended next stop and tour on a multi-stop mission
- [ ] A repro (seed, mission, position) is captured first

## Decisions

## Open questions
- Which mission, which seed, and what did the line do (flip, double back, point behind)?

## Links
FEAT-266, FEAT-257, BUG-204, DEC-398

## Files
the GPS / guide route in src/main.js and the road system

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062617-1pat).
