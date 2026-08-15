/**
 * src/map-cover.js — where the forest actually is, at map resolution.
 *
 * The 2D map prints green where trees stand and white where they do not, the way a USGS
 * quadrangle does. That distinction is NOT a new worldgen field: it is a read of the tree scatter
 * the world already runs (owner, 2026-08-15 — "derive the white areas off of existing prop
 * coverage"). Nothing here decides where trees go; prop-scatter.js does, and this replays it.
 *
 * ── Why a replay and not the predicates ──────────────────────────────────────────────────────
 * The obvious cheap read is "evaluate the scatter's rejection tests on a grid" — slope >
 * slopeRejectMax, in a pond, in a stream channel. That produces an almost uniformly green sheet,
 * because slopeRejectMax is 0.75: a cliff. The variation you actually see standing in the world
 * comes from CLUSTERING — clustersPerChunk (4) centres per 64 m chunk, each dropping
 * treesPerCluster (4–11) trees inside clusterRadius (18 m). Four 18 m discs cover ~4070 m² of a
 * 4096 m² chunk, so with overlap they leave real gaps. Those gaps are the open ground, and only a
 * replay of the cluster placement can find them.
 *
 * ── What is approximated (this is the "cheap proxy", not the exact scatter) ───────────────────
 * The rng stream is replayed EXACTLY — same mulberry32(seedFor(seed,'flora',cx,cz)), same draw
 * order — so cluster centres and tree offsets are the real ones. What is swapped out is the
 * expensive sampler chain:
 *
 *   prop-scatter                      map-cover
 *   ────────────────────────────────  ──────────────────────────────────────────────────
 *   terrain.analyticNormal (slope)    slope from the coarse height field's gradient
 *   terrain.analyticHeight            road._coarseH × terrainAmplitude
 *   roadBlocked (9 m of centreline)   dropped — see ROAD EXCLUSION below
 *
 * The slope swap is sound by measurement, not by hope: fineAmplitude is 0.5 m at a 20 m
 * wavelength against coarseAmplitude 150 m, so the detail octave contributes ~2.5% slope. Against
 * a 0.75 reject threshold that is far inside the noise floor. The coarse field is also the one the
 * map's contours are already drawn from, so the green agrees with the lines it sits under.
 *
 * ROAD EXCLUSION is dropped on purpose: it is a 9 m corridor, and the map paints a 2.2 px black
 * road over that exact corridor afterwards. Reinstating it would cost a centreline distance query
 * per candidate — the single most expensive sampler in the set — to reveal ground that is about to
 * be covered in ink.
 *
 * SCATTER SYNC: treeClusterPass's rng draw order and reject tests are mirrored below. An edit to
 * the cluster loop in prop-scatter.js must be reflected here in the same commit, or the map starts
 * describing a forest the world does not have. test/map-cover.mjs is the gate that proves the
 * replay still tracks the real scatter.
 */

import { mulberry32, seedFor } from './seed.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { biomeAt, BIOME } from './biome.js'

// Cover raster cell, metres. Sub-chunk (64 / 16 = 4×4 cells per chunk) so a cluster's 18 m disc
// spans a couple of cells and its edge can land somewhere other than a chunk boundary — at full
// chunk resolution the sheet reads as 64 m squares no matter how hard it is blurred.
export const COVER_CELL = 16
const CELLS_PER_CHUNK = FLORA_PARAMS.chunkSize / COVER_CELL   // 4

// Tree counts per cell that read as each band, applied to the NEIGHBOURHOOD-AVERAGED count, not to
// a bare cell — see the area-average note in map2d's _coverRaster. Calibrated against the measured
// distribution over 40×40 chunks of seed 6 (mean 1.45 trees/cell, 41% of bare cells empty; after a
// one-cell area average, p10 0.67 / p50 1.44 / p90 2.33).
//
// These cuts are therefore ~p8 and ~p65 of that distribution, which is what makes the sheet read
// predominantly green with open ground as the exception — the proportion a forest quadrangle has.
// Banding the BARE counts instead put 41% of the map under white, which is not a map of this world.
// The ONE count threshold left: at or above it a forest cell prints tree glyphs, below it the same
// green without them. There is deliberately no second cut turning low counts back to white — white
// means "not the forest biome", full stop (owner, 2026-08-15: green regions solid, white regions
// solid). A cut here instead sprayed white specks through the forest wherever cluster placement
// happened to leave a Poisson gap, which is a fact about a random number generator and not about
// any ground the player can walk on.
// Paired with COVER_COUNT_BLUR — read them together, since coverage depends on both. At blur r=4:
// 1.0 → 87% of forest, 1.4 → 42%, 1.8 → 2%. At 1.0 the glyphs covered 55% of the entire sheet and
// read as "every green cell has a tree on it", which erases the med/high distinction they exist to
// carry. 1.4 makes HIGH a genuine subset.
//
// ⚠ Be aware of what this threshold is cutting: see the honesty note on COVER_COUNT_BLUR in
// map2d.js. Tree density in this world has no spatial structure, so no value here produces truly
// coherent stands — only more or less of a smoothed random field.
export const DENSE_MIN = 1.4

/**
 * Slope in prop-scatter's units, from a height field's gradient.
 *
 * The scatter reads `1 - normal.y`. For a heightfield with gradient g, normal.y = 1/√(1+|g|²), so
 * this is the exact same quantity — NOT an eyeballed remap. That matters because the thresholds
 * (slopeMeadowMax 0.16, slopeSteepMin 0.34, slopeRejectMax 0.75) transfer unchanged.
 */
export function slopeFromGradient (dx, dz) {
  return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz)
}

/**
 * Replay one 64 m chunk's tree pass and bin the survivors into a CELLS_PER_CHUNK² count raster.
 *
 * Mirrors treeClusterPass exactly in rng draw ORDER, which is the part that has to hold: the
 * cluster loop draws ccx, ccz, then the species mix, then n, then per tree an angle and a radius —
 * and only a PLACED tree draws the five further values. Reject early and the stream shifts, so the
 * rejects are replayed too, not skipped.
 *
 * @param {number} cx,cz        chunk coords (world = cx * chunkSize)
 * @param {number} worldSeed
 * @param {{slopeAt:(x,z)=>number, heightAt:(x,z)=>number, rejectAt:(x,z)=>boolean}} s
 *        rejectAt covers the water tests (pond + stream channel) as one call, since the map
 *        resolves both from the same bbox-fetched lists. heightAt feeds the biome relief ring only
 *        — a placed tree's own y is of no interest to a map.
 * @returns {Float32Array} tree counts, row-major, CELLS_PER_CHUNK per side
 */
export function chunkCover (cx, cz, worldSeed, s, P = FLORA_PARAMS) {
  const S = P.scatter
  const size = P.chunkSize
  const ox = cx * size, oz = cz * size
  const out = new Float32Array(CELLS_PER_CHUNK * CELLS_PER_CHUNK)
  const rng = mulberry32(seedFor(worldSeed, P.worldSeedTag, cx, cz))

  for (let ci = 0; ci < S.clustersPerChunk; ci++) {
    const ccx = ox + rng() * size, ccz = oz + rng() * size
    // Species selection: one draw. The scatter samples slope, elevation and biomeNoise to build
    // pAspen, but all three only decide aspen-vs-pine and none of them draw from the stream — a
    // cluster yields the same NUMBER of trees either way. So the samplers are skipped and the draw
    // is not; skipping the draw would desynchronise every cluster after this one.
    rng()

    // The ground this cluster stands on. MEADOW and ROCK clear it entirely — this is where the
    // map's white comes from, and it is the SAME call the scatter makes, not a parallel rule.
    const ground = biomeAt(ccx, ccz, worldSeed, s)

    const n = Math.round(S.treesPerCluster[0] +
                        (S.treesPerCluster[1] - S.treesPerCluster[0]) * rng())
    for (let k = 0; k < n; k++) {
      const ang = rng() * Math.PI * 2
      const rad = Math.sqrt(rng()) * S.clusterRadius
      const tx = ccx + Math.cos(ang) * rad, tz = ccz + Math.sin(ang) * rad

      // ── placeTree's reject chain, in order. Each `continue` leaves the stream untouched,
      //    exactly as the early `return`s in prop-scatter do.
      if (ground !== BIOME.FOREST) continue              // meadow / bare rock
      if (s.rejectAt(tx, tz)) continue                  // pond water + stream channel
      if (s.slopeAt(tx, tz) > S.slopeRejectMax) continue // cliff
      // Placed: consume the five per-tree draws (brightness, variant, scale, rotY, tilt, tiltAz).
      rng(); rng(); rng(); rng(); rng(); rng()

      // Bin into the chunk's cell raster. Trees can land OUTSIDE the chunk (a cluster centre near
      // an edge throws up to clusterRadius past it) — those are dropped here and re-found when the
      // neighbouring chunk replays its own clusters, so no tree is double-counted and none of the
      // clustering that straddles a boundary is lost.
      const li = Math.floor((tx - ox) / COVER_CELL)
      const lj = Math.floor((tz - oz) / COVER_CELL)
      if (li < 0 || lj < 0 || li >= CELLS_PER_CHUNK || lj >= CELLS_PER_CHUNK) continue
      out[lj * CELLS_PER_CHUNK + li] += 1
    }
  }
  return out
}

export { CELLS_PER_CHUNK }
