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
Orchestrator: land `proto/feat-299-camp-run` (owner picked "Good: build it out and land", DEC-493). Then the owner's look in the game.

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
- [x] Measure: how often a camping area is not connected today (400 random seeds; seed 6 is a test seed only)
- [x] Camping area = one connected road run; no breaks
- [x] Absorbs junctions
- [x] Target mean size with a variation; both are slider-tunable (CAMP_PARAMS knobs, deliberately NOT debug sliders: zones are laid out at region entry, so a live slider would lie until re-entry; the owner's call)
- [x] Screenshot sheet over random seeds, before and after, for the owner
- [x] World identity: `test/fingerprint-world.mjs` shows the change is only the camp areas (camp areas are story-only and outside the fingerprint; no road, POI or terrain code touched); a 400-seed no-throw sweep (done: the census ran camp.js on all 400, none threw)
- [ ] Owner has looked

## Decisions
- DEC-437 (the ruling), DEC-493 (as built: grown by driving distance from the old disc centre, 930 m mean, ±50 % uniform; tunnel gap and merged areas kept as shown).

## Open questions
- Answered 2026-11-24 (card `feat299-camp-run-pick`, "Good: build it out and land", no note): the size stays 930 m ±50 %, the tunnel gap stays, merged areas stay. The questions below are kept as asked.
- (owner) The size: mean 930 m of road (the median of today's discs), ±50 % uniform (465–1395 m). Today's discs had a mean of 1181 m (right-skewed), so the runs cover 22 % of a region's road against 25 % (median). A mean of ~1180 m would keep the coverage instead.
- (owner) Tunnels: 30 % of areas have a bore inside. The map's casing skips bores (no camping in a tunnel, the FEAT-45 rule), so on the map those areas show a gap at the tunnel. Draw the casing through the tunnel instead?
- (owner) Two areas may grow into each other (34 % of regions have one such pair); the map then shows them as one longer area. Kept, as the simplest; say if they should stop at each other.
- No conflict found in a standing record, but the wording of "camping area" in DEC-006 (camping button place decides quality) and DEC-239 (a snack eaten at a camping area) depends on what a camping area IS. The builder reads those two before changing the definition; any change to where camping is allowed (the quality tiers) is the owner's call, listed here, not decided.
- What size? Mean and spread are the owner's call (needs a number: metres of road? the area in m²?). The screenshot sheet comes first.
- The expedition camp (FEAT-292, DEC-424) is a different thing (the R1 boss camp). The scribe assumes this ticket is only the ordinary camping areas; confirm.

## Links
DEC-437. Needs a sweep and a screenshot sheet (feedback_screenshots_for_worldgen_calls).

## Files
`src/camp.js` · `src/poi.js` · `src/road.js` · `test/fingerprint-world.mjs` · `test/camp-*.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-21 (lane, branch proto/feat-299-camp-run): census `test/camp-area-census.mjs` over 400 random regions: today 28.7 % of zones break into 2+ pieces (2432/727/190/45/13/3 for 1..6+), road per zone median 931 · p10 363 · p90 2418 m. Prototype: camp.js growArea (a driving-distance ball from the old disc centre, bisected to its target), growAreas (was fillReach), zoneAt = tether corridor of the run, map2d strokes the run. After: 0 broken, median 925 m. Gates: camp-zones rewritten (growArea on a hand-made network), camp-reach adds one-piece + size checks. The first census stalled 5 h externally (both processes froze in lockstep; the slow seed alone is 15 s); re-run under per-seed caps.
