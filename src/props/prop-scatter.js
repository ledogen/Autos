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
 * }
 *
 * Placement record: { cat, variant, x, y, z, scale, rotY, tint:[r,g,b] }
 *   y = world Y of the instance ORIGIN (trees: ground; blobs: sunk by buryFrac).
 */

import { mulberry32, seedFor } from '../seed.js'
import { FLORA_PARAMS } from '../../data/flora.js'

const lerp = (a, b, t) => a + (b - a) * t
const irange = (rng, [lo, hi]) => Math.round(lo + (hi - lo) * rng())
const frange = (rng, [lo, hi]) => lo + (hi - lo) * rng()

// Cheap deterministic low-freq world-space biome mask in [0,1] (independent of chunk window).
function biomeNoise(x, z, freq, seed) {
  const s = Math.sin(x * freq + seed * 0.001) + Math.cos(z * freq * 1.3 + seed * 0.002)
  return (s * 0.5 + 1) * 0.5   // ~[0,1]
}

function tintFor(rng, hex, jitter) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255
  const j = () => 1 + (rng() * 2 - 1) * jitter
  return [Math.min(1, r * j()), Math.min(1, g * j()), Math.min(1, b * j())]
}

/**
 * Scatter one chunk.
 * @param {number} cx integer chunk X
 * @param {number} cz integer chunk Z
 * @param {number} worldSeed
 * @param {object} samplers  { heightAt, normalAt, roadBlocked }
 * @param {object} [params=FLORA_PARAMS]
 * @returns {Array} placement records
 */
export function scatterChunk(cx, cz, worldSeed, samplers, params = FLORA_PARAMS) {
  const P = params, S = P.scatter
  const rng = mulberry32(seedFor(worldSeed, P.worldSeedTag, cx, cz))
  const size = P.chunkSize
  const ox = cx * size, oz = cz * size
  const out = []
  const { heightAt, normalAt, roadBlocked, roadDist, roadClear: roadClearFn } = samplers

  // BUG-23: radius-aware road keep-out. roadClear(x,z,keepOut) is true when NO road centreline lies
  // within keepOut metres. Falls back to the legacy fixed-radius roadBlocked for older fixtures that
  // predate roadClear (keepOut then ignored — they only exercise determinism, not the inflated mask).
  const roadClear = roadClearFn || ((x, z) => !roadBlocked(x, z))

  // FEAT-17: optional pond sampler (waterAt(x,z) → {inWater, inSkirt}) — nothing scatters IN a pond
  // (underwater trees). The skirt stays plantable (vegetated shoreline). Absent (older fixtures /
  // gates) → no exclusion, placements byte-unchanged. Pure fn of seed/coords → window-invariant.
  const waterAt = samplers.waterAt || null
  const inPondWater = (x, z) => { const w = waterAt && waterAt(x, z); return !!(w && w.inWater) }

  // FEAT-25: optional stream-channel sampler (streamAt(x,z) → {inChannel, inBank, stream}). Trees,
  // bushes, boulders and collidable rocks are excluded from the underwater CHANNEL (broken-looking
  // submerged props); the decorative small-rock category is instead DENSIFIED there (boost pass
  // below). Absent (older fixtures / gates) → no exclusion/boost, placements byte-unchanged.
  const streamAt = samplers.streamAt || null
  const inStreamChannel = (x, z) => { const s = streamAt && streamAt(x, z); return !!(s && s.inChannel) }

  // Max world horizontal bounding radius of a blob category — an UPPER bound over its variants +
  // instance scale: widest drawn radius × widest ground-plane axis × the irregularity peak × max
  // scale. Used to inflate the road keep-out so no part of a placed blob overhangs the lane (BUG-23).
  const blobBoundR = (cfg) =>
    cfg.blob.radius[1] * Math.max(cfg.blob.axisScale[0], cfg.blob.axisScale[2]) *
    (1 + cfg.blob.irregularity) * cfg.instScale[1]

  const slopeAt = (x, z) => 1 - Math.max(0, Math.min(1, normalAt(x, z).y))

  // ── helper: place a single prop of category `cat` at (x,z) if terrain allows ──────────
  // rngArg lets the FEAT-25 channel-rock boost pass draw from its OWN seeded stream (so the extra
  // rocks never perturb the main scatter's rng draws → existing placements stay byte-identical).
  const placeBlob = (cat, x, z, buryRange, ignoreRoad = false, rngArg = rng) => {
    const cfg = P[cat]
    // BUG-23: exclude road-respecting props from the road FOOTPRINT, inflating the keep-out by the
    // prop's own bounding radius so a big rock/boulder whose CENTRE sits just off the ribbon can no
    // longer overhang (and wall off) the driveable lane. Pure fn of seed/coords (window-invariant).
    if (!ignoreRoad && !roadClear(x, z, S.roadExclusion + blobBoundR(cfg))) return
    if (inPondWater(x, z)) return   // FEAT-17: no rocks/bushes under the pond plane
    // FEAT-25: keep boulders + collidable rocks + bushes out of the underwater channel (a hard prop
    // mid-creek reads broken / walls the channel). Decorative small rocks are ALLOWED — densified.
    if (cat !== 'smallRock' && inStreamChannel(x, z)) return
    const variant = (rngArg() * cfg.variants) | 0
    const scale = frange(rngArg, cfg.instScale)
    const bury = frange(rngArg, buryRange)
    // approximate exposed half-height from the variant's nominal radius * axis-y
    const halfH = cfg.blob.radius[1] * cfg.blob.axisScale[1] * scale
    const gy = heightAt(x, z)          // analyticHeight → includes the stream carve, so channel rocks sit on the bed
    out.push({
      cat, variant, x, z,
      y: gy + halfH * (0.5 - bury),     // bury 0.5 → centre at ground; →1 sinks it
      scale, rotY: rngArg() * Math.PI * 2,
      tint: tintFor(rngArg, cfg.color, cfg.colorJitter),
    })
  }

  const placeTree = (cat, x, z) => {
    if (roadBlocked(x, z)) return
    if (inPondWater(x, z)) return   // FEAT-17: no trees standing in the pond
    if (inStreamChannel(x, z)) return   // FEAT-25: no trees standing in the stream channel
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

  // ── tree clusters (grouping) ──────────────────────────────────────────────────────────
  const nClusters = S.clustersPerChunk
  for (let ci = 0; ci < nClusters; ci++) {
    const ccx = ox + rng() * size, ccz = oz + rng() * size
    const slope = slopeAt(ccx, ccz)
    const elev = heightAt(ccx, ccz)
    const biome = biomeNoise(ccx, ccz, S.biomeNoiseFreq, worldSeed)

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
      placeTree(cat, ccx + Math.cos(ang) * rad, ccz + Math.sin(ang) * rad)
    }
  }

  // ── rocks (slope-weighted), boulders, small rocks, bushes — independent scatter ────────
  const scatterN = (count, fn) => { for (let i = 0; i < count; i++) fn(ox + rng() * size, oz + rng() * size) }

  scatterN(irange(rng, S.rocksPerChunk), (x, z) => {
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
  scatterN(smallRockAttempts, (x, z) => {
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
      const x = ox + srng() * size, z = oz + srng() * size
      const s = streamAt(x, z)
      if (!s || !(s.inChannel || s.inBank)) continue
      placeBlob('smallRock', x, z, P.smallRock.buryFrac, true, srng)
    }
  }
  // Bushes sink slightly into the ground (kills slope-float, matches groundSink intent).
  scatterN(irange(rng, S.bushesPerChunk),     (x, z) => placeBlob('bush', x, z, [0.18, 0.34]))

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
      scale, rotY,
      tilt: pitch, tiltAz: Math.PI / 2,  // pitch about local Z: +X end toward the higher sample
      tint: tintFor(rng, cfg.color, cfg.colorJitter),
    })
  }
  scatterN(irange(rng, S.logsPerChunk), placeLog)

  return out
}
