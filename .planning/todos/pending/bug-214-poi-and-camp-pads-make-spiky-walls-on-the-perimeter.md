---
id: BUG-214
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Sometimes POI pads or the camping pad that's constructed make big ugly spiky walls on their perimeter."
relates: FEAT-103, FEAT-164, FEAT-52, FEAT-46, FEAT-45, FEAT-40, BUG-129, DEC-068, DEC-260, src/road.js, src/terrain.js
---
lane: bug (alpha by default)

# BUG-214: POI and camp pads make big ugly spiky walls around their edge

## Next steps
Owner: pick on the owed card `bug214-pad-walls-pick` (land the spike fix; what to do about the remaining tall fill banks).
Then the orchestrator lands `land/bug-214-pad-walls` (option 1, built) and the next agent builds the pick for the rest.

## Summary
The spikes were a composition bug: a bench (the flat pad carved for a POI or a camp) took full blend authority but let a
nearby road's height target leak into its own target, so where a road's bank only just reached, the ground was pulled
metres toward that road's height: a jagged curtain round the pad. Fixed by construction (option 1, built). What remains
is honest earthwork that is too steep: benches perched on a road's 10–16 m fill whose bank is held to a 10 m ring.

## Description
### Measurement (test/pad-wall-census.mjs, 12 random seeds, 468 pads: 324 POI + 144 camp)
Seeds 281831, 768902, 342285, 285150, 272606, 957815, 593497, 979157, 945726, 139046, 415733, 381723. Story region as
story mode builds it, stream carve wired, camps sited by the real CampSystem.evaluate (flat sites only). Every pad's ring
on the chunk grid (1 m vertices, the triangle diagonal included), pads on vs off.
| | worst grade median / p95 / worst | worst 1 m step (m) | spike over design (m) median / p95 / worst |
|---|---|---|---|
| main | 1.03 / 2.54 / 7.45 | 1.29 / 3.00 / 7.45 | 0.18 / 1.94 / 5.70 |
| option 1 | 0.96 / 1.92 / 3.52 | 1.17 / 2.37 / 3.78 | 0 / 0 / 0 |
Cause split on main: (c) overlapping carves (the road target leak) **177 pads** (107 POI, 70 camp), spike median 0.60 m,
worst 5.70 m. (a) ring too narrow for the height (capped at 10 m): 104 fills (Δh median 5.5 m, worst 16.4 m; grade
median 1.16, worst 2.58) and 31 cuts (Δh 8.4 m median; grade 1.43 median). (b) aliasing: no class of its own: the
falloff is ≥ 2.5 m wide and the 1 m grid holds it. (d) LOD seams: none: the chunk mesh has one resolution and equals the
physics height to < 1 mm at every ring vertex. After option 1: 43 of 468 pads (42 POI, 1 camp) still make a face over
56° where the ground without them is under 45°; 36 of them are capped rings, 29 of those fills of 11–16 m (a POI on a
road's fill embankment). The worst remaining (grade 2.2–3.5) stand where the road's own fill bank is already 2.4.
### Experiments not built
Longer ring (the road's FEAT-40 deep-bank allowance, toe cap 28 m) on seed 979157: median 1.12 → 1.08, worst 2.27 → 6.28:
the longer ring reaches across the road and steps at the far verge. Plus a 2:1 cut: no gain. Sizing the bank from the
road-carved ground instead of raw: mixed (one pad 2.89 → 1.78, three worse), reverted.

## Tracker
- [x] Measured across 12 random seeds: cause split with counts, distribution (census above)
- [x] Spikes fixed at the root: `_withPoiPad`, one layered composition for mesh and physics (option 1)
- [x] Proof: poi-pad-spike gate (main 3.76 m, branch 0), census overshoot 0 on 468 pads, driveway unchanged
- [ ] Owner pick for the remaining tall fill banks (owed card bug214-pad-walls-pick)
- [ ] No spiky walls on any pad perimeter (POI pads or camp pad), across sampled random seeds
- [ ] A repro place is captured with the pad's position and seed first (none named; the census stands in)

## Open questions
- The remaining fill banks: siting rejects them (74 of 324 POI sites, 13 of 144 camps would move), a longer ring
  (needs a road-side limit first), or leave them? On the card.

## Links
Owed card `~/CodeShit/ledorepo/projects/cargame/owed/bug214-pad-walls-pick.json`. Sheets: wip/bug-214/sheet-A.jpg,
wip/bug-214/sheet-siting.jpg (in the CarGame-land-feat180 worktree).

## Files
src/road.js (_withPoiPad, _poiPadCarve), src/terrain.js (_carveTableGen), test/poi-pad-spike.mjs, test/pad-wall-census.mjs

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118064848-ixas).
- 2026-11-18 census + option 1 on land/bug-214-pad-walls (3e0329c0, gate a42b372d). fingerprint-world vs main: story
  windows' poi (satellite y only, ≤ 3 cm; no x/z moves), surface, carve, water differ (terrain near pads); network,
  profiles, junctions, tiles, props identical. Driveway on 4 seeds: 10 cm lip and 1 m grade unchanged, ≤ 4.8 cm height.
  Affected gates 87/87 green (serial, 86 min, wip/bug-214/gates.log). pad-e2e ALL OK. Smoke: run 1 failed the
  opening's DEC-357 blink step (a 2 s timing check, load ~10), run 2 PASS 39 steps. Unverified: an in-app look (the
  sheets are the chunk-grid heights rendered headlessly).
