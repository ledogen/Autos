---
id: FEAT-136
type: feature
status: open
severity: minor
opened: 2026-10-21
relates: FEAT-125 (pad support), BUG-92 (rumble, Chrome on Mac)
---

# FEAT-136: Controller support in as many browsers as possible

## Request
Owner 2026-10-21: "I would like to get controller support working in as many browsers as
possible." This was found while chasing BUG-92. In Safari on the Mac, the pad does not drive the
truck at all. Until now it has only been proven in Chrome (FEAT-125: Xbox One BT and 8BitDo
Ultimate 2C BT).

## Leads (none checked yet)
- **Our filter drops pads.** `src/gamepad.js` skips any pad whose `gp.mapping !== 'standard'`.
  `mapping` is the browser's claim that the buttons sit in the W3C layout. Firefox (and maybe
  Safari) can report `''` for a pad it doesn't recognise, so the game ignores that pad.
- **Safari only lists a pad after a button press** with the page focused. The button press that
  wakes the pad may also need to count as input.
- **Safari goes through Apple's GameController framework,** which accepts only the pads Apple
  supports. The 8BitDo may need to be in its Xbox or Switch mode for Safari to see it.

## First step
Open `test/pad-test.html` (it shows what the browser reports for each pad) in Safari and Firefox,
with each pad. Note `id`, `mapping`, the button and axis count, and whether `vibrationActuator`
exists. Then decide: either a per-browser remap table for non-standard pads, or nothing at all
because the browser never shows the pad.

## Acceptance
A matrix in this ticket covering Chrome / Safari / Firefox × Xbox One BT / 8BitDo 2C BT, with
"drives" and "rumbles" per cell. Every cell where the browser shows the pad at all also drives the
truck. Cells where the browser hides the pad are recorded as browser limits.
