---
id: FEAT-320
type: feature
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 (FEAT-267 sign-off) — "while driving to the sign line, it's easy to forget that you're doing a demolition mission because the timer is the same as a courier mission. It would be nice if it said "x.xx km to the old sign line" Up top until you got to the targets, then it switched to the running total counter. Consider that players may not come in from the intended direction and might end up running the line backwards."
relates: FEAT-267, FEAT-65, DEC-399, DEC-403, DEC-430, src/main.js
---
lane: A

# FEAT-320: Demolition HUD reads "x.xx km to the old sign line" until the truck reaches the line

## Next steps
Lane a: lands with land/wave3-1120. Owner: the wording for the farm's drums and the camp's turn-back signs (below).

## Summary
Until the truck reaches the target line, the top HUD line of a demolition job reads the road distance to the line's
nearer end, in the owner's words. On arriving (or at the first knock-down) it switches to the running count.

## Description
- The distance is the road distance from the truck to the FIRST stop of the guide's tour (paper-route.js TourGuide,
  the shortest tour from the truck through the clusters still standing, DEC-399). Along a line that is its nearer
  end, so a truck coming in from the far side reads the far end. A side road joining the line in its middle reads
  the distance to that middle cluster, which is where the tour starts.
- ARRIVED latches (main.js `_site.arrived`) at the first knock-down, or once that road distance is under onM (120 m,
  where the targets become bodies). Until the tour is first planned the line shows the count, as before.
- Scoring and par are direction-free: the job settles when the last target falls wherever the truck is (mission.js),
  graded on elapsed against the par planned at accept; each target pays its share in the order it falls (DEC-403).
  A backwards run is graded against the same par; it costs or saves only the extra road to the far end.

## Tracker
- [x] HUD reads "x.xx km to the old sign line" short of the line, the count once there
- [x] Either end: the tour's first stop is the nearer end
- [x] Smoke step: 400 m short of the line the HUD reads the distance; the site has not latched arrived

## Open questions
- The owner's line names the sign line. Three jobs are demolition: the work site's old sign line, the farm's old
  drums and the camp's turn-back signs. All three use his line for now; the other two want their own words.

## Files
`src/main.js` · `test/cdp-smoke.mjs`

## Log
- 2026-11-21 (lane a): built on land/wave3-1120.
- 2026-11-21 (lane a): proofs on land/wave3-1120: affected gates 65/65 green (--serial, 67 selected, 2 browser), tut-gate 21/21, cdp-smoke 41/42 then pad step green after a test-only fix (12 downs no longer reach the setup page's start, DEC-475 rows), pad-e2e ALL OK. Open for the owner's wording of the drums' and turn-back signs' line.
