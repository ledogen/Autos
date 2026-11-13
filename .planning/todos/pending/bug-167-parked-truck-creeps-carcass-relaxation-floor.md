---
id: BUG-167
type: bug
status: open
severity: major
opened: 2026-11-13
source: Perf lane, 2026-11-13 — found while testing PERF-45 §1 (a memo for the parked ground query could never hit, because a parked truck is never still)
relates: PERF-45, PERF-48, FEAT-194, src/tire.js
---
lane: B

# BUG-167: A parked truck creeps downhill — the tire's carcass spring leaks at rest

## Next steps
Owner: rule on `bug167-creep` (fix it, or leave it). Lane B builds on a yes.

## Summary
With the handbrake on, a parked truck slides 0.4–6.7 mm/s downhill: about 20 cm over a 30 s park on a 17° slope.
The tire model's carcass deflection (the sideways and fore-aft stretch of the tire that carries a static load)
bleeds away at rest, so the tire has to keep sliding to keep holding the truck. A real parked truck does not move.

## Description
### Cause
The carcass relaxation divisor in `src/tire.js` is `1 + dt·vCon/L`, and `vCon` has a floor at
`SLIP_EPSILON = 0.05 m/s`. At zero speed that floor still relaxes the stored deflection, at about 0.17 per second.
Holding force then needs continuous slip.

### Measured (Perf lane, wip/perf-45/park-probe3.mjs in the perf worktree)
Headless world rig with the game's own contact query. Nine road spots on the three bench seeds, slopes 2–17°,
handbrake on, 1200 steps. Over the last 600 steps the chassis quaternion, strut compressions and hub positions
changed on every step at all nine spots. Each hub moves 1e-8 to 1.4e-4 m per step. Creep 0.4–6.7 mm/s.

### What a floor change alone does
With the floor lowered to 1e-4 and to 1e-7 (temporary edit, reverted) the creep stops, but the body then rocks:
spin up to 2e-3 rad/s, hubs moving up to 0.44 mm per step. So the fix needs a damping term for the carcass at
rest, not only a smaller floor, plus a feel check that low-speed behaviour (parking, crawling, the launch) is
unchanged.

### Why it matters beyond honesty
FEAT-194 stops the clock while the parking brake is latched, so a player may sit parked on a slope for a long
time. PERF-45 §1 (about 33 ms/s of parked physics) also cannot be memoised while the truck never comes to rest.

## Tracker
- [ ] Owner ruling on `bug167-creep`
- [ ] A parked truck on a 17° road holds within 1 mm over 60 s, handbrake on
- [ ] No rocking at rest: hub motion per step below 1e-6 m after settling
- [ ] Low-speed gates unchanged or re-baselined with the reason stated; physics fingerprint diff explained
- [ ] The complete model is stated, with any approximation flagged

## Open questions
- Fix now, or leave it (20 cm per 30 s on the steepest slopes; millimetres on ordinary ones)?

## Log
- 2026-11-13: filed from the Perf lane's PERF-45 §1 finding.
