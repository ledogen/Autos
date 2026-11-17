---
id: BUG-196
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117110130-qnfh) — "When you're already rolling backwards in first gear, it's really hard to switch into reverse. I think it prevents you from making the shift."
relates: FEAT-126, FEAT-185, src/drivetrain.js
---
lane: B

# BUG-196: The manual refuses reverse while rolling backwards

## Next steps
Fixed on `land/machine-1117` (machine lane p), awaiting landing. Owner: try it on the drive card machine-1117-look.

## Summary
The manual gearbox refused R at any speed above 2 km/h in EITHER direction, so a truck rolling back on a hill in 1st
could not be put in reverse. Now R is refused only rolling forwards.

## Description
Root: `stepManual` in src/drivetrain.js tested `Math.abs(vForward) > REV_THRESHOLD` (0.556 m/s). Reproduced in the gate
before the fix: rolling back at 1.46 and 3.96 m/s in 1st, two presses (1st → N → R) landed in N.
Fix: `vForward > REV_THRESHOLD`, so a forward roll still refuses R and a backward roll takes it. 1st while rolling forwards
from R was never guarded (gate case added). No other reverse lockout exists (clutch-assist forwards the request as is).
Flagged: the synchro now takes R at any backward speed; a real M5OD's reverse is not synchronised and grinds unless near
rest in either direction. That is the owner's call.

## Tracker
- [x] 1st → R accepted rolling backwards at 3.4 and 8.9 mph (gate manual-gearbox §6)
- [x] R still refused rolling forwards at 18 mph; R → 1st accepted rolling forwards (§6)
- [ ] Owner drive

## Files
`src/drivetrain.js` · `test/manual-gearbox.mjs`

## Log
- 2026-11-17: fixed 60cfe72b (land/machine-1117). manual-gearbox green; fingerprint-physics identical.
