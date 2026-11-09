---
id: BUG-149
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Spare, junction-edge-lip run on 9 random seeds (identical on main and the BUG-146 branch)
relates: BUG-145 (pad rim), BUG-122/123 (junction-edge steps)
---
lane: B

# BUG-149: pad rim lips of 0.28–0.39 m on seed 1074499174

Seed 1074499174: pad rim lips of 0.28 / 0.36 / 0.39 m (the limit is 0.25 m) at (742–743, 420.5), and a leg lip of
0.263 m on g:745990,432424,-1:0,1,1 at s 12. Pre-existing on main (after BUG-145's one duck cap).

## Acceptance

- [ ] Rim and leg lips at that site under 0.25 m, mesh == physics.
- [ ] junction-edge-lip passes there; the seed joins the gate if it is a new shape.

## The rim lips are BUG-150's cap (Lane B, 2026-11-08, `land/bug-150`)

The three rim lips were `_mergeCarve`'s duck cap, the same cap behind BUG-150's dirt wall but on the drop side. Here
the pad's dirt stands more than 1.2 m above the leg's section, so the cap held the dirt that far below the pad's rim.
On `land/bug-150`, where the cap is removed, Spare's census (`lip-census.mjs 1074499174`) reads: rim lips 0.281 /
0.360 / 0.389 m → none over 0.25 m (the seed's worst rim lip is then 0.158 m, elsewhere).

**Still open:** the 0.263 m leg lip on g:745990,432424,-1:0,1,1, side 1, at s 12. It is the same on main and on
`land/bug-150`, so it does not come from the cap. That is a leg's asphalt edge 12 m out from the node (LIP, not RIM).

## The leg lip is a mesh ≠ physics tilt near every padded mouth (Lane B, 2026-11-08, diagnosis only)

At s 12 on `g:745990,432424,-1:0,1,1` (side 1), the pad's ring runs along the leg's asphalt edge, 0.5 m before its
mouth (12.5 m). Physics rides the leg's ribbon there at 205.185; the drawn ribbon is 205.051, and the drawn dirt beside
it 204.923. So the DRAWN lip is 0.128 m (the designed 0.15). The 0.263 m PHYSICS lip is physics standing 0.134 m
above the drawn ribbon.

**The mechanism (probe `wip/bug-147/mouth-verts.mjs`: physics at the ribbon's own vertices, potholes off).**
- **The ribbon:** `road-mesh.js _ribbonSection` builds each cross-section on the smooth run tangent
  (`runProfile(arcS).tx/tz`), and gives every vertex the height of the SECTION's arc.
- **Physics:** `_sampleCarveWorld` projects the point on the resolver's own tangent, then reads the leg's section at
  the projected arc.
- **Near a mouth the two frames part**, by ~8° at this mouth, where the section's edge vertices project 1.4 m apart in
  arc. Physics − vertex is 0 on the centreline and grows linearly with lateral offset: +0.087 m at lat 3.73 next to
  the mouth, +0.036 / −0.024 m at lat ±3.75 by s 14.6. On this 14–25 % grade, grade × arc skew × lat ≈ 0.2 × 0.139 ×
  3.73 = 0.10 m, which matches.

**How common (probe `wip/bug-147/mouth-float.mjs`: each leg's OWN ribbon, raycast, vs physics at wheel height).**
Per-leg worst |physics − drawn| past the mouth:

| seed | legs | 0–5 m median | 0–5 m max | 5–10 m median | 10–15 m median |
|---|---|---|---|---|---|
| 1074499174 | 13 | 9.3 cm | 34 cm | 2.1 cm | 1.5 cm |
| 6 (test seed) | 21 | 9.4 cm | 17 cm | 2.7 cm | 1.7 cm |

40–60 m past the mouths the two agree (< 2 cm on 12 of 13 legs).

**Not fixed yet.** Which side moves (the ribbon section frame or physics' projection) is the open question. The ribbon
is welded to the pad's mouth chord (BUG-82), and the pad agrees with physics (±5 mm on the pad).
