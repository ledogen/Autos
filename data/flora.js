/**
 * data/flora.js — Procedural prop (tree/rock/bush) parameters for AUTOS FEAT-06.
 *
 * Exported const config in the spirit of data/ranger.js. Drives the three procedural geometry
 * primitives (prop-geometry.js), the baked palette (prop-palette.js), and the deterministic
 * scatter (prop-scatter.js). All tunables live here so a future debug-menu pass (FEAT-06
 * housekeeping) can expose them without hunting through the generators.
 *
 * Ranges written as [min, max] are sampled per-VARIANT at palette-bake time (a small fixed set of
 * meshes), NOT per-instance — per-instance variety comes from instance transform + tint. This is
 * the perf contract: a few baked geometries instanced thousands of times (see FEAT-06 ticket).
 *
 * Units: metres. Colours: 0xRRGGBB.
 */

export const FLORA_PARAMS = {
  worldSeedTag: 'flora',   // seedFor(worldSeed, 'flora', cx, cz) domain tag
  chunkSize:    64,        // MUST match terrain CHUNK_SIZE (src/terrain.js)

  // ── Scatter / biome ───────────────────────────────────────────────────────────
  scatter: {
    clustersPerChunk: 4,        // tree cluster centres seeded per chunk (grouping)
    clusterRadius:    18,       // m — individuals scatter within this of a cluster centre
    treesPerCluster:  [4, 11],  // [min,max] individuals per cluster
    rocksPerChunk:    [8, 18],  // collidable rocks (independent scatter) — 12–26 × 0.7, owner 2026-09-24 ("medium and large −30 %")
    smallRocksPerChunk:[60, 110],// decorative <0.1 m rocks (non-collidable; also shoulder + road) — owner 2026-09-23: "a ton more"; the zone pass below adds the localised ones
    streamRockBoost:  3,        // FEAT-25: extra channel-rock attempts = base small-rock attempts × this
                                //   (denser cobble scatter in stream beds/banks; USER-OWNED density dial)
    streamMedRockBoost: 10,     // FEAT-25 rework: MEDIUM ('rock' class) stones in the channel bed —
                                //   in-bed density ≈ this × ambient rock density (USER-OWNED, "10x med stones")
    bushesPerChunk:   [6, 14],
    boulderChance:    0.08,     // per chunk, a rare large buried boulder (0.04 → 0.08, owner 2026-09-24 "double boulders")
    logsPerChunk:     [0, 2],   // FEAT-15: fallen trunks (hard obstacle) — sparse forest debris
    logSlopeMax:      0.45,     // FEAT-15: no logs on near-cliffs (they'd visibly float/slide)
    logPitchMax:      0.55,     // rad — reject a log whose two ends span a step this steep (float guard)
    roadExclusion:    9,        // m — reject TREES + collidable rocks within this of the road
    groundSink:       0.3,      // m — sink trees + bushes so the base digs in (kills slope-float)
    treeTiltMax:      0.18,     // rad (~10°) — per-tree random lean from vertical (pivots at base)
    rockTiltMax:      1.0,      // rad (~57°) — rocks tumble (random lean about a random axis; boulders stay yaw-only, owner 2026-09-28)
    // Small-rock road bands: dense on the shoulder, SPARSE on the road surface itself.
    roadHalfWidth:    5,        // ~ RANGER_PARAMS.roadHalfWidth (road surface half-width)
    smallRockOnRoadKeep:0.07,   // fraction of small rocks kept ON the road surface (sparse)

    // Species selection by terrain (slope = 1 - normal.y; 0 flat, →1 vertical):
    slopeMeadowMax:   0.16,     // below → meadow (aspen favoured)
    slopeSteepMin:    0.34,     // above → steep/exposed (pine favoured); between → biome-noise mix
    // Above this, no trees at all. Was 0.75, which NEVER FIRED: this terrain tops out at slope
    // 0.593 (measured, 160k samples on seed 6 — p50 0.094, p90 0.248, max 0.593), so the world had
    // no bare ground anywhere and the 2D map had nothing honest to print white. Mirrors
    // BIOME_PARAMS.rockSlopeMin — the same rule per TREE that the ROCK biome applies per CLUSTER.
    // Keep the two equal.
    slopeRejectMax:   0.38,
    biomeNoiseFreq:   0.012,    // low-freq world-space mask for meadow/exposed blending
    // Aspen gets MORE common with elevation; pine ~uniform. Weight = 1 + k*(elev/elevRef).
    aspenElevBias:    0.6,
    elevRef:          120,      // m — elevation normaliser for the bias term

    // ── Zone rocks (owner 2026-09-23): rocks that FOLLOW THE GROUND TEXTURE. The base rock
    // passes above are chunk-uniform; this additive pass stands small / medium / large rocks
    // where the ground reads rock (the fragment texture), fewer on dirt, a trace on grass, and
    // LOCALISED — its own patchiness field (~30 m) so a rocky slope has rubble fans and bare
    // stretches, not a stipple. Not tier-scaled: rocks are what tie the props to the bump map,
    // and the owner wants them on every quality setting. Small + medium are non-collidable
    // (medium is ground-clearance scale, half-buried); large are the collidable `rock` class.
    zoneRocks: {
      attempts:   900,          // candidates per 64 m chunk (kept ≈ zone weight × patchiness)
      patchFreq:  0.033,        // 1/m — patchiness field (~30 m)
      patchMin:   0.42,         // field value below which the ground stays bare of zone rocks
      onRock:     1.0,          // keep weight where the ground is rock
      onDirt:     0.35,         //   … dirt (owner: "more … but not as much as the rocky terrain")
      onGrass:    0.06,         //   … grass
      mix:        [0.58, 0.224, 0.07],  // share small / medium / large of the attempts (need not sum to 1 — the rest are skipped); med+large × 0.7, owner 2026-09-24
    },

    // ── FEAT-85: roadside cover — where grass tufts and brush stand ───────────────────────
    // Two sources, both only where the ground reads green (terrain.groundAt / vegBlendOf — the same rule
    // the terrain paints green with, so the cover never stands on brown or grey ground):
    //  • THE WALL: road maintenance beats the brush back from the pavement edge, so it stands as
    //    a band whose inner face wanders 1–4 m off the edge along the road (a noise field over the
    //    run's arc-length, per side) — never a straight hedge. Inside the band the placement is
    //    dense; behind it the backcountry rule takes over. A second, slower noise field decides
    //    whether a stretch is a grassy verge or a woody hedge.
    //  • THE BACKCOUNTRY: a sparse general scatter gated by ITS OWN patchiness field (~40 m
    //    wavelength) so open ground has bare stretches and thick stretches, not a uniform stipple.
    // Randomness is keyed by world POSITION (not the chunk rng), so a chunk's cover is the same
    // whichever neighbours were streamed when it was scattered.
    cover: {
      enabled:          true,     // tier-written: Low turns it off (new chunks skip the pass)
      density:          1.0,      // tier-written: × on the BACKCOUNTRY attempts (Normal 1, High/Ultra more; the wall is a road feature and does not scale)
      farLod:           true,     // chunks in the 'far' prop ring stand the cheap Lo clumps (3–4 tris) in place of the full ones (see prop-system _placeChunk)
      sink:             0.05,     // m — clump origin below ground so the roots dig in on slopes
      slopeMax:         0.30,     // reject above this slope (1 - normal.y) regardless of greenness
      // the wall — owner 2026-09-23: 80 % less than the 4-row / 0.9 band, and SPORADIC: a third
      // noise field along the road (wallPatchFreq) gates whole stretches to bare, so what is left
      // stands in clumps with gaps rather than as a thinner hedge.
      wallStep:         0.9,      // m — candidate spacing along the road, per side
      wallRows:         2,        // candidates per step per side, spread across wallDepth
      wallBeatBack:     [1, 4],   // m — inner face distance from the PAVEMENT EDGE (halfWidth), wanders by noise
      wallNoiseFreq:    0.045,    // 1/m — beat-back wander (~22 m wavelength along the road)
      wallDepth:        2.2,      // m — thickness of the dense band behind the inner face
      wallDensity:      0.55,     // probability a candidate stands, inside a populated stretch
      wallPatchFreq:    0.06,     // 1/m — populated-vs-bare stretches along the road (~17 m)
      wallPatchMin:     0.45,     // field value below which the stretch is bare (mean gate ≈ 0.4)
      wallTallFrac:     0.175,    // mean share of TALL kinds (rye/sage) in the wall; the hedge/verge field scales it 0.4×–1.6×
      wallBrushNoiseFreq: 0.018,  // 1/m — hedge-vs-verge wander (~55 m)
      sageFrac:         0.5,      // of the tall kinds, the sagebrush share (rest wild rye)
      // the backcountry
      backAttempts:     1100,     // candidates per 64 m chunk at density 1 (kept ≈ green × patchiness) — owner 2026-09-23: "blanket everything"; scaled by `density` per tier
      backNoiseFreq:    0.025,    // 1/m — patchiness field (~40 m)
      backNoiseMin:     0.38,     // field value below which the ground stays bare
      backTallFrac:     0.1,      // share of tall kinds away from the road
      // the riverbanks (owner 2026-09-25): the stream BANK band (water.streamChannelAt inBank —
      // the ramp between the channel and grade) grows regardless of the green rule, rye-heavy
      // (it wants the moisture), sage rare. Candidates in the channel itself never stand.
      bankAttempts:     360,      // candidates per chunk (kept only where they land in a bank)
      bankDensity:      0.85,     // probability a bank candidate stands
      bankTallFrac:     0.45,     // share of tall kinds on the bank
      bankSageFrac:     0.15,     // of the tall kinds, sage (rest wild rye)
      // Off green ground: small grass + sage continue onto DIRT at this fraction of their green
      // density (owner: "the grass can and should continue on to dirt slopes, sparser"); rye is
      // green-only (it wants moisture). Nothing stands on rock (steep / above the treeline).
      dirtFrac:         0.5,      // 0.3 → 0.5, owner 2026-09-23: more of the ricegrass on the dirt slopes
      // rendering (live, no rebuild) — tier-written like lod.ring3d
      fadeStart:        60,       // m — clumps start shrinking toward the ground
      fadeEnd:          95,       // m — gone (zero fragments; instances stay resident)
      windStrength:     1.0,      // [-] vertex sway amplitude (0 = still)
    },
  },

  // ── Aspen: tall white trunk (kinked tapered tube) + rounded blob canopy ─────────
  aspen: {
    variants: 4,
    trunk:  { segCount: [3, 7], segLen: [1.6, 2.6], baseRadius: [0.16, 0.26],
              taperPow: 1.4, topFrac: 0.32, bend: 0.10, sides: 6 },
    canopy: { radius: [1.8, 2.8], axisScale: [0.85, 1.7, 0.85], irregularity: 0.26,
              noiseFreq: 1.6, subdiv: 1 },
    // white aspen bark with black flecks (fleck = per-face dark patches baked at palette time)
    barkColor: 0xeae7df, barkFleck: 0x242424, fleckChance: 0.22,
    canopyColor: 0x86b84a,
    instScale: [0.8, 1.35],
  },

  // ── Pine: frustum trunk + stacked kinked cone-skirt canopy ──────────────────────
  pine: {
    variants: 4,
    trunk:  { segCount: [3, 5], segLen: [2.4, 4.0], baseRadius: [0.24, 0.54],
              taperPow: 1.6, topFrac: 0.18, bend: 0.08, sides: 6 },
    canopy: { coneCount: [3, 5], baseRadius: [1.5, 2.3], coneHeight: [2.4, 3.8],
              overlap: 0.45, bend: 0.06, sides: 7,
              stretch: 1.5,    // vertical-only stretch of the cone stack (taller, same width)
              dropFrac: 0.6 }, // canopy base sits this fraction of a cone below the trunk tip
    barkColor: 0x5a3d22, canopyColor: 0x3b6840,
    instScale: [0.9, 1.6],
  },

  // ── Rocks: amorphous low-poly blobs, 20–90% buried, slope-weighted ──────────────
  rock: {
    variants: 5,
    blob:  { radius: [0.5, 2.0], axisScale: [1.25, 0.7, 1.0], irregularity: 0.5,
             noiseFreq: 2.2, subdiv: 1 },
    color: 0xb7b6b4, colorJitter: 0.10,
    buryFrac: [0.2, 0.9],          // 20–90% below ground (placement sinks the blob)
    slopeBias: 1.8,                // density multiplier ramps with slope (large rocks on steeps)
    instScale: [0.7, 1.6],
  },

  // Buried boulder: the large tail of the rock continuum (up to ~20 m) — rare.
  boulder: {
    variants: 3,
    blob:  { radius: [6, 20], axisScale: [1.2, 0.65, 1.05], irregularity: 0.42,
             noiseFreq: 1.3, subdiv: 2 },
    color: 0xb7b6b4, colorJitter: 0.10,   // shares the rock palette (boulders = large rock tail)
    buryFrac: [0.45, 0.8],
    instScale: [0.7, 1.2],
  },

  // Medium rocks (owner 2026-09-23): the missing size between the pebbles and the collidable
  // rocks, 0.16–0.36 m drawn radius, 30–60 % buried, so what stands proud is ground-clearance
  // scale. NON-collidable: a collidable rock is an engine body per instance, and the zone pass
  // stands hundreds of these per rocky chunk (the BUG-60 broad-phase churn is the ceiling).
  medRock: {
    variants: 4,
    blob:  { radius: [0.16, 0.36], axisScale: [1.25, 0.7, 1.0], irregularity: 0.5,
             noiseFreq: 2.4, subdiv: 0 },
    color: 0xa3a09b, colorJitter: 0.12,
    buryFrac: [0.3, 0.6],
    instScale: [0.8, 1.35],
  },

  // Small decorative rocks (<0.1 m) — NON-collidable (06b: drive straight over).
  smallRock: {
    variants: 3,
    blob:  { radius: [0.06, 0.135], axisScale: [1.25, 0.7, 1.0], irregularity: 0.55,
             noiseFreq: 2.6, subdiv: 0 },
    color: 0x8a8782, colorJitter: 0.12,
    buryFrac: [0.1, 0.4],
    instScale: [0.8, 1.4],
  },

  // ── Fallen logs (FEAT-15): downed trunks lying on the terrain — HARD drivable obstacle ──
  // One FIXED nominal length across variants so the scatter can ground both ends and bake exact
  // collision endpoints without reproducing the palette rng — per-variant variety comes from
  // kink/radius, per-instance from scale (small climbable saplings → genuinely blocking trunks).
  log: {
    variants: 3,
    length: 7,               // m — nominal trunk length (pre-instance-scale); ALL variants share it
    trunk: { segCount: [4, 6], baseRadius: [0.26, 0.42],
             taperPow: 1.25, topFrac: 0.45, bend: 0.14, sides: 6 },
    barkColor: 0x6f5c46, barkFleck: 0x40362b, fleckChance: 0.30,   // weathered dead wood
    color: 0x6f5c46, colorJitter: 0.10,   // instance tint (multiplies the baked bark colours)
    instScale: [0.65, 1.5],
  },

  // ── FEAT-85: roadside cover — three Eastern Sierra natives (no collision, no shadow bake) ──
  // Small bunchgrass (Indian ricegrass): fine wiry blades + a few airy straw seed stalks. ~40 tris.
  grass: {
    variants: 4,
    blades: [12, 18], height: [0.32, 0.64], spread: [0.28, 0.4], width: 0.035,
    stalks: [2, 4],
    color: 0x5e8a3a, tipColor: 0xa8b060, stalkColor: 0xc2b07a, colorJitter: 0.14,
    instScale: [0.8, 1.3],
  },
  // Great Basin wild rye: broad long arching blue-green blades + tall straight seed spikes. ~70 tris.
  rye: {
    variants: 4,
    blades: [10, 16], height: [1.2, 1.9], spread: [0.45, 0.7], width: 0.07,
    spikes: [3, 5],
    color: 0x56755a, tipColor: 0x9dab77, spikeColor: 0xb8a56a, colorJitter: 0.12,
    instScale: [0.8, 1.25],
  },
  // Big sagebrush: gnarled arching stems with clusters of small grey-green leaf cards. ~85 tris.
  // (The physics `bush` blob stays — this is visual cover only; owner 2026-09-22.)
  sage: {
    variants: 4,
    stems: [5, 8], height: [0.8, 1.4], spread: [0.5, 0.9], leaf: 0.17,
    stemColor: 0x6b5f4e, leafColor: 0x8c9c7e, colorJitter: 0.12,
    instScale: [0.8, 1.3],
  },

  // ── Bushes: squat blobs, 0.5–1.5 m (06b: soft velocity-drag, size-proportional) ─
  bush: {
    variants: 4,
    blob:  { radius: [0.5, 1.5], axisScale: [1.1, 0.78, 1.1], irregularity: 0.34,
             noiseFreq: 2.0, subdiv: 1 },
    color: 0x4f8a3a, colorJitter: 0.12,
    instScale: [0.8, 1.3],
  },

  // ── Collision (FEAT-06b) — analytic shapes the truck contact query tests against ────────
  // Read LIVE at query time (PropSystem.queryProps applies these to the baked shape dims), so the
  // sliders tune without a re-stream. Trees = capsule between baked (tilt-inclusive) trunk endpoints;
  // fallen logs = the same capsule test; rocks = sphere; boulders = exact triangle mesh (BUG-22c);
  // bushes = soft drag (no hard contact); medium/small rocks and roadside cover = none.
  collision: {
    trunkRadiusScale: 1.15,   // capsule radius = trunkRadius × instScale × this (bark + slop)
    rockRadiusScale:  0.92,   // sphere radius  = blob boundingSphere × instScale × this (lumpy, inset)
    bush: { k: 1350, fMax: 12000 }, // soft drag: F = clamp(k · |v| · effRadius, 0, fMax) N, opposing v
  },

  // ── PERF-07 baked prop shadows — USER-OWNED ───────────────────────────────────────────────
  // Every scattered prop would otherwise be a realtime shadow CASTER: each tree/rock/log re-renders
  // into the sun's directional shadow map every frame (~1.86 ms/frame on an M4 —
  // test/perf-prop-shadows.mjs), and since the truck is always moving the PERF-16 skip never fires.
  // A prop's shadow is a fixed world shape for a given sun angle → bake it per terrain chunk into a
  // world-space atlas (prop-shadow-bake.js), sampled by the terrain shader, and re-bake it as the
  // day/night key light swings (sunRebake* below). castRealtime=false
  // (default) drops props from the pass and shows the bake; true restores per-frame realtime casting.
  // The GUI checkbox 'Realtime prop shadows' A/Bs the two modes live.
  shadows: {
    castRealtime: false,   // false = baked atlas (default, the perf win); true = realtime per-frame casting
    strength:     0.34,    // baked shadow darkness on the ground (0 invisible → 1 fully black)
    // Atlas tile resolution in texels per 64 m chunk (0 = baked shadows OFF). 256 → 0.25 m/texel.
    // Written by applyQuality from the tier's shadowTilePx (Low 0 / Normal 256 / High 384 / Ultra
    // 512, i.e. 1.5×/2× density) and overridable live by the 'Baked shadow res' slider; a change
    // reallocates the atlas (ATLAS_N² tiles) and re-bakes every live chunk, so it is not free.
    tilePx:       256,

    // QUAL-18: baked shadows dissolve with view distance so the ring edge softens into fog instead
    // of ending on a line. Sized to cover at least the realtime shadow map's reach (shadowExtent
    // 160–220 m) so the baked mode never shows LESS shadow than realtime did at the same vantage.
    fadeStart:    240,     // view-distance (m) where the dissolve begins
    fadeEnd:      380,     // fully faded

    // ── Day/night re-baking ──────────────────────────────────────────────────────────────────
    // The bake projects each caster along the key light, so a moving sun makes every tile stale.
    // A roll re-queues the live chunks nearest-first and the bake slicer spreads them over the
    // following frames (MAX_BAKES_PER_CALL), so the atlas is never restamped in a single frame.
    //
    // sunRebakeM is measured in METRES the shadow tip of a 10 m tree would move — the shear itself
    // explodes near the horizon, so thresholding it directly would mean re-baking constantly at
    // dusk and never at noon, for no visual reason. Lower = shadows track the sun more finely and
    // roll more often; raise it if rolls ever show up in the frame budget.
    sunRebakeM:      0.6,
    // Floor on the interval between rolls. The real limiter is that a roll cannot start while the
    // previous one is still draining, but a fast debug cycle (dayLengthSec 5) would otherwise keep
    // the baker saturated back-to-back; this bounds the duty cycle regardless of clock speed.
    sunRebakeMinSec: 2.0,
  },

  // ── PERF-21 billboard impostor LOD ─────────────────────────────────────────────────────────
  // Chunks farther than ring3d (Chebyshev, in 64 m chunks) from the camera's chunk render their
  // trees/boulders as single camera-facing quads (prop-impostor.js atlas) instead of 3D instances
  // (~150–200 tris each). Written by applyQuality per tier (closer takeover on lower tiers) and
  // overridable live by the '3D prop ring' slider. Baked ground shadows are unaffected.
  lod: {
    ring3d: 2,             // chunks of full-3D props around the camera; beyond → billboards
    litGain: 1.7,          // billboard sun-contrast scale in the view-relight ratio (1 = physical
                           // Lambert average; 1.7 = user-tuned 2026-07-19, punchier lit side —
                           // see prop-impostor._updateLightUniforms); GUI slider
    flatten: 0,            // sun-on gradient flatten: blend toward the tile mean as the view
                           // swings sun-ward (0 = off, 1 = featureless). User-tuned OFF 2026-07-19 —
                           // the baked facet pattern reads better than the softened one; GUI slider
  },
}
