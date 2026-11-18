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
Fixed on land/bugs-1117-pad-cam-light; owner drives it on Windows (:8002) with the pad, card bugs-1117-pad-cam-light-drive. Close on his word.

## Summary
First play with the new vibration (FEAT-247) on Windows (the 8002 server): the pad rumbles all the time on a plain road, with no hit and no slide. A constant background rumble has to go.

## Description
Owner's words, verbatim (inbox 20261118053713-tte5):

> On the Windows on the 8002 server, first time playing with the new Rumble, I'm noticing there's pretty much always a Rumble all the time when I'm driving down the road. Even if I'm not hitting anything or sliding, that's gotta go.

## Tracker
- [x] No rumble while driving on a smooth road without a hit or a slide (headless: gate rumble-cruise, 60 and 80 km/h, zero effects sent)
- [x] The deliberate sources (ABS, hits, slides, surface) still rumble (slide, flat, kerb jolt, gravel: gates)
- [ ] Owner feels it on Windows

## Decisions

## Open questions
- None blocking. Which pad, and which browser, on that Windows machine? Nothing was recorded.

## Links
FEAT-247, FEAT-136, src/pad-rumble.js

## Files
src/pad-rumble.js · src/main.js · src/vehicle.js · src/contact-audio.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118053713-tte5).
- 2026-11-18 CAUSE: the `rough` (road texture) source = mean |strut velocity| over a 0.08 m/s floor. On asphalt that is the body riding the road's undulations and the deck's facet kinks (p50 0.10 m/s at 57 km/h): 58 % of a smooth drive buzzed, weak motor up to 0.29 (world rig, autopilot; wip/bugs-pcl/rumble-trace.mjs). Slip, bent, flat, kicks were 0. Off-road the same signal was LOWER than on asphalt: it never measured texture.
- FIX (454deaff): two sources on their real causes. `jolt` = strut velocity high-passed at 6 Hz ÷ speed (the change of ground slope: asphalt ≤ 0.014, floor 0.03, full 0.3, both motors). `rough` = loose ground under the truck (main.js _looseSurfaceFactorAt, as the tyre audio and dust), × speed; asphalt silent. Gates pad-rumble, rumble-cruise (new, heavy). Unverified: a real Windows pad.
