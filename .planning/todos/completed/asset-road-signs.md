---
id: ASSET-31
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-24
blocked-by: FEAT-59
relates: FEAT-39, FEAT-16, ASSET-22
---

# ASSET-31: Road signs

**Road furniture** — repeats along the network, never a destination. It makes a road read as
maintained and inhabited *between* POIs, at a density no POI model can carry. Placed from **road
geometry**, not scattered at random — see the flag below, which is the whole risk of this ticket.

## Request

A small kit of roadside signage on galvanised or timber posts — curve warning, gradient, junction
fingerpost, route/mile marker — faded, shot at, canted. Signs are how a road tells you about itself
before you can see around the bend, and this project's roads have **real, measured** curvature and
grade to tell you about.

## Spec

> ⚠ **SUPERSEDED — read the Resolution at the bottom for what actually shipped.** The owner re-cut
> this brief on 2026-08-23 (seven named California signs on a timber 4×4, no fingerpost, no
> shields) and adjusted the blank size on 2026-08-24. The piece list, the texture row, the real-size
> row and the collision row below are all stale. Kept verbatim as the original intent.

**One post mesh + one sign-face quad, driven by a shared face atlas.** The kit is deliberately not
four models:

| Piece | Tris | Notes |
|---|---|---|
| `sign-post` | ≤120 | plain post, ~2.0 m; the mount for everything below |
| `sign-face` | ≤40 | a quad (plus a thin backing) UV'd into the atlas — **the atlas cell is the sign type** |
| `sign-fingerpost` | ≤250 | 2–3 pointing blades on a post; a distinct silhouette, so a distinct mesh |

| Field | Value |
|---|---|
| Texture | **one shared 1024×1024 atlas** — diamond warnings (curve L/R, gradient, dip), route shields, mile markers, blank plates. One cell per sign type |
| Real size | faces 0.60–0.75 m; post 2.0 m to face centre |
| Origin | base-seated: post foot at y=0 |
| Forward | −Z (face reads from −Z) |
| Collision | `{ shape: 'box', dims: [0.10, 2.0, 0.10] }` — post only, knockable |

## Acceptance

- `assets/models/sign-post.glb`, `sign-face.glb`, `sign-fingerpost.glb` exist, export-clean under
  `.planning/research/ASSETS.md` settings.
- Sources committed: one `assets/models/src/road-signs.blend` + `road-signs.py`.
- **A new sign type is an atlas cell plus a UV offset — never a new model.** Prove it by producing at
  least four visibly different signs from the one `sign-face` mesh.
- Faces are legible at ~60 m from a moving vehicle (this drives the atlas cell resolution; text
  minifies badly, so favour symbols over words).
- Tri counts within budget; material names stable.
- All three load and place in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **⚠ A sign that lies is worse than no sign.** This is the one asset in the class whose *placement*
  can actively damage the game: a curve-warning sign on a straight, or a left-curve sign on a right
  bend, teaches the player their instruments are untrustworthy. The road system already knows the
  truth — the router prices curvature as κ² and the centerline carries real min-radius and honest
  1-D EMA grade — so **signage must be derived from the routed centerline, never scattered**. Warning
  signs read `minR` on the run ahead; gradient signs read the grade profile. That derivation is a
  placement ticket; this ticket must not ship a scatter path that makes the wrong thing easy.
- **Signs are not navigation UI and must never become it.** The GPS overlay (FEAT-39) already owns
  chevrons and junction arrow boards, and `items.md` is emphatic that **neither GPS may ever render
  an ETA** (par is never a countdown, SM-INV-3). A physical sign is set dressing plus honest road
  information — no distances-to-mission, no destination names tied to the active job, no timing.
  Fingerpost blades name *places*, not objectives.
- Route shields and mile markers are the cheapest way to make a region feel like a **place with a
  road system** rather than generated terrain — and per-region shield styling is an atlas cell, not
  a model, which makes it nearly free (QUAL-23 wants per-region routing character; this is the
  visible half of the same idea).


---

## Resolution — 2026-08-24 · shipped

### As shipped

| | |
|---|---|
| Models | `assets/models/sign-{grade,curves,rockslide,tee,cross,stop,icy}.glb` |
| Sources | `assets/models/src/road-signs.py` + `road-signs.blend` (one generator, all seven) |
| Tris | **52 each** (budget 120) |
| Materials | `SignPost` · `SignBack` · `SignFace` — names are the runtime API, keep them stable |
| Texture | one baked **512×512** face per sign, embedded, no Draco/KTX2 |
| Size on disk | **188 kB for all seven** |
| Blank | **36 in / 0.914 m** (diamond point-to-point; octagon across flats) |
| Post | timber 4×4, 89 mm, top at 2.18 m |
| Face centre | 2.00 m — diamond's bottom point at 1.54 m, clear of the 5 ft rural minimum |
| Model height | 2.430 m (2.457 m for the octagon) |
| Origin / forward | base-seated at y = 0 / −Z |
| Collision | `SIGN_POST_BOX` = `{ shape: 'box', size: [0.089, 2.180, 0.089] }` — **post only, knockable** |
| Registry | `signGrade` … `signIcy` in `data/prop-models.js`, no pool tag (see below) |

Audit: 0 loose verts, 0 non-manifold edges, 0 coplanar-within-1 mm face pairs, 0 inverted faces
(bmesh recalc check), UVs strictly inside [0, 1]. `npm test` — 9 affected gates green.

### The three decisions worth keeping

**Packaging: seven `.glb`s, not one.** The `steel-drum.py` precedent — one generator, one `.blend`
holding every variant side by side as the source view, `export()` writing a file per variant. A
spawner brings in one sign, not a set, and registration stays data-only. Now written up in
`ASSETS.md` ("A kit of variants…").

**The ticket's "a sign type is an atlas cell plus a UV offset" is honoured in a better place.** Each
variant declares its blank's outline as a polygon in **canvas coordinates**, and the mesh, the
artwork and the UVs are all derived from that one list. So the black border cannot drift off the
blank's edge, a new sign type is an outline plus a draw function rather than a new mesh, and
resizing the blank from 30 in to 36 in moved the geometry and the artwork together with one
constant. Corollary that is load-bearing: the canvas background is the field colour, because the
outline *is* the silhouette and the outermost texels are sampled right at the mesh edge.

**Legibility at 60 m is not achievable and never was.** A 0.914 m blank at 60 m is ~16 px on a
1080p screen; no real sign reads at that distance either. What reads at 60 m is colour and
silhouette — yellow diamond vs red octagon — and the symbol resolves around 25 m. That drove heavy
high-contrast symbols and kept lettering to the three signs where nothing else can carry the
meaning.

### Traps caught during the build, all now commented in the generator

- The blank was bolted to the **back** of the post, so the timber ran down the middle of every
  legend. Caught in the first front elevation, not by any numeric check.
- A symbol's clearance inset must exceed the border stripe (`BORDER_OFF + BORDER_W`), or the symbol
  crosses its own border — the cross's four arms poked into the yellow rim at 0.050 against 0.056.
- **A bezier's final chord is not its final tangent.** The arrowhead took its direction from
  `path[-1] - path[-2]` and came out 9° off vertical, one barb visibly higher than the other. Fixed
  by ending the path on a straight step.
- **An offset band folds back where the turn is tighter than its own half-width.** The winding-road
  sign grew a thin spur beside the arrowhead: a third S-bend squeezed into 0.065 of height against
  a 0.056 half-width, so the inner edge crossed itself. The cure is always a longer, gentler bend,
  never a thinner band — a thinner band just moves the limit. `ribbon()` now calls
  `polyline_min_radius()` and warns on stdout, so it cannot recur silently. Final path: two bends
  and a straight run into the head, min radius 0.0758 = ×1.35 the half-width.
- Blender's default `dither_intensity = 1.0` stipples flat fields with ±1 LSB noise and defeats
  PNG's row filters. It was costing **230 kB per face**; turning it off took the set from 1.6 MB to
  188 kB. Anything baking flat artwork wants this off — recorded in `ART-STYLE.md`. `gas-pump.glb`
  still carries the penalty and would be a free win if it is ever re-exported.

### Owner review passes

1. **2026-08-23 — the rebrief.** Post + face + fingerpost driven by a shared atlas became seven
   named California signs on a timber 4×4. Fingerpost, route shields and mile markers dropped.
2. **2026-08-24 — legend sizing.** Every legend 10% smaller, via one `LEGEND_SCALE = 0.90` applied
   by the Canvas about the blank's centre rather than forty edited coordinates. The border stripe
   and bolt heads are excluded (they belong to the blank, not the legend). `ROCK SLIDE AREA` moved
   to Arial Black — weight buys more legibility per unit of area than size does. **`STOP` opted out
   and went bigger** (cap 0.255 → 0.295, width 0.660 → 0.745): a warning sign is a picture with air
   around it, a regulatory sign is a word. Same pass fixed the arrowhead spur above.
3. **2026-08-24 — blank size.** 30 in → 36 in, because the board read small against the 4×4. That
   is the next rung of the MUTCD ladder, not an arbitrary scale factor, so the post-to-blank
   proportion stays a real one. Face centre held at 2.00 m, so the bigger blank did not buy its
   size by hanging lower into the road. Source-view spacing widened 1.05 → 1.20 m.

### Still open, and deliberately not done here: placement

**No pool tag is declared.** A `roadSign` tag would be a pool of things scattered at random, which
is precisely the failure the Notes section warns about — a curve warning on a straight teaches the
player their instruments lie. Placement is a road-geometry query, and it is its own ticket:

| Sign | Reads |
|---|---|
| `signCurves` | `minR` on the run ahead |
| `signGrade` | the grade profile ahead (mind the two elevation series — `seg.gradeAt` vs `runProfile().gradeY`) |
| `signTee` / `signCross` | the degree of the node ahead |
| `signStop` | a junction the player must actually stop at |
| `signRockslide` / `signIcy` | **nothing yet.** No geometric truth stands behind them — they are terrain/weather claims. Leave them unplaced until something can vouch for them. |

Same FEAT-59 wiring gap as ASSET-23 / `news-roll`; reachable meanwhile via `spawnModel('signStop')`.
