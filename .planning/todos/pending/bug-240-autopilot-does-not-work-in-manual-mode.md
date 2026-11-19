---
id: BUG-240
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "The autopilot doesn't work in manual mode"
relates: FEAT-293, DEC-428, DEC-084, src/autopilot.js, src/drivetrain.js, src/clutch-assist.js
---
lane: unplaced (scribe: free lane; Opus for the drivetrain side)

# BUG-240: The debug Driving AI does not work with the manual transmission

## Next steps
A lane reproduces it (debug panel, Driving AI, manual gearbox) and decides the smallest fix: the AI shifts and works the clutch itself, or the AI forces the automatic for its drive.

## Summary
The autopilot (debug panel, "Driving AI", FEAT-293 / DEC-428) does nothing useful when the truck has the manual transmission.

Owner's words:
> The autopilot doesn't work in manual mode

Why the scribe thinks so (not verified): `src/autopilot.js` is "state in, controls out" for throttle, brake and steer, built for the automatic; a manual needs gear selection and clutch from the controls too.

## Description
(See Summary.)

## Tracker
- [ ] Reproduced on a manual
- [ ] The AI drives a manual (shifts and clutch from its controls) or sets the gearbox to automatic for its drive and restores it
- [ ] A headless check in the autopilot gate with a manual drivetrain
- [ ] Owner has looked

## Open questions
- Which fix: the AI really drives a manual (shifts itself; AI cars later will need that for any truck), or it takes the automatic? DEC-428 says it "takes control of my vehicle until I give an input" and DEC-084 grows it into AI cars, so the scribe would lean to the first; owner's call.

## Links
FEAT-293.

## Files
`src/autopilot.js` · `src/drivetrain.js` · `src/clutch-assist.js` · `test/autopilot.mjs` (check the gate name)

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
