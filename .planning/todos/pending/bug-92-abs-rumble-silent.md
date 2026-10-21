---
id: BUG-92
type: bug
status: open
severity: minor
opened: 2026-10-21
relates: FEAT-135 (ABS — the pulse that should rumble), FEAT-125 (pad)
---

# BUG-92: ABS kick-back never rumbles the pad

## Report
Owner play-test 2026-10-21, after FEAT-135 merged: ABS "feels great", but the controller does not
vibrate while it cycles.

## What the code does
`src/vehicle.js` calls `padKick()` (`src/gamepad.js`) on every step after `src/abs.js` sets
`abs.pulse` (a cylinder dump onset, ~7/s per front channel on dry). `padKick` plays a 40 ms
`dual-rumble` (strong 0.4, weak 0.7), or `trigger-rumble` where the pad lists it. Only while the pad
drives. This is the game's first and only use of `vibrationActuator`, so no rumble path had ever
been proven on the owner's setup (Mac, Xbox One BT / 8BitDo Ultimate 2C BT).

## Two suspects — split them first
1. **The browser never reaches the motors.** Chrome on macOS may not pass rumble through to
   Bluetooth Xbox-protocol pads, and Firefox has no `vibrationActuator` at all.
2. **The pulses are too short or weak to feel.** A rumble motor needs tens of ms to spin up, so a
   40 ms buzz at 0.4/0.7 may not register.

Split them with a forced long buzz, typed into the DevTools console with the pad connected:
```js
navigator.getGamepads().filter(Boolean).map(g => [g.id, g.vibrationActuator?.effects ?? 'no actuator'])
navigator.getGamepads().find(Boolean).vibrationActuator.playEffect('dual-rumble', { duration: 1000, strongMagnitude: 1, weakMagnitude: 1 }).then(console.log)
```
- Buzzes → suspect 2: lengthen and strengthen `padKick` (try 80–100 ms, magnitude 1).
- No actuator, or silent → suspect 1: try Safari or a USB cable to find a path that works. No
  code fix applies.

## Acceptance
On the owner's pad and browser, cycling ABS is felt as pulsation, and it stops when ABS releases.
