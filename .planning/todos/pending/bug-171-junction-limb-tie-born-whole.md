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
Orchestrator: land `land/bug-171` (main merged at 9d289a2b, cost fix d2976022) and run the full smoke. The owner's
condition (DEC-261, no significant cost) is met: with the per-leg frame cache the foot costs no more than main's. Next
root after landing: the road-to-road seam (winner class, with BUG-179).

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
- [x] Affected gates 75/75 green (logs/c171-gates.log); fingerprint-world: only surface / carve differ.
- [ ] Owner answers the option-2 dive (keep 2 / option 3 next / other).

- [x] Owner answered: keep option 2, fix the rest by construction (DEC-260).
- [x] Option 3 judged against DEC-260: it is a kernel average of the leg's height over ~2 m of arc, not a construction
      fix → replaced by the continuous-frame foot (853bc4e0).
- [x] Census: steps 909 → 88 sites (≥ 15 cm 205 → 27; limb 593 → 8, other 250 → 8); ramps ≥ 15 cm/5 cm 109 → 113.
- [x] Affected gates 75/75 green (logs/c171-gates3.log); fingerprint-world: network/profiles/junctions/poi identical, carve-downstream differ.
- [x] Owner answers the follow-on dive: land after a cost check, seam next (DEC-261).
- [x] Main merged (9d289a2b); census identical to before the merge (steps 88, >= 30 cm 7).
- [x] Cost check (DEC-261): foot frame cached per leg (d2976022), at or below main's cost; output identical.
- [ ] Orchestrator lands it + full smoke.

### The foot fix (built 2026-11-15, 853bc4e0)
`_projectLegNearNode` now finds limb feet on a continuous frame: each vertex's tangent is the unit bisector of its two
chords, interpolated linearly along each chord, positions on the chords. A foot is a root of g(t) = (q − P(t))·T(t), a
quadratic per chord, solved exactly; the walk profile for `_limbWeight` is D(s) = |q − P(start)|² − 2∫g ds (closed
form), whose stationary points ARE g's roots. Using the chord distance at the roots instead left a max root below its
min (a weight flip 0 → 1 in 0.4 mm, 1.14 m step, seed 917338424): the integral is what makes it consistent. The 4 m
dedupe is gone. No network or road shape changes.

### What remains after the foot fix (census, 9 seeds, sites ≥ 15 cm)
winner 16 (the resolver's Voronoi seam between two runs: a different root) · limb 5 (a NODE handover: the run's two ends
are both junctions and the carve swaps node, seed 565500664 (−117.9, 89.7), 1.16 m) · other 3 · rivalSet 2 (1.55 m,
seed 407711925) · rivalFrame 1. Ramps: worst 1.65 m per 5 cm at seed 1074499174 (738.2, 407.5), where the ground stands
5.5 m above raw and above every leg's grade (not the limb blend: the feet there are still). Rolling radius 0.368 m.

### The remaining class: the polyline foot hop (found 2026-11-15; fixed by 853bc4e0)
579 of 602 base limb sites (168 of 183 > 0.15 m) keep the same limb count: one limb's foot hops 1–4 m along its leg.
Worst (seed 407711925, 1.46 m): foot 949.29 → 945.75 m at distances 14.511 / 14.512 m, segments 237 → 236. Inside a
bend near its centre of curvature, every polyline segment holds its own nearest point and `_projectLegNearNode` keeps the
lowest of a run of segments, so the foot jumps about one segment length where two are equidistant: rays from the bend
centre through each polyline vertex (visible as red fans in the dive's hillshades). Not the 4 m dedupe (setting it to
0.05 m changes nothing) and not the tie term.

## Decisions
DEC-231 (option 2 first, pictures) · DEC-260 (keep option 2; the rest by construction, never averaged away) · DEC-261
(land after a cost check; the road-to-road seam next).

## Open questions
- Which option, or is gore dirt off the deck acceptable as is for the alpha? (Lane C recommends option 2 first: a
  few lines, measurable in one census; option 3 only if 2 leaves the wrap ramps.)

## Files
`src/road.js` (`_limbWeight`, the self-pass loop under "BUG-130: EVERY other pass") · `test/junction-dirt-census.mjs`

## Log
- 2026-11-16: merged main (9d289a2b); census identical (logs/c171-merged.*). Cost (DEC-261, wip/bug171-cost/, seeds
  432747997, 3874494043, 4260169642, cold net + 2 × 81-chunk windows, A-B-A-B ×3): 42–82 k foot calls per run, all on the
  per-vertex carve path (0 in the network build). As built: 0.2 → 0.7 µs/call, +3–5 % of terrain window build. Frame
  cached per leg (d2976022): 0.17 µs/call vs main 0.19–0.24, −0.3 % of window; whole-run wall/instr spread ±5–10 %, so
  no difference is visible there. Fingerprint: cached == uncached; vs main only surface/carve/tiles/water/props differ.
- 2026-11-15: merged main (f68d17ee); option-2 census unchanged (logs/c171-opt2m.*). DEC-260. Option 3 replaced by the
  continuous-frame foot (853bc4e0): census logs/c171-foot.* steps 909 → 88. BUG-179 checked: different root.
- 2026-11-15: option 2 built (3f09bb72). Census logs/c171-base.* vs logs/c171-opt2.*: rivalSet 16/8/2.00 → 3/2/1.55,
  limb births 14 → 2, limb hops 579 → 582 unchanged; steps → ramps of 0.86 and 0.76 m per 5 cm at two sites. Dive
  BUG-171-option2-gore-steps.html (5 sites on 5 random seeds, game + physics-ground pairs). Gates 75/75 green.
- 2026-11-14: filed from BUG-158's census (logs/c158-A.log base, logs/c158-head.log head, in the content worktree).
