---
id: BUG-120
type: bug
status: closed
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

## Resolution

**Closed on evidence (Lane B, 2026-11-07).** Landed with the playtest batch (409f138f..c0021dc8). Once armed
('confirm?'), the job's abandon is the B menu's pre-selection, so one B press confirms inside the 3 s arm. Pinned in
cdp-smoke's pad step: its abandon entry is never the pre-selection, ↑ wraps to it, the release arms it, and armed it is
the pre-selection. (BUG-117 took abandon off mom's casserole, so the check runs on the giver's job.)
