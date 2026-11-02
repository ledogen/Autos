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

## Probed — Spare, 2026-11-01: not reproduced; needs the owner's sighting details

Read first: the chase camera's position and aim already use frame-length-aware decays
(1 − e^(−k·dt), and rate caps × dt) on the wall frame time, clamped at 0.25 s like the sim; nothing
else in the frame loop writes the camera, and `updateCamera` runs every frame between the render-pose
swap and its restore. So neither shape in "Likely shape" exists in the code as written.

Measured live (`wip/bug-102/camprobe.mjs`, free-roam spawn, W held, every frame logged: camera move,
truck move, horizontal separation):

| load | frames | camera still while the truck moved | separation p5 – max |
|---|---|---|---|
| none | 17 ms | 0 | 5.5 – 10.1 m |
| CPU throttled 6× | median 18 ms, max 67 | 0 | 5.8 – 9.8 m |
| CPU throttled 20× | median 63 ms, max 114 | 0 | 5.9 – 8.1 m |
| a 300 ms main-thread stall every 0.9 s, truck at speed | 17 ms + 320 ms spikes | 0 | 5.3 – 9.4 m |

Across each stall frame the truck jumps 0.5–5.7 m and the camera follows in the SAME frame by 0.8–7.1 m;
the separation never leaves its unloaded band. **Owed to reproduce:** which camera (chase / hood / an
orbit drag or pad look in progress), roughly the speed, and whether a menu, the map or a camp was
involved when it froze. Left open.
