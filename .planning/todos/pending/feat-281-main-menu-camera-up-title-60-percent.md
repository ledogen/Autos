---
id: FEAT-281
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Slide the main menu camera up a little bit (and, second message, inbox 20261118024140-6xz5:) main menu increase autos font size by 60%"
relates: FEAT-41, FEAT-248, src/main.js
---
lane: Free lane (menus)

# FEAT-281: Main menu: camera slides up a little; AUTOS title 60 % bigger

## Next steps
A lane applies both.

## Summary
Two look changes on the main menu: the scene camera moves up a little, and the AUTOS title font is 60 % bigger.

## Description
Owner's words, verbatim (inbox 20261118023958-g9fw and 20261118024140-6xz5):

> Slide the main menu camera up a little bit
> (and, second message, inbox 20261118024140-6xz5:)
> main menu increase autos font size by 60%

## Tracker
- [x] The main menu camera sits a little higher
- [x] The AUTOS title is 60 % larger than today
- [ ] Both read correctly at both UI scales (FEAT-248)

## Decisions

## Open questions
- "A little bit" for the camera has no number: a lane shows a before/after.

## Links
FEAT-41, FEAT-248, src/main.js

## Files
src/main.js (main-menu scene) · index.html / CSS (title)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118023958-g9fw and 20261118024140-6xz5).
- 2026-11-17 ui-1117b: camera look-at +0.35 m (CAM_RISE_M in stage.js); title 30 -> 48 px, spacing 9 -> 14. UI-scale check (FEAT-248) not done. Look pending.
