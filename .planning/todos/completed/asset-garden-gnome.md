---
id: ASSET-02
type: asset
status: completed
severity: minor
opened: 2026-08-03
updated: 2026-08-19
relates: FEAT-06, FEAT-46
---

# ASSET-02: Garden gnome

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A ceramic garden gnome — red pointed hat, white beard, blue coat. Set dressing for lay-by pads,
cabins and POIs (FEAT-46). Pairs naturally with ASSET-01; the two together read as "someone lives
here" faster than any amount of terrain detail.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤500** |
| Texture | one baked albedo, **256×256** (face, beard, coat trim) — the only asset in this set that earns a texture |
| Real size | ~0.22 m wide × 0.40 m tall |
| Origin | base-seated: base disc at y=0 |
| Forward | −Z (gnome faces −Z) |
| Collision | `{ shape: 'box', dims: [0.22, 0.40, 0.22] }` |

Bake the face — do **not** model eyes/nose geometry at this size. Procedural node trees do not
survive glTF export; bake to an image texture first (ASSETS.md).

## Acceptance

- `assets/models/gnome.glb` exists, export-clean under ASSETS.md settings, texture embedded.
- Sources committed: `assets/models/src/gnome.blend` + `gnome.py`.
- Texture ≤2K (256 here), dimensions divisible by 4; no Draco, no KTX2.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- 256×256 is sized to the ~0.4 m on-screen footprint; resist raising it.
- If a second variant is ever wanted, prefer a **texture** variant over a mesh variant.

## Resolution — 2026-08-19

`assets/models/gnome.glb` shipped. **426 tris** (budget 500), 225 verts, one mesh object,
5 flat materials, **0 images**, 27.9 kB, single-sided, no Draco. Sources:
`assets/models/src/gnome.blend` + `gnome.py` (parametric, `build(); export()`).
Registered as `gnome` in `data/prop-models.js` (FEAT-59), **no pool tag** — same rule as the
flamingos: a gnome is not a mission giver, and `lawnFurniture` has no consumer yet.
`node test/dist-assets.mjs` green; the 8 affected gates green.

Three spec deviations, all owner-directed or measured:

1. **No texture.** The spec budgeted one 256×256 baked albedo for the face. The owner's reference
   call was reference 1's colours and pose with reference 2's *low-poly* face — brim, beard, and a
   nose between them, **no eyes, no mouth**. With no face to paint there is nothing left for a
   texture to carry, so this reverts to the ART-STYLE default: flat colour per material, 0 images.
   That also drops the only reason this asset was called "the one that earns a texture".
2. **Seated, not standing.** Owner asked for reference 1's pose: cross-legged on a dark plinth,
   bare feet at the hem, knees as a free ring-vertex bulge. The reference's two solar orbs are NOT
   modelled — emissive + alpha, ART-STYLE rule 7.
3. **Footprint 0.292 × 0.400 × 0.314 m**, not the spec's 0.22 square. 0.22 describes a *standing*
   gnome; a seated one spreads. Collision box updated to match in `prop-models.js`. Origin and
   forward are unchanged: base-seated at exactly y = 0, forward = −Z (nose and feet reach −Z, so
   the box runs −0.182 … +0.132 in Z and is not centred on the origin).

Materials (5, all metalness 0): `GnomeHat` red · `GnomeCoat` blue · `GnomeBeard` off-white ·
`GnomeSkin` nose + feet · `GnomeBase` dark plinth. All recolourable by name.

Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges, 0 loose verts,
0/2000 inverted first-hit rays.

**No hands.** Tried three placements (flanks, knee crests, outboard of the beard); every one read
as a pebble stuck to the model, because a hand needs an arm to explain it and an arm is ~60 tris
hidden behind the beard from every angle that matters. Reference 1's hands exist to cup its orbs.
The 40 tris stayed unspent.
