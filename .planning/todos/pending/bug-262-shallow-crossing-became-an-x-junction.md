---
id: BUG-262
type: bug
status: open
severity: major
opened: 2026-11-24
source: owner, 2026-11-24 (chat) — "match above ground behavior - merge into one road" · "10m"
relates: BUG-259, BUG-234, DEC-495, DEC-494, DEC-068, src/road.js
---
lane: engine & world

# BUG-262: A 3° crossing became a full X junction

## Next steps
Owner's look at `wip/bug-262/sheet.jpg` (branch `land/bug-262-shallow-x-underground`, on top of BUG-259's
`land/bug-259-tunnel-x`), then land both together. Left over, above ground and out of DEC-495's scope: seed 2143977503's
13.5° X at (2942, 1087) and its neighbour at (2982, 1091) still pad on the hull.

## Summary
Two roads that cross at a very shallow angle should merge into one road, as the above-ground rule already says. On seed 2280440363 near (19, −42) a crossing of about 3° inside a tunnel became a full X junction instead, and its pad cannot weld to its legs.

## Description
- The crossing detector classes a crossing under `roadCrossAngleMin` (12°, `src/road.js` ~7747) as NEAR_PARALLEL: a graze that gets a box merge, not a shaped junction.
- The site crosses twice, about 100 m apart, at about 3°. Both crossings are X junctions on main (BUG-234).
- Cause (traced 11-25): the crossing classifier's 12° rule is not what merges roads; the BUG-105 overlap join is (a stretch
  under 2·HW for 20 m, or 60 m when it crosses: a graze under ~19°). It exempted bores (±80 m) and pairs sharing a node,
  and at the known site both held: two legs of node 0,-1,1, in bores, 55 m apart in height, within 10 m for 156 m and
  crossing twice. The X pass, which has no angle rule, took both crossings. The same shared-node exemption made seed
  3780529195's two above-ground X junctions at (-1795, 1673) (13.5°, hull pads).
- Pad state there: main has the convex-hull fallback with 2 of 4 legs welded; BUG-259 slice 2 (branch `land/bug-259-tunnel-x`, not landed) has 0 of 4.
- `test/pad-census.mjs` on main, 11-24: 211 real junctions, 211 welded, 0 on the hull fallback. Its windows may hold no X junction.

## Tracker
- [x] Trace why the 3° site became an X
- [x] Census of crossing angles on random seeds: how many X junctions sit under 12°, above and below ground
- [x] A crossing under the limit merges into one road, underground as above ground (DEC-495)
- [x] An underground junction sits at least 10 m from a portal (DEC-495); a gate holds it
- [ ] No junction on the hull fallback at an X (underground: none; above ground 2143977503 keeps two, 13.5°)
- [ ] Before/after sheet on random seeds; owner's look

## Decisions
- 2026-11-24, owner (DEC-495): a crossing under the near-parallel limit merges into one road, underground too; an underground junction is at least 10 m from a portal.

## Open questions
None.

## Links
BUG-259 (slice 2 and its card `bug259-slice2-weld-pick`) · BUG-234 · DEC-068 · DEC-494

## Files
`src/road.js` (`_v2JoinOverlaps`, `_v2OverlapStretch`, `_boreOpenLegsAtUndergroundNodes`) · `test/tunnel-x-junction.mjs`
(checks 10-12) · census `wip/bug-262/census.mjs`

## Log
- 2026-11-24: minted by the orchestrator from the owner's two rulings in chat.
- 2026-11-25 (lane s): the overlap join takes bores and shared-node crossing stretches (throat 30 m out), and tries the
  longer road as the side when the shorter cannot reach its deck; every bore of an underground junction opens ≥ 10 m out
  (the portal moves, the junction stays). 24 random seeds: underground legs < 12° 2 → 0, X junctions from a shallow-graze pair 4 → 0;
  4 of 24 seeds change, ug junctions < 10 m from a portal 2 → 0, hull pads 5 → 3. Gate tunnel-x-junction (4 seeds) red on
  BUG-259 (5 fails) → green. fingerprint-world vs e345fd63 identical. The join's Ts still ship ranked residuals
  ("a T always beats no T"): deck gaps 0.5-1.3 m vs the X's 0.2-4.2 m; one shows as a seam at 3780529195. Sheet wip/bug-262/sheet.jpg.
