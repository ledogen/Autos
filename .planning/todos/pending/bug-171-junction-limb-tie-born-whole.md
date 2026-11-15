---
id: BUG-171
type: bug
status: open
severity: minor
opened: 2026-11-14
source: Lane C, BUG-158's junction-dirt census (land/bug-158)
relates: BUG-158 (the classes fixed beside it), BUG-156 (_limbWeight), BUG-130 (the self-pass rival fade), src/road.js
---
lane: C

# BUG-171: junction dirt steps where a limb or self pass is born inside the tie distance

## Next steps
Owner: answer the dive `.planning/dives/BUG-171-option2-gore-steps.html` (keep option 2 / option 3 next / other).
Option 2 is built on land/bug-171 (not landed). It fixed the born-at-a-fold classes; the remaining 582 limb sites are a
different root (the polyline foot hop, see Description), which only option 3 or a smooth-curve foot can fix.

## Summary
Off the deck in junction dirt, the physics ground still jumps 0.15–2.0 m inside one 5 cm move at 618 census sites.
Both classes left over from BUG-158 have one root: the TIE term. A leg limb (`_limbWeight`, BUG-156) or a self pass of
the winner's run (the rival fade, BUG-130) that is born at a fold within the tie distance of the nearer one counts
WHOLE at birth, so its carve appears as a step instead of fading in.

## Description
### Measured (test/junction-dirt-census.mjs, 9 random seeds, R 1000 m, a site = a discontinuity ≥ 2 cm at 0.5 mm)
| class | sites | > 0.15 m | worst | root |
|---|---|---|---|---|
| limb | 602 | 183 | 1.46 m (seed 407711925, near node −898,−47) | `max(…, smooth(1 − δ / RULE_LIMB_TIE))` in `_limbWeight`, RULE_LIMB_TIE 0.5 m |
| rivalSet | 16 | 8 | 2.00 m (same node) | `max(prom term, smooth(1 − (d − dW) / RIVAL_TIE_M))` in the self-pass fade, RIVAL_TIE_M 2.5 m |

Identical on base 1190dfe4 and on land/bug-158 head: BUG-158's three fixes do not touch either.

### Why the tie term exists
At a FLIP the two passes are equidistant and must weigh the same (the winner is always whole), so the nearer-but-not-
winning one must also be whole there. The term buys that. Where a leg wraps the query at near-constant distance
(bending round the gore), every minimum is shallow and they trade places within centimetres; BUG-156 measured that a
pure depth weight (tie 0) turns those wraps into steep ramps (up to 1.08 m per 5 cm), 157 sites gone but 7 worse.

### Redesign options, simplest first
1. **Shrink the ties** (RULE_LIMB_TIE 0.5 → ~0.1 m, RIVAL_TIE_M 2.5 → ~0.5 m). One-line change; trades the steps
   for steeper ramps on the wrap. Census tells how many of each.
2. **Gate the tie by prominence**: tie term × smooth(p / ε), ε ~ 0.1 m. A minimum born at a fold (p = 0) starts at 0;
   at a flip of two developed minima (p > ε) it is whole. A fold within ε of a flip still ramps over ε.
3. **Soft-min across the wrap** (the real fix): stop enumerating minima. Weight every point of the run's distance
   profile along arc by a kernel of its distance (e.g. exp(−(d − dmin)/τ)) and blend the carve by those weights.
   Continuous in the query position by construction, so no birth, death or flip can step. Costs more samples per
   resolve near a junction (perf to measure with PERF-40), and it rewrites the limb model in `_carveDirtY` and the
   self-pass rivals.

## Tracker
- [x] Owner picks an option: option 2 first, pictures in a deep dive (DEC-231).
- [x] Option 2 built (land/bug-171, TIE_PROM_M 0.1 m on both tie terms).
- [x] Census: limb and rivalSet sites > 0.15 m 183 / 8 → 175 / 2; ramp worst stays 1.37 m (ramps > 0.15 m 101 → 109).
- [ ] Affected road gates green; fingerprint-world changes only surface / carve (fingerprint: only surface / carve differ).
- [ ] Owner answers the option-2 dive (keep 2 / option 3 next / other).

### The remaining class: the polyline foot hop (found 2026-11-15)
579 of 602 base limb sites (168 of 183 > 0.15 m) keep the same limb count: one limb's foot hops 1–4 m along its leg.
Worst (seed 407711925, 1.46 m): foot 949.29 → 945.75 m at distances 14.511 / 14.512 m, segments 237 → 236. Inside a
bend near its centre of curvature, every polyline segment holds its own nearest point and `_projectLegNearNode` keeps the
lowest of a run of segments, so the foot jumps about one segment length where two are equidistant: rays from the bend
centre through each polyline vertex (visible as red fans in the dive's hillshades). Not the 4 m dedupe (setting it to
0.05 m changes nothing) and not the tie term.

## Open questions
- Which option, or is gore dirt off the deck acceptable as is for the alpha? (Lane C recommends option 2 first: a
  few lines, measurable in one census; option 3 only if 2 leaves the wrap ramps.)

## Files
`src/road.js` (`_limbWeight`, the self-pass loop under "BUG-130: EVERY other pass") · `test/junction-dirt-census.mjs`

## Log
- 2026-11-15: option 2 built (3f09bb72). Census logs/c171-base.* vs logs/c171-opt2.*: rivalSet 16/8/2.00 → 3/2/1.55,
  limb births 14 → 2, limb hops 579 → 582 unchanged; steps → ramps of 0.86 and 0.76 m per 5 cm at two sites. Dive
  BUG-171-option2-gore-steps.html (5 sites on 5 random seeds, game + physics-ground pairs). Gates: logs/c171-gates.log.
- 2026-11-14: filed from BUG-158's census (logs/c158-A.log base, logs/c158-head.log head, in the content worktree).
