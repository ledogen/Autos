---
id: DEC-435
status: standing
decided: 2026-11-19
area: physics
governs: BUG-238, FEAT-194, src/park-brake.js, src/vehicle.js, parking brake, handbrake
supersedes: 
---

# DEC-435: Engine off, only the handbrake button toggles the parking brake

**Ruling.** "If the truck is off, pressing the gas or shifting gears should also not disengage the parking brake. When it's off, the only thing that can toggle the parking brake is RB. When it's on, Shifting out of gear should still disable the parking brake (youll stall anyway if its accidental - signals i'm driving now)"

**Why.** Taps on a dead truck must not roll it off. "RB" is the handbrake button of the Professor layout; in Ventura Highway (DEC-431) the same role is A. The record is written by the role, "the handbrake button".

**Replaces.** Narrows DEC-289 / DEC-024 / DEC-255 for the engine-off case only (they say throttle or a gear releases it). Not superseded: with the engine on they stand.

**Source.** Owner, inbox note 2026-11-19 (06:31). Owner's words.
