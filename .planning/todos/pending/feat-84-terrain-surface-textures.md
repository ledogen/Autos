---
id: FEAT-84
type: feature
status: in-progress
severity: minor
opened: 2026-09-22
source: owner request 2026-09-22 ("distinct textures for rock, dirt, and grass … blending normals or textures together at these three interfaces")
relates: FEAT-05 (the alpine biome colour + fbm detail this sits on), FEAT-25 (stone-texture.js — the procedural-texture precedent), FEAT-85 (roadside cover, built alongside), ART-STYLE.md rule 1 (the style exception ruled below)
branch: feature/roadside-cover (worktree CarGame-roadside-cover, :3754)
---

# FEAT-84: Per-zone surface textures — grass / dirt / rock, height-blended at the interfaces

## Request

The terrain is coloured per vertex into three natural zones (dirt, vegetation, rock — slope and
altitude decide) plus the engineered cut/fill zones, with a monochrome fbm mottle and a rock-only
noise bump on top. The owner wants each zone to carry its own surface detail and the three to
blend "at their interfaces" rather than crossfade.

## Rulings (owner, 2026-09-22)

- **Style exception, scoped.** ART-STYLE.md rule 1 says no textures. Ruled: a texture *generated
  at boot from a seed* ships no asset and stays in the "generate the artwork" spirit
  (`stone-texture.js` is the precedent). Hand-painted images remain out.
- **Channel:** normal (relief) + a *subtle* albedo modulation. The maps multiply the vertex palette
  colour (0.5 = ×1), so the colour pickers still drive the look and the palette stays flat.
- **Blend:** height-weighted. Each map carries its height in alpha; at an interface the taller
  feature wins, feathered over a depth — rock plates poke through thinning grass instead of a
  dissolve.

## What shipped (this branch)

- `src/terrain-texture.js` — `makeSurfaceTextures(seed, size, bases)`: three tileable
  (toroidal) DataTexture pairs. GRASS = thousands of tapered strokes (tufts) over soft fbm; DIRT =
  fbm clods + pebbles in a sun-washed brown + grey palette (absolute targets relative to the dirt
  colour; the albedo packs ×4 so a grey pebble can sit on a brown base); ROCK (owner's second
  pass: the bevelled-Voronoi first cut read as a cracked mud flat) = tilted plate facets with
  hard-edged joints, long random-walk fissures, and hundreds of small angular rubble polygons on
  top — both scales at once. Pure typed arrays (no canvas — a 2D canvas premultiplies colour by
  alpha and would corrupt the albedo where the height is low), so it runs headless and is gated.
- `src/terrain.js` — `_writeChunkVertexColors` also writes `aSurf` = (grass, dirt, rock) weights
  from the same feathered decision the colour is made from (cut face → rock, fill → dirt). The
  fragment blend at `<color_fragment>`: `w' = w · (1 + h)`, `b = max(w' − (max(w') − depth), 0)`
  normalised; albedo modulation mixed in by `uSurfAlbedo`; the blended tangent normal applied at
  `<normal_fragment_begin>` next to the FEAT-05 bump, scaled by `uSurfNormal`. All behind
  `uDetailScale > 0` (Low's kill-switch).
- **Local colouring** (owner: "if we want rocks poking through dirt we have to colour the rocks
  locally"): the share a zone GAINS in the height contest over its vertex weight pulls the
  fragment toward that zone's palette colour (`uColRock/Dirt/Grass`, synced from the params by
  `_syncSurfacePalette` on every recolour), so a rock plate surfacing in dirt is grey, not brown
  relief.
- **Grass splotches**: a world-space ~25 m field (`terrainSplotchFreq`) picks between pale
  "sedum" green, dead-grass straw and a darker desaturated green (`terrainGrassPale/Straw/Dark`,
  relative to the grass colour so the picker moves the family); pickers under Terrain Look.
- Params (`data/ranger.js`): `terrainTexNormal 0.8`, `terrainTexAlbedo 0.55`,
  `terrainTexBlendDepth 0.22`, tiles grass 2.0 m / dirt 2.4 m / rock 8 m. Live sliders under
  Terrain Look (alpine). `vegBlendOf()` exported — the ONE vegetation rule, also read by FEAT-85.
- Gate `test/terrain-texture.mjs` (fast): determinism, seamless wrap, height span, modulation
  centred on ×1, upward normals.

## Acceptance

- [x] Three distinct surfaces visible in-game on grass / dirt / rock ground; cut faces read rock,
      fill embankments read dirt.
- [x] Interfaces interlock (taller wins) rather than crossfade; `terrainTexBlendDepth` → 1 gives
      the plain crossfade back.
- [x] Colour pickers still recolour each zone; `terrainDetailScale 0` removes everything.
- [x] No image assets; gate green; headless imports unaffected.
- [x] Rock reads as relief, not ink (close-up 2026-09-23): plate shoulders roll into the joints,
      facets at ~6° (normal scale 12 — the physical unit is ~0.25 m per height unit over 3 cm
      texels), rubble collects along the fissures, joints only slightly darker in albedo.
- [x] Pebbles read as stones, not salt (targets kept close to the soil value; ~300 per tile).
- [x] Steep faces (owner pass 3, 2026-09-23: "traced-out paths and crumbs on top"): the angular
      fragments ARE the surface now — packed to 80 % cover (gated), 0.1–0.85 m, big blocks first —
      and the plate/fissure field only fills the gaps. The rock zone is also projected from the
      SIDE on steep ground (ZY/XY by the face normal, mirrored per side, blended by steepness) so a
      cliff keeps fragment shapes instead of streaking the top-down projection down its face.
- [x] Dirt pebbles (owner pass 4): ANGULAR fragments like the rock crumbs, ~50 % cover (gated
      42–60 %), patchy by an in-tile fbm mask (gravelly stretches vs bare clods).
- [x] Knolls: ground standing 1.5–6 m above its 40 m neighbourhood (the meadow rule's `rel`,
      positive) picks up to 0.55 rock share (`terrainKnollRelLo/Hi`, `terrainKnollRock`), so the
      fragment texture pokes through the grass on local maxima with local colouring. NOT yet
      eyeballed on an actual knoll — the verification framings were all basin floor.
- [x] Owner pass 5 (2026-09-23, first DRIVE): "the frequency of large shapes on the bumpmap is
      perfect" — the rock relief is ruled done, do not touch the fragment/plate recipe.
- [x] Pass 5: GREEN UNDER THE ROCKS — the 20 % of the rock tile between fragments (the plate
      filler + joints) is now a foliage green (`ROCK_GAP_GREEN`, absolute target relative to the
      rock picker, relief shading kept), "to suggest foliage hiding beneath the larger rocks".
- [x] Pass 5: GREEN UNDER THE DIRT — the soil between the pebbles pulls toward a dusty green in
      the HOLLOWS (`DIRT_UNDER_GREEN` × (1 − clod crown), 0.75 mix); the clod crowns and the pebble
      "splashes of colour" stay brown/grey.
- [x] Pass 5: GRASS SPLOTCHES REWRITTEN — the fbm field (three soft thresholds over a ~25 m fbm)
      never read: fbm sits near 0.5 so the meadow was one dark colour with rare soft patches
      ("it still looks all the same colour to me"). Now two CELLULAR blob layers (`tsBlobs` in the
      terrain shader): every lattice cell of `terrainSplotchSize` m (8) drops one round blob of
      radius 0.55–1 × `terrainSplotchCover` cells, a second layer at 0.4× the size on top, edges
      crisp over `terrainSplotchEdge` m (0.35), lattice domain-warped by two fbm octaves so the
      mats creep instead of reading as circles. Each blob takes pale / straw / dark by its hash;
      the ground between mats keeps the picker's meadow colour. Blended at
      `terrainSplotchStrength` (0.7), independent of the albedo slider. Seen overhead + eye level:
      irregular mats with defined edges. Sliders: Terrain Look → Splotch size / cover / edge /
      strength + the three pickers. Owner to tune — the colours are still the pass-2 guesses.
- [x] Pass 5: grass tuft strokes widened (brightness 0.78–1.22, yellowing ±0.16, normal 2.4) —
      "texture still isn't really visible" — secondary to the splotch rewrite above.

- [x] Owner pass 6 (2026-09-24, before sleep): the straw mats read as "cow pattern" against the
      greens → `terrainGrassStraw` is now a dark-brown earth tone (0x4a3a26; picker label "earth").
      Green under the dirt: more vibrant on FLAT dirt, hills as they were → `terrainDirtFlatGreen`
      (0.4): extra green saturation in the dirt hollows × flatness (slider "Dirt flat green").

- [x] Owner pass 8 (2026-09-25, after the A/B portfolio + my read): **albedo per zone** —
      `terrainTexAlbedoGrass/Dirt/Rock` (0 / 0 / 0.55; sliders "Albedo: grass / dirt / rock +
      cut/fill"); the carve zone (`aSurf.w` = carveZoneBlend, a new 4th component) forces dirt +
      rock albedo ON so engineered faces keep their busy look. Relief stays on every zone.
      **Splotches DELETED** (tsBlobs, the four uniforms, three pickers, four sliders — ruled out
      after seeing the meadow without them). **Rock gap green** is a picker
      (`terrainRockGapGreen` 0x2a4522, darker/richer) — a change re-bakes the maps (~40 ms) and
      swaps the uniforms (`_syncSurfacePalette` keys on dirt/rock/gap colours).
- [x] Pass 8, the dirt→rock read ("brown dirt turning into brown rocks turning into grey rocks"):
      two causes, both fixed. (1) The vertex colour blended rock INTO the ladder, so a half-rock
      vertex was a brown-grey average that the fragment map then multiplied — now the vertex
      colour carries dirt/grass only and the shader paints rock by the share rock WINS (the
      per-texel height contest with textures on, `vSurf.z` without), so a mixed vertex is brown
      dirt with grey fragments on it. (2) `terrainRockColor` was 0x72604b, a warm brown behind a
      "granite grey" comment — ground rock had always been brown while the prop rocks were grey.
      Now 0x7a7c80 (0x84868a read near-white on a sunlit face). Picker as before.

- [x] Owner pass 9 (2026-09-25, scenes 10 + 12 of the portfolio): **rock by coverage, not by
      contest** — a vertex with rock share s shows rock on s^γ of the tile (`terrainRockSparsity`
      2.0), the map's own fragment heights ranking texels tallest-first, so thinning rock gets
      SPARSER instead of fainter ("taper the sparsity, not the strength"). Pure dirt keeps a floor
      (`terrainDirtRockFloor` 0.06) so a basin's dirt rim has a few rocks poking through; grass
      contributes nothing (lowland meadow relies on the prop rocks). Grass and dirt still contest
      each other by height for the remainder. Sliders: Rock sparsity (γ), Dirt rock floor.
- [x] Pass 9: **tussocks** in the grass map — ~73 irregular mounds (12–24 cm radius, rim wobble
      so they read as clumps, not bubbles) under the strokes, normal 2.4 → 3.0. The relief that
      survives mipmapping at 30–80 m: the meadow reads as a bumpy shrubby turf instead of a plane
      ("too flat esp. at distance … twiggy / shrubby").

- [x] Owner pass 10 (2026-09-25, scene 21: "brown rocks on grey dirt"): the dirt map's own
      angular pebbles were relief-only and so dirt-brown, which read as brown rocks wherever the
      rock fragments had taken the ground around them. **A pebble is a rock and rocks are grey**:
      dirt texels above the clod ceiling (~0.40 after normalisation) take the rock colour, tallest
      first — `terrainDirtPebbleGrey` 0.35 of them on pure dirt, all of them once the rock share
      passes ~1/3 — so across a dirt→rock blend only the NUMBER of grey rocks changes, never
      their colour. `terrainDirtRockFloor` 0.06 → 0.03 (the pebbles now carry the rim).
      Slider "Dirt pebbles grey". Engineered fill keeps its own look (vSurf.w).

- [x] Owner pass 11 (2026-09-25): **joint green only on low-inclination rock** — the rock map's
      low texels (the filler between fragments, h < ~0.4) are desaturated to their own brightness
      as slope passes `terrainRockGreenSlopeLo/Hi` (0.25 → 0.5), so hill tops and shoulders keep the
      green and faces go bare grey ("steep faces slide, nothing grows in the joints"). Engineered
      cut faces are exempt (the stripes there were liked). Sliders "Rock green: bare from / by
      slope". Lichen on rock is the owner's stated eventual direction (FEAT-86), not yet.
- [ ] Scene 22 "seam" (green flats, grey cliff band, hard edge at the cliff threshold) was a ONE-OFF
      captured in the run the laptop slept through; three fresh captures render correctly. Filed
      as BUG-73 (vertex colours written before heights are real) — not a shader rule.

- [x] Owner pass 12 (2026-09-25, scenes 20 vs 22): **one colour key for "rock with foliage
      underneath"** — wherever rock is present the ground BETWEEN the rocks (grass, dirt, and the
      rock zone's own joints) pulls toward `terrainRockGapGreen` (`terrainUnderRockGreen` 0.8,
      gated by inclination, engineered faces exempt), applied before the rock mix so only the
      non-rock texels carry it. The green no longer lives in ANY map: the rock map's joints and the
      dirt map's hollows are neutral (relief only), so the picker is a live uniform (no re-bake).
      The "dirt flat green" rule is gone — it was my misreading of this ask. Scene 20's shoulder
      was the FILL skirt with the dirt albedo forced on (baked hollow green + pale pebbles = "green
      with rocks poking through"): dirt albedo is now off everywhere, the carve override keeps the
      rock albedo on cut faces only. Sliders: Under-rock green (key) picker + amount.

- [x] Owner pass 13 (2026-09-26, "brown rocks" in scenes 1–3): a dirt pebble that did not become
      a grey stone was still a lit, shadowed, angular bump in the dirt colour — i.e. a brown rock.
      Option B chosen (of: all pebbles grey / flatten the non-grey ones / re-bake sparser): the
      dirt normal map is suppressed on pebble texels that are not grey, so dirt is clods plus the
      grey stones, and the stone count still rises toward the rock zone. Shader-only, 4 lines.

- [x] Owner pass 14 (2026-09-27, seed w (197,616): "the clearly defined thresholds bother me"):
      **biome dither** — the rock share is perturbed per texel by a world-space noise field (two
      octaves, ~8 m + ~2 m, `terrainBiomeDither` 0.45 / `terrainBiomeDitherFreq` 0.12) before the
      coverage rule, weighted by s·(1−s) so pure meadow and pure rock stay pure; the dithered share
      also drives the pebble-grey share and the under-rock green. A dirt↔rock boundary is now a
      wide ragged band of rock islands and dirt pockets. Sliders "Biome dither" / "… freq".
      Grass↔dirt is NOT dithered (it goes through the height contest, already soft) — same
      treatment is a one-line extension if wanted.

- [x] Owner pass 15 (2026-09-27, the place capture at seed w (197,616)): the sharp "dirt" patches
      inside rock were the road's FILL embankments — the carve weight exempted every engineered
      zone from the rock mix, the dither, the stones and the under-rock green, on top of the vertex
      blend already fading rock out, so the 10–25 m carve feather collapsed to a line. `aSurf.w` is
      now SIGNED (+ fill, − cut): only cut walls keep their own look; fill behaves as natural dirt
      and dithers into the rock around it. Owner keeps dither 0.5 / freq 0.3.

- [x] 2026-09-27 (post-handoff): BUG-74 first mechanism (fill relief + stones ramp in with the
      carve feather — the gravel-bed overspill), BUG-75 fixed (border normals from the carved
      analytic neighbour), QUAL-32 fixed (matte terrain, faint asphalt sheen, "Sun shine" slider).

- [ ] 2026-09-28: every BUG-74 attempt REVERTED by ruling except the biome dither (signed carve
      weight, fill ramp, cut-by-depth, cut-rule deletion all gone; `aSurf.w` unsigned again). The
      roadwork seam is open; see BUG-74 for what was tried and the owner's own suggestions.

## Known limits / follow-ups

- Single tap per zone — repetition of the 8 m rock tile may show on big open faces. A second
  rotated tap blended by low-frequency noise is the standard fix (doubles the texture cost).
- The road-mesh dirt skirt (the vertical shoulder wall in `road-mesh.js`) keeps its fbm gravel
  bump only; it is a near-vertical strip and a planar XZ texture would smear on it.
- Meadow vs fertile green share one grass map.

## Owner pass 16 (2026-09-28) — dirt 0x7c6346, rock 0x59544f, "a small baseline of rocks poking through"

Owner: "dirt texture to include a small baseline amount of rocks poking through … a small baseline
level of rock texture noise that is then strongly amplified by the rock biome input" (reference:
seed 871429083 (107, 26), natural share ≈ 0.5 by altitude).

That mechanism already existed twice (`uDirtRockFloor` + `s^γ`; `uDirtPebbleGrey`) and BOTH dials
were dead. Measured (scratchpad `rock-cdf.mjs` / `rock-curve.mjs`): the coverage rules treat
`1 − height` as a quantile, but `_normalise` is min–max — only 1.8 % of rock texels exceed 0.5 and
0.3 % exceed 0.73. So "cov 0.27" admitted ~0.3 % of texels, the effective curve was a cliff (0.4 %
at s 0.5 → 13 % at 0.7 → 60 % at 0.8 — the "abrupt" rock front in every pass), and floor 0.03 vs
0.30 rendered identically (a first A/B was void: `_syncSurfacePalette` re-reads params per chunk,
so poke `_params` and call it, never the uniform). Pebbles the same: "35 % of the pebbles grey" was
0.1 % of the tile; the chips in the owner's reference are the rule saturating to "all" at s ≥ ⅓.

Fix at the root: `_rankOf(H)` (a true quantile) is baked into each normal map's unused .b; the
shader ranks rock coverage by it and turns the dirt rank into a rank-within-the-pebbles via
`uDirtPebbleFrac` (from the bake). Relief, joints and the height contest keep the absolute height
— the ruled-done relief recipe is untouched. Defaults: γ 2 → 6 (reproduces the approved curve,
1.6 / 12 / 26 % at s 0.5 / 0.7 / 0.8, without the cliff); floor 0.03 now an honest 3 %, in patches
(× (1 + 2·dither)); pebbles 0.35 honest ≈ 8 % of the tile as grey chips = the baseline. Gate
`terrain-texture` re-pinned: .b is a uniform quantile. Shots: scratchpad `shots/rank-before|after`
(03 dirt, 09 dirt→rock, 10 treeline, 22): chips appear on dirt, rock faces and treeline unchanged,
the 09 front is gradual. Both dials now do what their labels say — owner to tune.

### Pass 16 addendum — "they're brown … even with dirt pebbles grey maxed"

Owner: the baseline pebbles read brown, not grey. Two findings, both proven with in-page shots
(scratchpad `shots/redA|redB|neutral`, rock colour forced red / neutral):
1. Per-TEXEL rank left every pebble's lower half and every small pebble classed as a clod (brown,
   relief kept, no slider reached it). The dirt bake now ranks WHOLE pebbles by peak height,
   weighted by area (`rank` from `dirtFields`, soil = 0, pebble (0.05, 1]); the shader reads it
   straight (`ts_pr = ts_nD.b`; `uDirtPebbleFrac` gone). Red test: exactly the 35 % share, whole
   pebbles, and B=255 floods the tile → the rule is right.
2. With the rule right they STILL read brown: `terrainRockColor` 0x59544f (owner's pick) is a
   WARM grey (r > g > b, linear); a small warm chip on sunlit tan reads brown, while the prop rocks
   are neutral (0xb7b6b4 / 0xa3a09b / 0x8a8782 sRGB). Grey pebbles now also take the rock map's
   albedo flecks (`ts_pebW` in `ts_alb`) — helps little. A neutral grey of the same lightness
   (0x555555) reads grey at once. DECISION FOR THE OWNER: cool the rock picker (faces + pebbles,
   one colour per the "a pebble is a rock" ruling) or give pebbles the small-rock prop grey.
