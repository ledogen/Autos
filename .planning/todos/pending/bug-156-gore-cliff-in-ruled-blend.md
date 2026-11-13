---
id: BUG-156
type: bug
status: open
severity: minor
opened: 2026-11-09
source: Lane B, BUG-155's gore measurements (land/bug-155)
relates: BUG-155 (the one-sided clamp), QUAL-10 (the ruled blend, _carveDirtY), BUG-150 / BUG-149 (_mergeCarve's duck cap)
---
lane: B

# BUG-156: a cliff in the gore dirt beside a steep junction leg — a hard step inside the ruled blend

Seed 1074499174, junction (746, 432), leg `g:745990,432424,-1:0,1,1`, 1.5 m past its mouth, on the side away from
the BUG-155 leg: physics steps up in 10 cm of lateral travel. Both points resolve to the same run at the same arc, off
the pavement and outside the pad ring, so it is not a run switch and not the pad. It is a discontinuity inside the
dirt surface (`wip/bug-153/gore-prof.mjs`, physics across the gore):

| tree | where | step |
|---|---|---|
| main ff39a05e | lat 7.4 → 7.6 | 0.47 m |
| land/bug-155 | lat 8.2 → 8.3 (737.7, 442.1) | 0.76 m (0.86 m over 0.2 m) |

`gore.mjs` on the other leg at that node reads 1.16 m on main, 1.08 m on the branch, also ~1 m past the mouth: the same
kind of cliff. The gore on both sides of this steep node is otherwise a smooth 33–85 % ramp.

A smooth blend cannot make a step, so something in the dirt path switches hard. Candidates, unverified: the ruled
blend's plausibility guard (`|legGrade − nodeY| > MAX_LEG_SLOPE·along + halfWidth` drops a leg outright), a projection
limb appearing or vanishing, or `_mergeCarve`'s duck cap (BUG-150's rim-lip mechanism). BUG-155's one-sided clamp makes
the remaining weights more concentrated, so whatever switches here now moves more height.

## Acceptance
- [ ] No 5 cm lateral step over ~5 cm in gore dirt within 15 m past a padded mouth, on 1074499174 and the
      junction-edge-lip seeds (`wip/bug-153/gores.mjs` reports the worst step per leg).

## Root cause (Lane B, 2026-11-09)

Not the plausibility guard and not the duck cap: a **projection limb being born**. `_projectLegNearNode` returns every
local-minimum foot ("limb") of a leg in its ±40 m window, and `_carveDirtY` counts each as a leg of its own. Near a
steep leg that bends round the query, a second local minimum appears where the query crosses the leg's evolute (the
locus of its centres of curvature: on one side of it the distance-along-the-leg profile has one dip, on the other two).
At the site, the leg `g:0,0,1:745990,432424,-1` grows a second limb (arc 208.9, d 16.33, grade 209.91) between lat
8.20 and 8.25, and it entered the blend at its full taper (0.74) the instant it existed. That is the 0.72 m step. A newborn
dip has zero depth, so the fix is to count a limb by how distinct it is.

## Fix (`land/bug-156` d44b3c32, road.js only)

`_projectLegNearNode` keeps the window's per-segment distances and gives each foot a limb weight `wt` (`_limbWeight`):
- **p** = the limb's prominence: how far the distance rises (to the key saddle) before it falls to a nearer limb.
- **δ** = how much farther this limb is than that nearer one.
- `wt = max(1 − (1 − smooth(p / RIVAL_PROM_M)) · δ / (δ + p),  smooth(1 − δ / RULE_LIMB_TIE))`, the min over both
  sides; 1 for a leg with a single limb.

So a limb is born or dies at weight 0 (p = 0), two limbs swapping which is nearer stay at 1 (δ = 0), and two limbs within
`RULE_LIMB_TIE` = 0.5 m of each other both count whole, as before. `_carveDirtY` multiplies `wt` into the leg's taper. No
other consumer of the projection reads `wt`. No smoother added: the blend is the same blend with one more continuous
factor.

## Measured

| measure | main a60e60db | land/bug-156 |
|---|---|---|
| site, lat 8.20 → 8.25 (`gore-prof`) | 0.716 m | 0.027 m (an even ~54 % ramp) |
| site, lat 8.2 → 8.4 | 0.86 m | 0.12 m |
| worst 10 cm step in a 6 m square on the site (`grid.mjs`) | 0.81 m | 0.36 m |
| ticket leg `…:0,1,1`, worst gore line | 71.6 cm | 18.9 cm |
| 917338424, leg at (−204, −536), worst gore line | 61.1 cm | 8.0 cm |

**Census, 8 random seeds** (1074499174 1353361482 369055107 917338424 749163472 169372896 565500664 775686330; every
padded leg, lat 5.1–14, 0–15 m past the mouth, 5 cm grid): 111 of 5563 junction-disc discontinuities gone, **0 new**;
gore lines 49 of 7254 better by > 2 cm, **0 worse**. **4 more random seeds** (2004008452 1023084652 3208961000 748169566)
held out from tuning: no change at all. Tie values tried: 0 m → 157 gone but 7 lines worse (up to 1.08 m in 5 cm,
steep ramps where a leg wraps the query); 2.5 m → only 52 gone. A tie gated by p (so a near-tie birth also starts at
0) brings back the same 7 worse lines; not taken.

**Re-measured on main 8acdea46** (after PERF-37 / PERF-43 rewrote road.js's ground path; merge 18709db2, one mechanical
conflict: main's taper went into the module scratch `_rbTaper[nB++]`, which now takes `· pr.wt`). The site (`gore-prof`,
lat 8.2 → 8.4): main 0.86 m, branch 0.12 m, the same as before. Census, same 8 seeds: main now has 1596 junction-disc
discontinuities (5563 on a60e60db: main's own landings since removed most of them), the branch 1480: **111 gone, 0 new**;
gore lines 51 better by > 2 cm, **0 worse**. Affected gates for src/road.js on 18709db2: 72/72 green, hint-reuse
(PERF-43's exactness gate) among them.

**World fingerprint vs main:** every component of all six windows identical except `seed11 origin story · carve`.
There, 14 of 1.57 M mesh vertices move, all at one junction (−1411, −726), all within 22.3 m of the node. At that
junction the worst 10 cm steps fall 2.05 → 1.43 m, and six steps of 1.15–2.03 m are gone. A 2.9 m step stays, the
same on both trees (a connector-carve edge: BUG-158).

**Photos:** `wip/bug-156/shots/sheets/bug-156.jpg` in the land/bug-156 worktree. A film laid on the physics ground and
coloured by steepness shows main's red wall across the gore, gone on the branch. The drawn mesh (1 m triangles) smears
the step, so the plain photos look alike.

## Known limit (not fixed here)

A limb born **within 0.5 m of a nearer limb's distance** still enters at the tie weight, because the tie term overrides
the birth fade. That is what is left on the ticket leg (18.9 cm, δ = 0.18 m at birth) and the 53 cm at 775686330
(170.2, −21.8), δ = 0.07 m. Removing it (tie 0, or a p-gated tie) makes 7 gore lines steeper, as above. The real fix
would stop treating a leg as a set of separate feet: a continuous soft-min over the whole leg's distance profile has no
births at all. That is a redesign of the ruled blend's leg sampling, worth its own ticket if these still show.

The census's other big steps are not in the blend: BUG-158 (resolver switches, a connector-carve edge).
