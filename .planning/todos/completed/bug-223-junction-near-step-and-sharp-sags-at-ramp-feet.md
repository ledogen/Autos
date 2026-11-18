---
id: BUG-223
type: bug
status: done
severity: major
opened: 2026-11-18
source: BUG-216 agent, 2026-11-18
---
lane: engine & world

# BUG-223: Junction ramp feet carry sharp sags, and one is a near-step (1.167 per metre)

## Next steps
Waits on the owner's answer to card bug216-bottoming-spots (sag-limit the foot when BUG-200 option E lands?).

## Summary
Seed 1380228728 at (-62.9, -10.3): a junction sag of 1.167 /m, effectively a kerb. Seed 660454599 at (657, 1912): the foot of a -34 % ramp sags 4.9 %/m; BUG-200 option E eases the ramp to -24 % but sharpens the foot to 6.8 %/m, where a fresh truck bottoms at 60 km/h.

## Description
Census, 12 seeds: junction sags of 3 %/m or more are 3.3 per 10 km on main and 1.3 with option E. BUG-97 ruled junction sags fair at junction speed; the near-step is beyond that.

## Tracker
- [ ] Cause found
- [ ] Fix and a gate

## Decisions

## Open questions

## Links
BUG-216, BUG-200, BUG-97, DEC-409

## Files

## Log
- 2026-11-18 minted by the orchestrator.
- 2026-11-18 CLOSED, not fixed. Owner on card `bug216-bottoming-spots`: option 1, leave them ("10 before a 90deg corner the player should not be going 80kph"; "This is a feel problem"). He asked that no lasting ruling be written, so there is no decision record. BUG-200 option E lands without a sag limit at the foot.
