---
id: BUG-155
type: bug
status: open
severity: major
opened: 2026-11-08
source: Lane B, BUG-153's census (test/ribbon-frame.mjs, reported apart)
relates: BUG-153, QUAL-10 (the inter-leg ruled blend, _carveDirtY), BUG-82 (ribbon-pad weld), _padRibbonMask / _legDeckTop
---
lane: B

# BUG-155: the QUAL-10 ruled blend leaks onto a leg's own pavement — physics 0.34 m under the drawn ribbon, and a 0.34 m step at the mouth chord

Near a node, physics' leg cross-section (`_carveDirtY` with wx,wz) blends every in-range leg's grade with barycentric
weights. The intent in its comment is that the driving ribbon "never moves": on its own asphalt a leg should keep weight
1. But the soft gap clamp (RULE_SOFT 1.2) never reaches 0 on the pavement: at gap −0.5 m (lat 4.5) the own leg keeps
0.4, so a sibling 3 m away keeps ~12 % of the weight. Physics bends toward the sibling's grade where the drawn ribbon
(the leg's own formula) does not.

- 1074499174, leg `g:745990,432424,-1:1,1,1` at node (746, 432): physics − drawn = −0.337 m at lat 4.5, 0.5 m past the
  mouth, fading to 0 by 4.5 m. At the ribbon's vertices (stations ≤ 3.75) the class is 25–88 per seed, worst 8.2 cm.
- **A physics step at the mouth chord:** inside the ring the pad's mouth mask snaps to the leg's UNBLENDED deck
  (`_legDeckTop`, no wx,wz), and just outside it the on-ribbon branch is blended. At the site above physics drops
  0.337 m within 0.5 m at the edge.

## Before any edit
A proposal (orchestrator, 2026-11-08): how the inter-leg crease stays dead (the blend exists to kill the step at the
Voronoi boundary between two legs), and whether the owner's QUAL-10 ruling constrains the fix.

## Acceptance
- [ ] On a leg's own drawn pavement physics rides the drawn ribbon (< 2 cm; fold the blend class into
      `test/ribbon-frame.mjs`'s PASS), and there is no step at the mouth chord.
- [ ] The inter-leg crease stays dead (shoulder-lateral-continuity, junction-edge-lip, bank-steps).
