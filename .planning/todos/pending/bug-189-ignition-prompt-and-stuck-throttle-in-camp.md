---
id: BUG-189
type: bug
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16 — "I was camping. I wrapped up with Katie. Then it said press Y to start the truck even though I was still in camp. I decided to try to break it so I started the truck and it immediately pinned to rev limiter like the throttle was fully held. Then I returned to the truck. The throttle was still fully held until I tapped the accelerator."
relates: FEAT-229, BUG-183
---
lane: unplaced

# BUG-189: In camp: the start-the-truck prompt shows, and starting pins the throttle

## Next steps
Built on `land/tut-round2`. Owner: drive with the pad; if no phantom throttle comes back, close it (the root cause below
is the best reading, not reproduced on his hardware).

## Summary
Two faults. The ignition prompt shows while the camp is open. And starting the engine from camp latches full throttle until the accelerator is tapped.

## Description
Find why the throttle input latches (a held key or pad axis read while the camp UI owns input?) and fix it for every menu, not only the camp. The prompt must not show while any menu owns input.

## Tracker
- [x] No ignition prompt while the camp or any menu is open (camp, a parked card's lock, a pad menu)
- [x] Starting the engine never leaves the throttle held: both input-path latches fixed (see Log)
- [x] Smoke covers it (`opening`, in camp after Katie's talk)
- [ ] Owner confirms on his pad

## Log
- 2026-11-16: root cause, by reading the input path (`vehicle.js` rawThrottle = `pad.throttle` or `keys.w`, nothing else;
  the hint fires only on rawThrottle > 0): the hint came up untouched, so a pedal read pressed. Pad: the Gamepad API's
  standard mapping reads some pads' triggers off an axis, (v+1)/2, which sits at 0.5 until the first report after a
  (re)connect — a phantom half throttle that holds "until I tapped the accelerator". Fix: a trigger drives only once seen
  at rest since its pad connected (`gamepad.js trigger()`). Keyboard: no blur handler, so W let go out of focus stayed
  held; fix: blur clears the driving keys. Hint hidden while a menu owns the truck. Smoke checks all three (W in camp,
  blur with W down, a fake pad's trigger at 0.5 then rest then press).
