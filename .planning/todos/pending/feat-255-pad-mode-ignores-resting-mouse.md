---
id: FEAT-255
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "If someone accidentally just leaves the mouse hanging somewhere on the UI and then presses buttons on a pad, we should ignore where the mouse is. Right now it'll lock a menu item or on the map view it can lock the map center to a location and you have to move the mouse. It'd be better if just pushing a button on the controller started ignoring the mouse till it moved."
relates: FEAT-254, src/gamepad.js
---
lane: unplaced

# FEAT-255: Pad mode: a resting mouse is ignored until it moves

## Next steps
Owner: drive the pad on the Lane U branch (land/pad-menus) with the mouse parked over a menu row and over the map; the pad must keep the highlight and the map centre.

## Summary
Any pad button or stick input sets `pad.mouseLive = false`; hover is ignored until the mouse really moves (or a real key is pressed).

## Description
One flag, read in three places. `src/gamepad.js` sets `pad.mouseLive` false on a new button press, a D-pad / stick nav, a map pan / zoom or B held, and true on a trusted pointermove with movement or a trusted keydown. `src/menu-nav.js` (pointerover highlight), `src/map2d.js` (list-row mouseover; `_padStep` no longer yields the cursor to a resting mouse) read it. Not done: the CSS `:hover` paint on a resting pointer (25 rules) still draws; the highlight itself no longer moves.

## Tracker
- [x] Pad input ends hover until the mouse moves
- [x] Menus: a resting mouse cannot take the highlight
- [x] Map: the centre lock is the pad's while the mouse rests
- [ ] Owner look

## Files
`src/gamepad.js` · `src/menu-nav.js` · `src/map2d.js` · `test/pad-e2e.mjs`

## Log
- 2026-11-17: built on land/pad-menus; test/pad-e2e.mjs checks the flag flips both ways.
