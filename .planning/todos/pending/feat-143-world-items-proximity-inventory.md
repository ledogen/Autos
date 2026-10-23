---
id: FEAT-143
type: feature
status: open
severity: minor
opened: 2026-10-22
source: owner, 2026-10-22 — "I plan on taking a lot of the in game items and placing them in the world in 3d. We already did the modeling work and it should be simple enough to build colliders for them. I actually think we could have an area-based inventory system so if you drop an item it goes onto the ground and you can also pick up items from the ground. This would allow us to spawn collectible items randomly in the world or allow them to drop from certain events"
relates: FEAT-122 (inventory), FEAT-121 (item tracker), items.md "New idea, not ruled" (proximity inventory, 2026-10-21), feature/stranded-spare (the first item model in the world)
---

# FEAT-143: World items — drop to the ground, pick up from it

## Why

Every inventory item already has a real-size Blender model: the thumbnail builders in
`assets/models/src/items.py`. feature/stranded-spare proved the path from thumbnail to world object
with the spare tire. `items.py export_glb()` lays a builder in its rest pose and writes
`assets/models/<file>.glb`. `src/debris.js` then hulls the render mesh, thinned by `thinHull` to the
engine's limit, so no hand-built collider is needed. The owner wants to use that for an
**area-based (proximity) inventory**: drop an item and it lands on the ground as a physics body, and
pick up items lying near the truck. That opens the way to random collectibles in the world and to
items dropped by events.

## Open design questions (owner's to answer — none ruled)

- Pick-up gesture and reach: park near it, or drive over it? What radius?
- Does a dropped item persist: across a sleep, across leaving the area, in the save? (SM-INV and
  cold-generation rules: world spawns must come from the seed, while a player's drop is player state.)
- Random world spawns: which items, how often, and where (roadside, POI yards)?
- Event drops: which events?
- CLAUDE.md and items.md say most items are 2D art only, with no world presence. This ticket
  reverses that, so both docs need a line once it is ruled.

## Acceptance

- To be written once the questions above are ruled.
