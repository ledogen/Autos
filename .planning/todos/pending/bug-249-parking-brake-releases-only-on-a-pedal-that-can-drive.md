---
id: BUG-249
type: bug
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 (gearbox landing card) — "pretty sure i already asked for this but throttle application shouldnt release the parking brake if the engine is off. same with lt on automatic. basically gate the automatic brake release on an action that actually moves the truck"
relates: BUG-238, DEC-435, DEC-255, FEAT-194, src/vehicle.js, src/park-brake.js, test/park-brake.mjs
---
lane: A (land/gearbox-1120)

# BUG-249: The parking brake lets go only on a pedal that can drive the truck

## Next steps
Lands with land/gearbox-1120. Then the owner drives it: engine off, W / RT / LT leave the brake on; manual in N or clutch in, W leaves it on.

## Summary
The latched parking brake let go on the throttle (and, on the automatic, the reverse pedal) whatever the engine and gearbox were doing, so a tap on a dead truck released it. Now the pedal releases it only when it can move the truck. This is the owner's earlier BUG-238 (DEC-435) plus the gear and clutch half.

## Description
The release condition (src/vehicle.js, fed to `stepParkBrake` as `throttle`):
- engine running (ignition `running`, not seized), AND
- automatic: W / RT, or S / LT at rest as the reverse pedal (DEC-255). The box is always in D or R while running.
- manual: W / RT with a gear in (not N, not mid-shift) and the clutch out past `clutchShiftMax` (0.15, the shift rule's "clutch in" line). With the clutch assistant on, that is the moment it bites as the revs rise.

A manual shift landing in a gear still releases it with the engine running (DEC-435: "Shifting out of gear should still disable the parking brake"), and no longer with it off. The Space tap / handbrake button always toggles it.

## Tracker
- [x] Engine off: W, RT, the automatic's LT and a manual shift into gear leave the brake set (test/park-brake.mjs §8)
- [x] Engine on, manual: W in N or with the clutch held in leaves it set; in gear with the clutch out W releases (§8)
- [x] Engine on, automatic: W / RT / LT-reverse release as before (§2b, §3 unchanged)
- [ ] Owner has driven it

## Decisions
- 2026-11-20, owner: "gate the automatic brake release on an action that actually moves the truck".

## Open questions
- DEC-435 keeps "shifting out of gear" as a release with the engine on, and the code releases on a shift that LANDS in a gear (clutch in, so it does not move the truck by itself). Does a gear landing still release it, or only a pedal that drives? Kept as it was (DEC-435 stands) until the owner says.

## Files
`src/vehicle.js` · `src/park-brake.js` (header) · `test/park-brake.mjs`

## Log
- 2026-11-20: built on land/gearbox-1120; park-brake gate all green incl. §8.
