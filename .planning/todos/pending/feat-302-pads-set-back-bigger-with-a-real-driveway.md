---
id: FEAT-302
type: feature
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "I think we could rework pads in general to move the pad back a little bit, increase its size a little bit, and then actually build a driveway. I'm only talking pushing the pad back maybe two, three meters. I think when you get away from the road a little bit, you can take a lot more freedom with the pad making Without doing too much earthwork and then connecting it with a driveway or something It would also be a little more fun to drive on occasion. Some POIs have parking lots, so you have to think of how the driveway should logically attach to the parking lot so that you can access all the spaces."
relates: DEC-440, BUG-243, BUG-214, FEAT-71, FEAT-294, src/poi.js, src/terrain-physics.js, src/road-carve.js
---
lane: engine & world (world-gen; Opus)

# FEAT-302: Rework POI pads: set back 2-3 m, a little bigger, a real driveway; parking lots get a logical driveway

## Next steps
A lane first writes a short design note and a before-and-after screenshot sheet over 6 random seeds (a house, a gas station, an auto shop, a parking-lot POI), then builds. The owner picks the sizes (needs numbers) before the build.

## Summary
Owner's words:
> I think we could rework pads in general to move the pad back a little bit, increase its size a little bit, and then actually build a driveway. I'm only talking pushing the pad back maybe two, three meters. I think when you get away from the road a little bit, you can take a lot more freedom with the pad making Without doing too much earthwork and then connecting it with a driveway or something It would also be a little more fun to drive on occasion. Some POIs have parking lots, so you have to think of how the driveway should logically attach to the parking lot so that you can access all the spaces.

### The scribe's reading
- Move every POI pad back from the road by about 2 to 3 m ("I'm only talking pushing the pad back maybe two, three meters").
- Make the pad "a little bit" bigger.
- Connect the pad to the road with a real driveway (a short paved or dirt strip, with a gradient the truck can climb), not a pad butted to the shoulder. Reason given: away from the road the terrain tolerates more freedom with little earthwork, and it is "a little more fun to drive on occasion".
- Parking-lot POIs: the driveway must attach so that every space is reachable (a lot with one entry drives a loop or a spine, not a dead-end past one row).

BUG-243 (the service station's pad) is the first case of the same thing.

## Description
(See Summary.)

## Tracker
- [ ] Design note: setback, size increase, driveway shape (width, grade limit), lot connectivity rule
- [ ] Screenshot sheet before / after over random seeds for the owner
- [ ] Pads sit 2-3 m further from the road; a little bigger (the number the owner approves)
- [ ] Every pad has a driveway; the earthwork stays low
- [ ] Parking-lot POIs: every space reachable from the driveway (a gate checks reachability)
- [ ] BUG-243 closes with it, or separately
- [ ] MESH == PHYSICS; fingerprint-world shows only the pads
- [ ] Owner has looked

## Open questions
- CONFLICT to check, BUG-214 (pads and camp pads make spiky walls on the perimeter) and FEAT-71 (POI satellite placement: lawn furniture and yard clutter placed around a POI). Moving the pad changes the zone those solvers fill; the owner or builder confirms they are reworked with it.
- DEC-068 (junction pads weld to ribbons) is about ROAD junction pads, a different object; it does not govern POI pads. Not a conflict.
- Which POI types get a driveway: all, or only the ones with a pad (houses, gas, auto shop, shops, lots)? And the dirt-road case (feat-dirt-roads).
- Numbers: setback is "two, three meters" (the owner), size "a little" (unspecified: +10 %? +20 %?), driveway width and grade (unspecified).

## Links
BUG-243, BUG-214, FEAT-71. Needs a sweep and a screenshot sheet (feedback_screenshots_for_worldgen_calls).

## Files
`src/poi.js` · `src/terrain-physics.js` · `src/road-carve.js` · `test/poi-*.mjs` · `test/fingerprint-world.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
