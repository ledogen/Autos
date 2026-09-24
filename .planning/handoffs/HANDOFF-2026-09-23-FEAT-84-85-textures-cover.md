# HANDOFF — FEAT-84 surface textures + FEAT-85 roadside cover — 2026-09-23

**UPDATE 2026-09-24 (pass 5, after the owner's first drive):** the two tickets' "Owner pass 5"
sections are the record — green under rock/dirt textures, cellular grass splotches, wall −80 %
sporadic, tier-scaled backcountry, far-ring 3-tri LOD swap, staggered fade, medium rock + zone
rocks. Committed as `feat(84)` + `feat(85)` and main (`d3e72b7`) merged INTO the branch; still
unmerged to main. Screenshots of the pass are in the session scratchpad only. Open: owner tunes
the splotch pickers/sliders and the zone-rock dials, rules on sage-as-collidable, and frame cost on
real hardware at High/Ultra (`coverDensity` 1.6 / 2.2 is a guess — measure, then set).

**Two owner requests from 2026-09-22, four review passes, one UNMERGED branch. Rock/dirt/grass
detail maps blended by height at the interfaces, and a beaten-back wall of native grasses and
sagebrush along every shoulder. Owner has reviewed screenshots through pass 4 but has NOT driven
it, NOT ruled it done, and it is NOT committed.**

Branch `feature/roadside-cover`, worktree `/Users/ledogen/CodeShit/CarGame-roadside-cover`, dev
server `:3754` (Vite; restart with `cd <worktree> && npm run dev -- --port 3754 --strictPort`).
Base is main at `cd585ad`; main has not moved. Main's own working tree carries UNRELATED
uncommitted work (ranger.glb / ranger.py / road.js edits) — leave it alone.

Tracker: `.planning/todos/pending/feat-84-terrain-surface-textures.md`,
`feat-85-roadside-cover.md` (both `in-progress`, each with a "What shipped" section that is the
technical reference), `feat-86-lichen-on-rocks.md` (filed, open, future). Memory:
`project_feat84_85_textures_cover` (read-first line in MEMORY.md).

---

## 1. State of the tree (19 files, uncommitted)

```
NEW   src/terrain-texture.js          procedural grass/dirt/rock DataTexture pairs (headless-safe)
NEW   test/terrain-texture.mjs        gate: determinism, seamless wrap, spans, fragment/pebble cover
NEW   test/roadside-cover.mjs         gate: clump geometry, wall band, bores/pads, order-invariance
NEW   .planning/todos/pending/feat-84 / feat-85 / feat-86
MOD   src/terrain.js                  aSurf weights, shader blend, local colouring, splotches, knolls, groundAt()
MOD   src/props/prop-geometry.js      makeGrassClump / makeRyeClump / makeSageClump
MOD   src/props/prop-palette.js       COVER_CATS, buildCoverMaterial (wind + fade)
MOD   src/props/prop-scatter.js       coverPass (wall + backcountry)
MOD   src/props/prop-system.js        cover keys: capacity, material, no bake/cast/sweep
MOD   src/props/prop-debug.js         "Roadside cover (FEAT-85)" folder
MOD   src/road.js                     walkTileRoads(), junctionPadBlocked()  (additive, read-only)
MOD   src/main.js                     samplers roadWalk/groundAt/padBlocked, tier cover fields, __terrain
MOD   src/debug.js                    Terrain Look: surface + splotch + knoll sliders
MOD   data/ranger.js, data/flora.js   params
MOD   test/gates.mjs                  two gates registered
MOD   .planning/research/LAYOUT.md
```

Gates: `npm test` (affected, 64 selected) = **63/64 green**, the red is the standing
`road-clearance` (same 2 earthwork pairs as main — BUG-69/70 residue, not this work). Ran clean
three times across the passes. Fast gates for everything touched: green.

To commit when the owner says so (one commit per ticket is the norm):
```bash
cd /Users/ledogen/CodeShit/CarGame-roadside-cover
git commit -m "feat(84): procedural grass/dirt/rock surface textures, height-blended" -- src/terrain-texture.js src/terrain.js data/ranger.js src/debug.js test/terrain-texture.mjs test/gates.mjs .planning/todos/pending/feat-84-terrain-surface-textures.md .planning/research/LAYOUT.md
git commit -m "feat(85): roadside cover — ricegrass, wild rye, sagebrush along the shoulders" -- src/props data/flora.js src/road.js src/main.js test/roadside-cover.mjs .planning/todos/pending/feat-85-roadside-cover.md .planning/todos/pending/feat-86-lichen-on-rocks.md
bash ~/.claude/skills/worktree/scripts/wt.sh merge roadside-cover     # then: wt.sh clean roadside-cover
```
(`test/gates.mjs` and LAYOUT.md touch both; put them in whichever commit lands first.)

## 2. Owner rulings — do not re-litigate

| ruling | where it bites |
|---|---|
| ART-STYLE "no textures" EXCEPTED for textures generated at boot from a seed (no image asset); `stone-texture.js` is the precedent | `terrain-texture.js` — never a PNG |
| ART-STYLE "no cutout foliage" HOLDS — cover is opaque geometry, zero alpha | `prop-geometry.js` clumps |
| Channel: normal + SUBTLE albedo modulation that multiplies the palette (pickers keep working) | shader at `<color_fragment>` |
| Height-weighted blend (taller wins), not crossfade | `w' = w·(1+h)`; ADDITIVE form let rock surface in every dirt hollow |
| Rock poking through dirt must be coloured LOCALLY | `ts_gain` mix toward `uColRock/Dirt/Grass` |
| Rock v1 (bevelled Voronoi) = "cheese balls / cracked mud flat" → v2 facets+fissures+rubble; v3 on steep faces "traced paths + crumbs on top" → fragments ARE the surface at 80 % cover, plates fill the gaps, SIDE projection on steep ground | `rockFields`, `RUBBLE_COVER`, `ts_steep` block |
| Dirt pebbles: sun-washed brown + grey; then ANGULAR like the crumbs, ~50 % cover, patchy | `dirtFields`, `PEBBLE_COVER`, in-tile fbm mask |
| Grass tile +25 %; splotchy palette pale sedum / straw / darker neutral (ABSOLUTE colours blended — a factor over the dark base washed the meadow white) | `uGrassPale/Straw/Dark`, `terrainSplotchFreq` |
| "Rocks poking thru grass around local maxima" | knoll term: `rel` 1.5–6 m above the 40 m local mean → up to 0.55 rock share |
| Cover = three natives: Indian ricegrass (small, 20 % smaller, DOUBLE density), Great Basin wild rye (large, 20 % larger), big sagebrush (third kind). Physics `bush` blob stays | `flora.js grass/rye/sage`, `wallRows 4`, `wallTallFrac 0.175` |
| Wall beat-back 1–4 m from the pavement edge, NOT a straight line — noise along the road; a DIFFERENT noise field for backcountry | `wallNoiseFreq`, `backNoiseFreq` |
| Grass continues onto dirt slopes, sparser | `dirtFrac 0.3` (grass + sage; rye green-only — my call, one param) |
| Sway ×2 | `0.10` coefficient in `buildCoverMaterial` |
| Lichen on boulders = future small ticket | FEAT-86 |

## 3. What is verified, and how

Headless screenshots only (`node test/screenshot.mjs <x> <z> --port=3754 --height= --pitch= --zoff=`,
seed 6, fog off, daytime). Vantages used: road level and overhead at junction (-38,183), road
level at (-390,-382), close-ups at (-40,192) [cut bank], (-30,197) [dirt + clumps], the portal
cliff from (-85,165). Seen and accepted by me: wall shape and wander, three clump models at
2–15 m, grass/dirt/rock textures at 2 m and 45 m, cliff without streaking, pebble patches.

NOT seen: the knoll rock rule on an actual local maximum (every framing was basin floor);
wind (stills); dusk; a bare above-treeline face; the Low tier; any other seed.

Cost (Normal tier, spawn, headless — vsync-locked so GPU ms unmeasured): cover adds ~99k tris and
8 draw calls at 2243 clumps; the pass-2 density doubling of small grass has NOT been re-measured.
Probe script: `scratchpad/perf-cover.mjs` pattern (uses `window.__props()`, `__terrain()`, `__ri()`
under `?prof=1`).

## 4. Open items (owner's, in order)

1. Drive it. Tune through sliders, not defaults: Terrain Look → Surface relief / albedo / blend
   depth / tiles / splotch pickers / knoll; Props → Roadside cover → beat-back, depth, rows, tall
   share, sage share, backcountry, dirt density, fade, wind.
2. Find a knoll and judge the poke-through (`terrainKnollRock` 0 turns it off).
3. Frame cost on real hardware after the density doubling; if the vertex stage shows on Low-class
   machines, gate cover to the near ring only (`_placeChunk`, one condition).
4. Commit + merge (section 1). Close FEAT-84/85 with resolution notes on merge.

## 5. Known limits (in the tickets)

- A road adopted AFTER a chunk scattered has no wall there until the chunk re-streams (the BUG-71
  sweep only re-drops chunks with *intruded* props). Fix if seen: road-signature check in
  `invalidateRoadIntrusions`.
- One texture tap per zone (plus the steep side tap for rock): the 8 m rock tile may repeat on
  big faces.
- The road-mesh dirt skirt keeps only the FEAT-05 fbm bump.
- Cover instances stay resident in the vertex stage out to the far ring; only fragments fade.

## 6. Gotchas learned the hard way

- `tintFor(undefined)` = black: cover tint must be brightness-only `[b,b,b]` (vertex colours are
  baked; instanceColor multiplies).
- DataTexture, never canvas: a 2D canvas premultiplies rgb by alpha and the height lives in alpha.
- Albedo packs ×4 (`ALBEDO_PACK`): a grey pebble on the brown dirt base needs a ×3+ blue factor.
- Normal scale is physical: height unit ≈ 0.25 m over 3 cm texels, so rock needs ~12, not 2 — at 2
  a plate facet was under 2° and read as a flat tile with seams.
- Pebble/fragment targets must stay within ~1.2× the soil value or they read as white salt under
  sun + ACES.
- Screenshot trap near a cut: raw ground sits ABOVE the carved camera → shot from inside the hill
  (the flat blue frame). Raise `--height` or pick a spot off the carve.
- The props gate fixture's road must sit MID-chunk; on the boundary the far verge belongs to the
  neighbour and "both sides" fails for a fixture reason.
- `echo ====` in zsh is an error (`=` expansion); use `----`.
