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
**Classic world, 300 random seeds** (the BUG-232 list, story region; tool `wip/bug-234/why.mjs` in CarGame-land-feat180; per-site table `wip/bug-234/summary-classic.txt` in main): **30 sites on 21 seeds**, the same count as before BUG-232, which fixed none of them because it was a different class. Shipped grades: 8 sites ship over 45 % and 23 over 30 %. The worst is 279 %, with decks 55.2 m apart. Solved-deck gaps: 27 of 30 are under 12 m; there are 3 at 12 m and 1 at 55 m. No self-crossings remain.

**The owner's custom world** (terrain 50 %, coarseAmplitude 75; gentle roads, wGrade 290), 30 random seeds: **0 sites**. His capture seed 2711103901 has 2 sites, both class B, both on the same road.

The crossing rung (`_v2DeleteFor`, `src/road.js`) deletes the longer member of every crossing pair unless a plan "sanctions" (excuses) the crossing. Sheet: `wip/bug-234/sheet.jpg` in main, one site per class plus the owner's capture. Causes, by class:
- **A. The excusing plan's winner was deleted: 3 sites.** `_v2CededExtents` reads `_v2MergeFor` without asking whether the winner survives the rung. The winner dies, so the merge never applies. The loser ships on its own line and crosses a third road. Seeds 908965980 (×2) and 757333870.
- **B. The excusing plan did not build: 14 sites**, plus the owner's 2. The crossing sits inside a T promotion's extent (`_v2CededExtents`). At assembly, `_v2PromoteOne` declines that promotion in 10 of the 14, so the side road ships plain and full length. In the other 4, and at the owner's site, the plan built, but its extent includes the departure-blend margin, where the loser ships on its own line. The code comment above `_v2CededExtents` says a spec that survives to that point WILL ship; that claim is false here. Worst: 1315540905, 99 %, 97 % and 46 %; 2080966469, 94 %.
- **D. The crossing exists only after the pass-2 re-plan: 4 sites.** Pass 1 routes did not cross (the pair is not even listed). A deletion flipped a node's pin class, so `_v2SettleDeletions` froze the verdicts and every route re-planned on built-degree pins. The new routes cross, and a frozen rung mints no verdict (R4). Seed 4071845502, 65 %. Seed 2321482520, 47 % and 33 %.
- **E. The plan layer never paired the two edges: 4 sites.** Both edges are in the wide graph, neither is dropped, and both are over 60 m long. So one of `_v2ConflictPairs`' geometry gates drops the pair: chord-to-route, `_coarseNear`, or no conflict interval. Not split further. Seeds 1297855292 (53 %, 33 %) and 3032355380.
- **F. A restored Urquhart side (DEC-401, DEC-427): 5 sites.** `_v2RestoreDropped` registers it after planning ("ASSEMBLY ONLY… never enter g.adj"). The crossing rung never sees it, and `_v2RestoreGrazes` checks only the legs of its own two nodes. This class holds the worst site: seed 1960791808 (618, −1723), decks 55.2 m apart, 279 %.

**Owner-seen site, 2026-11-20** ("brand new game on 3296 and i see two roads overlapping", capture `wip/bug-234/owner-capture-2711103901.json` in main). Seed 2711103901 in a custom world: terrain 50 % (coarseAmplitude 75) and gentle roads (wGrade 290). The census above used the classic world only. Reproduced headless on main (the branch's road code is identical) with the capture's params and road centre. Mark (933, −1575): two runs on heading 172°, `g:0,-3,0:927174,-1417946,-1` (deck 88.9) and `g:901587,-1928064,-1:1,-3,1` (deck 87.1, the observed run). The mark lies between them, 5.7 m and 5.5 m away. Their centre lines stay under 10 m apart for 164 m, so the pavements overlap, and they cross 89 m north, at (940, −1486). Solved decks there are 0.3 m apart and the shipped grade is 4.7 %, so this site has no ramp, only doubled pavement. Cause, a variant of class B: the longer run, graph edge 0,-3,0|0,-3,2 (1571 m), has a disjoint mid-span plan whose winner is 1,-3,1|0,-2,2. That plan did build. But its sanctioned extent includes the departure-blend margin, where the loser ships on its OWN line, not the winner's pavement. So a crossing with a THIRD road (edge 1,-4,0|1,-3,1, a T-promoted side road) was excused. The BUG-105 overlap join cannot catch it either: `_v2OverlapStretch` skips T departure spans and any stretch that crosses. Option 2 (an X junction) covers it.

No site comes from the shove.

## Fix options, simplest first (counts: 30 classic sites plus the owner's 2)
1. **X junction at the crossing (assembly backstop, recommended).** This runs after the promotions and the BUG-105 overlap join (`_v2JoinOverlaps`), and it uses the same machinery. Every surviving proper crossing of two runs, outside node throats, is cut into a 4-way node at P. The through run is sliced at P (`_v2SliceRun`). The other run's halves are rebuilt as departures from P (`_v2BuildDeparture` re-solves their profiles to P's deck). It fixes all 32, whatever the class, and feeds nothing back into the plan (FEAT-76's argument). Connectivity goes up: plus 1 node and 2 edges per site, and no road is deleted (DEC-070). Limit: 27 of 30 have decks under 12 m apart. The 55 m site will decline and needs a fallback. This conflicts with an unrecorded 2026-08-25 code-comment ruling ("nodes are the only intersections… T/X promotion retired"); that is the owner's call.
2. **Honest sanction (plan layer).** A crossing counts as excused only by a plan that will build. The longer member is then deleted. It fixes classes A and B: 17 of 30, plus the owner's 2. It deletes 14 roads: 13 on 11 of the 300 seeds, and the owner's 1571 m road. That goes against DEC-070 (connectivity only goes up). It does nothing for D, E or F, and it needs a cycle guard and a window-invariance proof.
3. **Widen the overlap join** (`_v2OverlapStretch` skips T departure spans and any stretch that crosses). It turns the owner's 164 m of doubled pavement into one road with two Ts, and with it that crossing. I have not measured how many of the 30 also have doubled pavement. It can go together with option 1.
4. Re-judging after the pass-2 re-plan (class D only) breaks the R4 freeze. Not offered.

## Tracker
- [x] Cause traced on the three worst sites: 1960791808 is class F; 1315540905 and 2080966469 are class B. All 30 are classed.
- [x] Fix options, simplest first (above).
- [x] Census complete: 300 classic seeds, plus 30 at the owner's world settings; every site classed; sheet made.
- [ ] Owner pick (card bug234-crossing-fix-pick).
- [ ] Gate, fingerprint, 400-seed sweep.
- [ ] Landed on main (orchestrator).

## Decisions
- 2026-11-19, owner (card bug232-spiral-tunnels): "No spirals: refuse the loop". Recorded as DEC-446: the router refuses a path that crosses itself; no grade separation (no tunnel under, no bridge over) is added for spirals or for BUG-234's no-junction crossings. The same card covered this ticket ("BUG-234 over/under passes"): no over/under passes.
None yet.

## Open questions
- (Answered by DEC-446: no over/under passes.)
- X junction (option 1) or honest sanction (option 2)? The X junction contradicts a code-comment ruling of 2026-08-25 above `_v2CededExtents` ("nodes are the only intersections… the T/X promotion concept is retired"). That ruling has no decision record. DEC-070 (connectivity only goes up) is the later standing record. This is the owner's call.

## Links
BUG-232 (the same lift, one run crossing itself).

## Files
`src/road.js` (`_addCrossingByRun`), `src/corridor-router.js`.

## Log
- 2026-11-18: minted from BUG-232's census. Cause not traced.
- 2026-11-19: owner answered "No spirals: refuse the loop" on the BUG-232 card (DEC-446), which blocked "BUG-234 over/under passes": no grade separation. Fix options for the no-junction crossings stay open (junction or refuse), simplest first.
- 2026-11-20 (lane p, land/bug-234-crossing-trace @ main f6e58c57): census plus a plan-layer trace on 283 of 300 seeds. 23 sites remain; classes A 1, B 10, D 4, E 4, unresolved 4. Heavy runs held at 13:47 (owner's quiet machine). The last 17 seeds and the sheet are owed. No src/ change.
- 2026-11-20: owner capture seed 2711103901 (custom world T50/R290) classified as a class-B variant: the sanctioned extent covers the loser's departure blend, and the crossing road also overlaps for 164 m. It exists on main. Tool `wip/bug-234/near.mjs` (CAP= takes a capture's params).
- 2026-11-20 22:10: census complete. Classic world, 300 seeds: 30 sites on 21; classes A 3, B 14, D 4, E 4, F 5 (restored sides). Owner's world settings, 30 seeds: 0 sites. Sheet in main's wip/bug-234/sheet.jpg. Card bug234-crossing-fix-pick written.
