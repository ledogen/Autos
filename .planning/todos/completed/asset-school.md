---
id: ASSET-73
type: asset
status: done
closed: 2026-10-31
severity: minor
opened: 2026-10-07
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-73: Country school

**POI model** — the `school` class. A one-room schoolhouse: clapboard, bell cupola, flagpole.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** — raised from ≤1000 (owner, 2026-10-29: match the trailer home and the barn, the lay-by buildings at 1200; simple is fine) |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/school.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.

## Resolution (2026-10-31)

Shipped after the owner's review in Blender ("all approved"): `assets/models/school.glb` (127 kB); generator + `.blend` in `assets/models/src/`, and the re-export from there is byte-identical to the reviewed file. Registry key `school` (data/prop-models.js); the src/poi.js `school` slot now names it instead of the placeholder cube. Gates: `npm test` (24 affected, incl. poi-yard's model-on-pad checks and poi-collider) green, cdp-smoke PASS. The numbers below are as reviewed.

### As built

`wip/school/` (generator `school.py`, `.blend`, `.glb`; promoted). **1141
tris**, 7 materials (`SchoolWhite`, `SchoolRoof`, `SchoolRed`, `SchoolStone`, `SchoolGlass`,
`SchoolCurtain`, `SchoolSign`), one 512x512 atlas (the plaque + the flag). Overall 10.2 x 7.0 x 7.8 m (to the cupola
finial); main block 9.6 x 4.8.

What it is: a one-room schoolhouse in white **lapped clapboard** (each course leans back to a
shadowed butt edge, not a V-groove), tall six-over-six windows with drawn burgundy curtains, a steep slate roof, a gabled entry
vestibule on the road side with red double doors (no transom) and a **SCHOOL** plaque (the school
is named per seed), a **bell cupola** with a dark bell on the ridge, and a **flagpole** flying the US
flag (stars and stripes baked into the atlas; obverse to the road). Owner 2026-10-30: the bare dark
glass and the dark transom read as black voids, so the panes became burgundy curtains and the
transom went (door head down to the 2.72 m course line). The vestibule's roof runs into the
main roof and the slabs' intersection is the valley.

Audit: 0 inverted first hits of 7075 rays, 0 different-material z-fight pairs, 0 mirrored road-facing
lettered faces (the flag's back reads mirrored, as a real flag does), metalness 0. Facing proved in
the .glb: the steps and pole are at glTF z -4.23 (road), the back eave at +2.75.

Placement numbers for promotion: the ticket asks for one box, but the vestibule stands 1.2 m proud of
the body, so two: `boxes` = main block `c: [0, 1.77, 0], s: [9.66, 3.54, 4.86]` + vestibule
`c: [0, 1.64, -3.02], s: [2.46, 3.27, 1.23]` (glTF frame); footprint `size: [9.66, 3.54, 6.07]` (the body is not centred on the origin in depth). The US flag stays
(owner, 2026-10-31). `seat: 0.95` (back
eave 0.30 m off the pad's back edge, the steps 0.72 m inside its road edge).
