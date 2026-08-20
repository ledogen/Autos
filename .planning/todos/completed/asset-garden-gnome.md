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

## Resolution — 2026-08-20

`assets/models/gnome.glb` shipped. **478 tris** (budget 500), 255 verts, one mesh object,
5 flat materials, **0 images**, 29.3 kB, single-sided, no Draco. Sources:
`assets/models/src/gnome.blend` + `gnome.py` (parametric, `build(); export()`).
Registered as `gnome` in `data/prop-models.js` (FEAT-59), **no pool tag** — same rule as the
flamingos: a gnome is not a mission giver, and `lawnFurniture` has no consumer yet.
`node test/dist-assets.mjs` green.

**0.2088 W × 0.400 H × 0.2056 D m** — inside the spec's 0.22 × 0.40 × 0.22. Origin and forward
as specified: base-seated at exactly y = 0 (both boot soles flat on it), forward = −Z. Note the
Z extent is **−0.114 … +0.092**, not centred on the origin: the nose and boot toes reach forward.

The classic upright ornament — boots, tunic to the boot tops, arms down the sides with bare hands
showing, beard draped over the belly, tall floppy hat. A first pass built the *seated* pose of the
colour reference; the owner's call 2026-08-20 is standing, which is also what this envelope
assumes. There is no base disc: two boots stand on the ground the way the flamingos' legs do,
which freed the fifth material for the boots.

**One spec deviation: no texture.** The spec budgeted one 256×256 baked albedo for the face and
called this "the only asset in this set that earns a texture." The owner's reference call was the
classic colours and pose plus a *low-poly* face — brim, beard, and a nose between them, **no eyes,
no mouth**. With no face to paint there is nothing left for a texture to carry, so this reverts to
ART-STYLE's flat-colour default. `news-roll` and `produce-stall` remain the only textured models.

Materials (5, all metalness 0): `GnomeHat` red · `GnomeCoat` blue tunic · `GnomeBeard` off-white ·
`GnomeSkin` nose + hands · `GnomeBoot` dark brown. All recolourable by name.

Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges, 0 loose verts,
0/3000 inverted first-hit rays.

Three things the generator records so they are not re-discovered:

- **The beard's forward offset is solved from the body profile**, stated as `(z, rx, ry, PROUD)`.
  Stated as an absolute offset, widening the body silently swallows the lower beard and cuts the
  white silhouette off with a horizontal edge halfway down. It also makes the beard *drape* over
  the belly, which is what a real one does.
- **The arm's shoulder station sits low**, at z 0.228 where the tunic is still 75 mm wide, so the
  arm emerges from inside the flank. Hung off the 0.248 shoulder it perched on the outside and
  read as a bolted-on slab with a visible flat cap.
- **Boots are a 3-station sweep, not scaled icospheres.** Same tri cost, but an ellipsoid's sole is
  a point — the gnome balances on two dots and only two vertices touch y = 0.
