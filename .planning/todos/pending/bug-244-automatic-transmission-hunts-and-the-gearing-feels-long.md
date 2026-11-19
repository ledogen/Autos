---
id: BUG-244
type: bug
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "The automatic transmission hunts and seeks really bad and to me it feels like the gearing is a little bit long. That could be realistic though. It has enough torque in first gear."
relates: DEC-205, DEC-255, FEAT-258, src/drivetrain.js, data/transmissions.js
---
lane: lane B (drivetrain; Opus)

# BUG-244: The automatic hunts and seeks between gears; the gearing feels a little long

## Next steps
A lane records a drive that shows the hunting (gear vs time, throttle, speed) on the real jalopy, then separates the two complaints: shift-logic hunting (a bug) and gear ratios (a tuning question for the owner).

## Summary
Owner's words:
> The automatic transmission hunts and seeks really bad and to me it feels like the gearing is a little bit long. That could be realistic though. It has enough torque in first gear.

Two separate things in one note: (1) the automatic hunts, i.e. it shifts up and down repeatedly instead of settling; (2) the gearing feels a little long (tall ratios). He adds that (2) "could be realistic though" and that first gear has enough torque. Hunting is the bug; gearing is a feel call and, on his own hedge, not yet a request for a change.

## Description
(See Summary.)

## Tracker
- [ ] Reproduced: log gear, throttle, speed, engine rpm on a drive where it hunts (the run logger or a headless drivetrain script)
- [ ] Cause named: shift points, the hysteresis band, kickdown (`shiftDownEff`, `kickdownRPM`, `kickdownDelay` in `src/drivetrain.js`), or converter slip
- [ ] Hunting fixed, with a headless gate on a steady-throttle cruise and a climb
- [ ] Gearing: the owner decides whether to change ratios (not built from n = 1)
- [ ] Owner has looked

## Open questions
- Gearing: "a little bit long ... could be realistic though". No change is asked. The scribe does not touch ratios; the owner says if he wants shorter gearing (DEC-205 covers the axle ratio as final drive, an alpha part).
- No conflict found; DEC-255 is about the automatic's reverse pedal only.

## Links
FEAT-258, FEAT-159.

## Files
`src/drivetrain.js` · `data/transmissions.js` · `test/drivetrain-*.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
