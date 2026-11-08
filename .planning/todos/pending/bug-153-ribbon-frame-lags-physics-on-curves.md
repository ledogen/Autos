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
