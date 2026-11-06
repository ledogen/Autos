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

## Fixed — Lane B, 2026-11-06 (feature/machine 3066dab2, a4ec7b87)

**Cause: the chase spring ran on the wall clock while the truck runs on the sim's.** They are the same number at a
healthy frame rate. Under load they aren't: PERF-32's catch-up budget abandons the step debt once a frame has burned
a step's worth of wall time, so the sim runs in slow motion.
- Measured live (`wip/bug-102/drawprobe.mjs`, 6× CPU throttle and random 50–400 ms main-thread stalls): sim 13.6 s in
  24.9 s of wall, 55 %.
- The camera's exponential still closed the gap at its wall-clock rate, so around a slow-motion truck it pulled in
  tight: a 3.7 m shorter trail at 25 m/s and a quarter speed.
- The moment the frame rate recovered, it dropped back out to its full trail in ~0.2 s (1/k). That is "the camera
  drops behind the truck when the game lags".

**Fix.** `updateCamera(camera, vehicleState, dt, followDt)`:
- The chase follow uses `followDt`: its position lerp, pitch low-pass, and yaw and aim rate caps. That is the sim time
  the DRAWN truck advanced this frame. main.js gives the drawn pose an exact time:
  `_prevRenderT + alpha · (simTime − _prevRenderT)`, with `_prevRenderT` stamped where `_prevRenderPos` is copied.
  That covers a hold's snap to the physics pose too.
- Input, freecam, the look timers and the camp focus stay on wall time.
- At a healthy rate `followDt` = `frameTime` (the signed-off feel is unchanged). In slow motion it's the slower truck
  time; in a hold it's 0, and the truck is still too.

**Gate `test/camera-follow-clock.mjs`** (the real updateCamera, a truck at 25 m/s):

| frames | trail, now | trail, the wall-clock follow |
|---|---|---|
| 60 fps | 10.79 m | 10.79 m |
| PERF-32 slow motion (15 fps, one step each) | 10.79 m | 7.05 m |
| slow motion ↔ recovery every 2 s | 10.79 m steady | 7.05–10.77 m, dropping back on each recovery |
| bursty, a clamped 250 ms frame every 0.5 s | 9.12–10.65 m | identical |

The bursty dip is the exponential's own step: it takes the goal's end position for the whole frame, so a long frame
lands the camera nearer, never behind. Integrating it exactly would move the 60 fps trail by ~4 % (4.79 → 5.00 m of
lag at 25 m/s), and the feel is signed off.

**"Freezes in space": still not reproduced, by Spare's probe or mine.** In the real app under the loads above, the
camera never stayed still across a drawn frame while the truck mesh moved, and the truck stayed centred on screen. The
code has only two paths that hold the camera on a fixed point: the camp/service-screen focus (each holds the truck as
well, and each hands back on close) and freecam. If the owner sees it again, the sighting details Spare asked for
(camera mode, a menu/map/camp, a pad look) are what's owed.
