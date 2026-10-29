---
id: ASSET-70
type: asset
status: open
severity: minor
opened: 2026-10-07
updated: 2026-10-30
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-70: Doctor's office

**POI model** — the `doctor` class. A converted house with a clinic sign and a ramp.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** — raised from ≤900 (owner, 2026-10-29: match the trailer home and the barn, the lay-by buildings at 1200; simple is fine) |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/doctors-office.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.

## Status — built, in owner review (2026-10-30)

`wip/doctors-office/` (generator `doctors-office.py`, `.blend`, `.glb`; git-invisible until
promotion). **1140 tris**, 8 materials (`ClinicSiding`, `ClinicTrim`, `ClinicRoof`, `ClinicGreen`,
`ClinicWood`, `ClinicStone`, `ClinicCurtain`, `ClinicSign`), one 512x256 image (the sign). Overall
9.8 x 7.0 x 5.3 m; walls 9.0 x 5.0.

What it is: a pale-yellow side-gabled bungalow in lap siding (the trailer's V-grooves), white corner
boards and trim, green shutters and door, a charcoal roof with a ridge cap and a chimney, gable vents.
The conversion shows at the door: a porch landing under a shed roof, the old steps off one side and a
1:12 wheelchair ramp with white rails along the front wall off the other. A post sign by the road
reads **CLINIC** beside a **green** cross (the red cross is a protected emblem); it names no doctor,
who is rolled per seed.

Audit: 0 inverted first hits of 5881 rays, 0 z-fight pairs, 0 mirrored lettered faces, metalness 0.
Facing proved in the .glb: the sign is at glTF z -4.15 (road), the back eave at +2.85.

Placement numbers for promotion: collision box `size: [9.06, 3.04, 5.06]` (walls + foundation to the
eave). The landing, steps and ramp are left out like the trailer's stoop, but the ramp is 4.8 m long:
whether it should be solid (and drivable) is the owner's call. `seat: 0.85` (back eave 0.30 m off the
pad's back edge, the sign 0.70 m inside its road edge).
