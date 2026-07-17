/**
 * data/flora.js — Procedural prop (tree/rock/bush) parameters for RangerSim FEAT-06.
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
    rocksPerChunk:    [12, 26], // collidable rocks (independent scatter) — denser per user
    smallRocksPerChunk:[30, 60],// decorative <0.1 m rocks (non-collidable; also shoulder + road)
    streamRockBoost:  3,        // FEAT-25: extra channel-rock attempts = base small-rock attempts × this
                                //   (denser cobble scatter in stream beds/banks; USER-OWNED density dial)
    streamMedRockBoost: 10,     // FEAT-25 rework: MEDIUM ('rock' class) stones in the channel bed —
                                //   in-bed density ≈ this × ambient rock density (USER-OWNED, "10x med stones")
    bushesPerChunk:   [6, 14],
    boulderChance:    0.04,     // per chunk, a rare large buried boulder
    logsPerChunk:     [0, 2],   // FEAT-15: fallen trunks (hard obstacle) — sparse forest debris
    logSlopeMax:      0.45,     // FEAT-15: no logs on near-cliffs (they'd visibly float/slide)
    logPitchMax:      0.55,     // rad — reject a log whose two ends span a step this steep (float guard)
    roadExclusion:    9,        // m — reject TREES + collidable rocks within this of the road
    groundSink:       0.3,      // m — sink trees + bushes so the base digs in (kills slope-float)
    treeTiltMax:      0.18,     // rad (~10°) — per-tree random lean from vertical (pivots at base)
    // Small-rock road bands: dense on the shoulder, SPARSE on the road surface itself.
    roadHalfWidth:    5,        // ~ RANGER_PARAMS.roadHalfWidth (road surface half-width)
    roadShoulderOuter:8.5,      // outer edge of the shoulder band
    smallRockOnRoadKeep:0.07,   // fraction of small rocks kept ON the road surface (sparse)

    // Species selection by terrain (slope = 1 - normal.y; 0 flat, →1 vertical):
    slopeMeadowMax:   0.16,     // below → meadow (aspen favoured)
    slopeSteepMin:    0.34,     // above → steep/exposed (pine favoured); between → biome-noise mix
    slopeRejectMax:   0.75,     // above this, no trees at all (cliff)
    biomeNoiseFreq:   0.012,    // low-freq world-space mask for meadow/exposed blending
    // Aspen gets MORE common with elevation; pine ~uniform. Weight = 1 + k*(elev/elevRef).
    aspenElevBias:    0.6,
    elevRef:          120,      // m — elevation normaliser for the bias term
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
    canopyColor: 0x86b84a, tintJitter: 0.12,
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
    barkColor: 0x5a3d22, canopyColor: 0x3b6840, tintJitter: 0.10,
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

  // Small decorative rocks (<0.1 m) — NON-collidable (06b: drive straight over).
  smallRock: {
    variants: 3, collidable: false,
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

  // ── Bushes: squat blobs, 0.5–1.5 m (06b: soft velocity-drag, size-proportional) ─
  bush: {
    variants: 4,
    blob:  { radius: [0.5, 1.5], axisScale: [1.1, 0.78, 1.1], irregularity: 0.34,
             noiseFreq: 2.0, subdiv: 1 },
    color: 0x4f8a3a, colorJitter: 0.12,
    instScale: [0.8, 1.3],
  },

  // ── Collision (FEAT-06b) — analytic shapes the truck contact query tests against ────────
  // Read LIVE at query time (collider applies these to the baked shape dims), so the sliders tune
  // without a re-stream. Trees = vertical capsule (trunk only); rocks/boulders = sphere; bushes =
  // soft drag (no hard contact); small rocks = none.
  collision: {
    trunkRadiusScale: 1.15,   // capsule radius = trunkRadius × instScale × this (bark + slop)
    rockRadiusScale:  0.92,   // sphere radius  = blob boundingSphere × instScale × this (lumpy, inset)
    bush: { k: 1350, fMax: 12000 }, // soft drag: F = clamp(k · |v| · effRadius, 0, fMax) N, opposing v
  },

  // ── PERF-07 baked prop shadows — USER-OWNED ───────────────────────────────────────────────
  // Every scattered prop would otherwise be a realtime shadow CASTER: each tree/rock/log re-renders
  // into the sun's directional shadow map every frame (~1.86 ms/frame on an M4 —
  // test/perf-prop-shadows.mjs), and since the truck is always moving the PERF-16 skip never fires.
  // The sun is static, so a prop's shadow is a fixed world shape → bake it ONCE per terrain chunk
  // into a world-space atlas (prop-shadow-bake.js), sampled by the terrain shader. castRealtime=false
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
  },

  // ── PERF-21 billboard impostor LOD ─────────────────────────────────────────────────────────
  // Chunks farther than ring3d (Chebyshev, in 64 m chunks) from the camera's chunk render their
  // trees/boulders as single camera-facing quads (prop-impostor.js atlas) instead of 3D instances
  // (~150–200 tris each). Written by applyQuality per tier (closer takeover on lower tiers) and
  // overridable live by the '3D prop ring' slider. Baked ground shadows are unaffected.
  lod: {
    ring3d: 2,             // chunks of full-3D props around the camera; beyond → billboards
    litGain: 2.0,          // billboard sun-side brightening (× max(view·sunXZ, 0)); GUI slider
  },
}
