---
id: BUG-168
type: bug
status: open
severity: major
opened: 2026-11-13
source: owner, 2026-11-13 (inbox) — "Not sure if this is a bug or if it just hasn't been built yet, but I've noticed you can't die from impact"
relates: FEAT-146 (the run ends), SM-INV-1, src/damage.js (`fatalMphBare` 60, `fatalMphFull` 100, `fatalEnabled`), src/main.js (`_endRun('crash')`)
---
lane: B

# BUG-168: The owner cannot die from an impact — the fatal-crash rule exists but does not fire in play

## Next steps
Lane B reproduces it headless: drive the truck into a wall, a tree and a building at 50 / 70 / 90 / 110 mph and log the equivalent speed the damage model computes for each hit.

## Summary
Death by impact is built. A hit at or above a fatal equivalent speed ends the run: 60 mph into a bare panel, rising linearly to 100 mph into a panel with full armor. The owner reports never dying from an impact, so either the threshold is out of reach in real play or the speed the model computes for a hit is too low.

## Description
### What exists
`src/damage.js`: `fatal = fatalEnabled && v >= fatalMph(armorBefore)`, where `v` is the hit's equivalent speed and `fatalMph` runs 60 → 100 mph with the panel's condition before the hit. The first fatal hit is stored and the frame loop ends the run with `_endRun('crash')` in story mode.

### Suspects, in the order to check
1. **The equivalent speed reads low.** `v` comes from the contact impulse, not the speedometer. A glancing hit, a hit that the body rides up, or a prop that breaks away may never reach 60 mph equivalent.
2. **Full armor makes it 100 mph**, which the truck rarely holds off-road. A fresh truck may simply be unkillable in practice.
3. **The hit lands on a region with no fatal check** (wheels, underbody), or the run-end is suppressed in a state the owner was in (free roam, the tutorial).

## Tracker
- [ ] Table: object × speed → equivalent speed, fatal or not
- [ ] Cause named
- [ ] Fix or a threshold proposal for the owner
- [ ] A gate: a head-on at a stated speed into a rigid wall is fatal

## Open questions
- Where and at what speed did it happen? Free roam and the tutorial never end a run, by design.

## Log
- 2026-11-13: minted from the owner's inbox by the orchestrator. Nothing built.
