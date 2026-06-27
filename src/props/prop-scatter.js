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
  const { heightAt, normalAt, roadBlocked, roadDist } = samplers

  const slopeAt = (x, z) => 1 - Math.max(0, Math.min(1, normalAt(x, z).y))

  // ── helper: place a single prop of category `cat` at (x,z) if terrain allows ──────────
  const placeBlob = (cat, x, z, buryRange, ignoreRoad = false) => {
    if (!ignoreRoad && roadBlocked(x, z)) return
    const cfg = P[cat]
    const variant = (rng() * cfg.variants) | 0
    const scale = frange(rng, cfg.instScale)
    const bury = frange(rng, buryRange)
    // approximate exposed half-height from the variant's nominal radius * axis-y
    const halfH = cfg.blob.radius[1] * cfg.blob.axisScale[1] * scale
    const gy = heightAt(x, z)
    out.push({
      cat, variant, x, z,
      y: gy + halfH * (0.5 - bury),     // bury 0.5 → centre at ground; →1 sinks it
      scale, rotY: rng() * Math.PI * 2,
      tint: tintFor(rng, cfg.color, cfg.colorJitter),
    })
  }

  const placeTree = (cat, x, z) => {
    if (roadBlocked(x, z)) return
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
  scatterN(irange(rng, S.smallRocksPerChunk), (x, z) => {
    const d = roadDist ? roadDist(x, z) : Infinity
    if (d < S.roadHalfWidth && rng() > S.smallRockOnRoadKeep) return   // sparse on the road itself
    placeBlob('smallRock', x, z, P.smallRock.buryFrac, true)
  })
  // Bushes sink slightly into the ground (kills slope-float, matches groundSink intent).
  scatterN(irange(rng, S.bushesPerChunk),     (x, z) => placeBlob('bush', x, z, [0.18, 0.34]))

  return out
}
