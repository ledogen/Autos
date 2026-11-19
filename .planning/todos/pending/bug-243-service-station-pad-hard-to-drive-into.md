---
id: BUG-243
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "Could we scoot the service station over or align its pad height to the road so that it's easier to drive into?"
relates: FEAT-302, BUG-214, FEAT-71, ASSET-82, FEAT-178, src/poi.js, src/terrain-physics.js
---
lane: engine & world (world-gen; Opus)

# BUG-243: The service station is hard to drive into: scoot it or match its pad height to the road

## Next steps
A lane measures the step between the road and the service bay's pad over random seeds (height difference, slope into the bay) and picks the smaller fix: move the building, or blend the pad's height to the road. FEAT-302 (pad rework) may absorb it.

## Summary
Owner's words:
> Could we scoot the service station over or align its pad height to the road so that it's easier to drive into?

Which POI: the scribe reads "service station" as the AUTO SHOP (the two-car service bay with a lift, ASSET-82 "The service station", `src/poi.js` autoShop), not the gas station (pumps). The owner says "drive into", which is what you do on the bay's lift. FLAGGED: confirm. A gas station would be the pump pad.

## Description
(See Summary.)

## Tracker
- [ ] Measured: pad-to-road height step and the approach slope at auto shops, over 200 random seeds
- [ ] The pad's height matches the road at the entry, or the building moves, so the truck rolls in without a lip
- [ ] MESH == PHYSICS holds (terrain-physics mirror)
- [ ] Owner has looked

## Open questions
- Which POI is "the service station": the auto shop (the scribe's reading) or the gas station? Confirm.
- Overlap with FEAT-302 (the pad rework: pad back 2-3 m, a driveway). If the driveway ships, this may close with it; the owner or the orchestrator decides to merge them.
- Related, no conflict: BUG-214 (pad and camp pads make spiky walls on the perimeter) and DEC-228 / DEC-296 (bay light) are separate.

## Links
FEAT-302 (pad rework); BUG-214; FEAT-71 (POI satellite placement).

## Files
`src/poi.js` · `src/terrain-physics.js` · `src/terrain.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
