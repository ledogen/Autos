---
id: FEAT-290
type: feature
status: open
severity: minor
opened: 2026-11-18
source: owner, 2026-11-18 (inbox)
---
lane: free lane

# FEAT-290: At most one fire pit per house yard; more yard props from the item models

## Next steps
(1) Cap fire pits at one per yard in the yard solver. (2) List every item model made for thumbnails that would read as yard clutter (shovel, pallet, …) with its tri count and whether it meets the 1000-tri floor and the art style; propose the set to the owner before adding any to a pool.

## Summary
At most one fire pit per house yard; more yard props from the item models.

## Description
Owner: "Houses should not be allowed to have more than one fire pit in their lawn furniture. Also, we should probably add a Bunch of new props for the lawn furniture. Look through items that we modeled for thumbnails like the shovel, a palette, etc."

## Tracker
- [x] Built (part 1: the pit cap; part 2 is the owner's pick, owed card feat290-yard-props-pick)
- [x] A gate or smoke step holds it (test/poi-yard.mjs, 150 seeds)
- [x] Owner has looked

## Decisions
- 2026-11-19, owner (card feat290-yard-props-pick): choice "I'll list which in the note box"; note: "And all the ready ones make the garden fountain, the sculpture, the vase, and the high lift much rarer than the other items. For the max of one per yard. Kill the dead campfire." Recorded as DEC-447.

## Open questions
- Reading of "Kill the dead campfire": leave it out of the yard pool (scribe's reading), or delete `campfire-dead.glb`? (ASSET-90 shipped it; the owner approved its look on 2026-11-17.)
- "The sculpture": both sculpture-a and sculpture-b? "Max of one per yard": one of each of the four types, or one in total from that group?
- The owner wrote nothing on the NEEDS-WORK items (shovel, cooler, bike pump); they stay out until models exist.

## Links

## Files
src/poi.js, data/prop-models.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
- 2026-11-18 land/feat-290-pit-cap: `yardMax` field on a pool entry (firePit 1), enforced in dressYard; poi-yard gate pins it (fails with the cap removed). Fingerprint vs main: only the poi component of seed6 origin story differs (yard contents). Part 2 list on owed card; sheet wip/feat-290/candidates.jpg.
- 2026-11-19: owner answered part 2 (DEC-447). Scribe's reading: every READY item on the card (jerry can, tire, hi-lift jack, firewood bundles, garden fountain, sculptures A and B, ornate vase, small pallet, the farm barrels and crates shared with houses) becomes a yard prop; the fountain, the sculptures, the vase and the hi-lift jack are much rarer than the rest and capped at one per yard (`yardMax` 1); campfire-dead.glb is out of the yard pool. Uncertain: "Kill the dead campfire" could mean (a) leave it out of the yard pool (the scribe's reading, matches the card's "probably no") or (b) delete the model. Also "the sculpture": both sculpture-a and sculpture-b, or one of them. "max of one per yard": one each of those four types, or one in total from the rare group. Not built.
