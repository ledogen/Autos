---
id: BUG-153
type: bug
status: open
severity: major
opened: 2026-11-08
source: Lane B, BUG-149's leg lip (seed 1074499174)
relates: BUG-149 (depends on this), BUG-12 (the ribbon's continuous frame), BUG-82 (ribbon-pad weld), FEAT-10 (deg-2 join weld), the corner-facet fix (_refineFrame)
---
lane: B

# BUG-153: the drawn ribbon tilts against physics on curves — the wheel rides up to ~0.1 m off the asphalt past junction mouths

MESH == PHYSICS breaks on the ribbon wherever a leg curves, and it is worst just past junction mouths, where legs
bend into the node on slopes. On the centreline the two agree exactly. Off it, physics − drawn grows linearly with the
lateral offset: the drawn ribbon is TILTED against the surface the wheel rides. The truck's body collides with the
drawn ribbon (the road-tile trimesh) while its wheels ride the analytic carve, so the two disagree by the same amount.

BUG-149's 0.263 m leg lip (seed 1074499174, `g:745990,432424,-1:0,1,1`, side 1, s 12) is this: the drawn lip there is
0.128 m (the designed 0.15), and physics stands 0.134 m above the drawn ribbon.

## Mechanism

- **Physics' frame:** `_resolveRoadSurface` → `_refineFrame` projects onto the run's exact analytic centerline
  (`e.centerline.nearest(...).tangent`, the corner-facet fix).
- **The ribbon's frame:** `road-mesh.js _ribbonSection` builds each cross-section on `runProfile(arcS).tx/tz`.
  `_buildRunProfile` sets `tx[i]` to the INCOMING chord (vertex i−1 → i), and `_interpolateRunProfile` interpolates
  it linearly. So on a curve the section frame trails the true tangent.
- **The height error:** every vertex of a section takes the height of the section's arc, but physics re-projects the
  vertex to a different arc. The error is ≈ grade × lat × tan(frame lag).
- **Measured** (`wip/bug-147/tangents.mjs`, the BUG-149 leg): polyline vertices every 4.0 m on a curve turning 9.5°
  per chord (radius ≈ 24 m). The frame lags physics' tangent by 9.5° from s 4 to s 11, by 3.6° at s 14, and by 0
  from s 16, where the leg straightens.
- **At the ribbon's own vertices** (`wip/bug-147/mouth-verts.mjs`, potholes off): physics − vertex is 0.000 on the
  centreline, +0.087 m at lat 3.73 beside the mouth, and +0.036 / −0.024 m at lat ±3.75 by s 14.6. On this 14–25 %
  leg, 0.2 × 3.73 × tan 8° ≈ 0.10 m.

## Census

Probe: `wip/bug-147/mouth-float.mjs`. Each leg's OWN ribbon (a hit triangle's centroid resolves to the leg) is raycast,
and compared with physics at wheel height, potholes off. The table gives each leg's worst |physics − drawn| at lat
−4.5 / 0 / +4.5, by distance past its mouth.

| seed | pads | legs | 0–5 m median | 0–5 m max | 5–10 m median | 5–10 m max | 10–15 m median | 10–15 m max |
|---|---|---|---|---|---|---|---|---|
| 1074499174 | 5 | 13 | 9.3 cm | 34 cm | 2.1 cm | 18 cm | 1.5 cm | 42 cm |
| 6 (test seed) | 7 | 21 | 9.4 cm | 17 cm | 2.7 cm | 15 cm | 1.7 cm | 12 cm |

Calibration: 40–60 m past the mouths on seed 1074499174, the same probe reads < 2 cm on 12 of 13 legs and 2–5 cm on
1. The probe is sound, and the gap lives on the curves next to junctions. Mid-road curves have the same mechanism,
scaled by their own curvature, grade and chord spacing; not yet censused.

## Acceptance

- [ ] The drawn ribbon matches physics across its width on curves: the census above under ~2 cm in every band, at the
      pads and mid-road, on random seeds and seed 6.
- [ ] The ribbon-pad weld (BUG-82) and the deg-2 join seal (FEAT-10) still hold.
- [ ] BUG-149's leg lip measures the designed ~0.15 m in physics, as it already does drawn.
- [ ] A gate pins it: ribbon vertices vs physics at the same x,z.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-153`)

**The frame.** `road.js runFrameAt(arcS, runKey)` is runProfile's sample with tx/tz replaced by the tangent physics
projects onto: the run's analytic centerline at the true arc (`_refineFrame`'s eligibility; the chord tangent stands in a
T departure band, as in physics). FEAT-10's degree-2 weld is re-applied on top: the same directions, the same smoothstep
over roadJoinWeldLength. Every reader that draws or rebuilds the ribbon's edge takes it, so the BUG-82 weld still holds:
`_ribbonSection` (the sweep and the pad mouths' weld sections), the deg-2 lead-ins, `_junctionMouths` / `_ringHasMouth`
(the ring's mouth chords), the crotch walk, the deg-2 connector mouths, and `_legDeckTop` (the leg deck under a pad).
`runProfile.tx` stays the chord tangent for everything else: curvature, the tunnel tube and portals, the lip frames.

**Measured** (`test/ribbon-frame.mjs`'s census: every drawn section's pavement vertices vs physics at the same x,z,
potholes off, R 640):

| seed | main: verts ≥ 2 cm (frame class) | main worst | fix: verts ≥ 2 cm | fix worst |
|---|---|---|---|---|
| 273004588 | 232 | 19.7 cm | 0 | 1.0 cm |
| 2654449719 | 303 | 6.2 cm | 0 | 0.5 cm |
| 1074499174 | 461 | 6.9 cm | 0 | < 2 cm |
| 6 (test seed) | 188 | 5.7 cm | 0 | 0.8 cm |

BUG-149's leg (1074499174, `g:745990,432424,-1:0,1,1`, side 1): drawn == physics to 1 mm at s 11 / 12 / 13 (main
+0.128 / +0.134 / +0.100). The physics lip at s 12 is now 0.128 m (main 0.262 m), the designed edge.

**Two other mechanisms remain, both physics-side and the same on main** (the gate reports them apart):
- **A promoted T's departure band** (`offCurveSpans`, the last ~30 m before the T): physics deliberately frames on the
  raw polyline chords there (the points left the centerline), so its frame jumps up to 15° at every vertex. A smooth
  ribbon cannot follow a faceted surface: 58 / 37 / 20 / 0 vertices ≥ 2 cm, up to 0.38 m on a 10°-banked curve
  (2654449719, (126.8, −182.1)).
- **The QUAL-10 ruled blend leaks onto a leg's own pavement.** Near a node, physics blends every in-range leg's grade;
  the soft gap clamp (RULE_SOFT 1.2) leaves a sibling up to ~12 % of the weight at the pavement edge, so physics bends
  toward the sibling's grade where the ribbon does not. At the vertices: 25–88 per seed, up to 8.2 cm. Between them it
  is worse at the edge: −0.34 m at lat 4.5, 0.5 m past a mouth (1074499174 `g:745990,432424,-1:1,1,1`). And physics
  steps by that same 0.34 m across the mouth chord, because the pad side snaps to the leg's unblended deck.
