---
id: ASSET-69
type: asset
status: open
severity: minor
opened: 2026-10-07
updated: 2026-10-30
relates: FEAT-98 (Places and Missions — replaces the placeholder marker)
---

# ASSET-69: Small office

**POI model** — the `office` class. A single-storey office: flat roof, glass door, a sign board.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** — raised from ≤800 (owner, 2026-10-29: match the trailer home and the barn, the lay-by buildings at 1200; simple is fine) |
| Materials | flat colours per ART-STYLE.md, faceted; desaturated nature, saturated man-made |
| Real size | ~10 × 6 m footprint — must fit the 14 × 8 m lay-by pad |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the side that faces the road) |
| Collision | one box for the body |

## Acceptance

- `assets/models/office.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.

## Status — built, in owner review (2026-10-30)

`wip/office/` (generator `office.py`, `.blend`, `.glb`; git-invisible until promotion).
**996 tris**, 8 materials (`OfficeWall`, `OfficeBrick`, `OfficeAccent`, `OfficeTrim`, `OfficeMetal`,
`OfficeGlass`, `OfficeConcrete`, `OfficeSign`), one 512x128 image (the board). Overall 10.9 x 6.2 x
4.5 m (x, depth, height); walls 10.0 x 5.0.

What it is: light stucco over a dark coursed-brick wainscot, a deep-blue parapet band whose raised
false front carries an **OFFICES** board (the name is rolled per seed, so the board names no tenant),
an aluminium storefront (glass door + sidelight + transom) under a flat canopy, venetian blinds (one
window part-raised onto the dark room), a rooftop unit, two downspouts.

Audit: 0 inverted first hits of 6551 rays, 0 z-fight pairs, 0 mirrored lettered faces, metalness 0.
Facing proved in the .glb: the stoop is at glTF z -3.60 (road), the back coping at +2.59.

Placement numbers for promotion (registry entry + one poi.js line, owner's call): collision box
`size: [10.08, 3.83, 5.08]` (walls + band; stoop and canopy left out, like the trailer's stoop);
`seat: 1.1` (back coping 0.31 m off the pad's back edge, 1.5 m of pad in front of the stoop). No
recolour pool authored; `OfficeAccent` is the obvious one if variety is wanted.
