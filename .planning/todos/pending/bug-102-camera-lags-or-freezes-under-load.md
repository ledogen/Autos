---
id: BUG-102
type: bug
status: open
severity: minor
opened: 2026-11-01
source: owner, 2026-11-01 — long-standing, surfaces under heavy machine load
relates: src/camera.js (chase camera), the fixed-timestep accumulator in src/main.js, BUG-101 (same frame-ordering family)
---

# Chase camera drops behind the truck or freezes in space when the frame rate dips

## Owner's report (2026-11-01, verbatim)

> The other one that I noticed is a super long standing one. Under heavy load, when the game lags,
> the camera sometimes drops behind the truck or the camera freezes in space while the truck moves
> on. It's jarring, but not super major. Just visually a distracting bug that seems to come up more
> when the machine is under load.

## Likely shape

Two different symptoms, probably two causes:
- **Drops behind**: the chase camera's spring/lag is integrated with the RENDER delta, so a long
  frame (several fixed steps) moves the truck far while the camera takes one big, clamped step. The
  camera should either integrate per fixed step, or close the gap with a frame-length-aware
  exponential (1 − exp(−dt/τ)) that converges regardless of dt.
- **Freezes in space**: a frame whose delta is clamped to the accumulator's maximum (spiral-of-death
  guard) may skip the camera update entirely, or the camera reads a target that was not advanced
  that frame.

## Acceptance

- In the headless harness or a throttled Chrome (e.g. 4× CPU throttle in the smoke), the camera
  distance behind the truck stays within its normal band at steady speed and never stays still
  while the truck moves.
- Normal-frame-rate behaviour unchanged (camera feel is signed off; do not retune the spring).
