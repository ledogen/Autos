---
id: BUG-113
type: bug
status: open
severity: minor
opened: 2026-11-05
source: owner, 2026-11-05 (page inbox, playing main) — "b on pad doesnt close the recovery menu. it opens the pause menu which is strange and unexpected"
relates: BUG-109 (the pad pass; its five screens didn't include the Recovery menu), FEAT-125 (B-hold side menu)
---
lane: Spare

# BUG-113: B on the pad opens pause instead of closing the Recovery menu

B is back everywhere else. On the open Recovery menu, B opens the pause menu.

## Acceptance

- [ ] B closes the Recovery menu (and only that), on main after BUG-109.
- [ ] A fake-pad cdp-smoke step pins it.

## Built (Spare, 2026-11-05, feature/spare 46d58df3)

Esc / pad B is the general back (owner, 2026-10-20): main.js's Esc handler steps out of a card through
`_cardBackButton()` (camp, mission and paper cards), then closes the map, and only then pauses. The Recovery card
has no back button of its own, so it fell through to the pause menu. One case in that chain: an open Recovery card
closes (`_recoveryOpen = false; _updateRecovery()`) before the map and the pause. Pinned in cdp-smoke's broke-down
step: with the card open, a fake-pad B closes it and the pause menu stays shut, then X reopens it for the step's own
"end run". The landing smoke runs on main (orchestrator, 2026-11-05).
