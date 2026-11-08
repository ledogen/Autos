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
