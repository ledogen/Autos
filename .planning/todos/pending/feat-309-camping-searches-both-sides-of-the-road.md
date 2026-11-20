---
id: FEAT-309
type: feature
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox 20261119222722-t7df) — "Camping should search both sides of the road simultaneously."
relates: DEC-452, DEC-006, FEAT-45, FEAT-308, FEAT-299, src/camp.js
---
lane: unplaced

# FEAT-309: The campsite search looks on both sides of the road at once

## Next steps
Owner: look at `wip/camp-1119/sheet.jpg` (owed card camp-1119-look): two spots where the camp now lands across the road.

## Summary
The site was searched on one ray, out from the road edge on the side the truck stands on (FEAT-45, 2026-07-30).
Good ground across the road was missed unless you parked over there. Now a ray runs out on each side every grade,
and the better site wins.

## Description
`CampSystem.evaluate` grades `_gradeSide` twice: the truck's own side and the far side (same road point, normal
flipped). `sideBeats` picks, by the score the card already shows:
1. a flat site beats no flat site;
2. two flat sites: the higher vibe (flat + view + shade + water);
3. neither flat: the flatter ground (the card then reports the nearer miss; a ray with rungs beats one with none).
**Tie rule:** an exact tie stays on the truck's own side (no crossing the road for nothing). The result is a pure
function of the truck's spot, so it is deterministic. The memo (re-grade after 1.5 m) still keys on the truck's side,
because the tie rule reads it. The pad's normal points to the chosen side, so the gear faces the road either way.

FEAT-299 (continuous camping areas, not built) changes the zones, not the ray: nothing here is in its way.

## Tracker
- [x] Both sides graded each re-grade; the better by the existing score wins; tie → own side
- [x] Gate `test/camp-sides.mjs` registered: never worse than one-sided, the better side, deterministic (numbers in Log)
- [x] Cost measured, one ray vs both (Log)
- [ ] Owner look (sheet)

## Files
`src/camp.js` (`evaluate`, `_gradeSide`, `sideBeats`) · `test/camp-sides.mjs`

## Log
- 2026-11-19 (lane ai, land/camp-1119): built. 32 random seeds × shoulder spots (744): a site found one-sided 216 (29.0 %),
  two-sided 337 (45.3 %); 121 spots (16.3 %) gained a site where one-sided had none; the site sits across the road at 157
  (21.1 %); never a worse one. The own-side ray matched main's evaluate exactly at all 744 (identity check, not kept).
  Cost per full re-grade, measured in the page (seed 6, 60 spots): one ray 1.5 ms → both sides 3.5 ms. A re-grade runs
  only while hunting below 20 km/h, after 1.5 m of travel (≤ ~3.7 a second), on the 10 Hz poll.
- 2026-11-20: affected gates 19/19 green (camp-sides 1470 s under load 10, ~470 s quiet), cdp-smoke 42/42 on the retry
  (first run: the known DEC-357 blink flake), pad-e2e ALL OK. Sheet wip/camp-1119/sheet.jpg; card camp-1119-look.
