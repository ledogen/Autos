---
id: BUG-249
type: bug
status: closed
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
- [x] Engine on, manual: a shift landing in a gear releases it (DEC-435, owner 2026-11-20; §4)
- [ ] Owner has driven it

## Decisions
- 2026-11-20, owner: "gate the automatic brake release on an action that actually moves the truck".
- 2026-11-20, owner (chat, on whether a manual shift into gear still releases it): "shifting with engine on should release the brake. either you stall and the engine holds the truck on an incline or there is enough rotational energy to get the truck moving." DEC-435 stands as built; pinned by park-brake §4 (engine on, landing in 1st / R releases) and §8 (engine off, it does not).

## Files
`src/vehicle.js` · `src/park-brake.js` (header) · `test/park-brake.mjs`

## Log
- 2026-11-20: built on land/gearbox-1120; park-brake gate all green incl. §8.
- 2026-11-20: 1698b8bf — the smoke's Ventura roll-off starts the engine first (a story teleport seats a dead truck, FEAT-33; a driven arrival has it running). SMOKE_STEPS=boot,pad green: mom's card, offer, shop, pump all let go on the gas.
- 2026-11-24: CLOSED. Owner drove it, card gearbox-shift-time-drive: "Good" (shift time 0.35 s and the parking brake rules stand as built).
