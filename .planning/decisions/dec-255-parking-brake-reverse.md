---
id: DEC-255
status: standing
decided: 2026-11-15
area: physics
governs: FEAT-194, src/vehicle.js, src/park-brake.js, test/park-brake.mjs
supersedes: 
---
# DEC-255: Automatic: reverse from a parked stop releases the parking brake; manual: brake never does

**Ruling.** "for an auto box I would like holding reverse from a parked state to release the parking brake automatically. For manual transmission vehicle holding S or left trigger should not release the parking brake from a stop." On the automatic, S / LT at rest is the reverse pedal and counts as gas for the latch; on the manual it is only a brake.

**Why.** FEAT-194's "brake pedal never releases" left the automatic unable to back out of a parked spot without a Space tap.

**Replaces.** FEAT-194 part 1 for the automatic only (the manual and the park lock are unchanged).

**Source.** Owner, 2026-11-15 inbox / owed card. Owner's words.
