---
id: BUG-218
type: bug
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox)
---
lane: engine & world

# BUG-218: A missed shift grinds the gears with the engine not running

## Next steps
Built on `land/bug-218-grind-engine-off`; the owner tries it (a parked truck with the engine off shifts silently through every gear).

## Summary
A missed shift grinds the gears with the engine not running.

## Description
Owner: "You should not be able to grind gears on an engine that's not running."

## Tracker
- [x] Built
- [x] A gate or smoke step holds it
- [ ] Owner has looked

## Decisions
- The rule is physical, in `src/drivetrain.js` stepManual (the one source of `missShift`, so the grind sound, pad
  rumble, damage alert, −2 % wear and the run-log event all follow it): a shift with the clutch engaged grinds only
  when |input shaft − target gear's speed| > 100 rpm. The input shaft rides the flywheel (engine speed); the target
  gear turns with the output (axle × that gear's ratio, N = 0).
  - Engine off, parked: both shafts at rest, every gear selects cleanly.
  - Engine off, rolling, clutch engaged: still grinds (in N the stopped input shaft meets a turning output; in gear
    the wheels motor the dead engine at the old ratio). Clutch disengaged it is the synchro's job, accepted as before.
  - Engine running: grinds as before, except a clutchless shift rev-matched within 100 rpm now goes through.
  - Approximation: a shift TO N with the clutch engaged is judged by the same mismatch (N has no teeth to mesh).
- Found on the way: a dead engine in gear on a parked truck made the rears chatter ±1.2 rad/s (its drag, non-zero at
  0 rpm, was applied whole and flipped sign every step; tach read ~150 rpm). The drag is now capped at the torque
  that stops the rear axle in one step.

## Open questions

## Links

## Files
src/damage.js, src/physics.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
- 2026-11-18 built (d3282677): shaft-mismatch rule + dead-engine drag cap. manual-gearbox §16 holds it; fingerprint-physics identical to main. 41/41 affected gates green; pad-e2e ALL OK (load ~10-15); cdp-smoke green (load 12-15).
