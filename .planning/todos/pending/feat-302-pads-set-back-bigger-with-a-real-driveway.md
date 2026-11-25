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
**Rework 3 (owner, 2026-11-24 evening, DEC-498):** the grey marking is out. Try the driveway inheriting the ground texture it covers; if that reads badly, gravel. The driveway ribbon is a physics surface. Driveways are allowed through the story-poi check (amend the gate for driveway mouths only). The driveway meets the POI's parking lot when it has one. A lone trailer home gets a driveway parallel to the road, level with the home, whose ends slope to meet the road. "make it make sense!" Build on proto/feat-302-pad-driveway (CarGame-feat302), sheet-3, then a look card.

REWORK (owner, 2026-11-24): the prototype's look was rejected. A world-gen lane (Opus) rebuilds the driveway as a junction-like connection and marks the whole drivable area, then shows the owner a new sheet. Option B's numbers (set back 3 m, pad 16 x 9) are "okay in theory". FEAT-318 lands first.

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

## Decisions
- 2026-11-24, owner (card feat302-pad-sizes-pick): "I'm not a huge fan of how this turned out. I'm okay with option B in theory. All I see from these photos is an ugly texture square printed on the road next to POIs and some of them are set back. By definition, setting back a POI means it's easier to drive to it and the transition is more natural. If we're going to build driveways, they need to connect to the road With what is effectively a junction, meaning they need to carry the roads at normal, and then blend it to the pads normal. The entire Portion from the edge of the road ribbon to the POI pad needs to be marked so it's clear where the \"driveable\" area is."
  Orchestrator's reading, not the owner's words: at the road end the driveway surface takes the road's own surface normal (its camber and grade) and blends to the pad's normal along its length, like a junction mouth; and the surface from the ribbon edge to the pad is visibly marked as drivable.

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
- 2026-11-24 evening: the owner answered card feat302-driveway-rework-pick with "Change": see DEC-498 and Next steps (rework 3).
