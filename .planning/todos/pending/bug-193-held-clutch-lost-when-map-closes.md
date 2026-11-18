---
id: BUG-193
type: bug
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "If you hold LB in the map and then close it, the vehicle's clutch is not held in even though you're holding the clutch key. Can we check for button state immediately upon closing the map? That way it just picks up on a player who's already holding the button."
relates: src/gamepad.js
---
lane: unplaced

# BUG-193: LB held through the map (or a card) is not the clutch after it closes

## Next steps
Fixed; owner look when convenient.

## Summary
A pad button keeps the key it went down with, so LB held in the map stayed the map's ArrowLeft after the map closed.

## Description
Root: gamepad.js `held` maps a button to the key sent at press (so a press that opens a menu releases the key it sent). LB down in the map layout held ArrowLeft; in drive, `held.has(4)` blocked the Shift keydown. Fix: back in the drive layout, a held LB (clutch) or RB (handbrake) releases its old key and is read afresh as drive's. Deliberately NOT A / Y / L3: held through a close they would fire a shift, the ignition or the lights. Triggers and sticks are analog, read live every frame, so they were never affected.

## Tracker
- [x] LB held through a map / card close engages the clutch
- [x] RB likewise (handbrake)
- [ ] Owner look

## Files
`src/gamepad.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-17: fixed on land/pad-menus; test/pad-e2e.mjs checks Shift fires on the close.
