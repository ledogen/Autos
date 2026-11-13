---
id: FEAT-195
type: feature
status: closed
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "I still don't know how to abandon a mission on controller I think It should be triggered by holding B and going up"
relates: [FEAT-125]
---
lane: Spare

# Controller: abandon a mission with B-hold + up

## What

There is no discoverable way to abandon a job on the pad. The owner's binding: hold B (the side menu's hold)
and press up. It must be shown on screen wherever the side menu shows its bindings — no hidden gestures.

## Acceptance

- [ ] B-hold + up abandons the current job (with the same confirm the keyboard path has), including an expired one.
- [ ] The binding is printed in the B-hold menu; pad-e2e covers it.

## Resolution (Spare, 2026-11-13 — land/feat-195, closes on landing)

**Why it was undiscoverable.** B held + ↑ already reached the abandon (FEAT-125: it is the B menu's last entry and ↑
from the top pre-selection wraps to it), but nothing on screen said so: the job button's pad keycap read a bare Ⓑ
(a B tap opens the TOP icon, not the abandon), the menu's "hold Ⓑ" line never mentioned it, and while moving the
entry is off the menu (only a parked truck can abandon, owner 2026-10-15). Parked with the menu on the abandon, its
name label also landed on top of the job HUD's text.

**Built.** The binding is printed where it acts: the job button's keycap reads Ⓑ+↑ (gamepad.js BINDINGS `j` row,
park-badge.js draws "B + ↑" as round B then +↑); the B menu's "hold Ⓑ" line adds "· ↑ abandon job" while the entry
is on the menu (parked, shown, not armed — CSS only); armed, the keycap reads plain Ⓑ "confirm?" (BUG-120's one-press
confirm, unchanged) and the line drops the ↑. Expired jobs: same Ⓑ+↑, one press signs it off (FEAT-113, unchanged).
The menu label is hidden when the pick is the abandon button (it reads its own words). Moving: unchanged, the button
reads PARK · to abandon.

**Proof.** cdp-smoke's pad step checks the printed Ⓑ+↑ + hint line, then the armed plain Ⓑ. wip/feat-195/shot.mjs
drives both paths in the real app (abandon: B held, ↑, release arms, B confirms; expired: B held + ↑ signs off) and
shoots them (wip/feat-195/*.png).
