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
