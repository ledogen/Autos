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
- [ ] Owner has looked

## Decisions

## Open questions

## Links

## Files
src/poi.js, data/prop-models.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's inbox.
- 2026-11-18 land/feat-290-pit-cap: `yardMax` field on a pool entry (firePit 1), enforced in dressYard; poi-yard gate pins it (fails with the cap removed). Fingerprint vs main: only the poi component of seed6 origin story differs (yard contents). Part 2 list on owed card; sheet wip/feat-290/candidates.jpg.
