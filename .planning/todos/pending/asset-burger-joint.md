---
id: ASSET-80
type: asset
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05 (answering feat147-art in Lane A's window) — "have lane C build a burger joint model. for now we can just do a camera move on the burger joint in the game world and put the dialogue cards over it"
relates: FEAT-147 (the opening's firing scene frames it), opening.md § The firing, src/poi.js foodVendor slot
---
lane: C

# ASSET-80: Burger joint

**POI model** — the `foodVendor` class (`src/poi.js`: `model: null` today, so a placeholder cube on a
lay-by). It is where the player is fired (opening.md § The firing). FEAT-147's opening is a camera move
onto this building with the Story cards over it. Until this ships, that shot frames the cube. A
roadside burger stand under fluorescent light: the deliberate boredom of opening.md, not a chain
restaurant.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** (the lay-by buildings' figure; the trailer home, barn and clinic) |
| Materials | flat colours per ART-STYLE.md, faceted, no textures except one small sign image if needed |
| Real size | must fit the 14 × 8 m lay-by pad, with the doctor's office's margins (~10 × 6 m footprint) |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (the counter / front faces the road, and the camera move frames that face) |
| Collision | one box for the body; an awning or canopy stays drive-through, like the clinic's ramp |

The sign shows a burger graphic and **no business name**. The name rolls per seed from
`data/offer-names.js` (the clinic's rule). Today's foodVendor pool also rolls Pizza, Bakery, Ice Cream
and others. Whether the region-1 vendor's names narrow to burger ones is an owner call; until then the
pool stays as it is.

## Acceptance

- [ ] Modelled per `.planning/research/ASSETS.md` + ART-STYLE.md (≥ ~1000 tris is the floor, nothing floats, windings proven with the ray check).
- [ ] `assets/models/burger-joint.glb` exported clean; generator + `.blend` in `assets/models/src/`; material names stable.
- [ ] Registry key in `data/prop-models.js` (collision box + `seat`); the `foodVendor` slot in `src/poi.js` names it (the doctor's office did the same, ASSET-70).
- [ ] Owner's look in Blender before promotion; then `npm test` (poi-yard, poi-collider) + cdp-smoke.
