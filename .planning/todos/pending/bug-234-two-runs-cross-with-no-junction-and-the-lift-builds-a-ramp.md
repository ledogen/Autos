---
id: BUG-234
type: bug
status: open
severity: major
opened: 2026-11-18
source: BUG-232 census, 2026-11-18
relates: BUG-232, FEAT-19, FEAT-40, src/corridor-router.js, src/road.js
---
lane: Engine & world

# BUG-234: Two different runs cross with no junction there, and the at-grade lift builds a ramp

## Next steps
- Owed runs (held 2026-11-20 13:47 by the owner's quiet-machine order): the last 17 census seeds, the 4 "no-ctx" sites, the 4 "never discovered" sites, and the sheet. Exact commands are in the lane p handoff.
- Owner pick between the fix options below (card `bug234-crossing-fix-pick`). Recommended: option 2, an X junction at the crossing.

## Summary
Two different road runs cross in plan view where the network has no junction. The FEAT-19 at-grade crossing lift then raises the lower deck onto the upper one. Where the solved decks were far apart that makes a ramp far over the grade cap.

## Description
BUG-232's census on 300 random seeds (main e4251ee1), inside the story region: 30 sites on 21 seeds (7 %). The worst is seed 1960791808 at (617.8, −1722.5): solved decks 55.2 m apart, shipped grade 279 %. 8 of the 30 sites ship a grade over 45 %; 21 ship over 30 %. The full list is `wip/bug-232/summary.txt` in the main checkout (git-ignored), from `wip/bug-232/census.mjs` in CarGame-land-feat180.

## Findings (2026-11-20, main f6e58c57, lane p)
Census on 283 of the BUG-232 300 random seeds (story region; tool `wip/bug-234/why.mjs` in CarGame-land-feat180): **23 sites on 17 seeds** remain after BUG-232 (the old count was 30 on 21 of 300). BUG-232 fixed none of them; it was a different class. Shipped grades, worst first: 279, 99, 97, 94, 65, 53, 47, 46, 41, 39, 39, 38, 36, 34, 33, 33, 33, 31, 28, 26, 16, 10, 10 %. 8 sites ship over 45 % and 18 over 30 %. No self-crossings remain.

The crossing rung (`_v2DeleteFor`, `src/road.js`) deletes the longer member of every crossing pair unless a plan "sanctions" the crossing. Causes, by class:
- **A. The sanctioning plan's winner was deleted: 1 site.** `_v2CededExtents` reads `_v2MergeFor` without asking whether the winner survives the rung. The winner dies, so the merge never applies. The loser ships on its own line, and it crosses the third road. Seed 757333870 (−1301, 1006).
- **B. The sanctioning plan did not build: 10 sites.** The crossing sits inside a T promotion's extent (`_v2CededExtents`). At assembly, `_v2PromoteOne` declines that promotion (7 of the 10 have a declined promotion on record), so the side road ships plain and full length. The code comment above `_v2CededExtents` says a spec that survives to that point WILL ship; that claim is false here. This class holds the worst traced site: seed 1315540905 (1305, −1628), decks 11.5 m apart, 99 %, and two more at 97 % and 46 % on the same seed. Seed 2080966469 ships 94 %.
- **D. The crossing exists only after the pass-2 re-plan: 4 sites.** Pass 1 routes did not cross (the pair is not even listed). A deletion flipped a node's pin class, so `_v2SettleDeletions` froze the verdicts and every route re-planned on built-degree pins. The new routes cross, and a frozen rung mints no new verdict (R4). Seed 4071845502 (−564, −376): 12.0 m, 65 %. Seed 2321482520: 47 % and 33 %.
- **E. The plan layer never paired the two edges: 4 sites.** Neither edge lists the other in `_v2ConflictPairs` in either pass. One of its discovery gates drops the pair: chord distance, `_coarseNear`, or no conflict interval. Not yet split by gate. Seed 1297855292: 53 % and 33 %.
- **Unresolved: 4 sites**, including the worst, 1960791808 (618, −1723): decks 55.2 m apart, 279 %. Both runs are plain graph edges sharing node 0,-4,2. My tool found no captured graph that spells them, so these are not classed yet (owed run).

**Owner-seen site, 2026-11-20** ("brand new game on 3296 and i see two roads overlapping", capture `wip/bug-234/owner-capture-2711103901.json` in main). Seed 2711103901 in a custom world: terrain 50 % (coarseAmplitude 75) and gentle roads (wGrade 290). The census above used the classic world only. Reproduced headless on main (the branch's road code is identical) with the capture's params and road centre. Mark (933, −1575): two runs on heading 172°, `g:0,-3,0:927174,-1417946,-1` (deck 88.9) and `g:901587,-1928064,-1:1,-3,1` (deck 87.1, the observed run). The mark lies between them, 5.7 m and 5.5 m away. Their centre lines stay under 10 m apart for 164 m, so the pavements overlap, and they cross 89 m north, at (940, −1486). Solved decks there are 0.3 m apart and the shipped grade is 4.7 %, so this site has no ramp, only doubled pavement. Cause, a variant of class B: the longer run, graph edge 0,-3,0|0,-3,2 (1571 m), has a disjoint mid-span plan whose winner is 1,-3,1|0,-2,2. That plan did build. But its sanctioned extent includes the departure-blend margin, where the loser ships on its OWN line, not the winner's pavement. So a crossing with a THIRD road (edge 1,-4,0|1,-3,1, a T-promoted side road) was excused. The BUG-105 overlap join cannot catch it either: `_v2OverlapStretch` skips T departure spans and any stretch that crosses. Option 2 (an X junction) covers it.

No site comes from the shove. Promotion departure geometry moved a run at 2 sites (about 3 to 7 m), but in both of those the sanction is the cause.

## Fix options, simplest first
1. **Honest sanction (plan layer).** A crossing counts as sanctioned only by a plan that will build: its winner survives (class A), and its promotion is predicted buildable (class B). The rung then deletes the longer member. Covers 11 of 23. It removes about 11 edges on these seeds, which is minus 1 road per site, and may leave dead ends. It does nothing for D or E. It makes the rung read other verdicts, so it needs a cycle guard and a window-invariance proof.
2. **X junction at the crossing (assembly backstop, recommended).** This runs after the promotions and the BUG-105 overlap join (`_v2JoinOverlaps`), and it uses the same machinery. Every surviving proper crossing of two runs, outside node throats, is cut into a 4-way node at the crossing point P. The through run is sliced at P (`_v2SliceRun`). The other run's two halves are rebuilt as departures from P (`_v2BuildDeparture`), which re-solves their profiles to P's deck. Covers all 23, whatever the cause. It feeds nothing back into the plan (FEAT-76's argument). Connectivity goes up: plus 1 node and 2 edges per site, and no road is deleted (DEC-070). Limit: a departure must meet the grade rules. 22 of the 23 sites have decks within 12 m. The 55 m site (1960791808) will decline, and it needs a fallback: delete the longer member (option 1's rule) or reroute.
3. **Re-judge after the pass-2 re-plan (class D).** This breaks the R4 freeze, because built degree would change under the pins derived from it. Not recommended.

## Tracker
- [x] Cause traced on the three worst sites. 1315540905 is class B; 2080966469 is class B; 1960791808 is not classed yet (owed). Every site is classed except 4.
- [x] Fix options, simplest first (above).
- [ ] Owed runs: 17 seeds, the unresolved and class-E sites, the sheet.
- [ ] Owner pick (card bug234-crossing-fix-pick).
- [ ] Gate, fingerprint, 400-seed sweep.
- [ ] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner (card bug232-spiral-tunnels): "No spirals: refuse the loop". Recorded as DEC-446: the router refuses a path that crosses itself; no grade separation (no tunnel under, no bridge over) is added for spirals or for BUG-234's no-junction crossings. The same card covered this ticket ("BUG-234 over/under passes"): no over/under passes.
None yet.

## Open questions
- (Answered by DEC-446: no over/under passes.)
- Option 1 or option 2? Option 2 contradicts a code-comment ruling of 2026-08-25 above `_v2CededExtents` ("nodes are the only intersections… the T/X promotion concept is retired"). That ruling has no decision record. DEC-070 (connectivity only goes up) is the later standing record. This is the owner's call.

## Links
BUG-232 (the same lift, one run crossing itself).

## Files
`src/road.js` (`_addCrossingByRun`), `src/corridor-router.js`.

## Log
- 2026-11-18: minted from BUG-232's census. Cause not traced.
- 2026-11-19: owner answered "No spirals: refuse the loop" on the BUG-232 card (DEC-446), which blocked "BUG-234 over/under passes": no grade separation. Fix options for the no-junction crossings stay open (junction or refuse), simplest first.
- 2026-11-20 (lane p, land/bug-234-crossing-trace @ main f6e58c57): census plus a plan-layer trace on 283 of 300 seeds. 23 sites remain; classes A 1, B 10, D 4, E 4, unresolved 4. Heavy runs held at 13:47 (owner's quiet machine). The last 17 seeds and the sheet are owed. No src/ change.
- 2026-11-20: owner capture seed 2711103901 (custom world T50/R290) classified as a class-B variant: the sanctioned extent covers the loser's departure blend, and the crossing road also overlaps for 164 m. It exists on main. Tool `wip/bug-234/near.mjs` (CAP= takes a capture's params).
