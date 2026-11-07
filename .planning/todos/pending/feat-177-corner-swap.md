---
id: FEAT-177
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06 playtest (relayed verbatim by the orchestrator)
relates: src/recovery.js (spare change, spareFitHours), src/service.js (fitLabour)
---
lane: B

# FEAT-177: Swap two mounted tires (a corner swap) without a spare

> There's currently no way to swap the positions of two mounted tires on the vehicle unless you have a spare. I
> think we should allow players to just perform a Corner Swap for2x the time that it takes to change a tire.

## Acceptance
- [ ] Parked, the player can pick two corners and swap their wheels (tire, wheel condition, flat state travel with them).
- [ ] It takes 2 × the time of one tire change.
- [ ] Pinned in a node gate (the two corners' state exchanged, the clock advanced).
