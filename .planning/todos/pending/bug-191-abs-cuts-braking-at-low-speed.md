---
id: BUG-191
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "ABS really reduces your ability to slow down at low speeds, especially when rolling off the throttle and immediately applying the brakes. Sometimes it just totally coasts."
relates: BUG-92, src/physics.js
---
lane: B

# BUG-191: ABS cuts braking at low speed; sometimes the truck just coasts

## Next steps
Lane B (Opus): reproduce headless (throttle lift then full brake from 5–40 km/h, ABS on vs off), find the root, fix, gate it.

## Summary
With ABS on, low-speed stops are much longer than with ABS off, worst right after a throttle lift. Sometimes there is no braking at all.

## Description
Reported on the Windows play build (main ea373576), 8BitDo pad. A stopping-distance table, ABS on against off by entry speed, is the evidence wanted before and after.

## Tracker
- [ ] Reproduced headless with numbers
- [ ] Root cause named
- [ ] ABS-on stop from low speed is no longer than ABS-off on the same surface (within the expected ABS margin)
- [ ] A gate pins it
- [ ] Owner has driven it
