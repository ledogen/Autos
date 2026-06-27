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
    clustersPerChunk: 3,        // tree cluster centres seeded per chunk (grouping)
    clusterRadius:    18,       // m — individuals scatter within this of a cluster centre
    treesPerCluster:  [4, 11],  // [min,max] individuals per cluster
    rocksPerChunk:    [3, 8],   // collidable rocks (independent scatter)
    smallRocksPerChunk:[18, 38],// decorative <0.1 m rocks (non-collidable)
    bushesPerChunk:   [6, 14],
    boulderChance:    0.04,     // per chunk, a rare large buried boulder
    roadExclusion:    9,        // m — reject props within this of the road footprint

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
    trunk:  { segCount: [3, 7], segLen: [1.6, 2.6], baseRadius: [0.10, 0.18],
              taperPow: 1.4, topFrac: 0.30, bend: 0.10, sides: 6 },
    canopy: { radius: [1.8, 2.8], axisScale: [0.85, 1.7, 0.85], irregularity: 0.26,
              noiseFreq: 1.6, subdiv: 1 },
    barkColor: 0xdfe3e0, canopyColor: 0x55803a, tintJitter: 0.12,
    instScale: [0.8, 1.35],
  },

  // ── Pine: frustum trunk + stacked kinked cone-skirt canopy ──────────────────────
  pine: {
    variants: 4,
    trunk:  { segCount: [3, 5], segLen: [1.2, 2.0], baseRadius: [0.15, 0.26],
              taperPow: 1.6, topFrac: 0.16, bend: 0.08, sides: 6 },
    canopy: { coneCount: [3, 5], baseRadius: [1.5, 2.3], coneHeight: [1.2, 1.9],
              overlap: 0.45, bend: 0.06, sides: 7 },
    barkColor: 0x5a3d22, canopyColor: 0x2f5d34, tintJitter: 0.10,
    instScale: [0.9, 1.6],
  },

  // ── Rocks: amorphous low-poly blobs, 20–90% buried, slope-weighted ──────────────
  rock: {
    variants: 5,
    blob:  { radius: [0.5, 2.0], axisScale: [1.25, 0.7, 1.0], irregularity: 0.5,
             noiseFreq: 2.2, subdiv: 1 },
    color: 0x8a8782, colorJitter: 0.10,
    buryFrac: [0.2, 0.9],          // 20–90% below ground (placement sinks the blob)
    slopeBias: 1.8,                // density multiplier ramps with slope (large rocks on steeps)
    instScale: [0.7, 1.6],
  },

  // Buried boulder: the large tail of the rock continuum (up to ~20 m) — rare.
  boulder: {
    variants: 3,
    blob:  { radius: [6, 20], axisScale: [1.2, 0.65, 1.05], irregularity: 0.42,
             noiseFreq: 1.3, subdiv: 2 },
    color: 0x807d78, colorJitter: 0.08,
    buryFrac: [0.45, 0.8],
    instScale: [0.7, 1.2],
  },

  // Small decorative rocks (<0.1 m) — NON-collidable (06b: drive straight over).
  smallRock: {
    variants: 3, collidable: false,
    blob:  { radius: [0.04, 0.09], axisScale: [1.25, 0.7, 1.0], irregularity: 0.55,
             noiseFreq: 2.6, subdiv: 0 },
    color: 0x8a8782, colorJitter: 0.12,
    buryFrac: [0.1, 0.4],
    instScale: [0.8, 1.4],
  },

  // ── Bushes: squat blobs, 0.5–1.5 m (06b: soft velocity-drag, size-proportional) ─
  bush: {
    variants: 4,
    blob:  { radius: [0.5, 1.5], axisScale: [1.1, 0.78, 1.1], irregularity: 0.34,
             noiseFreq: 2.0, subdiv: 1 },
    color: 0x3d6b2e, colorJitter: 0.12,
    instScale: [0.8, 1.3],
  },
}
