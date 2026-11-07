---
id: BUG-120
type: bug
status: open
severity: major
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: FEAT-125 (e891c93a made abandon job the hold-B side menu's last entry, J on the keyboard), BUG-119
---
lane: B

# BUG-120: A mission can't be abandoned from the controller

> It's not possible to abandon a mission from controller

FEAT-125's pad audit put "abandon job" in the hold-B side menu (never pre-selected, last entry). Find why the owner
couldn't reach or use it (a gate on parked/active state, the entry hidden, the release not firing it) and fix it.

## Acceptance
- [ ] An active job can be abandoned on the pad alone, in the states a keyboard player can (J).
- [ ] Pinned in cdp-smoke's pad step.
