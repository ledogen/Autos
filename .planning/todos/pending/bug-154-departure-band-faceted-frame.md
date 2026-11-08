---
id: BUG-154
type: bug
status: open
severity: major
opened: 2026-11-08
source: Lane B, BUG-153's census (test/ribbon-frame.mjs, reported apart)
relates: BUG-153 (the ribbon frame), BUG-53 (offCurveSpans), the corner-facet fix (_refineFrame)
---
lane: B

# BUG-154: in a promoted T's departure band, physics rides a faceted frame the drawn ribbon cannot follow — up to 0.38 m

In `offCurveSpans` (a promoted T's departure band, the last ~30 m before the T; also shove deflections), `_refineFrame`
declines on purpose: the points have left the centerline. So physics frames on the raw 4 m polyline chords, and its
tangent jumps at every vertex (15° per chord on the sites below). The drawn ribbon uses a smooth tangent
(runFrameAt's fallback, runProfile's interpolated chord). On a banked, graded curve the two disagree at the pavement edge.

Census (BUG-153's gate, R 640, potholes off): 58 / 37 / 20 / 0 pavement vertices ≥ 2 cm on 273004588 / 2654449719 /
1074499174 / 6, worst 0.378 m at 2654449719 (126.8, −182.1), run `g:-1,-1,0:151540,-173831,-1` (band s 494.8–529.2,
camber 9–12°). The same on main.

## Acceptance
- [ ] Physics and the drawn ribbon agree in departure bands to < 2 cm across the width (fold the band class into
      `test/ribbon-frame.mjs`'s PASS).
- [ ] The band's carve stays on its points: no frame that pulls the surface off the deflected polyline.
