---
id: BUG-64
type: bug
status: closed
severity: major
opened: 2026-09-07
source: owner, 2026-09-07 — photo, seed 1517161527 near (-79,-501): the road drops to a parallel road over a near-vertical wall
relates: FEAT-77, BUG-130, DEC-071, src/road.js, test/road-carve-walls.mjs, test/lib/close-pairs.mjs
---
lane: unplaced

# BUG-64: near-vertical walls between two roads: two classes, only one is clearance

## Next steps
Owner: pick on card `bug64-walls-pick` (sheet `wip/bug-64/sheet.jpg` on branch `proto/bug-64-walls`). Recommended:
close this ticket, keep the two-road overlap walls as FEAT-77's open class-A item, and mint a BUG-130-family ticket for
the switchback step (site 1 of the sheet).

## Summary
Walls steeper than 45° between two roads that run close together. Class B (the carve composing two banks into a step
neither bank has) was fixed 2026-11-01 and is still gone on random seeds. Class A (two roads whose earthworks really
overlap) is common: about 1 wall over 60° per world. It is not a carve defect; FEAT-77's rule lets those pairs exist.

## Description

### Re-measured 2026-11-22 (main ece7a251, 400 random seeds)
Harness (wip, not in `src/`): `wip/bug-64/census.mjs` on branch `proto/bug-64-walls` worktree. Per seed: the player's
world (spawnDecision + pond no-go, routed to the region's warm radius 2800 m), every close pair from
`test/lib/close-pairs.mjs` (bores, junction throats, crossings, T blends and hairpin arms excluded) within 2550 m of
spawn. The ground is walked at 1 m between the two shoulders. A wall = a run of 1 m steps steeper than 45°
(`roadCutSlope`), counted once per pair per class, height ≥ 1.5 m. Classed at its steepest step like
`road-carve-walls`: natural (raw ground ≥ 31°), composition (class B), overlap (2+ roads' earthworks reach it),
single (one road's own bank). "Drive off" = the wall's top is within 3 m of a shoulder; "into" = its foot is.

| class | sites (400 worlds) | slope median / p90 / worst | height median / p90 / worst | > 60° | > 70° | drive off | foot at a shoulder | inside FEAT-77's rule |
|---|---|---|---|---|---|---|---|---|
| composition (B) | 6 | 59° / 78° / 78° | 6.8 / 13.7 / 13.7 m | 2 | 2 | 0 | 2 | 0 |
| overlap (A) | 2089 | 54° / 65° / 78° | 8.0 / 19.4 / 41.6 m | 421 | 86 | 35 | 933 | 27 |
| single bank (design) | 2023 | 49° / 55° / 86° | 8.5 / 19.7 / 37.2 m | 19 | 2 | 7 | 139 | 1 |
| natural (raw ≥ 31°) | 1916 | 55° / 67° / 84° | 14.3 / 29.9 / 65.6 m | 532 | 89 | 29 | 435 | 17 |

Per world: overlap or composition walls over 60° = 423 sites in 252 of 400 worlds; over 70° = 88 sites in 76 worlds.
Drive-off walls ≥ 1.5 m that are not natural ground: 42 sites in 39 worlds (0.1 per world). 85 % of overlap walls are
two legs of one node. Overlap pairs: median 43.6 m apart, 15 m of deck height between them.

**Then vs now.** Then (2026-09-07, three 1400 m windows): 16 carve-made walls, 10 of them class B; the 2026-11-01
battery fix took composition walls 33 → 0. Now: 6 composition walls in 400 whole regions (one in 67 worlds).

**The owner's site today.** Seed 1517161527, (-120,-480), 762 m from spawn: one road (`g:-1,-1,2:0,-1,1`, deck
140.7 m); the parallel leg `g:0,-2,1:0,-1,1` is no longer built (node 0,-2,1 now sits at (386,-1042) with two other
roads). No wall within 220 m.

### Root cause per class
- **Class B residue.** The two worst (seed 1946683182 (-1242,1174): 86°/78°, 14 m; seed 3382780114 (1982,1187):
  77°, 6.8 m) are both ONE run passing twice (a switchback): the resolver lists the run twice and the second pass's
  bank appears in 1 m (offset 1.6 → 14.6 m fill; −1.5 → −6.8 m cut). That is BUG-130's arm-flip family, not two-road
  composition. `bank-steps` gates it on its two seeds only.
- **Class A.** `_carveCrossSectionBlended` composes two banks correctly (fills by max, cuts by min, fill meeting cut
  sums). Where the upper road's fill descends into the lower road's cut, both slopes point the same way and add. The
  pairs exist because FEAT-77's rule (`corridor-router.clearReq` via `RoadSystem._v2ClearPrm`) caps each road's foot
  at carveHalfWidth + roadMaxEmbankmentToe = 18 m (so it never asks more than 28.5 m centre to centre), while the
  carve's deep-bank toe reaches DEEP_BANK_TOE_EXTRA = 18 m further (36 m, i.e. up to 46.5 m). 2062 of 2089 overlap
  walls are at pairs that pass the rule. DEC-071's wording ("neither road's earthwork may reach the other") is
  stricter than the built rule.

### Fixes measured (not built; experiments in `wip/bug-64/patch.mjs`, env BUG64)
- **(toe) The rule's foot = the carve's real toe** (`cap += DEEP_BANK_TOE_EXTRA`, one line in `_v2ClearPrm`). First
  34 of the 400 seeds: overlap walls 201 → 143, over 60° 46 → 21, over 70° 12 → 6. But 47 overlap walls now sit at
  pairs inside the rule that the planner could not separate (main: 8), so `road-clearance` would go red, and the
  region build took 1.59× as long (672 s → 1066 s summed). Needs planner work (FEAT-77's node-departure re-route)
  before it could land, and it moves routes.
- **(seq) Compose in order** (fills first, then each cut dug into the filled ground at its own slope; no road
  moves). 10 seeds: over 60° 11 → 6, but over 70° 2 → 5 and drive-off walls 3 → 14 (the lower road's cut bites
  the upper road's fill at its shoulder), build 1.33×. Rejected.

### History (2026-09-07 to 2026-11-01)

Owner photo 2026-09-07, seed 1517161527 near (-79,-501): the road the truck is on drops to a
parallel road on the right over a near-vertical wall. Measured headlessly (`feature/junction-stitch`,
composed `analyticHeight` walked between the two shoulders, bores excluded, junction throats within
25 m of a shared node excluded):

**Photo site** (-162,-458): `g:-1,-1,2:0,-1,1` × `g:0,-2,1:0,-1,1` — two legs of node 0,-1,1 —
centres **21.1 m** apart with **14.3 m** of height between them; composed ground 67°, raw 34°.

**Battery census, three 1400 m windows (seeds 6/7/20):** 66 close pairs (2 shoulders + 2 m .. 60 m);
25 have ground steeper than the 1:1 cut slope between them; **16 of those are CARVE-MADE** (raw
terrain there under 30°). Only **6 of the 16** violate the owner's earthwork rule
`sep ≥ 12 m + roadFillSlope · |Δy|`. The other ten are 40–60 m apart with 2–18 m of height
difference on gentle ground — e.g. seed 20 (1738,416): 59 m apart, 6.9 m Δy, raw 16°, composed
**77°** — which no clearance rule explains. That is the carve composing two footprints
(`_carveCrossSectionBlended` / `_mergeCarve`, each road's toe reaching 18–28 m) into a step where
one road's cut face meets the other's fill.

#### Two fixes, not one

1. **Class A — clearance (owner ruling 2026-09-07):** adjacent roads must clear each other by
   12 m centre to centre PLUS the earthwork taper for their height difference
   (`roadFillSlope · |Δy|`). Two routes: (a) make the merge planner's conflict distance
   height-aware so such pairs become Ts (the lower road rides the upper's deck and departs where
   the earthwork can separate — no router change, uses FEAT-76's machinery; also make the fork
   candidates' `clears` test height-aware); (b) QUAL-26's two-pass router pricing the sibling's
   corridor as occupied within that radius (true separation; ~1.15× route time; window-invariance
   argument owed). Owner to choose; (a) first is the recommendation.
2. **Class B — carve composition:** a wall between roads 40–60 m apart with single-digit Δy is a
   carve bug regardless of routing. Diagnose the composition at seed 20 (1738,416) and seed 6
   (-928,-673).

#### Acceptance (2026-09-07, now the Tracker)

- A gate walks the ground between every close pair (bores and throats excluded) and fails on
      composed slope > `roadCutSlope` where the raw terrain is gentler — both classes, one ruler
- Class B: the census's ten unexplained walls go to zero with no road moving
- Class A: the owner's rule is enforced by whichever route is chosen, and the photo site
      reads as two roads on their own earthworks

#### Status 2026-09-08

Class A is FEAT-77 (built on `feature/junction-stitch`: the rule in the conflict walk + a second
routing pass; residue tracked by `test/road-clearance.mjs`). Class B stays here: the gate's
report line counts the carve-made walls (41–49 across the battery as the network moves).

#### Class B — Spare, 2026-11-01: the composition is fixed; overlap ruled FEAT-77's (a)

**Cause.** `_carveCrossSectionBlended` mixed the winning run with ONE rival by nearness (50/50 at the
equidistant line, fading out over a 12 m band). Four defects, each a step no single bank has:
1. A rival whose toe had already ended (blendW 0, i.e. raw ground) was still averaged in at 50 %,
   which folded the other road's bank into a step at the midline (the ticket's seed 6 (-926,-677)).
2. Only the nearest rival counted, so when the second-nearest run changed (a junction's legs), a
   leg's whole bank dropped out at once (seed 3 (-1211,871)).
3. A far interior run with no carve at the point blocked the BUG-57 polar cap of a run ending right
   there: a 5.9 m notch at an anchor bend (seed 20 (1748,418), 80°, the ticket's other named site).
4. Rivals were re-projected from the polyline foot (not the perpendicular foot) and never got the
   analytic-frame refinement the winner gets, so the flip between them was a 0.45 m step 27 m out.

**Fix (landed on feature/spare 2026-11-01 after ruling (a) below; was parked on `proto/bug-64-earthwork-union` f666cdb4).** Every run and run end within the resolver footprint is a rival
(`nr.rivals`), each anchored at the resolve point and re-projected live on its refined frame
(`_refineFrame`, now shared with the winner). They compose as earthwork: fills union by max,
cuts by min, and a fill meeting a cut sums. A run end that is radially nearer than the interior
winner takes the point. Over the winner's core and shoulder, each rival is eased from the winner's
own surface to its own. No road moves, and `CROSS_BLEND_BAND` is retired.

**The ruler: `test/road-carve-walls.mjs` (new, registered).** It walks the ground between every
close pair at 1 m, at road-clearance's stations (`test/lib/close-pairs.mjs`, now shared). A step
counts as a COMPOSITION wall when all three hold:
- it is steeper than `roadCutSlope`;
- the raw ground under it is gentler than 31°;
- it is more than 0.25 m/m steeper than every road's own bank there (the pair plus every run that
  reaches it).

Two classes are REPORTED, not gated:
- single-bank walls: by design, a cut deeper than ~5 m peaks at 1.5:1 mid-bank and a fill deeper
  than ~17 m is steepened by the toe cap;
- overlapping earthwork: two or more roads' banks reach the same step.

| battery (9 windows) | main 9143ba8b | branch |
|---|---|---|
| composition walls (gate) | **33** | **0** |
| pairs with any step > 45° | 47 | 34 |
| … > 60° | 16 | 13 |
| … > 70° | 2 | 2 |
| median / worst | 54.5° / 80° | 55.2° / 76.5° |

**What it cannot fix: overlap.** Most of the remaining steep pairs are two roads whose earthworks
really do reach each other. That includes the ticket's "40–60 m apart, unexplained" pairs. FEAT-77's
`_v2ClearReq` caps each foot at carveHalfWidth + roadMaxEmbankmentToe (18 m), but the carve's toe
reaches DEEP_BANK_TOE_EXTRA further (36 m). So two roads 50 m apart on a 5 m fill pass the rule,
yet their banks overlap. Making the rule use the carve's real toe is class A, and it moves routes.

**Gates.** The affected suite was 51/53 green. Red: road-clearance (the known FEAT-77 red) and
**road-fill-support, seed 7 (-175,938)**. That site is two legs of one node, 27 m apart, with the
other leg's fill standing 3.5 m above this leg's outer shoulder (overlap, class A). The neighbour's
bank now ramps onto the shoulder at 0.293 m per 0.2 m (56°), against the gate's 0.268 tolerance.
On main the same pair had a 65° wall at the midline. Three variants were measured:

| variant | composition walls | > 60° | fill-support |
|---|---|---|---|
| ease over 1.5 m from raw | 0 | 7 | 0.352 |
| (1 − blendW_owner) weighting | 0 | 29 | green, but 15 pairs > 70° |
| **ease from the owner's surface over 5.5 m (the candidate)** | **0** | **13** | **0.293** |
| ease over 8 m | 7 | 7 | 0.282 |

**Ruled (owner, 2026-11-01): (a).** The candidate lands. road-fill-support learns the overlap rule:
an UP-step where two or more roads' earthworks reach either end of the step is reported as FEAT-77's
and never gated; the tolerance (0.268 m) is unchanged. Both gates judge overlap with one function,
`soloEarthwork` in `test/lib/close-pairs.mjs` (moved out of road-carve-walls). Measured on the
landed branch: seed 7's 0.293 m step at (-169, 931) reads as overlap. The steps leading up to it on
the same shoulder ramp (lat 8.2–8.6 m, 0.234–0.268 m) sit on the near side of where the other leg's
earthwork begins and stay under the tolerance. Main's worst on seed 7 is 0.184 m, at a different
site. The other three seeds are unchanged. Class A (FEAT-77's foot = the carve's real toe) stays
open and moves routes.

**The call that was owed (owner).**
- (a) Land the candidate and teach road-fill-support the same overlap rule as road-carve-walls:
  an up-step where two roads' earthworks both reach the point belongs to FEAT-77, not to the
  footprint contract BUG-15 guards. The tolerance itself stays.
- (b) Hold it until class A makes FEAT-77's foot the carve's real toe, so overlapping pairs stop
  being built. That moves routes.

Spare recommends (a). Every other count is no worse than main or better, and the seed-7 pair was
already a 65° wall at the midline on main. Cost: carve sampling is ~4 % slower (2.76 → 2.88 µs per
sample on seed 6, 2.50 → 2.58 µs on seed 20). cdp-smoke passed 3 of 5 runs on the branch; the 2
failures were the known save-step flake (truck pinned near the farm at (-862,558)), and main's carve
failed 1 of 3 on the offer step.

## Tracker
- [x] A gate walks the ground between every close pair (bores and throats excluded) and fails on composed slope >
      `roadCutSlope` where the raw terrain is gentler (`test/road-carve-walls.mjs`, 2026-11-01)
- [x] Class B: the census's unexplained walls go to zero with no road moving (battery 33 → 0; 400 random worlds: 6,
      the worst two are switchback passes, BUG-130 family)
- [ ] Class A: the owner's rule is enforced by whichever route is chosen (FEAT-77; owner pick 2026-11-22)

## Decisions
- 2026-09-07, owner: adjacent roads keep 12 m of daylight and neither road's earthwork may reach the other (DEC-071).
- 2026-11-01, owner: (a) land the class-B composition fix; road-fill-support learns the overlap rule. "i dont think
  its really bothering me (same with bug-64 vertical walls)."

## Open questions
- Close BUG-64 with class A left in FEAT-77, or build the rule-foot change (with the planner work it needs)?
- DEC-071 says no earthwork may reach the other road; the built rule caps the foot at 18 m. Is the cap an accepted
  approximation, or does DEC-071 want the real toe?

## Links
Card `~/CodeShit/ledorepo/projects/cargame/owed/bug64-walls-pick.json` · sheet
`/Users/ledogen/CodeShit/CarGame-bug64/wip/bug-64/sheet.jpg` · census logs `wip/bug-64/census-*.jsonl`,
`summary-main.txt`, `summary-toe.txt` (git-invisible, in the bug64 worktree).

## Files
`src/road.js` (`_carveCrossSectionBlended`, `_v2ClearPrm`) · `src/corridor-router.js` (`clearReq`) ·
`src/road-carve.js` (`DEEP_BANK_TOE_EXTRA`) · `test/road-carve-walls.mjs` · `test/lib/close-pairs.mjs`

## Log
- 2026-11-22: re-measured on main ece7a251 over 400 random seeds (table above); no seed over its 150 s cap. Two
  fixes measured as experiments, nothing built, `src/` untouched. Owner's original site no longer has a second road.
- 2026-11-24: CLOSED. Owner, card bug64-walls-pick: "1. Close BUG-64; overlap walls stay in FEAT-77; new ticket for the switchback step". The jagged edges and the switchback step are BUG-258.
