---
id: BUG-154
type: bug
status: landed eabc032c — open only for the owner's look at the photo sheets + the 2.5 cm band bar (owed road-seams-look)
severity: major
opened: 2026-11-08
source: Lane B, BUG-153's census (test/ribbon-frame.mjs, reported apart)
relates: BUG-153 (the ribbon frame), BUG-53 (offCurveSpans), the corner-facet fix (_refineFrame)
---
lane: B

# BUG-154: in a promoted T's departure band, physics STEPS at every polyline vertex (up to 0.43 m at the pavement edge) and the drawn ribbon is smooth

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

## Diagnosis (Lane B, 2026-11-08, by reading + one probe)

**Physics in the band is not just faceted: it steps.** In a band, `_resolveRoadSurface` takes `_projectOntoRun`'s
nearest CHORD SEGMENT (clamped), whose tangent is that segment's direction. A point beside a polyline vertex therefore
changes owner abruptly:
- **On the inside of a bend,** the two segments' projections overlap and the owner flips at the bisector. The foot's
  arc jumps by 2 · lat · tan(θ/2), and the height by grade × that jump.
- **On the outside,** the vertex's wedge is framed by one segment's direction until the next segment's foot leaves the
  vertex. The arc then jumps by lat · sin θ.

The corner-facet fix's own note already calls this "staircasing collision". `_refineFrame` cured it everywhere except
here, because in a band the points have left the centerline.

**Measured** (`wip/bug-153/band-steps.mjs`: physics every 5 cm along lines parallel to the run, inside the band, at
wheel height). 2654449719, `g:-1,-1,0:151540,-173831,-1`, band 494.8–529.2, vertices at 496.8 / 500.7 / 505.0 / 509.8
/ … m:

| lat | 5 cm steps over 3 cm | worst step |
|---|---|---|
| −4.5 | 5 | 42.5 cm (arc 500.0, a vertex) |
| −3.75 | 5 | 34.3 cm |
| 0 | 0 | 1.6 cm (the grade itself) |
| +3.75 | 4 | 17.9 cm |
| +4.5 | 5 | 21.5 cm |

So a wheel near the pavement edge in a departure band meets a 0.2–0.4 m step at every vertex where the band turns
hard. The drawn ribbon is smooth there, and that is the 0.38 m drawn/driven split.

## Owner decision (2026-11-08 17:02Z, tracker owed `bug154-frame`: "changes")
Verbatim: "i believe that this is diagnosed properly but i have not noticed itself in game myself. fix it and show proof
of the issue with photos so i can see whats actually fixed. I may have just written this off as General Glitchiness So
it very well could be real But I'm having trouble picturing it without pictures"
Orchestrator: build option A. The deliverable is before/after PHOTOS: the step visible before and gone after, at
2654449719 plus one more random seed.

## Options

**A — a continuous frame on the band's own polyline (recommended).** Give each band vertex the bisector of its two
chords as its tangent, and interpolate linearly along each chord. Positions stay on the chords, the same points
`_buildRunProfile` integrates, so the BUG-53 reason for declining the centerline still holds. Physics' band path
solves the foot by projecting onto that frame: s ← s + (w − c(s)) · t(s), the fixed-point loop `_legDeckTop` already
runs, starting from today's nearest-segment foot. runFrameAt's band fallback returns the same tangent, so the ribbon
and physics share one frame. That replaces today's lagging incoming-chord tangent.
- The frame is continuous, so the foot is continuous for lat below the band's turn radius (chord / turn ≈ 4 m / 15°
  ≈ 15 m at the site above): no steps on the pavement or its shoulders.
- Cost: a few loop passes per physics sample, in bands only (≤ ~35 m per promoted T).
- Residual: the ribbon's centre rides the slice spline, which rounds each vertex, while physics' centre is on the
  chords. That is ≤ ~10 cm laterally near a vertex (the BUG-153 census saw 0.104 m), times a cross-slope of up to
  ~17 % on these banked bands: ~1–2 cm. Marginal against `ribbon-frame.mjs`'s 2 cm.
- Edge case: on the inside of a tight band curve, past ~15 m lateral (the dirt bank, not the pavement), the foot can
  stop being unique. Take the nearest solution, as the analytic path does. bank-steps covers it.

**B — a smooth band curve (the upgrade if A's residual shows).** Fit the band's points with the same centripetal
Catmull-Rom the ribbon slices are swept along, cache it per run, and give `_refineFrame` a nearest-point projection on
it in bands. Physics and the ribbon's centre would then be the same curve, with a C1 frame: no residual, and no shading
facets at the vertices. Cost: a spline nearest-point routine (Centerline.nearest's pattern) plus a per-run cache.

**C — an analytic primitive for the deflection, in the plan layer (not recommended).** If the router emitted the
departure band as a real centerline segment, offCurveSpans would not be needed at all. But it changes the network
itself, so everything downstream moves (fingerprint-wide), for the same outcome as B.

**Rejected: facet the ribbon to match physics.** That draws the staircase instead of removing it.

## Measure (when the hold lifts)
- `band-steps.mjs` on the band sites: no 5 cm step over ~3 cm at any lat.
- `ribbon-frame.mjs`: the band class → 0 vertices ≥ 2 cm, then fold it into the PASS.
- Gates: road-smoothness, bank-steps, shoulder-lateral-continuity, junction-edge-lip, and the rest of the affected
  set.
- Fingerprint: surface / carve move only inside bands (lattice proof).

## Implemented: option A (Lane B, 2026-11-08, `land/bug-155` f8f82d98, after BUG-155)

`road.js`, under the BUG-154 docstring before `_resolveRoadSurface`:
- `_bandInfo(e)` is cached per run. It marks which polyline vertices still sit on the centerline (within 1 cm). It
  widens each offCurveSpan out to the nearest such vertex.
- `_bandTangent` gives an on-centerline vertex the analytic tangent, and every other band vertex the bisector of its
  two chords.
- `_bandFrameAt(e, s)`: the position is on the chord, and the tangent is the linear blend of the chord's two end
  tangents. `runFrameAt` uses it in a band, so the ribbon gets the same frame as physics.
- `_bandRefine` (from `_refineFrame` in a band): the foot of a query point is where the frame's normal passes through
  it. Per chord that is a quadratic in u, the fraction along the chord. It is solved exactly, and the nearest root in
  [0, 1] over the five chords around the old foot wins.

Why the widening: my first version switched from the analytic frame to the band frame at s0 − 0.5, and left a 14.3 cm
step there. At an on-centerline vertex the two frames are identical, so switching there carries no step.

**Measured, desk probes only** (no gates yet). Band `g:-1,-1,0:151540,-173831,-1` at 2654449719 (s 494.8–529.2):

| measure | before | after |
|---|---|---|
| worst 5 cm step, lat −4.5 / −3.75 / 0 / 3.75 / 4.5 (`band-steps.mjs`) | 42.5 / 34.3 / 1.6 / 17.9 / 21.5 cm | 2.1 / 2.0 / 1.6 / 1.4 / 1.4 cm |
| drawn vs physics, band class, R 256 (`sec-census.mjs`) | 37 vertices ≥ 2 cm, worst 37.8 cm | 5, worst 2.3 cm |

The 1.6 cm at lat 0 is the grade itself over 5 cm, the same before and after. The 2.3 cm residual is the one option A
predicted: the ribbon's centre rides the slice spline, physics' centre rides the chords. At 1074499174 the band class
goes from 20 vertices, worst 6.6 cm, to 0.

**Still owed when the hold lifts:** the affected gates; `ribbon-frame.mjs` with the band class folded in (if the
2.3 cm residual fails 2 cm, the choice is option B or a band tolerance, and that goes back to the orchestrator); the
fingerprint lattice proof; and the deliverable, before/after photos of the step at 2654449719 plus one more random
seed.

## Landing proof (Lane B, 2026-11-09)

Lands with BUG-153 + 155 from `land/bug-155`; the full record is in BUG-153's ticket. Band class gated at 2.5 cm in
`test/ribbon-frame.mjs` (2.3 cm measured at the drawn vertices; 4.3 cm worst over the whole drawn surface inside 3.75 m,
was 35.7 cm). Before/after photos: `wip/bug-153/shots/sheets/sheet-154.jpg` (2654449719's band: 1316 → 164 film cells
off by ≥ 2 cm, worst 53 cm → a few cm on the lane; 1074499174's band: 754 → 92).

## Resolution (2026-11-09)

Landed on main as **eabc032c** (merge of land/bug-155 @ 6caadf81, BUG-153 + 154 + 155 together; affected 83/83 + the 58 gates shared with BUG-140 green; cdp-smoke 26/26 on b34a51e1). Before/after photo sheets: https://claude.ai/artifact/HLqtsmsrjVJJVqrEpkMpr8 (copies in main wip/bug-153-155-shots/).
