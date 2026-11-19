---
id: BUG-235
type: bug
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18, capture autos-capture-1795073264292.json (seed 1225608752, day 2)
relates: FEAT-211, FEAT-120, src/main.js
---
lane: free lane

# BUG-235: The result card replays its reveal at 10 Hz when a map waypoint is set

## Next steps
Fix is on `land/bug-235-result-card-replay`. Owed: a smoke check that fails on main (finish a paid job with a waypoint set; the card's body must not be rewritten while it shows), then land.

## Summary
Owner: "I finished a freight job and the reward card came up and it's firing the sound effect over and over again and spamming the animation fade in of the plus one deed... Maybe 20 hertz, 10 hertz. I was still able to hit continue."

## Description
Cause, read from the code (not yet reproduced in a browser): the HUD poll in the frame loop runs every 100 ms and calls `_renderMissionUI()` while `_waypointOn()` is true (FEAT-211: the waypoint's HUD line is a live distance). `_waypointOn()` is false during a job and turns true the instant the job ends, if the player has a waypoint set. The mission is then in state `done`, so each poll rewrites the result card's HTML and re-runs `_revealResult`: the first coin and the first rows' fade-in start again every 100 ms, and the later rows never arrive. 10 Hz matches the owner's estimate. `_tutDrive()` has the same shape.
Fix: the poll skips the repaint while the state is `done`. The card is static, and continue leaves `done`.

## Tracker
- [x] Cause found in the code.
- [x] Fix: `src/main.js`, the HUD poll's condition.
- [ ] A smoke check that fails on main and passes on the branch.
- [ ] Landed on main (orchestrator).

## Decisions
Plain defect, fixed without asking (owner's standing rule, card bug216).

## Open questions
None.

## Links
FEAT-211 (waypoints), N-04 (the staged reveal).

## Files
`src/main.js` (`_renderMissionUI`, `_revealResult`, the HUD poll).

## Log
- 2026-11-18: minted from the owner's report; cause and fix the same hour.
