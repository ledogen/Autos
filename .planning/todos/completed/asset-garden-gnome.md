---
id: ASSET-02
type: asset
status: done
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

`assets/models/gnome.glb` shipped. **500 tris — exactly at the budget**, 268 verts, one mesh
object, 6 flat materials, **0 images**, 31.4 kB, single-sided, no Draco. Sources:
`assets/models/src/gnome.blend` + `gnome.py` (parametric, `build(); export()`).
Registered as `gnome` in `data/prop-models.js` (FEAT-59), **no pool tag** — same rule as the
flamingos: a gnome is not a mission giver, and `lawnFurniture` has no consumer yet.
`node test/dist-assets.mjs` green.

**0.206 W × 0.400 H × 0.165 D m** — inside the spec's 0.22 × 0.40 × 0.22. Origin and forward as
specified: base-seated at exactly y = 0 (both boot soles flat on it), forward = −Z. **The bounds
are not symmetric** — X comes out even at ±0.1031 by coincidence, but Z runs −0.095 … +0.070 — because the pose puts
weight on one leg, hangs the other arm, and pushes the nose and boot toes forward. The registry
box is a size rather than a centred extent, so it over-covers by ~3 mm on one side.

The classic upright ornament: boots, belted coat, beard over the chest, tall red hat, one hand on
the belt and the other hanging at the hip. Four passes got here — seated (the colour reference read
too literally), standing but portly, humanoid but stiff, then this.

**The humanoid fix was the vertical layout, not the waistline.** Proportions are taken off the
owner's third reference as fractions of total height, from the ground: boot top 0.11, coat hem
0.17, belt 0.31, **shoulder line 0.50**, beard bottom 0.39, hat brim 0.70, tip 1.00 — head plus
hat is exactly the top half. The torso is then a narrow tube (rx 0.056…0.081 against the old
0.100 belly) **widest at the shoulders**, nipped at the belt, flaring slightly to the hem, with
rx > ry throughout. The beard is deliberately narrower than the shoulders so blue shows either
side of it; at equal width it ate them and the torso lost its slope.

**The pose is built per-side, not mirrored** (`ARM_R`/`ARM_L`, `LIMB_R`/`LIMB_L`). A perfectly
mirrored figure reads as a mannequin whatever the proportions. Four deviations carry it and none
costs a triangle: contrapposto (hips +4 mm toward the weight leg, shoulders −3 mm, head +2 mm back
over the hips — 1% of height, below "leaning" and above "stiff"); the left arm hanging loose at the
hip while the right rests on the belt; the left foot set 16 mm back and toed out 25° against the
planted foot's 9°; and the hat tip flopping forward *and* to his left.

**Two spec deviations.**

1. **No texture.** The spec budgeted one 256×256 baked albedo for the face and called this "the
   only asset in this set that earns a texture." The owner's reference call was the classic colours
   and pose plus a *low-poly* face — brim, beard, and a nose between them, **no eyes, no mouth**.
   With no face to paint there is nothing left for a texture to carry, so this reverts to
   ART-STYLE's flat-colour default. `news-roll` and `produce-stall` remain the only textured models.
2. **Six materials**, one over ART-STYLE's soft limit, spent on the buckle. `GnomeLeather` merges
   the reference's mid-brown trousers with its near-black boots and the belt into one dark-leather
   role — at the 20 m viewing distance that value split is invisible while the boot silhouette
   carries the read. `GnomeBuckle` is the only warm metal on the model and is the detail the owner
   asked for by name, so it could not be merged. Metalness stays 0; roughness 0.35 does the brass.

Materials (6, all metalness 0): `GnomeHat` red · `GnomeCoat` blue · `GnomeBeard` off-white ·
`GnomeSkin` nose, face band and hands · `GnomeLeather` belt + trousers + boots · `GnomeBuckle`
brass. All recolourable by name.

Audit clean: 0 object-vs-object clips, 0 coplanar pairs, 0 non-manifold edges, 0 loose verts,
0/5000 inverted first-hit rays.

Seven things the generator records so they are not re-discovered:

- **The belt is a BAND OF THE BODY SWEEP, not a ring around it.** As its own cylinder it cost 32
  tris and needed two caps buried inside the coat; as two extra stations it costs 16 and cannot
  z-fight.
- **The beard's forward offset is solved from the body profile**, stated as `(z, cx, rx, ry, PROUD)`.
  Stated as an absolute offset, widening the body silently swallows the lower beard and cuts the
  white silhouette off with a horizontal edge halfway down. Its `cx` tracks the head, or the beard
  slides off the face once the pose stops being symmetric.
- **Leg and boot are one 4-station limb**, not two parts: 88 tris against 104, and the
  trouser-to-boot flare comes free. A scaled icosphere boot has a *point* for a sole — the gnome
  would balance on two dots with only two vertices touching y = 0.
- **The toe box must be a SLAB.** Stations 0 and 1 are the same size 20 mm apart, so the foot is
  flat-topped and the step up to the ankle is a hard crease that flat shading turns into the top of
  the shoe. A single smooth taper from sole to cuff over 48 mm reads as a traffic cone.
- **Arm rings sit perpendicular to the arm, not horizontal** (`sweep_path`, not `sweep`). A
  horizontal ring of radius r on an axis tilted t off vertical yields a tube whose true
  perpendicular radius is only `r·cos t`. Measured per band: the right arm ran 11°/62°/59° off
  vertical → 98%/47%/51% of nominal thickness, the left 14°/21°/25° → 97%/93%/91%. That is exactly
  why the *right* arm read as a skewed drinking straw and the left did not — reaching for the belt
  tips the forearm past 60° and halves its apparent thickness. Fattening the radii to compensate
  would have ballooned the near-vertical upper arm; the fix is the frame. It also squares the end
  cap to the forearm instead of slicing the hand off parallel to the ground. **The legs stay on the
  horizontal sweep on purpose** — a boot sole has to be flat on y = 0.
- **Arms have four stations — shoulder, elbow, cuff, hand.** Three put the elbow and the wrist at
  the same point, so the "hand" was really a forearm and the arm could only bend by *lengthening
  that band*, which is exactly how the two hands ended up different sizes. With a real elbow the
  bend lives in the upper-arm/forearm angle and every band length stays fixed.
- **Asymmetry is pose, not anatomy.** The two arm tables differ only in *direction*; radii are
  identical station-for-station and the three segment lengths are held equal per side —
  upper arm 45.9 / 45.9 mm, forearm 25.6 / 25.7 mm, hand (the skin band) 21.4 / 21.5 mm, whole arm
  92.8 / 93.1 mm, 0.3% apart. The numbers are recorded above the tables in `gnome.py`; check them
  after any edit, because eyeballing a table of offsets will not catch a 20% limb-length error and
  the owner's eye will.
- **The hands must not have a vertex on +Y.** The arms run at 7 segments with the ring phase
  offset by half a segment, so a *facet* faces forward instead of a vertex — at 6 segments on the
  common phase each hand ended in a knife edge aimed at the camera and read as a beak. The extra
  segment was paid for by deleting a hat station, as the elbows were later. What reads as a hat is
  the flare **peak** at z 0.272 and the tip curl above 0.380; the cone between them is a straight
  taper and does not need describing, so it is where tris get harvested.
- **`ring()` takes a plan yaw**, rotating each ring about its own centre. Real foot splay is most of
  what stops two feet reading as a pair of parked objects, and it is free.
- **The hand is 9 mm proud of the belly, no more.** At 23 mm the forward sweep from the cuff became
  a pale spike in profile.
- **Winding is only ever proven by ray-cast.** The viewport draws backfaces, so an inverted part is
  invisible there. Four separate causes hit this build: a top-down station table, `mirror = -1` on
  the left limb, all six faces of the buckle box, and (checked, clean) the plan yaw.

## Follow-up — 2026-08-21: curated recolour pool

Owner ruling: recolouring should draw from a **pool of colours saved ahead of time** per model, so
the look stays curated while spawns can be randomised. Checked against `ASSETS.md` — it already
ratified half of this ("one material per colour, the material *name* is the runtime API",
`material.color.set()`, "say in the ticket which materials are recolourable"). The curated-pool
layer on top is new, so it is now written into `ASSETS.md` as its own section.

`GnomeCoat` may be **cobalt / bottle green / burgundy**; hat, beard, skin, leather and buckle are
**fixed** — a gnome is a red hat and a white beard, and recolouring those stops it being a gnome.
The burgundy is deliberately much darker than the hat above it (luminance 0.042 vs 0.113, a 2.7×
ratio): a coat matched to the hat's pillar-box red collapses the figure into one red mass at
distance, losing the value structure ART-STYLE rule 5 asks for.

Shipped in three pieces:

- `data/prop-models.js` — a `palette` field, `{ <material name substring>: [[r,g,b], …] }`, linear
  RGB, index 0 equal to the authored colour, all arrays the same length (the variant index is one
  number for the whole model, so listed materials recolour in lockstep — that is how a coordinated
  outfit gets defined rather than independent dice per material).
- `src/model-service.js` — `spawnModel(key, { variant: n })`. `n` is any integer, taken modulo the
  palette length, so callers pass a raw hash. **The caller owns determinism**: derive it from the
  seed the way `poi.js` derives `modelKey`, never `Math.random()`.
- `test/model-palette.mjs` — new `npm test` gate (subsystem `infra`, fast).

**The trap this is built around.** `Object3D.clone()` shares geometry *and materials* by reference —
which is exactly why `spawnModel` is cheap. So `.color.set()` on a spawned model's material
recolours **every** instance in the world, including ones already placed. Per-spawn recolour must
swap the material *object*, never mutate the shared one. Each pool colour is therefore built once
at load: a hundred gnomes cost three coat materials, not a hundred, and draw calls are unchanged.

Verified end-to-end against the real `.glb` through the real `GLTFLoader`: the palette binds to
`GnomeCoat`, variants 0/1/2 yield the three colours, and 5 and −1 fold correctly to 2. The gate was
proved by breaking it three ways — drifted index 0, a renamed material, and an over-broad key that
matches six materials — each caught with a specific message.

**Nothing spawns gnomes yet** (no pool tag; see the resolution above), so the randomisation goes
live with the lawn-furniture scatter, not now.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-71 (POI-satellite scatter for lawn furniture)**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.
