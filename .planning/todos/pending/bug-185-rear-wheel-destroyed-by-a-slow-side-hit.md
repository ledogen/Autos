---
id: BUG-185
type: bug
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I smacked the rear wheel into a tree and it gave out. I would like it to be a little bit more resistant to getting destroyed. That was maybe a 10 mile an hour side impact maybe 20. I'm just wanting a little bit more forgiveness there. Maybe take a look at where the bedside collision is versus the wheel. If the bedside is flush with the wheel, maybe pop it out A dozen centimeters or so and that could help alleviate the issue."
relates: src/damage.js, src/physics.js, data/ranger.js
---
lane: unplaced (physics, Opus)

# BUG-185: A 10 to 20 mph side hit on a tree destroys the rear wheel

## Next steps
A physics lane: measure where the bed side sits against the wheel face, then the wheel's side-impact threshold.

## Summary
A slow side impact on a rear wheel destroyed it. The owner wants more forgiveness and suggests checking whether the bed side's collider is flush with the wheel; if so, move it out about 12 cm so the body takes the hit first.

## Tracker
- [ ] Measured: bed-side collider against the wheel's outer face, front and rear
- [ ] Body takes a side hit before the wheel where the real truck's would
- [ ] A 10 to 20 mph side hit on a tree no longer destroys a healthy wheel; numbers before and after
- [ ] Wheel damage from a hard hit still happens

## Log
- 2026-11-16: filed from the owner's inbox note.
