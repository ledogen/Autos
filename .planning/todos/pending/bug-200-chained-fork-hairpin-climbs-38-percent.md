---
id: BUG-200
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "ticket #9 for voilating max grade significantly. id like to find a fix which might end up being to drop it all together."
relates: BUG-179, DEC-366, DEC-064, DEC-065, src/road.js
---
lane: B

# BUG-200: A chained fork leaves a hairpin that climbs 38 %

## Next steps
Owner: pick on the owed card `bug200-hairpin-grade-pick` (sheet `wip/bug-200/sheet.jpg` in `CarGame-machine`). Then a
fresh Lane B agent builds the pick on `land/bug-200-hairpin-grade` (option E is already prototyped there, c5052efd),
with a gate that fails before and passes after.

## Summary
The 38 % is not the chain and not the router. It is the junction's deck hold + recovery (FEAT-82, `_recoverFromHold`),
which may climb up to the router's ceiling, 38 % (gMaxRoad 24 % + gradeTol 14 %). That happens on about 1 road run in
11 on every random seed, at junctions of every kind; the chain only moved #9's hairpin to a place where it hit it.

## Description
**Site #9** (seed 688224244, the hairpin 36 m north of old node 0,-5,0). Grade = steepest 10 m (centred, 5 m samples
of the shipped profile, the tutorial-seed search's measure).
- Before BUG-179 (18292451) the road existed, same hairpin, apex at node 0,-5,0: climb arm 31.7 %, trunk arm 33.2 %.
- Main now (53cabcb7) and this branch: the apex is the chain's fork P (54, −2547); climb arm **38.8 %**, > 30 % for 10 m.
- The SOLVED profile (router + profile solver, before any junction blend) climbs at 22 % there. The deck hold keeps
  the climb arm level for 7.5 m (a hairpin's two arms leave the apex in nearly the same direction, one up and one
  down, so the bend's grade plane, the mean of the two, is about level), then the recovery has to regain the height:
  the 30 m smoothstep it starts from peaks at 42 % uncapped, and the projection clips it at the 38 % ceiling.

**Census, 32 random seeds, R 3000 m, 3734 runs** (`wip/bug-200/census-*.jsonl`, `summ.mjs`): each run's steepest 10 m.

| tree | runs > 30 % | runs ≥ 37.5 % (at the ceiling) | road > 30 % | median / p95 |
|---|---|---|---|---|
| before BUG-179 | 1083 / 3731 | 346 | 20.5 km of 2240 | 24.1 / 38.1 % |
| main now = this branch | 1085 / 3734 | 347 | 20.6 km | 24.1 / 38.1 % |
| option E prototype | 327 / 3742 | 174 | 9.8 km | 24.0 / 37.3 % |

Histogram, main (steepest 10 m per run, %): 0–12: 275 · 12–16: 382 · 16–20: 481 · 20–24: 511 · 24–26: 597 ·
26–30: 397 · 30–34: 348 · 34–37.5: 396 · ≥ 37.5: 347. By where the steepest 10 m sits: (a) ordinary 259 of 2820 at the
ceiling · (b) ≤ 60 m from a T promotion 87 of 904 · (c) ≤ 60 m from a chained fork 1 of 10 (#9's twin on 679946859).
1057 of the 1085 runs over 30 % are made by the junction blend (shipped ≥ 3 points above solved); the solved profile
itself: median 20.1 %, p95 25.1 %, 52 runs over 30 %. So #9 is the generator's normal junction ceiling in a new place.

Outliers, not this mechanism (unexplained, for a later ticket): 86.7 % on 679946859 g:1,2,2:1,3,0 (156 m from any end:
a mid-span crossing blend?), 74 % / 60 % where the solver itself built 85–89 % (ladder failure), 53.3 % on 3399414440
(767, −2011) and 45.2 % on 4206092701 (a 32 m run, no room), both unchanged by option E.

**Options** (conflicts are the owner's to resolve):
- **A — the chain declines this fork** (back to main before BUG-179 at that node): #9 back to 31.7 / 33.2 %, still
  over 30 %. The tear BUG-179 fixed comes back here as the old overlap (deck step 0.37 m at #9; the four big ones
  6.12 / 3.95 / 14.87 / 6.94 m were other chains). Touches 10 runs in 32 seeds. Conflicts: DEC-366 (the chain the owner
  signed off), "ask before changing junction promotion".
- **B — drop the road.** #9's climb arm (136 m): the detour between its ends becomes 3233 m (24×), and the 973 m trunk
  ends in a dead end at the hairpin. As a rule over the 336 runs at the ceiling: 11 are bridges (dropping one cuts the
  network in two), the rest need a detour of median 5.6× their length. Conflicts: DEC-070 (connectivity only goes up),
  DEC-396 (no new dead ends).
- **C — move the T point.** Toward the old node it becomes A (33 %); away from it the fork sits lower on the 24 %
  trunk and the climb gets longer. No position helps; not prototyped.
- **D — do nothing.** The ceiling is FEAT-82's stated rule ("a leg may be steep, never illegal"). Conflicts: none.
- **E — hold the recovery to the design maximum** (prototype c5052efd): past a deck hold the recovery may not climb
  steeper than gMaxRoad 24 % or the run's own solved grade where that is steeper; only where no window up to 45 % of the
  run fits does the old 38 % pass run. #9: 38.8 → 24.2 %. Census: runs > 30 % 1085 → 327, at the ceiling 347 → 174,
  road > 30 % 20.6 → 9.8 km. Every junction's handoff moves (world fingerprint). Conflicts to check: DEC-065 (no
  longitudinal grade smoother: this is not one, it caps the junction's own recovery, no profile is averaged), DEC-047
  ("the hard grade cap never moves": the 38 % ceiling stays, E only stops the blend reaching it), DEC-064 untouched.

## Tracker
- [x] The site reproduced headlessly; grade profile main vs BUG-179, the stage that sets it named (junction recovery)
- [x] Census: how many chained forks (and plain forks on main) exceed the design grade, on random seeds
- [x] Fix options shown to the owner with before/after screenshots; "drop the road" among them
- [ ] The owner's pick built, with a gate that fails before and passes after

## Decisions
- 2026-11-17, owner: "id like to find a fix which might end up being to drop it all together."

## Open questions
- The pick: A, B, C, D or E (owed card `bug200-hairpin-grade-pick`). Recommendation: E.

## Links
BUG-179, DEC-366, DEC-064, DEC-065, DEC-047, DEC-070, DEC-396, FEAT-82, QUAL-13

## Files
`src/road.js` (`_applyJunctionBlend`, `_recoverFromHold`) · `wip/bug-200/` (census, shots, sheet) · `test/leg-overlap-tear.mjs`

## Log
- 2026-11-17: minted by the orchestrator from the owner's verdict on BUG-179's round-2 sheet.
- 2026-11-17, Lane B: investigation done. Option E prototype c5052efd. Gates and BUG-179 measure: see the next entry.
