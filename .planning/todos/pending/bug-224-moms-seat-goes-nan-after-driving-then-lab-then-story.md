---
id: BUG-224
type: bug
status: open
severity: major
opened: 2026-11-18
source: FEAT-293 close-out agent, 2026-11-18
---
lane: engine & world

# BUG-224: Drive about 150 m, visit the lab, start a story run: the truck's state goes NaN at mom's seat

## Next steps
Reproduce headless or in the smoke (drive ~150 m with W, enter the lab and leave, start a story run) and find which seat or re-seat path leaves a stale pose.

## Summary
The truck's state becomes NaN (not-a-number, the result of an undefined calculation): strut compression reads about 3e5 m, then the velocity from the engine is NaN. Parking at mom's then opens no camp panel.

## Description
Found while chasing a smoke failure on the driving-AI branch. It is not the AI: driving the same 150 m by hand fails the same way. Moving the truck back to where it started before the lab visit avoids it, which is what the smoke step now does. A player can plausibly hit this: free roam drive, lab, then a story run.

## Tracker
- [ ] Reproduced without the smoke's re-seat
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
FEAT-293.

## Files
src/main.js, src/stage.js, src/physics.js

## Log
- 2026-11-18 minted by the orchestrator.
