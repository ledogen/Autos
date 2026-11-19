---
id: FEAT-299
type: feature
status: open
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "A single camping region often has multiple breaks due to the way their circle overlaps with the roads. Let's make it so each camping area is a continuous piece of road. I like how it can absorb intersections. Since it's not a fixed circle anymore, we should aim to have an average camping area size But build in variation on the size."
relates: DEC-437, DEC-006, DEC-239, DEC-060, FEAT-103, FEAT-154, src/camp.js, src/poi.js, src/road.js
---
lane: engine & world (world-gen; Opus)

# FEAT-299: A camping area is one continuous piece of road; average size, with variation

## Next steps
A lane first measures how the camping area is defined today (a circle intersected with the roads) and how often it comes out in several pieces over 400 random seeds. Then a prototype: the area is a connected run of road, grown to a target length, absorbing the junctions it meets. The owner sees a screenshot sheet of 6 random seeds, before and after, before the size is chosen.

## Summary
A camping area is a circle laid over the road network; where roads cross the circle edge the camping area has several breaks (separate pieces). The owner wants each camping area to be ONE continuous piece of road, and likes that it can absorb intersections.

Owner's words:
> A single camping region often has multiple breaks due to the way their circle overlaps with the roads. Let's make it so each camping area is a continuous piece of road. I like how it can absorb intersections. Since it's not a fixed circle anymore, we should aim to have an average camping area size But build in variation on the size.

### Scribe's reading
- The area becomes a connected run of road (a subgraph of the road network: a stretch of edges and the junctions on them, no gaps), not a fixed-radius disc.
- Junctions inside the stretch are absorbed (kept as they are).
- "an average camping area size but build in variation": a target size (say measured in road metres) with a spread, picked per camping area from the seed. The owner gave no number.

## Description
(See Summary.)

## Tracker
- [ ] Measure: how often a camping area is not connected today (400 random seeds; seed 6 is a test seed only)
- [ ] Camping area = one connected road run; no breaks
- [ ] Absorbs junctions
- [ ] Target mean size with a variation; both are slider-tunable
- [ ] Screenshot sheet over random seeds, before and after, for the owner
- [ ] World identity: `test/fingerprint-world.mjs` shows the change is only the camp areas; a 400-seed no-throw sweep
- [ ] Owner has looked

## Open questions
- No conflict found in a standing record, but the wording of "camping area" in DEC-006 (camping button place decides quality) and DEC-239 (a snack eaten at a camping area) depends on what a camping area IS. The builder reads those two before changing the definition; any change to where camping is allowed (the quality tiers) is the owner's call, listed here, not decided.
- What size? Mean and spread are the owner's call (needs a number: metres of road? the area in m²?). The screenshot sheet comes first.
- The expedition camp (FEAT-292, DEC-424) is a different thing (the R1 boss camp). The scribe assumes this ticket is only the ordinary camping areas; confirm.

## Links
DEC-437. Needs a sweep and a screenshot sheet (feedback_screenshots_for_worldgen_calls).

## Files
`src/camp.js` · `src/poi.js` · `src/road.js` · `test/fingerprint-world.mjs` · `test/camp-*.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
