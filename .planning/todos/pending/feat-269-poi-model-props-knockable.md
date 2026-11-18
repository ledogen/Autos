---
id: FEAT-269
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Post Alpha Ticket to expand rigid body props to assets that are currently POI models. Obviously the structures themselves don't need to have physics, …"
relates: FEAT-251, FEAT-71, FEAT-103, ASSET-71
---
lane: unplaced

# FEAT-269: The smaller props on POI models get rigid bodies (post-alpha)

## Next steps
Post-alpha (MILESTONES Later list). Nothing to build for the alpha.

## Summary
Extend the knock-over props from lawn furniture (FEAT-251) to the small loose props that are part of POI models: the expedition camp, the canoe at the fishing store, and similar. Buildings stay static. Owner: post-alpha.

## Description
Owner's words, verbatim (inbox 20261117234740-i77v):

> Post Alpha Ticket to expand rigid body props to assets that are currently POI models. Obviously the structures themselves don't need to have physics, but it would be cool if all of the smaller props around the expedition camp could be knocked over or the canoe At the fishing store, etc.

## Tracker
- [ ] The structures themselves stay without physics
- [ ] The smaller props around the expedition camp can be knocked over
- [ ] The canoe at the fishing store can be knocked over
- [ ] Other POI models get the same treatment where they carry small props

## Decisions

## Open questions
- Which props per POI count as "small" and are split out of the POI .glb (a per-model list)?

## Links
FEAT-251 (lawn furniture knocks over, closed), FEAT-71, FEAT-103

## Files
src/poi.js · src/model-service.js · the POI .glb files

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261117234740-i77v).
