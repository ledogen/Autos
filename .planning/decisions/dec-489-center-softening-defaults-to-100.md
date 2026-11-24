---
id: DEC-489
status: standing
decided: 2026-11-24
area: ui
governs: FEAT-125, src/gamepad.js, src/settings.js, center softening, steerShape
supersedes: 
---

# DEC-489: Center softening starts at 100 %

**Ruling.** "Center softening default value when first toggled on should be 100%". The center-softening default is 100 % (steerShape 1), so the first time the steering assist is turned off the slider reads 100 %. A saved value is kept.

**Why.** The slider only shows with the assist off; it used to start at 0 % (linear).

**Replaces.** The 0 % default.

**Source.** Owner, 2026-11-24. Owner's words.
