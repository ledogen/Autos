---
id: BUG-119
type: bug
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: FEAT-125 (pad-only play), FEAT-146 (the run end), BUG-109 (the towel card on the pad, pinned in cdp-smoke 'endings')
---
lane: B

# BUG-119: The give-up screen can't be worked with the pad

> New bug can't use the pad to select the options in the give up screen

The cdp-smoke already walks the towel confirm card (`tc-back`/`tc-end`) with the D-pad and A, so the screen meant is
probably another one on that path: the run-end result card after giving up (`re-menu`), or the pause menu reached
from it. Find which, fix it, pin it in the smoke's pad walk.

## Acceptance
- [ ] Every button on the give-up path (pause → towel card → result card → main menu) is reachable and pressable on the pad alone.
- [ ] Pinned in cdp-smoke.
