---
id: FEAT-251
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Did I ever make a ticket about being able to crash into lawn furniture and it goes flying? The only thing I want players to actually collide with is the fire pit. Otherwise at a bare minimum we need to make them pass through everything else, but I'd rather it use the demolition system and spawn in a rigid body physics object when the player bumps into the lawn ornament. So it can have mass and hit the truck and tumble."
relates: FEAT-65, FEAT-71, src/demolition.js, src/debris.js
---
lane: unplaced

# FEAT-251: Lawn furniture gets knocked flying; only the fire pit is solid

## Next steps
A free lane (Opus): reuse the demolition system so a bumped lawn ornament becomes a rigid body with mass. The fire pit stays a fixed collider. Fallback if that is costly: everything but the fire pit is pass-through.

## Summary
Lawn furniture should tumble when hit, with real mass, instead of stopping the truck. Only the fire pit stays solid.

## Description
No earlier ticket covered this (searched 2026-11-17). Minimum bar from the owner: pass through everything except the fire pit.

## Tracker
- [ ] Fire pit is the only fixed lawn collider
- [ ] A bumped ornament spawns as a rigid body and tumbles
- [ ] Mass per ornament is realistic
- [ ] Body count and cost measured
- [ ] Owner has driven it
