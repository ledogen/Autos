# HANDOFF - Newspaper roll prop (Blender/MCP) - 2026-08-03

## State

A low-poly rolled-newspaper prop was built in Blender over the blender-mcp connection and
saved. A reusable skill was written for the workflow. The asset is **not yet exported and not
yet usable in-game** - see Outstanding.

- Generator: `assets/models/src/news-roll.py` - **the source of truth.** The `.blend` and `.glb` are
  both its output; regenerate with `blender --background --python news-roll.py -- --export`.
- Blend file: `assets/models/src/news-roll.blend` (was `assets/models/NewsRoll.blend`, removed)
- Exported: `assets/models/news-roll.glb` (126 KB) - **export-clean but not loadable yet, see FEAT-59**
- Skill: `~/.claude/skills/blender-game-asset/` (SKILL.md + 3 references + build template)

## The asset

Two objects, 358 tris total (roll 256, string 102), one **512x276** packed texture
(originally 1024x551 - see Outstanding item 1). Bounds 90.2 x 420.4 x 73.9 mm.

| Object | Tris | Material |
|---|---|---|
| `NewspaperRoll` | 256 | `Newsprint` |
| `RollString` | 102 | `Twine` |

Bounds ~90 x 420 x 73 mm. Origin at world origin, mesh seated so its lowest point is z=0.

### Roll parameters

    r0=0.016  turns=2.5  r_end=0.036  length=0.42
    squash_z=0.85                  # radial squash -> elliptical section
    flare=0.27, exponent 2.5       # f(t) = 1 + flare*abs(2t-1)**2.5
    n_t=12                         # spiral steps, sampled by ARC LENGTH not angle
    CROSS_TS=[0.0,0.10,0.50,0.90,1.0]   # 5 verts across the paper width
    Solidify: thickness 0.004, offset 0, even offset

Arc-length sampling matters: `theta(s) = (-r0 + sqrt(r0^2 + 2*b*s))/b` with
`b = (r_end-r0)/(2*pi*turns)`. Equal-angle sampling starves the outer turn, which is the only
one visible.

### String parameters

    a_s=0.0368  b_s=0.0314  tube=0.0026   MAJ=12  MIN=4
    BULGE = {3: 2.40, 2: 1.45, 4: 1.45}   # knot formed by bulging rings, not separate mesh
    tails: two 3-sided cones, 3 tris each

MAJ=12 is deliberate - it puts ring index 3 exactly at top dead centre so the knot sits
centred. Object z-location tracks the roll axis; if the roll moves, move this too.

### Texture and UVs

Baked from real text objects via a throwaway Workbench scene (flat lighting, ortho cam,
material colour). Fonts: `BigCaslon.ttf` masthead, `Times New Roman Bold.ttf` headline, both
from `/System/Library/Fonts/Supplemental/`.

- Masthead "Daily News", size 0.125, page y=0.186, curve offset 0.0022 (faux-bold; thin
  serifs vanish under filtering otherwise)
- Headline "Meadow Pass to close for six weeks", size 0.046, page y=0.0241
- Everything else is blocked grey bars, no other text

UVs are analytic, assigned during the build from grid indices - not unwrapped. V follows
spiral arc length (`tile = 2*pi*r_end`), U runs the tube length linearly.

Masthead and headline sit at facet indices 10.5 and 8.5 - i.e. facet **centres**, so creases
do not cut through the letterforms. Facet width in V is `(total_arc/tile)/n_t = 0.15046`.
Their layout separation was set to exactly 2 facets so a single UV rotation could centre both.
**Any change to `n_t`, `tile` or the page layout invalidates this and it must be re-solved.**

## Outstanding

> **Update 2026-08-03 (later session).** Items 1-4 resolved except the generator; item 5 added.
> Asset is now exported at `assets/models/news-roll.glb` (128 KB, 358 tris, 512x276 texture) with
> its source at `assets/models/src/news-roll.blend`.

1. ~~**Texture violates project convention.**~~ **RESOLVED - the convention was wrong, not the
   texture.** The power-of-two rule in ASSETS.md was never derived from this codebase: `hilux.glb`
   contains zero images (`"images": []`), so there was no textured precedent to derive it from, and
   the document was uncommitted boilerplate written the same day. Three.js r184 has no WebGL1 path
   (removed r163), so NPOT textures mipmap and repeat-wrap normally; `src/props/prop-impostor.js`
   already ships a 1024x768 mipmapped atlas. **ASSETS.md has been corrected.** The texture was simply
   halved to **512x276** (divisible by 4), preserving the UV solve, the wrap tile and the
   facet-centre offsets exactly - no re-bake, no re-solve.

2. ~~**Material will break glTF export.**~~ **RESOLVED.** `Newsprint` is now a bare
   `Image Texture -> Base Color`. The Fac-0.12 Noise/ColorRamp multiply was **baked into the PNG**
   (periodic 2D value noise, 4 octaves, seed 20260803, matching the shader's 0.946-0.984 effective
   multiplier range) so the paper grain survives. The Noise->Bump was dropped - not worth a baked
   normal map at prop scale.

   Also removed: a **dangling Mapping node** (scale Y 2.4, offset Y -1.267) fed by a Texture
   Coordinate but **not connected to Image Texture's Vector input** - a leftover from an abandoned
   experiment, contributing nothing to the render. It was briefly (and wrongly) baked into the mesh
   UVs, which scaled V by 2.4: the page came out squashed vertically and the masthead repeated
   across the roll. Reverted by remapping V back onto the analytic ladder
   `C[i] = (TOTAL*i/N_T)/TILE + U_OFF` (max deviation 7.9e-8). **The UVs are analytic and final as
   generated - there is no texture transform anywhere in this asset.** The GLB reports no
   `extensionsUsed` at all.

3. ~~**File layout.**~~ **RESOLVED**, with one change: the name is **`news-roll`**, not
   `newspaper-roll` - user's call, this supersedes the name agreed here. `assets/models/src/` is now
   the documented source layout in ASSETS.md, kept a separate directory so it can be gitignored
   wholesale if the `.blend` files grow. `*.blend1` is gitignored.

4. ~~**BLOCKER - props have no GLB path.**~~ Still true, now **tracked as FEAT-59**
   (`.planning/todos/pending/feat-modelled-prop-glb-path.md`). The export is correct; the game
   still cannot load it. That ticket is the remaining work before the asset is usable.

5. ~~**still no `build.py`**~~ **RESOLVED.** `assets/models/src/news-roll.py` is the generator, and
   the shipped `.glb` and `.blend` are now **its output**, not hand-edited artefacts:

       blender --background --python news-roll.py -- --export

   Verified by generating into a scratch dir and diffing against the hand-repaired export:
   positions match to **2.5e-6 m**, UVs to **1.2e-7**, identical tri counts (256/102) and bounds.
   The generated `.blend` is 227 KB against 1.97 MB for the hand-saved one - the text-bake rig and
   the 1024x551 master are regenerated by `bake_page()` rather than stored.

   One correction to the parameters recorded above: the mesh was **not** seated at z=0 as claimed.
   `build_roll()` seated off the *base* mesh, but Solidify with `use_even_offset` thickens at the
   flared ends and reaches past `THICKNESS/2`, leaving the evaluated low point at **-4.1 mm** - the
   prop would have sunk into the ground. The generator now calls `seat_on_floor()` after both
   objects exist, measuring through the depsgraph.

## Gotchas

- The blender-mcp socket accepts **one client**. Claude Desktop and Claude Code cannot both be
  attached. Large `execute_blender_code` payloads can also break the pipe - split them.
- Baked PNGs were written to `bpy.app.tempdir`, which is wiped when Blender quits. The current
  texture is packed into the .blend, so it survives; the loose files do not.
- Do not judge mirrored text from a screenshot - a model seen from the far side looks mirrored
  when it is fine. Verify with `dP/dU cross dP/dV == outward normal`.
- The user may be navigating the viewport concurrently; set the view in the same call as the
  screenshot.
- `obj.dimensions` is cached - call `bpy.context.view_layer.update()` after moving vertices.

## Where the technique detail lives

`~/.claude/skills/blender-game-asset/references/` - `modeling.md` (sampling, tri budgets,
reduction), `texturing.md` (bake pipeline, UV handedness, facet placement), `export.md`
(conventions discovery, export checklist, provenance).
