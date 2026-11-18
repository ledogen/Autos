---
id: BUG-203
type: bug
status: open
opened: 2026-11-17
severity: minor
source: orchestrator (re-pin walk, FEAT-229)
---

# BUG-203: "Wrong way. Turn around" shows over the tutorial opening's cards

## Next steps
Find what feeds the wrong-way alert during the opening and silence it while the opening owns the screen.

## Summary
During the tutorial's opening (the orbit around the joint with its story cards) the HUD prints "Wrong way. Turn around". Seen on both the old seed 3590618618 and the new 1872706826, so it is not seed-specific.

## Description
Visible in frames 1-3 of `CarGame-land-211d/wip/tut-repin/sheet.jpg`. The truck is parked and the player has no control yet, so no driving alert should show.

## Tracker
- [ ] No wrong-way alert while the opening plays, on any seed
- [ ] The alert still works once the player drives

## Decisions

## Open questions

## Links
FEAT-229, DEC-402

## Files
src/main.js (opening), the GPS wrong-way alert

## Log
- 2026-11-17 minted from the re-pin agent's walk.
