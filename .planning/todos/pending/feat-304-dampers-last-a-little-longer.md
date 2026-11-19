---
id: FEAT-304
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "My dampers are not quite lasting as long as the springs. Bump their durability a little bit. On a standard jalopy, my springs are still at 50% and my dampers are at 9 and 13%."
relates: DEC-441, DEC-005, DEC-033, src/damage.js, FEAT-284
---
lane: lane B (damage.js; Opus for the number)

# FEAT-304: Dampers wear out faster than springs: bump damper durability a little

## Next steps
A lane reads `damage.js`, proposes a damper-wear change to bring dampers near the springs' wear on the same drive, and puts the number to the owner (he gave none).

## Summary
Owner's words:
> My dampers are not quite lasting as long as the springs. Bump their durability a little bit. On a standard jalopy, my springs are still at 50% and my dampers are at 9 and 13%.

The owner's one data point: on a standard jalopy, springs at 50 %, dampers at 9 % and 13 % (front and rear, presumably). That is n = 1: per feedback_no_rebalance_from_n1 it is a direction, not a calibration. The ask is "a little bit", no number.

### Current constants (`src/damage.js`)
- Dampers: `durDamper: 1.2e3` ((m/s)·s per axle) and `damperVelFloor: 0.10` m/s (only near-static motion is free).
- Springs (event-priced from bump-stop force): `springBumpRefDmg: 0.022` (one corner's loss at the reference slam), `springBumpExp: 0.6`, `springBumpRefNFront: 31500` N, `springBumpRefNRear: 21000` N.
- Precedent: FEAT-284 (tires last 20 % longer).

## Description
(See Summary.)

## Tracker
- [ ] The owner names "how much" (a percent, e.g. 20 % longer like FEAT-284, or a target ratio against springs)
- [ ] `durDamper` (and/or the floor) changed; spring numbers untouched
- [ ] A damage gate confirms damper life up by the agreed factor and springs unchanged
- [ ] Owner has looked (one drive on the same jalopy)

## Open questions
- HOW MUCH? The owner says "a little bit". Candidate: 20 % longer (as FEAT-284 did for tires: raise `durDamper`'s life by 1.2, i.e. divide the per-use wear by 1.2), or a bigger bump if he wants dampers to track springs. The scribe recommends 20 % first, then a second look. Owner's call.
- No conflict: DEC-005 (wear on time and intensity) and DEC-033 (one damage framework) hold the framework; this changes one constant. Not a damage-row change (that is FEAT-296's low damage).

## Links
FEAT-284 (tires 20 % longer).

## Files
`src/damage.js` (durDamper, damperVelFloor) · `test/damage-*.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
