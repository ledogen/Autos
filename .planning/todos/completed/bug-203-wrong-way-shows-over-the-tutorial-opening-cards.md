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
Fixed on land/feat-288-p6-opening (with FEAT-288 P6); closes when it lands.

## Summary
During the tutorial's opening (the orbit around the joint with its story cards) the HUD prints "Wrong way. Turn around". Seen on both the old seed 3590618618 and the new 1872706826, so it is not seed-specific.

## Description
Visible in frames 1-3 of `CarGame-land-211d/wip/tut-repin/sheet.jpg`. The truck is parked and the player has no control yet, so no driving alert should show.

## Tracker
- [x] No wrong-way alert while the opening plays, on any seed
- [x] The alert still works once the player drives

## Decisions

## Open questions

## Links
FEAT-229, DEC-402

## Files
src/main.js (opening), the GPS wrong-way alert

## Log
- 2026-11-17 minted from the re-pin agent's walk.
- 2026-11-18 cause: the tutorial's GPS line to mom's was handed to gps.js from the firing's first frame, so a truck parked against it raised gps.js's wrong-way flag under the cards. Fix (main.js getRoute): on the firing day no line until mom's pedals card `tut-drive`. Smoke: a 10 Hz watch over the opening's cards (truck turned round under her ring) counts 0; after `tut-drive`, and after a skip at three moments (a waypoint), turned against the line the alert shows.
