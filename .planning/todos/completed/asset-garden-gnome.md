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

`assets/models/gnome.glb` shipped. **492 tris** (budget 500), 264 verts, one mesh object,
6 flat materials, **0 images**, 31.0 kB, single-sided, no Draco. Sources:
`assets/models/src/gnome.blend` + `gnome.py` (parametric, `build(); export()`).
Registered as `gnome` in `data/prop-models.js` (FEAT-59), **no pool tag** — same rule as the
flamingos: a gnome is not a mission giver, and `lawnFurniture` has no consumer yet.
`node test/dist-assets.mjs` green.

**0.196 W × 0.400 H × 0.170 D m** — inside the spec's 0.22 × 0.40 × 0.22. Origin and forward as
specified: base-seated at exactly y = 0 (both boot soles flat on it), forward = −Z. The Z extent
is **−0.100 … +0.070**, not centred on the origin: the nose and boot toes reach forward.

The classic upright ornament: boots, belted coat, beard over the chest, tall red hat, arms bent
with the hands resting either side of the buckle. Three passes got here — seated (the colour
reference read too literally), standing but portly, then this.

**The humanoid fix was the vertical layout, not the waistline.** Proportions are taken off the
owner's third reference as fractions of total height, from the ground: boot top 0.11, coat hem
0.17, belt 0.31, **shoulder line 0.50**, beard bottom 0.39, hat brim 0.70, tip 1.00 — head plus
hat is exactly the top half. The torso is then a narrow tube (rx 0.056…0.081 against the old
0.100 belly) **widest at the shoulders**, nipped at the belt, flaring slightly to the hem.
The beard is deliberately narrower than the shoulders so blue shows at either side of it; at equal
width it ate them and the torso lost its slope.

**Two spec deviations.**

1. **No texture.** The spec budgeted one 256×256 baked albedo for the face and called this "the
   only asset in this set that earns a texture." The owner's reference call was the classic colours
   and pose plus a *low-poly* face — brim, beard, and a nose between them, **no eyes, no mouth**.
   With no face to paint there is nothing left for a texture to carry, so this reverts to
   ART-STYLE's flat-colour default. `news-roll` and `produce-stall` remain the only textured models.
2. **Six materials**, one over ART-STYLE's soft limit of ~6, spent on the buckle. `GnomeLeather`
   merges the reference's mid-brown trousers with its near-black boots and the belt into one
   dark-leather role — at the 20 m viewing distance that value split is invisible while the boot
   silhouette carries the read. `GnomeBuckle` is the only warm metal on the model and is the detail
   the owner asked for by name, so it could not be merged. Metalness stays 0; roughness 0.35 does
   the brass.

Materials (6, all metalness 0): `GnomeHat` red · `GnomeCoat` blue · `GnomeBeard` off-white ·
`GnomeSkin` nose, face band and hands · `GnomeLeather` belt + trousers + boots · `GnomeBuckle`
brass. All recolourable by name.

Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges, 0 loose verts,
0/4000 inverted first-hit rays.

Five things the generator records so they are not re-discovered:

- **The belt is a BAND OF THE BODY SWEEP, not a ring around it.** As its own cylinder it cost 32
  tris and needed two caps buried inside the coat; as two extra stations it costs 16 and cannot
  z-fight.
- **The beard's forward offset is solved from the body profile**, stated as `(z, rx, ry, PROUD)`.
  Stated as an absolute offset, widening the body silently swallows the lower beard and cuts the
  white silhouette off with a horizontal edge halfway down.
- **Leg and boot are one 4-station limb**, not two parts: 88 tris against 104, and the
  trouser-to-boot flare comes free. A scaled icosphere boot has a *point* for a sole — the gnome
  would balance on two dots with only two vertices touching y = 0.
- **The hand is 9 mm proud of the belly, no more.** At 23 mm the forward sweep from the cuff became
  a pale spike in profile.
- **Winding is only ever proven by ray-cast.** The viewport draws backfaces, so an inverted part is
  invisible there. Three separate causes hit this build: a top-down station table, `mirror = -1` on
  the left limb, and all six faces of the buckle box.
