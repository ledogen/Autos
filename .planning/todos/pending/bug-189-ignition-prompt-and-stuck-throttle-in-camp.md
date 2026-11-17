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
Lane A fixes it with the tutorial round (DEC-353).

## Summary
Two faults. The ignition prompt shows while the camp is open. And starting the engine from camp latches full throttle until the accelerator is tapped.

## Description
Find why the throttle input latches (a held key or pad axis read while the camp UI owns input?) and fix it for every menu, not only the camp. The prompt must not show while any menu owns input.

## Tracker
- [ ] No ignition prompt while the camp or any menu is open
- [ ] Starting the engine never leaves the throttle held: checked from camp and from another menu
- [ ] Smoke or gate covers it
