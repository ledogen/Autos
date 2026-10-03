/**
 * src/road-quality.js — Per-stretch road quality computation.
 *
 * Extracted from road-mesh.js (Plan 09-06) to break the circular import that
 * would arise if terrain.js imported from road-mesh.js (road-mesh.js imports
 * terrain.js for CHUNK_SIZE, so that direction is forbidden).
 *
 * Consumers:
 *   - road-mesh.js  (the per-vertex q the marking shader tiers on — D-02 — and ribbon potholes)
 *   - road.js       (pothole severity on the carved surface — D-03 / SURF-06; the terrain mesh
 *                    carve reads it through road.js's shared resolver, not directly)
 *   - mission.js    (par oracle: a rough stretch is slower)
 *
 * D-03: same per-stretch roadQuality value drives both lane markings
 * (visual, road-mesh.js) and pothole severity (physics+mesh, SURF-06).
 *
 * Phase: 09-road-surface
 * Plan: 09-06 (extracted from 09-05)
 */

import { seedFor, mulberry32 } from './seed.js'

// ── Road quality constants (D-02/D-03) ───────────────────────────────────────
// ROAD_QUALITY_STRETCH: arc-length span per quality tier (metres). D-02.
export const ROAD_QUALITY_STRETCH = 500

// ROAD_QUALITY_BLEND: blend zone at stretch boundaries (metres). D-02.
export const ROAD_QUALITY_BLEND = 10

/**
 * Hash a runKey string into a stable 32-bit integer for use as a seedFor coordinate.
 * Reuses the djb2-style approach: fold each character using Math.imul.
 * Pure function — no side effects. Deterministic (D-16).
 *
 * @param {string} runKey — per-run identifier from road._network (e.g. "mz3")
 * @returns {number} unsigned 32-bit integer
 */
export function hashRunKey(runKey) {
    let h = 5381
    const s = String(runKey)
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0
    }
    return h >>> 0
}

/**
 * Compute the blended road quality value at arc-length `arcS` along a run.
 *
 * Algorithm (D-02):
 *   stretchIdx = floor(arcS / ROAD_QUALITY_STRETCH)
 *   Each stretch: quality = mulberry32(seedFor(worldSeed, 'roadquality', hashRunKey(runKey), stretchIdx))()
 *   The LAST ROAD_QUALITY_BLEND metres of a stretch smoothstep-blend into the next stretch's value,
 *   so the value is continuous across the boundary. (It used to blend on both sides of the
 *   boundary, which snapped back to the old value right after crossing it.)
 *
 * Returns a value in [0, 1). Deterministic from (worldSeed, runKey, arcS) — D-16.
 *
 * D-03: This function IS the labeled `roadQuality` hook. Call it from any surface consumer
 * (markings in road-mesh.js, pothole severity in road.js / terrain.js via Plan 09-06).
 *
 * @param {number} arcS      — arc-length along the run (metres)
 * @param {string} runKey    — per-run identifier
 * @param {number} worldSeed — unsigned 32-bit world seed
 * @returns {number} road quality in [0, 1); higher = better condition
 */
export function roadQuality(arcS, runKey, worldSeed) {
    const rk = hashRunKey(runKey)
    const stretchIdx = Math.floor(arcS / ROAD_QUALITY_STRETCH)

    // Quality for the current stretch
    const q0 = mulberry32(seedFor(worldSeed, 'roadquality', rk, stretchIdx))()

    // Arc-length fraction within the current stretch [0, 1)
    const fracInStretch = (arcS % ROAD_QUALITY_STRETCH) / ROAD_QUALITY_STRETCH

    // Blend at the END boundary (last ROAD_QUALITY_BLEND metres of this stretch)
    const blendStart = 1.0 - ROAD_QUALITY_BLEND / ROAD_QUALITY_STRETCH
    if (fracInStretch >= blendStart) {
        const q1 = mulberry32(seedFor(worldSeed, 'roadquality', rk, stretchIdx + 1))()
        // smoothstep blend: t goes 0→1 across the blend zone
        const tRaw = (fracInStretch - blendStart) / (ROAD_QUALITY_BLEND / ROAD_QUALITY_STRETCH)
        const t = tRaw * tRaw * (3 - 2 * tRaw)  // smoothstep
        return q0 + (q1 - q0) * t
    }

    return q0
}
