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
