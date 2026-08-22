---
id: ASSET-08
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-22
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46, SM-1, ASSET-24
---

# ASSET-08: Backyard fire ring (brick-and-mortar)

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire ring beside
a log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

**A built masonry fire ring, of the kind somebody lays in their own back yard.** Coursed block or
brick, mortared, sitting level on the ground with a flat cap you could set a mug on. Ash and a couple
of burnt log ends inside. Unlit.

**This is a piece of construction, not a fire.** Somebody bought the block, dug a footing, laid two
courses and pointed the joints. It is permanent, it is level, it is regular, and it will still be
there next season. That is the entire content of the asset — the fire is incidental to it.

## The read this asset exists to carry

**Someone LIVES here.** That is why it is placed with a POI and never alone, and it is the whole
reason it is on the roster.

**It is now the ONLY thing carrying that read, and it must not be a bigger campfire.** ASSET-24 (the
player's campfire, closed 2026-08-22) ships with a ring of eleven found, half-buried, irregular
stones — so *a ring of rocks around ash* no longer distinguishes anything. The two assets must be
tellable apart **in silhouette, at 20 m, through fog**, where per ART-STYLE rule 8 only the outline
and the big value divisions survive.

The distinction is therefore **built versus found**, and it has to be carried by geometry:

| | ASSET-24 campfire (shipped) | ASSET-08, this ticket |
|---|---|---|
| Stones | irregular blobs, no two alike | **coursed blocks, all one size** |
| Joints | none — stones touch and overlap | **mortar joints, staggered course to course** |
| Level | each stone tilted, sunk to its own depth | **dead level, one flat cap line** |
| Seating | half-buried, settled | **sits on the ground on a footing** |
| Outline | lumpy, irregular top edge | **a clean horizontal ring** |
| Diameter | 0.71 m | **1.0 m** |

**A straight, level, unbroken top edge is the single strongest cue** — nothing natural has one.
Spend the geometry there before anywhere else.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤550** — see the arithmetic below |
| Texture | **none.** Flat colours per ART-STYLE rule 1; mortar is a *material*, never a map |
| Real size | **1.0 m outer diameter × 0.30 m tall** (two courses + cap) |
| Origin | base-seated and centred: ground plane at y=0, ring centre at x=z=0 |
| Forward | n/a (rotationally symmetric; free to yaw-randomise on placement) |
| Collision | `{ shape: 'cylinder', radius: 0.50, height: 0.30 }` |
| Filename | **`assets/models/fire-pit.glb`** — kept as-is; four other tickets cross-reference it |

### Where the 550 goes

- **24 blocks** — 12 per course, 2 courses — at 12 tris each (a box, tapered radially): **288**
- Two-tone bed, ash outside and dark char inside, ~10-gon: **~58**
- Two or three burnt log ends lying flat in it: **~60**
- Remainder is headroom for a cap course, a hearth lip, or a gap in the ring

**Model ONE block and place it 24 times** with a radial transform — the equivalent of the old spec's
"reuse 3 stone shapes, do not model 12". Twenty-four *unique* blocks is the failure mode; they are
supposed to look identical, because they came off a pallet.

> ART-STYLE.md's budget table lists "fire pit" in the **700–1800** row. 550 is deliberately tighter:
> that row is for mid structures placed once, and this is lawn furniture that repeats with every POI
> that gets one. If the mortar joints genuinely cannot be carried inside 550, say so with a measured
> count rather than quietly overrunning — ASSET-24 overran its budget by 57% and the reason is
> written into its resolution.

### Construction notes

- **Staggered joints.** Course two is rotated half a block against course one. This is what
  masonry *is*, it costs zero tris, and without it the ring reads as an extruded tube with grooves.
- **Mortar is the second material, not a texture.** Recess the blocks a few millimetres from the
  joint faces and let flat shading do the shadow line — the same trick the trailer's lap siding uses
  (ART-STYLE rule 2). Do not bake a joint map.
- **Value structure** (rule 5): pale mortar → mid block face → near-black interior char. The
  interior wants to be **much** darker than feels right as a tuple; these are linear values.
- **The ash bed sits slightly below y=0** so the ring reads as founded rather than floating when it
  lands on a graded lay-by pad.
- Consider **one block missing or tipped** out of the twenty-four. A single break in an otherwise
  perfect ring says *built, then weathered* far more cheaply than any amount of surface detail —
  and it is the one irregularity that does not cost the built read.

## Acceptance

- `assets/models/fire-pit.glb` exists, export-clean under ASSETS.md settings.
- Sources committed: `assets/models/src/fire-pit.blend` + `fire-pit.py`.
- **Tellable apart from `campfire.glb` in silhouette at thumbnail size.** Put the two renders side
  by side before calling it done; if the only difference is scale, it is not done.
- Reads correctly when placed on a graded lay-by pad, not just flat ground.
- Tri count within budget, reported per object through the depsgraph with modifiers applied.
- Material names stable and distinctive; say in the resolution which are recolourable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Ships unlit.** A lit state — flame particles, a point light, warm ground bounce — is a
  gameplay/VFX ticket citing this asset, and it will want to sit inside the day/night lighting pass.
  Model it cold with a clean attach point; do not bake glow in. **Follow ASSET-24's convention:** an
  empty node named `FireFlameAnchor` at the flame origin, since glTF carries no lights and no
  particle systems and the VFX rig finds its anchor by name.
- Yaw-randomising placement is what keeps a repeated ring from reading as repeated. It matters more
  here than it did before — twenty-four identical blocks make any repetition obvious.
- **Reusable from `assets/models/src/campfire.py`:** the sizing rule that guarantees a gapless ring
  (mean block width must exceed the arc spacing `2*pi*r/count`, and it is the *worst case* that has
  to clear it, not the mean), and the base-seating discipline. **Not** reusable: `make_stone` and its
  per-stone sink and tilt variation, which is exactly the found-rock look this asset must avoid.

### Provenance

Re-specced 2026-08-22 by owner ruling, from *"a ring of stones around a bed of ash"* to brick-and-
mortar construction. ASSET-24 had taken the stone ring — the original wording made that ring this
asset's whole identity, and once the campfire acquired one, this ticket had nothing left to say.
Masonry gives it a distinction that survives at silhouette distance and is more true to what it is
for: a fixture at a place where people live, not a fire someone laid.
