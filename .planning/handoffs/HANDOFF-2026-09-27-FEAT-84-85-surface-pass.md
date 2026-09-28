# HANDOFF — FEAT-84 surface textures + FEAT-85 roadside cover, owner passes 5–15 — 2026-09-27

**Branch `feature/roadside-cover`** (worktree `/Users/ledogen/CodeShit/CarGame-roadside-cover`,
Vite dev `:3754`; main's own dev server is `:8000`). **18 commits ahead of main, tree clean,
NOT merged, NOT pushed.** Main was merged INTO the branch at `69f94dc` (main = `d3e72b7`,
PERF-27 + FEAT-68 close); main has not moved since. Gates: `npm test` 44–52 affected, all green
except the standing `road-clearance` red (BUG-69/70 residue, same two pairs as main).

The previous handoff (`HANDOFF-2026-09-23-FEAT-84-85-textures-cover.md`) covers passes 1–4 and
the build. This one covers what the owner's first drive and the A/B portfolio turned into. The two
tickets' "Owner pass N" sections (`feat-84-*.md` passes 5–15, `feat-85-*.md` passes 5, 7, 8) are
the technical record, pass by pass; this file is the map.

## The artifact (share with a friend)

https://claude.ai/artifact/Nw9S3vUKvWByigaqY9SBmL — "AUTOS Surface A/B", Version 7. Thirty
before/after pairs (before = main `d3e72b7`, after = branch at `729098a`), wipe slider + side by
side, a reviewer brief. **Stale on the after side** for the last three commits (biome dither,
fill-as-dirt, dither 0.5/0.3). Regenerate:
```
cd CarGame-roadside-cover
node test/ab-shots.mjs 3754 9333 <out>/after            # 30 frames, ~5 min; a case filter and a pre-shot eval are optional args
sips → JPEG q78 into scratchpad/ab/jpg/after/  (the page + before/ live in the session scratchpad; if that is gone, rebuild the page from test/ab-shots.mjs's CASES — the HTML was generated from them)
Artifact publish with url=<above>, root=<jpg dir>, files=after/*.jpg   # before/ stays as published
```
Don't close the lid mid-capture: a sleep stalls the headless Chrome and the run loses frames
(the shooter takes a comma list of case ids to recapture just those).

## What the look IS now (the rules, in shader order — `src/terrain.js` `<color_fragment>`)

1. Vertex colour = dirt → vegetation ladder only. **No rock in the vertex colour.** `aSurf` is
   vec4: (grass, dirt, rock, ±carve) — carve **signed**: + fill, − cut.
2. FEAT-05 mottle (`uMottle` 0.6, `uNoiseScale` 0.3) over everything.
3. **Rock by coverage, not contest.** Rock share s is **dithered** per texel (two octaves,
   `uBiomeDither` 0.5 / 0.3 m⁻¹, weight s·(1−s) so pure ends stay pure), then rock may occupy
   s^γ of the tile (`uRockSparsity` 2), the rock map's own heights ranking texels tallest-first;
   pure dirt keeps a floor (`uDirtRockFloor` 0.03). Grass/dirt contest the remainder by height
   (`uSurfDepth` 0.22).
4. **Under-rock green** — THE colour key: wherever rock is present, the ground between rocks
   (grass, dirt, or the rock zone's own joints) pulls toward `uRockGapGreen` (0x2d372a) ×
   `uUnderRockGreen` 0.8, gated by inclination (`uRockGreenSlope` 0.25→0.5: steep = bare), CUT
   walls exempt. No green is baked in any map.
5. Rock texels → `uColRock` (0x5a5b5e — was a warm brown 0x72604b behind a "granite grey"
   comment; that was the original "brown rocks").
6. **A pebble is a rock and rocks are grey**: the dirt map's pebbles take `uColRock`, tallest
   first, `uDirtPebbleGrey` 0.35 of them on pure dirt → all by s ≈ 1/3; the non-grey pebbles
   **lose their relief too** (option B) so dirt = clods + grey stones, nothing brown lit like a rock.
7. Albedo (colour) maps: **rock only** (`uSurfAlbW` = 0/0/0.55), forced on for CUT faces; grass,
   dirt and FILL take none — relief only. Grass map carries tussocks (distance read).
8. Relief normals blended by the same shares; rock side-projected on steep faces.

Deleted along the way, by ruling — do not re-add: the cellular grass splotches, the flat-dirt
hollow green, the baked gap green in the rock map, the baked hollow green in the dirt map, dirt
albedo on fill, the design-time "dirt flat green".

## Cover / props (FEAT-85) as they stand

Wall −80 % and sporadic (rows 2, density 0.55, patch gate 0.06/0.45); backcountry 1100 attempts ×
tier `coverDensity` (Low 0 / Normal 1 / High 1.6 / Ultra 2.2); riverbanks (`bankAttempts` 360,
inBank, rye-heavy, no green gate); dirtFrac 0.5. Zone rocks 900 attempts, mix 0.58/0.224/0.07
(small/medium/large; medium+large −30 % by ruling), `medRock` non-collidable; boulders 0.08.
Far-ring 3–4-tri Lo stand-ins by pool-key remap; staggered per-instance fade; small/medium rocks
fade through `groundMaterial`. Litter passes: ground grid + road-sample grid + bbonly deferral
(scatter 26.7 → 5.4 ms/chunk vs main ~2; `test/bench-scatter.mjs`). BUG-71 sweep skip predicate
`sweepIgnoresKey` (FADE_CATS + cover) — any new litter cat placed near a road MUST be in it.

## Owner rulings not to re-litigate (this pass)

| ruling | date |
|---|---|
| Rock relief recipe is DONE ("frequency of large shapes is perfect") | 09-23 |
| More props: rocks on every tier, grass by tier; shoulder −80 % sporadic | 09-23 |
| Straw → earth; then splotches removed entirely; never a colour lattice on the meadow | 09-24/25 |
| Albedo only on rock + cut faces; fix the colour KEY, not the albedo | 09-25 |
| Grey rocks: taper SPARSITY not strength; lowland meadow relies on prop rocks; a little rock on a basin's dirt rim | 09-25 |
| A pebble is a rock and rocks are grey; option B (flatten the non-grey ones) | 09-25/26 |
| Green through rock only on low inclination; lichen is the eventual direction (FEAT-86) | 09-25 |
| Palette: rock 0x5a5b5e, noise 0.3, mottle 0.6, gap 0x2d372a | 09-25 |
| Visible thresholds are bad; dither 0.5 / 0.3 kept | 09-27 |

## Open

1. **Merge to main** — the owner has driven it and approved the direction pass by pass but has
   not said "merge". `bash ~/.claude/skills/worktree/scripts/wt.sh merge roadside-cover`, then
   close FEAT-84/85 with resolution notes (FEAT-86 stays open).
2. **BUG-73** (green flash — a whole above-treeline flat rendering fertile green for one load).
   Seen twice, never with the audit attached. `test/chunk-audit.mjs` found the vertex data clean
   on two forced reloads → next time, dump the uniforms/texture versions too (ticket says how).
3. **GPU cost on the Air** is still unmeasured: Terrain Look → "Surface textures (A/B)" with the
   stats panel is the test. CPU is measured and paid back.
4. Proposed, unruled: sagebrush as a soft-drag collidable (one line in `bakeCover`); grass↔dirt
   dither (same one-liner as rock); High/Ultra `coverDensity` 1.6/2.2 are guesses.
5. The steep dirt slope (portfolio scene 03) and the fully sunlit alpine face (05) read pale —
   lighting + relief facets; `Surface relief` and the rock picker are the levers.

## Gotchas learned this pass

- `window.terrain` is the LAB's helper, not the TerrainSystem — use `window.__terrainSystem()`.
- Treeline is **60–200 m** (`terrainTreelineHi` 200), not 105; altitude rock starts early.
- Shader helpers that call `tdHash`/`tdFbm` must be spliced at `main()`, not prepended (the
  terrain-detail NOISE_GLSL is itself a prepend) — a compile failure = missing ground, props drawn.
- `setTerrainUniform('uVec.x', v)` addresses one component; colours go through `_recolor`.
- Screenshot camera heights must use the CARVED surface near roads (`ab-shots` builds a RoadSystem
  for that); raw heights put the camera inside a cut.
- A mid-run laptop sleep kills a capture; the shooter's case filter recovers the rest.
