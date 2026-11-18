---
id: BUG-222
type: bug
status: open
severity: minor
opened: 2026-11-18
source: FEAT-292 agent, 2026-11-18
relates: FEAT-154, FEAT-292, BUG-128, src/poi.js, test/expedition-camp.mjs
---
lane: SM-3

# BUG-222: The requisition's return spot is farther than the FEAT-154 nearness limit on about a quarter of seeds

## Next steps
Orchestrator: land `land/bug-222-return-spot` (the own-road fix). Owner: the rule question under Open questions decides
the remaining far returns (all geometry); until then the gate's pinned seeds stay green and the census seeds stay red.

## Summary
The "return spot" is the FEAT-154 edge fade's return (`poi.js returnPoint`), not a requisition. The gate wants it within
40 m of the row the truck left by (100 m on that row's own road); on 60 worlds 24 rows on 17 seeds missed. Root cause of
5 of them: a row dropped the return spots of every road within 60 m, not only its own. Fixed. The other 19 are geometry.

## Description
### Cause
`_returnSpots` drops a spot on a row's far side or within poiEdgeReturnM (10 m) inside it (owner, 2026-11-01). The test is
a half-plane through each barricade, out to 60 m sideways, and it ran against EVERY row. Two roads that leave a junction
just outside the wall each have a row; each row's half-plane covered the inside stretch of the other road, so both lost
their first spots, and the fade from one row went 41–62 m to the next road (1268363027: its own spot 17 m in was dropped;
the fade went 62 m to a sibling). Now a spot is tested only against the rows on its own road (`rowsOf`, filed by
`_edgeRows`; the camp's row under the camp's edge). Spots only come back; none is lost (superset on every sweep seed).

### The rest is geometry
19 far rows are left on 60 seeds (45–220 m from the row, median 114 m; before: 41–220 m, median 68 m). Each is on a road
that runs out at 2–34 degrees to the wall, hugs it, or bows back out, so it stays between 2390 m and 2402 m for a stretch
past its row. Return spots must be ≤ 2390 m (owner, 2026-10-31: "the nearest job road at 2390 m or less"), so the fade
takes the nearest job road to the truck:
- 15 rows: the own road has no spot within 100 m of its row (117–445 m, or none). 8 come back on it 106–220 m on, 7 on
  another road 54–202 m away.
- 4 rows: the own road has one 20–62 m in, but another road's spot is nearer the truck (33–52 m against 40–82 m), so the
  fade takes that one, 45–56 m from the row (593940002, 4225133450, 1268363027, 2417171636).
A fix that also brings a sibling's spots back can make a near-tie flip: 2130035470 had passed (own road 28 m), and now
returns 49 m off on the sibling, 46 m from the truck against 48 m. That is "nearest job road" doing its job.

### Measured
- 60 study seeds (wip/bug-222/base-*.log, fix-*.log, `probe.mjs`, `an.py`): far rows 24 on 17 seeds → 19 on 15.
- 400 random seeds (wip/bug-222/sweep-*.log, `sweep.mjs`, `sweep-an.py`): SWEEP400.

## Tracker
- [x] Cause found: rows dropped return spots on other roads (5 of 24); the other 19 are geometry under the 2390 m rule
- [x] Fix in `_returnSpots` and a gate: 2611481022 pinned in expedition-camp (51 m on a sibling before, within 40 m now)
- [x] 400-seed no-throw sweep
- [ ] Owner: the rule for roads that run along the wall (Open questions)

## Decisions

## Open questions
- On a road that runs along the wall for 100–450 m, no spot ≤ 2390 m is near its row, so the fade puts the truck on the
  nearest job road 45–220 m away (often another road). Keep that (A); or B: prefer the truck's own road when its inside
  stretch has a spot within ~60 m of the truck; or C: on a road's own inside stretch allow spots up to the wall (2400 m),
  still 10 m inside its row. Recommendation: A, and the gate then checks "nearest spot to the truck" on such rows.

## Links
FEAT-154 (the fade, owner rulings 2026-10-31 and 2026-11-01), BUG-128 (the own-road 100 m allowance), FEAT-292.

## Files
src/poi.js (`build`, `_edgeRows`, `_returnSpots`), test/expedition-camp.mjs

## Log
- 2026-11-18 minted by the orchestrator.
