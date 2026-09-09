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
