---
id: ASSET-33
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-04
closed: 2026-08-04
blocked-by: FEAT-59
relates: ASSET-32, ASSET-22, ASSET-28
---

# ASSET-33: Rolled newspaper

**Cargo** — visible load, not scenery. It is the thing the delivery job actually moves: it comes from
the uncle's van (ASSET-32) and goes to the rural mailboxes (ASSET-22). Small enough to be a handled
item rather than a bed load, so it is the one cargo asset that is also a hand prop.

## Request

A single newspaper rolled into a tube and tied with twine, low-poly, readable at arm's length: a
legible masthead and one headline, everything else blocked grey bars. The roll flares at the ends and
is squashed elliptically in section so it reads as paper under tension rather than a cylinder.

## Spec

| Field | Value |
|---|---|
| Tri budget | ≤400 — **shipped at 358** (roll 256, string 102) |
| Texture | one albedo, **512×276** (NPOT is fine — see below) |
| Real size | 90.2 × 73.9 × 420.4 mm (X × Y × Z) |
| Origin | base-seated: lowest point at y=0, roll axis along Z |
| Forward | −Z (axis-aligned; the prop is near-symmetric, so orientation is cosmetic) |
| Collision | none — handled item, below the prop-collision threshold |
| Draw calls | 2 (one per material) |

| Material | Role |
|---|---|
| `Newsprint` | the paper — bare `Image Texture → Base Color`, no node graph |
| `Twine` | the string and its two tails |

The headline reads *"Meadow Pass to close for six weeks"* under a *"Daily News"* masthead. Both are
**baked into the texture**, not live text — changing either is a re-bake through the generator.

## Acceptance

- [x] `assets/models/news-roll.glb` exists, export-clean: 126 KB, no `extensionsUsed`, one image,
      no Draco/KTX2.
- [x] Sources committed: `assets/models/src/news-roll.blend` + `news-roll.py`.
- [x] Tri count within budget (358 / 400). Material names stable (`Newsprint`, `Twine`).
- [x] Base-seated (min y = 0 on `RollString`), verified from the exported glTF bounds.
- [x] The `.glb` and `.blend` are both **generator output**, not hand-edited — verified by
      regenerating into a scratch dir: positions match to 2.5e-6 m, UVs to 1.2e-7, identical tri
      counts and bounds.
- [ ] Loads and places in-world through the FEAT-59 model import service. **Still blocked.**

## Notes

- Own work → no `CREDITS.md` entry needed.
- Regenerate with `blender --background --python news-roll.py -- --export`. The generator is the
  source of truth; the `.blend` and `.glb` are its output. `bake_page()` rebuilds the text rig and
  the master texture rather than storing them, which is why the `.blend` is 227 KB and not 2 MB.
- **The 512×276 texture is deliberate, not a violation.** The power-of-two rule that used to sit in
  `.planning/research/ASSETS.md` was unverified boilerplate and has been removed — Three.js r184 has
  no WebGL1 path, so NPOT textures mipmap and wrap normally, and `src/props/prop-impostor.js` already
  ships a 1024×768 mipmapped atlas. The master was simply halved from 1024×551, preserving the UV
  solve, the wrap tile and the facet-centre offsets exactly.
- Paper grain is **baked into the PNG** (periodic 2D value noise, 4 octaves, seed 20260803), not a
  shader multiply — the material has to survive glTF export as a flat texture link.

### The three things that will break if you touch them

1. **Spiral sampling is by arc length, not angle.** `theta(s) = (−r0 + sqrt(r0² + 2·b·s))/b` with
   `b = (r_end − r0)/(2π·turns)`. Equal-angle sampling starves the outer turn, which is the only one
   the player ever sees.
2. **UVs are analytic and final — there is no texture transform anywhere in this asset.** The
   masthead and headline sit at facet indices 10.5 and 8.5, i.e. facet *centres*, so creases do not
   cut through the letterforms. Facet width in V is `(total_arc/tile)/n_t = 0.15046`. **Any change to
   `n_t`, `tile` or the page layout invalidates this and it must be re-solved.**
3. **Seating happens through the depsgraph, after both objects exist.** Solidify with
   `use_even_offset` thickens at the flared ends and reaches past `THICKNESS/2`; seating off the base
   mesh leaves the evaluated low point at −4.1 mm and the prop sinks into the ground.

The knot is formed by bulging three rings of the string tube (`BULGE = {3: 2.40, 2: 1.45, 4: 1.45}`),
not by separate geometry. `MAJ=12` puts ring index 3 at top dead centre so the knot sits centred — the
string's z-location tracks the roll axis, so if the roll moves, move it too.

## Resolution

Built and exported 2026-08-03 over the blender-mcp connection; generator, source layout and texture
convention resolved in a follow-up session the same day. Full build notes, the abandoned-Mapping-node
post-mortem and the workflow gotchas are in
`.planning/handoffs/HANDOFF-2026-08-03-newspaper-roll.md`. Closed as **modelled and export-clean**;
in-world loading is FEAT-59's job, tracked there, and is the only unticked acceptance line — the same
carve-out ASSET-21 closed under.
