---
id: BUG-206
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "On the Windows on the 8002 server, first time playing with the new Rumble, I'm noticing there's pretty much always a Rumble all the time when I'm driv…"
relates: FEAT-247, FEAT-136, src/pad-rumble.js
---
lane: bug (alpha by default)

# BUG-206: Controller rumbles constantly while driving on Windows

## Next steps
Find which per-source gain feeds a constant floor (road surface or engine?) and cut it.

## Summary
First play with the new vibration (FEAT-247) on Windows (the 8002 server): the pad rumbles all the time on a plain road, with no hit and no slide. A constant background rumble has to go.

## Description
Owner's words, verbatim (inbox 20261118053713-tte5):

> On the Windows on the 8002 server, first time playing with the new Rumble, I'm noticing there's pretty much always a Rumble all the time when I'm driving down the road. Even if I'm not hitting anything or sliding, that's gotta go.

## Tracker
- [ ] No rumble while driving on a smooth road without a hit or a slide, on Windows
- [ ] The deliberate sources (ABS, hits, slides, surface) still rumble

## Decisions

## Open questions
- Which pad, and which browser, on that Windows machine? Nothing was recorded.

## Links
FEAT-247, FEAT-136, src/pad-rumble.js

## Files
src/pad-rumble.js · src/main.js · src/vehicle.js · src/contact-audio.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118053713-tte5).
