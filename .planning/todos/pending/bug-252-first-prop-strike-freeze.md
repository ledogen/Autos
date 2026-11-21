---
id: BUG-252
type: bug
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "When I was coming in at Mach Jesus and I hit the very first sign, I noticed it seemed like the truck stopped for a couple frames on contact. I want to say the game didn't drop frames, but the truck just froze in place before carrying speed through the sign and then it demolished as intended. Check that there's no loading that occurs on first prop strike. This was also my first prop strike of that particular run if it matters."
relates: BUG-108, FEAT-65, FEAT-267, PERF-32, src/main.js, src/debris.js
---
lane: unplaced

# BUG-252: The truck seemed to freeze for a couple of frames on the first sign of a demolition run

## Next steps
Not reproduced headless or in the lab. Next: a story-run browser probe of the demolition smash path (pay share, coin,
readout, GPS re-plan) with `?hitch=1`, or the owner's run log / a `?hitch=1` run if it happens again.

## Summary
Physics holds nothing: a 13 kg sign at 40 m/s takes 0.33 m/s off the truck in ONE step, on the first strike and on the
second alike. Nothing is built lazily on contact: the sign's model and collider load when the site is placed, and its
body is spawned asleep at 120 m (3 s before contact at 40 m/s). The one path not yet measured is the story-run smash
handler.

## Description
### What exists before contact (code read)
- `_placeSite` loads every target kind (`debrisSystem.load`: GLB fetch + hull) when the job is accepted.
- `_updateSite` spawns each target as a pinned debris body, asleep, at `onM` = 120 m, and the debris clone mesh is
  drawn from then on (so its shader is compiled before contact).
- On contact: the engine wakes the body; the damage feed, contact audio and pad rumble run every step anyway. The smash
  latch (moved 0.3 m or tilted 25°) then runs `_paySiteShare` (economy `payTarget`, `_showThrowReadout`, `playCoin`:
  synthesized oscillators, no decode) and `TourGuide.poll` (a budgeted re-plan job). Nothing in that list is first-use only.

### Physics, headless (wip/bug-252/trace.mjs: the real DebrisSystem, signGrade's own hull, 13 kg, asleep, flat slab)
Per-step truck speed change around the wake step (step 0), strike 1 then strike 2 in the same world, 40 m/s:
- strike 1: −0.006 −0.006 −0.006 **−0.332** +0.001 +0.001 −0.006 −0.002 −0.002 −0.003
- strike 2: −0.000 −0.000 −0.000 **−0.322** +0.008 +0.007 −0.000 +0.004 +0.004 +0.003
The momentum bound 2·m·v/M is about 0.56 m/s; one step, then the truck runs on. 55 and 70 m/s, centre and wheel line,
broadside and edge-on: the same single step (−0.50 to −0.58, −0.66 to −0.68). No multi-step hold anywhere.

### Browser, testing lab (wip/bug-252/browser.mjs: the real app, the sign spawned as `_updateSite` does)
The truck is set to 40 m/s 100 m short and coasts, so it arrives at about 29 m/s. Run A (60 fps): first strike of the
session, frame dt 16.9 ms at contact, sim +16.7 ms every frame, worst frame of 400 = 19.5 ms. Run B (a loaded machine,
30 fps), two strikes in one session: every frame around both contacts gains the sim its full 33.3 ms; contact frame dt
34.2 ms (strike 1) and 35.1 ms (strike 2), worst of 400 frames 36.7 / 36.1 ms; speed off the truck in the contact frame
0.35 and 0.33 m/s. The first strike and the second are the same.

### Why it can look like a freeze without a frame drop
PERF-32's catch-up brake drops the sim debt a long frame leaves. A 100 ms main-thread stall therefore shows the last
frame for 100 ms and then the truck carries on from where it was, with no jump: it reads as "the truck froze", not as
a stutter.

## Tracker
- [x] Physics trace, first vs second strike at 40 m/s (no hold)
- [x] Lab browser probe, first strike of a session (no stall)
- [ ] Story-run demolition smash path measured in the browser
- [ ] Fix, once a cause is seen

## Files
`wip/bug-252/trace.mjs` · `wip/bug-252/browser.mjs` (git-ignored probes)

## Log
- 2026-11-20: diagnosis on land/props-1120. Not reproduced; no src/ change.
