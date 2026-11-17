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
Fixed on `land/bug-191` (b9e95ab3), not landed. Owner drives it on a pad: full throttle, lift, brake at once, ABS on.

## Summary
With ABS on, low-speed stops are much longer than with ABS off, worst right after a throttle lift. Sometimes there is no braking at all.

## Description
Reported on the Windows play build (main ea373576), 8BitDo pad. A stopping-distance table, ABS on against off by entry speed, is the evidence wanted before and after.

## Tracker
- [x] Reproduced headless with numbers
- [x] Root cause named
- [x] ABS-on stop from low speed is no longer than ABS-off on the same surface (within the expected ABS margin)
- [x] A gate pins it
- [ ] Owner has driven it

## Decisions
- DEC-029 (assists are settings) governs ABS; no conflict.

## Log
- 2026-11-17 b9e95ab3 (lane B). Root: off the pedal `stepAbs` re-synced the reference to the FASTEST wheel — a rear spun up under throttle (13 m/s, truck at 4). Braked, every wheel read ~70 % slip, all four valves dumped to 0, the decel sensor then read ~0, so ref crept down at only the 1 m/s² margin: coasted 14–220 m vs 0.6–40 m ABS off (duty 0–36 %). Fix: re-sync to the faster undriven front (traction.js's sensor) and rise-limit ref at measured accel + margin. After: ≤ 1.27× dry, ≤ 1.47× loose. Gate `abs-stop` extended (43 FAIL before, PASS after); 30/30 affected gates green; fingerprint-physics identical (it runs without ABS state).
- Residual, not the latch: loose ground, part pedal, straight after full throttle, 10–20 km/h = 1.36–1.47×. The squat unloads the fronts, so they genuinely start to lock. The valves then re-apply from 0.8 × that low first lock pressure at absReapplyRate 3/s. That is ABS tuning; it is held for the owner's drive (n = 1).
