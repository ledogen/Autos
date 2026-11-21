---
id: BUG-238
type: bug
status: closed
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "If the truck is off, pressing the gas or shifting gears should also not disengage the parking brake. When it's off, the only thing that can toggle the parking brake is RB. When it's on, Shifting out of gear should still disable the parking brake (youll stall anyway if its accidental - signals i'm driving now)"
relates: DEC-435, DEC-289, DEC-255, DEC-431, DEC-363, FEAT-194, FEAT-294, src/park-brake.js, src/vehicle.js
---
lane: unplaced (scribe: lane B, vehicle input; Opus for the rule)

# BUG-238: Engine off: only the handbrake button toggles the parking brake

## Next steps
Closed into BUG-249 (owner 2026-11-20: "pretty sure i already asked for this"), which built the engine-off rule and carries the "shifting out of gear" question.

## Summary
With the engine off, the throttle and the gearbox must not release the latched parking brake. Only the handbrake button does. With the engine on, shifting out of gear still releases it.

Owner's words:
> If the truck is off, pressing the gas or shifting gears should also not disengage the parking brake. When it's off, the only thing that can toggle the parking brake is RB. When it's on, Shifting out of gear should still disable the parking brake (youll stall anyway if its accidental - signals i'm driving now)

### What the code does today
`stepParkBrake(parked, { tap, throttle, gearIn, speed, lock })` in `src/park-brake.js`: a latched brake lets go on another tap, the THROTTLE, or (manual) a shift that lands in a gear, unless a parked screen is up (`lock`). It never looks at whether the engine is running, so a stray gas press or a shift with the engine dead releases the brake. DEC-431 words the button by role: "the handbrake button" is RB in Professor and A in Ventura Highway; this ticket and its record use the role name.

## Description
(See Summary.)

## Tracker
- [x] (vehicle.js gates its inputs on the engine;) engine off: only the handbrake button (tap) toggles the latch
- [x] Engine on: throttle still releases; shifting out of gear releases (manual)
- [x] Unit check in `test/park-brake.mjs` for engine off x throttle and gear, engine on x shifts, in both pad layouts (the role, not the button)
- [ ] Owner has looked (carried on BUG-249)

## Open questions
- CONFLICT, DEC-289 (and DEC-024 which it carried over): "only throttle (or a gear on the manual, or reverse on the automatic, DEC-255) releases it". This request narrows it: with the engine OFF those no longer release. DEC-435 is written to sit on top of DEC-289 without superseding it; the owner confirms that reading.
- The code releases on a shift that LANDS in a gear (park-brake.js header: "a shift that lands in a gear"). The owner writes "Shifting out of gear should still disable the parking brake (you'll stall anyway if it's accidental - signals I'm driving now)". Those are opposite ends of a shift. Which one: out of gear (neutral), into a gear, or any shift of the lever?
- The automatic's reverse pedal (DEC-255) with the engine off: also no release? The scribe assumes yes (engine off = only the handbrake button).
- DEC-363 (the brake needs a stop) and DEC-431 (a parked screen locks the brake) are unaffected.

## Links
FEAT-194 (the parking brake), FEAT-294 (Ventura Highway layout).

## Files
`src/park-brake.js` · `src/vehicle.js` (the caller) · `test/park-brake.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-20: built as BUG-249 on land/gearbox-1120 (engine off: only the handbrake button; park-brake gate §8). Closed into BUG-249.
