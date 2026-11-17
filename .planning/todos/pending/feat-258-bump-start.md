---
id: FEAT-258
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117100618-vea0) — "You should be able to bump start your car in neutral. The way we can handle this is if the engine speed is already above 300 rpm when you press the starter it will just instantly start the engine. You don't have to hold it for the minimum cranking time."
relates: FEAT-33, FEAT-120, FEAT-162, src/ignition.js, src/drivetrain.js, DEC-374
---
lane: B

# FEAT-258: Bump start — already turning above 300 rpm, the key press starts the engine

## Next steps
Built on `land/machine-1117` (machine lane p), awaiting landing. Owner: try it on the drive card machine-1117-look.

## Summary
Pressing the starter while the engine already turns faster than 300 rpm (rolled in gear with the clutch biting, or still
spinning down after a shutoff) starts it on that press, with no crank time.

## Description
### The honest model, before the rule (measured, wip/machine-1117/honest.mjs)
Rolling in 2nd at 10 mph with the key off and the clutch biting, the wheels already turn the engine (942 rpm; drivetrain.js
"dead engine in gear" branch, with its compression drag on the rear axle). Holding the key then started it after the
normal 0.27 s catch time, but during the crank the starter's lag pulled the engine DOWN from ~940 to 511 rpm and the
engine's drag left the wheels. Both are wrong physically: a starter's overrunning clutch cannot slow an engine the wheels
drive. So the model already allowed a bump start, by holding the key; what the rule adds is no crank time and no rpm dip.
### Built
- `src/ignition.js`: on a fresh press from OFF, engine speed (last step's `drivetrain.engineRPM`) above
  `ignitionBumpStartRPM` (300, data/ranger.js) → RUNNING at once, event `catch`. A seized engine or an empty tank never.
- The starter's own spin does not count: crank speed is 450 rpm, above the 300, so a released crank marks the spin
  (`starterSpin`) until it falls below 300. Without that, tap-release-tap would start a worn engine at once.
### Not built (flagged)
- "In neutral": in N the engine is not coupled to the wheels, so it is only above 300 rpm while spinning down after a key-off
  (~1 s from idle, engineOffRpmLag 0.7 s). Rolled in gear with the clutch biting is the real bump start.
- The crank-in-gear dip above (engine pulled to crank speed while the wheels drive it) is unchanged below 300 rpm. The
  honest fix: while cranking with the clutch biting, the engine follows the faster of the starter and the wheels, and drags.
- An engine bump-started between 300 and 450 rpm with the clutch biting is under `stallRPM` (450) and can stall on the next step.
- An automatic: this Ranger's boxes have no rear pump, so a real one cannot be push-started; here a key-off coast keeps
  the engine above 300 rpm through the converter, so the press starts it.

## Tracker
- [x] Engine above 300 rpm at the press: running on that step (gate ignition-starter §8)
- [x] Below 300, seized, empty tank, or the starter's own spin: cranks as before (§8)
- [x] End to end: rolled in 2nd, key off, one press, it pulls (gate manual-gearbox §15)
- [ ] Owner drive

## Decisions
- 2026-11-17, owner: the ruling in `source:` (DEC-374).

## Files
`src/ignition.js` · `data/ranger.js` · `test/ignition-starter.mjs` · `test/manual-gearbox.mjs`

## Log
- 2026-11-17: built 61fa456e (land/machine-1117). ignition-starter, manual-gearbox green; fingerprint-physics identical.
