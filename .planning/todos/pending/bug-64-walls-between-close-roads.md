---
id: BUG-64
type: bug
status: pending
severity: major
---

# BUG-64 — near-vertical walls between two roads: two classes, only one is clearance

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

## Two fixes, not one

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

## Acceptance

- [ ] A gate walks the ground between every close pair (bores and throats excluded) and fails on
      composed slope > `roadCutSlope` where the raw terrain is gentler — both classes, one ruler
- [ ] Class B: the census's ten unexplained walls go to zero with no road moving
- [ ] Class A: the owner's rule is enforced by whichever route is chosen, and the photo site
      reads as two roads on their own earthworks

## Status 2026-09-08

Class A is FEAT-77 (built on `feature/junction-stitch`: the rule in the conflict walk + a second
routing pass; residue tracked by `test/road-clearance.mjs`). Class B stays here: the gate's
report line counts the carve-made walls (41–49 across the battery as the network moves).

## Class B — Spare, 2026-11-01: the composition is fixed; overlap ruled FEAT-77's (a)

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
