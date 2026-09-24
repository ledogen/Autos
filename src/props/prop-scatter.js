/**
 * src/props/prop-scatter.js — Deterministic per-chunk prop scatter for FEAT-06.
 *
 * Pure-ish: returns a flat list of placement records for one chunk. All randomness derives from
 * seedFor(worldSeed, 'flora', cx, cz) → mulberry32, so a chunk re-streamed at any time produces
 * IDENTICAL placements (window-invariant, matching the terrain/road D-16 discipline). No THREE,
 * no scene, no imports from road/terrain — terrain height/normal and road proximity are injected
 * as `samplers` so this stays decoupled while the road/terrain bugfix work proceeds in parallel.
 *
 * samplers: {
 *   heightAt(x,z)   -> number              // terrainSystem.analyticHeight
 *   normalAt(x,z)   -> {x,y,z}             // terrainSystem.analyticNormal (slope = 1 - .y)
 *   roadBlocked(x,z)-> boolean             // true if within FLORA_PARAMS.scatter.roadExclusion of road
 *   roadClear(x,z,keepOut) -> boolean      // BUG-23: true if NO road centreline within keepOut metres
 *                                          //   (radius-aware keep-out; legacy sets may omit it)
 *   roadWalk(cx,cz,stepM) -> [{runKey, samples:[{x,z,tx,tz,arcS,bore}]}]   // FEAT-85 (optional):
 *                                          //   road slices around the chunk, sampled along the arc
 *   groundAt(x,z)  -> {green, rock}        // FEAT-85 (optional): terrain.groundAt — the cover stands
 *                                          //   where the ground reads green (sparser on dirt, never rock)
 *   padBlocked(x,z,keepOut) -> boolean     // FEAT-85 (optional): on a junction / lay-by pad
 * }
 *
 * Placement record: { cat, variant, x, y, z, scale, rotY, tint:[r,g,b] }
 *   y = world Y of the instance ORIGIN (trees: ground; blobs: sunk by buryFrac).
 */

import { mulberry32, seedFor, djb2 } from '../seed.js'
import { FLORA_PARAMS } from '../../data/flora.js'
import { biomeAt, BIOME } from '../biome.js'

const lerp = (a, b, t) => a + (b - a) * t
const irange = (rng, [lo, hi]) => Math.round(lo + (hi - lo) * rng())
const frange = (rng, [lo, hi]) => lo + (hi - lo) * rng()

// Cheap deterministic low-freq world-space biome mask in [0,1] (independent of chunk window).
function biomeNoise(x, z, freq, seed) {
  const s = Math.sin(x * freq + seed * 0.001) + Math.cos(z * freq * 1.3 + seed * 0.002)
  return (s * 0.5 + 1) * 0.5   // ~[0,1]
}

// Sampler-derived predicates, defined once at module scope so the tree pass (extracted below for
// FEAT-45) and the rock/bush/log passes share ONE definition instead of two drifting copies.
const inPondWaterAt = (samplers, x, z) => { const w = samplers.waterAt && samplers.waterAt(x, z); return !!(w && w.inWater) }
const inStreamChannelAt = (samplers, x, z) => { const s = samplers.streamAt && samplers.streamAt(x, z); return !!(s && s.inChannel) }
const slopeFrom = (samplers, x, z) => 1 - Math.max(0, Math.min(1, samplers.normalAt(x, z).y))

function tintFor(rng, hex, jitter) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255
  const j = () => 1 + (rng() * 2 - 1) * jitter
  return [Math.min(1, r * j()), Math.min(1, g * j()), Math.min(1, b * j())]
}

/**
 * The TREE-CLUSTER pass — the first pass of a chunk's scatter, extracted so it has exactly one
 * definition and two callers: scatterChunkGen (which runs it as the head of the full scatter) and
 * scatterTreePositions below (FEAT-45's camp shade score, which wants the trees and nothing else).
 *
 * It draws from the CALLER's rng so the stream position after it is unchanged — the extraction is
 * a pure code move, and test/props.mjs's determinism/window-invariance gate is what proves it.
 *
 * @param {Function} rng   the chunk's mulberry32 stream, positioned at the start of the chunk
 * @returns {Array} tree placement records (generator return value; `yield*` it)
 */
export function* treeClusterPass (rng, ox, oz, worldSeed, samplers, P = FLORA_PARAMS) {
  const S = P.scatter
  const size = P.chunkSize
  const { heightAt, roadBlocked } = samplers
  const out = []
  const slopeAt = (x, z) => slopeFrom(samplers, x, z)

  const placeTree = (cat, x, z, ground) => {
    // Biome gate. Evaluated once per CLUSTER and passed down (see the cluster loop) rather than
    // per tree: it costs a slope sample plus a five-point relief ring, which is far too much to pay
    // 44 times a chunk, and a meadow that only half-cleared its own cluster would read as a thinned
    // patch rather than as open ground. Rejects BEFORE any rng draw, like roadBlocked.
    if (ground !== BIOME.FOREST) return
    if (roadBlocked(x, z)) return
    if (inPondWaterAt(samplers, x, z)) return       // FEAT-17: no trees standing in the pond
    if (inStreamChannelAt(samplers, x, z)) return   // FEAT-25: no trees standing in the stream channel
    const slope = slopeAt(x, z)
    if (slope > S.slopeRejectMax) return
    const cfg = P[cat]
    // Uniform brightness jitter (NO hue shift) — instanceColor multiplies the WHOLE tree, so a
    // coloured tint would bleed the canopy hue onto the trunk (was greening the white aspen bark).
    const b = 0.92 + rng() * 0.16
    out.push({
      cat, variant: (rng() * cfg.variants) | 0, x, z,
      y: heightAt(x, z) - S.groundSink,    // sink so the base digs in (kills slope-float)
      scale: frange(rng, cfg.instScale), rotY: rng() * Math.PI * 2,
      // per-tree lean from vertical (pivots at the trunk base = geometry origin) — natural variation
      tilt: rng() * S.treeTiltMax, tiltAz: rng() * Math.PI * 2,
      tint: [b, b, b],
    })
  }

  const nClusters = S.clustersPerChunk
  for (let ci = 0; ci < nClusters; ci++) {
    const ccx = ox + rng() * size, ccz = oz + rng() * size
    const slope = slopeAt(ccx, ccz)
    const elev = heightAt(ccx, ccz)
    const biome = biomeNoise(ccx, ccz, S.biomeNoiseFreq, worldSeed)
    // Which ground this cluster is standing on. FOREST places, MEADOW and ROCK clear it entirely —
    // this is where the world's openings come from. Note this is a different thing from `biome`
    // above, which is only the species mask (aspen vs pine) and has always been named that.
    const ground = biomeAt(ccx, ccz, worldSeed, { heightAt, slopeAt })

    // species probability: aspen favoured in meadows (low slope) + at elevation; pine on steeps.
    let pAspen
    if (slope <= S.slopeMeadowMax)      pAspen = 0.85
    else if (slope >= S.slopeSteepMin)  pAspen = 0.15
    else                                pAspen = lerp(0.85, 0.15,
                                            (slope - S.slopeMeadowMax) / (S.slopeSteepMin - S.slopeMeadowMax))
    pAspen *= 1 + S.aspenElevBias * (elev / S.elevRef)   // aspen ↑ with elevation
    pAspen = Math.max(0.05, Math.min(0.95, pAspen * (0.6 + 0.8 * biome)))
    const cat = rng() < pAspen ? 'aspen' : 'pine'

    const n = irange(rng, S.treesPerCluster)
    for (let k = 0; k < n; k++) {
      // jittered offset within cluster radius (sqrt for area-uniform)
      const ang = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * S.clusterRadius
      placeTree(cat, ccx + Math.cos(ang) * rad, ccz + Math.sin(ang) * rad, ground)
      yield   // PERF-14: slice point — EVERY candidate (a single sampler chain can run ms-scale)
    }
  }
  return out
}

/**
 * FEAT-45: the trees of one chunk, and nothing else — the deterministic read-only source the camp
 * SHADE score counts. Deliberately NOT a query against the live PropSystem: the streamer is a
 * window artifact (chunks come and go with the camera) and a score that changed with what happened
 * to be resident would not be a property of the SITE. This replays the chunk's own first pass, so
 * the trees counted are exactly the trees standing there.
 *
 * Cost: clustersPerChunk × treesPerCluster candidates (≤ ~44), each a slope + road + height sample.
 * Callers are expected to cache per chunk — see CampSystem's tree memo.
 */
export function scatterTreePositions (cx, cz, worldSeed, samplers, params = FLORA_PARAMS) {
  const rng = mulberry32(seedFor(worldSeed, params.worldSeedTag, cx, cz))
  const g = treeClusterPass(rng, cx * params.chunkSize, cz * params.chunkSize, worldSeed, samplers, params)
  let r
  do { r = g.next() } while (!r.done)
  return r.value
}

/**
 * Scatter one chunk — synchronous wrapper over the generator below (identical output).
 * @param {number} cx integer chunk X
 * @param {number} cz integer chunk Z
 * @param {number} worldSeed
 * @param {object} samplers  { heightAt, normalAt, roadBlocked }
 * @param {object} [params=FLORA_PARAMS]
 * @returns {Array} placement records
 */
export function scatterChunk(cx, cz, worldSeed, samplers, params = FLORA_PARAMS) {
  const g = scatterChunkGen(cx, cz, worldSeed, samplers, params)
  let r
  do { r = g.next() } while (!r.done)
  return r.value
}

/**
 * PERF-14: resumable scatter. Same draws, same order, same output as the old synchronous
 * scatterChunk — but a GENERATOR that yields every few candidates so PropSystem can time-slice
 * one chunk's scatter across frames (a whole chunk was 20–40 ms of sampler calls: the measured
 * cause of the one-hitch-per-chunk-crossing stutter). Yields carry no value; the final `return`
 * is the placement list. Determinism/window-invariance untouched: the rng streams and candidate
 * order are byte-identical to the wrapper above, only wall-clock interleaving changes.
 */
export function* scatterChunkGen(cx, cz, worldSeed, samplers, params = FLORA_PARAMS) {
  const P = params, S = P.scatter
  const rng = mulberry32(seedFor(worldSeed, P.worldSeedTag, cx, cz))
  const size = P.chunkSize
  const ox = cx * size, oz = cz * size
  const out = []
  const { heightAt, roadBlocked, roadDist, roadClear: roadClearFn } = samplers

  // BUG-23: radius-aware road keep-out. roadClear(x,z,keepOut) is true when NO road centreline lies
  // within keepOut metres. Falls back to the legacy fixed-radius roadBlocked for older fixtures that
  // predate roadClear (keepOut then ignored — they only exercise determinism, not the inflated mask).
  const roadClear = roadClearFn || ((x, z) => !roadBlocked(x, z))

  // FEAT-17: optional pond sampler (waterAt(x,z) → {inWater, inSkirt}) — nothing scatters IN a pond
  // (underwater trees). The skirt stays plantable (vegetated shoreline). Absent (older fixtures /
  // gates) → no exclusion, placements byte-unchanged. Pure fn of seed/coords → window-invariant.
  const inPondWater = (x, z) => inPondWaterAt(samplers, x, z)

  // FEAT-25: optional stream-channel sampler (streamAt(x,z) → {inChannel, inBank, stream}). Trees,
  // bushes, boulders and collidable rocks are excluded from the underwater CHANNEL (broken-looking
  // submerged props); the decorative small-rock category is instead DENSIFIED there (boost pass
  // below). Absent (older fixtures / gates) → no exclusion/boost, placements byte-unchanged.
  const streamAt = samplers.streamAt || null
  const inStreamChannel = (x, z) => inStreamChannelAt(samplers, x, z)

  // Max world horizontal bounding radius of a blob category — an UPPER bound over its variants +
  // instance scale: widest drawn radius × widest ground-plane axis × the irregularity peak × max
  // scale. Used to inflate the road keep-out so no part of a placed blob overhangs the lane (BUG-23).
  const blobBoundR = (cfg) =>
    cfg.blob.radius[1] * Math.max(cfg.blob.axisScale[0], cfg.blob.axisScale[2]) *
    (1 + cfg.blob.irregularity) * cfg.instScale[1]

  const slopeAt = (x, z) => slopeFrom(samplers, x, z)

  // ── helper: place a single prop of category `cat` at (x,z) if terrain allows ──────────
  // rngArg lets the FEAT-25 channel-rock boost pass draw from its OWN seeded stream (so the extra
  // rocks never perturb the main scatter's rng draws → existing placements stay byte-identical).
  const placeBlob = (cat, x, z, buryRange, ignoreRoad = false, rngArg = rng, allowChannel = false) => {
    const cfg = P[cat]
    // BUG-23: exclude road-respecting props from the road FOOTPRINT, inflating the keep-out by the
    // prop's own bounding radius so a big rock/boulder whose CENTRE sits just off the ribbon can no
    // longer overhang (and wall off) the driveable lane. Pure fn of seed/coords (window-invariant).
    if (!ignoreRoad && !roadClear(x, z, S.roadExclusion + blobBoundR(cfg))) return
    if (inPondWater(x, z)) return   // FEAT-17: no rocks/bushes under the pond plane
    // FEAT-25: keep boulders + AMBIENT collidable rocks + bushes out of the underwater channel (a
    // random hard prop mid-creek reads broken). Decorative small rocks are allowed everywhere, and
    // the dedicated bed-stone pass opts in explicitly (allowChannel) — creek stones ARE the point.
    if (!allowChannel && cat !== 'smallRock' && inStreamChannel(x, z)) return
    const variant = (rngArg() * cfg.variants) | 0
    const scale = frange(rngArg, cfg.instScale)
    const bury = frange(rngArg, buryRange)
    // approximate exposed half-height from the variant's nominal radius * axis-y
    const halfH = cfg.blob.radius[1] * cfg.blob.axisScale[1] * scale
    const gy = heightAt(x, z)          // analyticHeight → includes the stream carve, so channel rocks sit on the bed
    out.push({
      cat, variant, x, z,
      y: gy + halfH * (0.5 - bury),     // bury 0.5 → centre at ground; →1 sinks it
      gy,                               // PERF-14: ground Y captured here so commit never re-samples
      scale, rotY: rngArg() * Math.PI * 2,
      tint: tintFor(rngArg, cfg.color, cfg.colorJitter),
    })
  }

  // ── tree clusters (grouping) ──────────────────────────────────────────────────────────
  // FIRST pass in the chunk's rng stream, and extracted (treeClusterPass) so FEAT-45's camp
  // shade score can replay JUST the trees without paying for the rocks/bushes/logs behind them.
  // `yield*` keeps the draws, the order and the yield cadence byte-identical to the inline version.
  const trees = yield* treeClusterPass(rng, ox, oz, worldSeed, samplers, P)
  for (const t of trees) out.push(t)

  // ── rocks (slope-weighted), boulders, small rocks, bushes — independent scatter ────────
  // PERF-14: generator helper — yields EVERY candidate; sampler chains (analytic height + road
  // scan + water/stream lookups) can individually run ms-scale, so coarser slices blow the budget.
  function* scatterN (count, fn) {
    for (let i = 0; i < count; i++) { fn(ox + rng() * size, oz + rng() * size); yield }
  }

  yield* scatterN(irange(rng, S.rocksPerChunk), (x, z) => {
    // large rocks more common on steeper ground
    const keep = (1 - P.rock.slopeBias) + P.rock.slopeBias * (slopeAt(x, z) / S.slopeRejectMax + 0.3)
    if (rng() < Math.max(0.1, Math.min(1, keep))) placeBlob('rock', x, z, P.rock.buryFrac)
  })

  if (rng() < S.boulderChance) {
    const x = ox + rng() * size, z = oz + rng() * size
    placeBlob('boulder', x, z, P.boulder.buryFrac)
  }

  // Small rocks IGNORE the road exclusion — dense on the shoulder, sparse ON the road surface.
  const smallRockAttempts = irange(rng, S.smallRocksPerChunk)   // captured for the FEAT-25 boost pass
  yield* scatterN(smallRockAttempts, (x, z) => {
    const d = roadDist ? roadDist(x, z) : Infinity
    if (d < S.roadHalfWidth && rng() > S.smallRockOnRoadKeep) return   // sparse on the road itself
    placeBlob('smallRock', x, z, P.smallRock.buryFrac, true)
  })

  // FEAT-25: denser small rocks inside stream channels. An ADDITIVE pass (the base scatter above
  // still keeps whatever small rocks it placed in-channel) drawing from a SEPARATE seeded stream so
  // it can't shift the main scatter's rng. attempts = base small-rock attempts × streamRockBoost;
  // a rock is kept only where it lands in a channel bed or bank. Deterministic + window-invariant.
  const streamRockBoost = S.streamRockBoost ?? 0
  if (streamAt && streamRockBoost > 0) {
    const srng = mulberry32(seedFor(worldSeed, 'streamRocks', cx, cz))
    const attempts = Math.round(smallRockAttempts * streamRockBoost)
    for (let i = 0; i < attempts; i++) {
      // PERF-14: yield BEFORE the channel-miss continue — with boost ~10× the attempts run into
      // the hundreds, and a no-channel chunk otherwise burns the WHOLE pass (hundreds of streamAt
      // walks, 12-19 ms measured) inside one un-sliceable step.
      if ((i & 3) === 3) yield
      const x = ox + srng() * size, z = oz + srng() * size
      const s = streamAt(x, z)
      if (!s || !(s.inChannel || s.inBank)) continue
      placeBlob('smallRock', x, z, P.smallRock.buryFrac, true, srng)
    }
  }

  // FEAT-25 rework (2026-07-08): MEDIUM stones in the CHANNEL bed — the user-visible "rocky
  // creek" read ("i want like 10x med stones in beds"). Same additive/separate-rng discipline
  // as the small-rock boost above so every pre-existing placement keeps its exact draws.
  // attempts = a fresh rocksPerChunk draw × streamMedRockBoost, kept only where they land IN
  // the channel — so in-bed medium-stone DENSITY lands at ~boost× the ambient rock density.
  // placeBlob opts into the channel (allowChannel) but keeps the road keep-out: no stones
  // poking through bridge decks where a road fills the channel. Bury range is tighter than
  // ambient rocks ([0.2,0.9]) — creek stones should read as seated but EXPOSED, not vanish.
  const medBoost = S.streamMedRockBoost ?? 0
  if (streamAt && medBoost > 0) {
    const mrng = mulberry32(seedFor(worldSeed, 'streamMedRocks', cx, cz))
    const attempts = Math.round(irange(mrng, S.rocksPerChunk) * medBoost)
    for (let i = 0; i < attempts; i++) {
      if ((i & 3) === 3) yield   // PERF-14: before the miss-continue (see small-rock boost above)
      const x = ox + mrng() * size, z = oz + mrng() * size
      const s = streamAt(x, z)
      if (!s || !s.inChannel) continue
      placeBlob('rock', x, z, [0.25, 0.65], false, mrng, true)
    }
  }
  // Bushes sink slightly into the ground (kills slope-float, matches groundSink intent).
  yield* scatterN(irange(rng, S.bushesPerChunk),     (x, z) => placeBlob('bush', x, z, [0.18, 0.34]))

  // ── FEAT-15: fallen logs — downed trunks resting on (and pitched to) the terrain ─────────
  // LAST scatter pass so every pre-existing placement keeps its exact rng draws (logs are purely
  // additive to the world). The log lies along its local +X; a THREE yaw rotY maps that axis to
  // world (cos rotY, −sin rotY). Both ends are grounded with heightAt (the carved/composed
  // surface) and the instance is pitched via the existing tilt machinery (tiltAz = π/2 → local Z
  // → pitch), so the trunk follows the slope instead of floating at one end. Hard obstacle ⇒
  // full road keep-out inflated by the half-length (BUG-23 discipline).
  const placeLog = (x, z) => {
    const cfg = P.log
    if (!roadClear(x, z, S.roadExclusion + (cfg.length / 2) * cfg.instScale[1])) return
    if (inPondWater(x, z) || inStreamChannel(x, z)) return
    if (slopeAt(x, z) > S.logSlopeMax) return
    const variant = (rng() * cfg.variants) | 0
    const scale = frange(rng, cfg.instScale)
    const rotY = rng() * Math.PI * 2
    const hl = (cfg.length / 2) * scale
    const ux = Math.cos(rotY), uz = -Math.sin(rotY)
    const yA = heightAt(x - ux * hl, z - uz * hl)
    const yB = heightAt(x + ux * hl, z + uz * hl)
    const pitch = Math.atan2(yB - yA, 2 * hl)
    if (Math.abs(pitch) > S.logPitchMax) return   // ends span a step/bank — it would float; skip
    out.push({
      cat: 'log', variant, x, z,
      y: (yA + yB) / 2 - 0.06 * scale,   // slight settle so the tube digs in on uneven ground
      gy: (yA + yB) / 2,                 // PERF-14: mid-span ground Y for the blob (avoids commit-time resample)
      scale, rotY,
      tilt: pitch, tiltAz: Math.PI / 2,  // pitch about local Z: +X end toward the higher sample
      tint: tintFor(rng, cfg.color, cfg.colorJitter),
    })
  }
  yield* scatterN(irange(rng, S.logsPerChunk), placeLog)

  // ── Zone rocks — small / medium / large rocks following the ground texture ────────────
  // Additive, on its own seeded stream (the streamRocks discipline), gated by the terrain's
  // own ground reading (samplers.groundAt — absent in older fixtures → no zone rocks) and by a
  // patchiness field so they gather in fans. See data/flora.js scatter.zoneRocks.
  const Z = S.zoneRocks
  if (Z && Z.attempts > 0 && samplers.groundAt && P.medRock) {
    const zrng = mulberry32(seedFor(worldSeed, 'zoneRocks', cx, cz))
    const mixS = Z.mix[0], mixM = mixS + Z.mix[1], mixL = mixM + Z.mix[2]   // shares of the attempts; past mixL → none
    for (let i = 0; i < Z.attempts; i++) {
      const x = ox + zrng() * size, z = oz + zrng() * size
      // three draws per candidate regardless of the gate, so the stream stays aligned
      const uKeep = zrng(), uSize = zrng()
      const gate = _smooth01(Z.patchMin, Z.patchMin + 0.2, noise2(x * Z.patchFreq, z * Z.patchFreq, worldSeed ^ 0x2545f491))
      if (gate <= 0) continue                                     // bare patch — no sampler cost
      if ((i & 3) === 3) yield
      const g = samplers.groundAt(x, z)
      const dirt = Math.max(0, 1 - g.green - g.rock)
      const w = g.rock * Z.onRock + dirt * Z.onDirt + g.green * Z.onGrass
      if (uKeep > w * gate) continue
      if (inPondWater(x, z)) continue
      if (uSize < mixS) {
        if (!roadClear(x, z, S.roadHalfWidth + 0.5)) continue     // off the pavement (the base pass owns the shoulder)
        placeBlob('smallRock', x, z, P.smallRock.buryFrac, true, zrng)
      } else if (uSize < mixM) {
        if (!roadClear(x, z, S.roadHalfWidth + 0.5 + blobBoundR(P.medRock))) continue
        placeBlob('medRock', x, z, P.medRock.buryFrac, true, zrng)
      } else if (uSize < mixL) {
        placeBlob('rock', x, z, P.rock.buryFrac, false, zrng)     // collidable: full keep-out inside placeBlob
      }
    }
  }

  // ── FEAT-85: roadside cover — ricegrass, wild rye, sagebrush ─────────────────────────
  // Additive and LAST, on its own seeded stream, so every placement above keeps its exact draws.
  // Optional samplers (roadWalk / greenAt / padBlocked) — absent (older fixtures, gates) → no
  // cover, output byte-unchanged. See data/flora.js scatter.cover for the two sources.
  yield* coverPass(out, cx, cz, worldSeed, samplers, P, { roadClear, inPondWater, inStreamChannel, slopeAt })

  return out
}

// Cheap 2D value noise in [0,1] (world-space, seed-keyed) — the cover's patchiness fields.
function _hash2(ix, iz, seed) {
  let h = seed | 0
  h = Math.imul(h ^ (ix | 0), 0x9e3779b9)
  h = Math.imul(h ^ (iz | 0), 0x85ebca6b)
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
const _sm = (t) => t * t * (3 - 2 * t)
function noise2(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z)
  const fx = _sm(x - x0), fz = _sm(z - z0)
  const a = _hash2(x0, z0, seed), b = _hash2(x0 + 1, z0, seed)
  const c = _hash2(x0, z0 + 1, seed), d = _hash2(x0 + 1, z0 + 1, seed)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz
}
function noise1(t, seed) {
  const i = Math.floor(t), f = _sm(t - i)
  return _hash2(i, 0, seed) + (_hash2(i + 1, 0, seed) - _hash2(i, 0, seed)) * f
}
const _smooth01 = (e0, e1, x) => x <= e0 ? 0 : x >= e1 ? 1 : _sm((x - e0) / (e1 - e0))

/**
 * FEAT-85: the cover pass. Two sources (data/flora.js scatter.cover explains the intent):
 *   THE WALL — walks the road slices around this chunk (samplers.roadWalk) and, per sample and
 *   side, stands `wallRows` candidates in a band whose inner face sits halfWidth + beatBack off
 *   the centreline, beatBack wandering along the run's arc by a noise field. A second field
 *   picks hedge (brush) vs verge (grass) per stretch. Only candidates that LAND in this chunk are
 *   kept (the 3×3 walk means the neighbour's slice fills the edge from the other side).
 *   THE BACKCOUNTRY — chunk-rng candidates kept with probability ground × patchiness, held off
 *   the road by the widest beat-back so they never stand in the mown verge.
 * Every per-candidate draw comes from a stream seeded by the candidate's WORLD POSITION, so the
 * result does not depend on which neighbours' roads were registered at scatter time.
 */
function* coverPass(out, cx, cz, worldSeed, samplers, P, h) {
  const S = P.scatter, C = S.cover
  if (!C || C.enabled === false || (!samplers.roadWalk && !samplers.groundAt)) return
  const { heightAt } = samplers
  const { roadClear, inPondWater, inStreamChannel, slopeAt } = h
  const size = P.chunkSize
  const ox = cx * size, oz = cz * size
  const halfW = S.roadHalfWidth
  const padBlocked = samplers.padBlocked || (() => false)
  const groundAt = samplers.groundAt || (() => ({ green: 1, rock: 0 }))
  const bb0 = C.wallBeatBack[0], bb1 = C.wallBeatBack[1]
  const dirtFrac = C.dirtFrac ?? 0

  // Which kind, and does it stand on THIS ground? Small grass and sagebrush thin onto dirt at
  // dirtFrac of their green density; wild rye is green-only; nothing stands on rock.
  const pickKind = (tall, prng) => tall ? (prng() < (C.sageFrac ?? 0.5) ? 'sage' : 'rye') : 'grass'
  const standProb = (cat, g) => {
    const dirt = Math.max(0, 1 - g.green - g.rock)
    return cat === 'rye' ? g.green : g.green + dirt * dirtFrac
  }

  // Stand one clump. `prng` is the candidate's position-keyed stream (already used for its
  // keep/skip draws); the remaining draws pick variant, scale, yaw and tint.
  const stand = (x, z, cat, prng) => {
    if (inPondWater(x, z) || inStreamChannel(x, z)) return
    if (padBlocked(x, z, 0.5)) return
    if (slopeAt(x, z) > C.slopeMax) return
    const cfg = P[cat]
    if (!cfg) return
    const gy = heightAt(x, z)
    // Brightness-only tint (like trees): the clump's colours are baked per vertex (base → tip),
    // and instanceColor MULTIPLIES them, so a coloured tint would square the green.
    const b = 1 + (prng() * 2 - 1) * cfg.colorJitter
    out.push({
      cat, variant: (prng() * cfg.variants) | 0, x, z,
      y: gy - C.sink, gy,
      scale: frange(prng, cfg.instScale), rotY: prng() * Math.PI * 2,
      tint: [b, b, b],
    })
  }

  // ── the wall ──────────────────────────────────────────────────────────────────────────
  if (samplers.roadWalk && P.grass) {
    const walk = samplers.roadWalk(cx, cz, C.wallStep)
    for (const run of walk) {
      const rh = djb2(run.runKey || '') ^ worldSeed
      for (const s of run.samples) {
        if (s.bore) continue
        const nx = s.tz, nz = -s.tx                       // right-hand normal (road-mesh rightDir)
        for (let side = -1; side <= 1; side += 2) {
          const bb = bb0 + (bb1 - bb0) * noise1(s.arcS * C.wallNoiseFreq + side * 37.1, rh)
          const hedge = noise1(s.arcS * C.wallBrushNoiseFreq + side * 11.3 + 100, rh ^ 0x5bd1e995)
          // Sporadic (owner 2026-09-23): a stretch is populated or bare by a third field along the
          // arc, so the thinning reads as gaps between clumps, not a thinner hedge everywhere.
          const patch = C.wallPatchFreq
            ? _smooth01(C.wallPatchMin ?? 0.45, (C.wallPatchMin ?? 0.45) + 0.2, noise1(s.arcS * C.wallPatchFreq + side * 5.7 + 200, rh ^ 0x27d4eb2f))
            : 1
          if (patch <= 0) continue
          for (let k = 0; k < C.wallRows; k++) {
            const prng = mulberry32(seedFor(worldSeed, 'coverWall', Math.round(s.x * 4), Math.round(s.z * 4), side, k))
            if (prng() > C.wallDensity * patch) continue
            const lat = halfW + bb + prng() * C.wallDepth
            const along = (prng() - 0.5) * C.wallStep
            const x = s.x + nx * lat * side + s.tx * along
            const z = s.z + nz * lat * side + s.tz * along
            if (Math.floor(x / size) !== cx || Math.floor(z / size) !== cz) continue   // the landing chunk owns it
            if (!roadClear(x, z, halfW + 0.5)) continue                                  // another leg's pavement (throats)
            const cat = pickKind(prng() < (C.wallTallFrac ?? 0.175) * (0.4 + 1.2 * hedge), prng)
            if (prng() > standProb(cat, groundAt(x, z))) { yield; continue }
            stand(x, z, cat, prng)
            yield   // PERF-14: every candidate that reached the samplers is a slice point
          }
        }
      }
    }
  }

  // ── the backcountry ───────────────────────────────────────────────────────────────────
  const backN = Math.round(C.backAttempts * (C.density ?? 1))   // tier-scaled (Normal 1×)
  if (samplers.groundAt && P.grass && backN > 0) {
    const crng = mulberry32(seedFor(worldSeed, 'coverBack', cx, cz))
    for (let i = 0; i < backN; i++) {
      const x = ox + crng() * size, z = oz + crng() * size
      const gate = _smooth01(C.backNoiseMin, C.backNoiseMin + 0.25, noise2(x * C.backNoiseFreq, z * C.backNoiseFreq, worldSeed ^ 0x9e3779b9))
      if (gate <= 0) continue                                     // bare patch — no sampler cost
      if ((i & 3) === 3) yield
      if (!roadClear(x, z, halfW + bb1)) continue                 // never inside the mown verge
      const prng = mulberry32(seedFor(worldSeed, 'coverBackPt', Math.round(x * 4), Math.round(z * 4)))
      const cat = pickKind(prng() < (C.backTallFrac ?? 0.1), prng)
      if (prng() > standProb(cat, groundAt(x, z)) * gate) continue
      stand(x, z, cat, prng)
      yield
    }
  }
}
