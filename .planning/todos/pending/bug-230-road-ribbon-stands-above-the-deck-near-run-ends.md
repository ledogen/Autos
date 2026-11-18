---
id: BUG-230
type: bug
status: open
severity: minor
opened: 2026-11-18
source: BUG-221 census (wip/bug-221/census.mjs), 2026-11-18
relates: BUG-221, BUG-153, BUG-223, src/road-mesh.js
---
lane: Engine & world

# BUG-230: Road ribbon and junction pads stand up to 0.86 m above the deck the tires use, near run ends

## Next steps
Re-run the BUG-221 census on current main, split by junction class. Examine the 1.99 m outlier (seed 948023748,
s 1097/1130) first: say whether it is a real step a truck body can hit or a census artefact.

## Summary
MESH == PHYSICS check from BUG-221's census, 13 seeds: road-collider vertices on the lane band (|lat| ≤ 5 m) compared
with `sampleRoadTopY` (the deck the tires ride). More than 25 m from a run end the ribbon is within 4 to 9 cm.
Within 25 m of a run end (the junction blends) it stands up to 0.86 m above. One point is 1.99 m above, not examined.
The tires never see this; only the body can. Same family as BUG-221 (fixed) and BUG-223 (owner's feel call).

## Tracker
- [ ] Census re-run on main, by junction class, with the count of mouths over 5 cm.
- [ ] The 1.99 m outlier explained.
- [ ] Each class fixed as a plain defect, or shown to the owner if a fix has a cost.

## Log
- 2026-11-18 minted by the orchestrator from BUG-221's census.
