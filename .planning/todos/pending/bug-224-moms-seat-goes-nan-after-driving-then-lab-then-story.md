---
id: BUG-224
type: bug
status: open
severity: major
opened: 2026-11-18
source: FEAT-293 close-out agent, 2026-11-18
---
lane: engine & world

# BUG-224: Drive about 150 m, visit the lab, start a story run: the truck's state goes NaN at mom's seat

## Next steps
Fix built (Decisions, Log). The orchestrator lands `land/bug-224-nan-seat` after its main smoke.

## Summary
The truck's state becomes NaN (not-a-number, the result of an undefined calculation): strut compression reads about 3e5 m, then the velocity from the engine is NaN. Parking at mom's then opens no camp panel.

## Description
Found while chasing a smoke failure on the driving-AI branch. It is not the AI: driving the same 150 m by hand fails the same way. Moving the truck back to where it started before the lab visit avoids it, which is what the smoke step now does. A player can plausibly hit this: free roam drive, lab, then a story run.

## Tracker
- [x] Reproduced without the smoke's re-seat (wip/bug-224/diag1.log)
- [x] Cause found (the lab exit's seat waits on a network build while the sim steps the truck at the lab pose)
- [x] What survived the launch named (diag3: params._bodyOther torque NaN, not the engine world)
- [x] Fix and a gate (`step-carry-reset`), physics fingerprint identical

## Decisions
- Cause (diag1, 2026-11-18): exitLab swaps the world back at once, but its seat (`_reseatTruckAtSpawn`, override = the
  last teleport point) first awaits `netClient.buildNow` because the truck had streamed the network 150 m away. For
  ~1.1 s the sim steps the truck at the LAB pose (-27, 0.6, 51) against real ground at 196 m: 400 m/s, y 142 km, strut
  18 m. The seat then lands it finite, but the engine world keeps something from the launch and mom's seat goes NaN.
  Without the 150 m drive the build is a no-op and the seat lands before a step: why the smoke workaround hid it.
- Fix planned: hold the sim while any seat is in flight (a pending-seat counter in `_reseatTruckAtSpawn`, read by
  `_heldPause`), so no caller can step a pose against a world that does not match it; plus one finite guard at
  physics.js Step 3e (engine read-back: keep the last finite pose, zero the motion, console.error once).

- Survivor (diag2/diag3, 2026-11-18): NOT the engine world (every body finite after the lab and before camp). It is
  `params._bodyOther`'s torque: NaN after the launch, and self-feeding (the in-step body copy's mounts go NaN, its
  torque reads NaN·0) while the parked truck looked fine; mom's seat woke it. makeVehicleState renews vehicleState only.
- Built: (1) `_seatsPending` counts every `_reseatTruckAtSpawn` (all callers go through it) and `_heldPause` holds
  the sim while it is above 0, decremented in a `finally`; buildNow never rejects (a failed/stale build resolves
  false, the seat lands on the analytic terrain). (2) `resetStepCarry(params)` (physics.js) clears `_bodyOther` and
  `_rockGripUp` at both seats (`_reseatTruckAtSpawnInner`, `_reseatOnRegionGround`). (3) Step 3e reads the engine
  into scratch; non-finite → keep the step-start pose, zero motion, one console.error.

## Open questions

## Links
FEAT-293.

## Files
src/main.js, src/stage.js, src/physics.js

## Log
- 2026-11-18 minted by the orchestrator.
- 2026-11-18 lane: reproduced + cause (diag1). Smoke: re-seat workaround removed, lab step asserts the truck stays finite
  and < 5 m/s after exit. src fix NOT yet written (agent stopped). Scratch: test/_diag224.mjs (delete before landing).
