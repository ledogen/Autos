/**
 * test/road-test-harness.js — Test helpers for RangerSim road routing
 *
 * ES6 module. Exported from here, imported by test/test-road.html.
 *
 * Exports:
 *   assert(label, condition) — logs PASS:/FAIL: prefix to console
 *   mockCoarseHeight(wx, wz) — deterministic 50% steep ramp terrain (wz * 0.5)
 *   TEST_PARAMS — minimal RANGER_PARAMS mirror with coarse + road routing fields
 *
 * Purpose: Isolate road routing tests from live simplex noise and full RANGER_PARAMS.
 * mockCoarseHeight returns a 50% grade ramp in +Z — far exceeding the 12% max-grade
 * limit — so any valid router MUST switchback laterally rather than climbing straight up.
 */

// ── assert ─────────────────────────────────────────────────────────────────────
/**
 * Log PASS: or FAIL: for a named assertion.
 * @param {string} label — human-readable test description
 * @param {boolean} condition — true means pass
 */
export function assert(label, condition) {
    if (condition) {
        console.log(`PASS: ${label}`)
    } else {
        console.error(`FAIL: ${label}`)
    }
}

// ── mockCoarseHeight ───────────────────────────────────────────────────────────
/**
 * Synthetic steep-ramp terrain: height = wz * 0.5 (50% grade in +Z direction).
 *
 * Grade = |dh/dz| = 0.5 — far exceeds the 12% maxRoadGrade limit.
 * Any router that hard-blocks edges exceeding maxRoadGrade CANNOT climb straight
 * in +Z on this surface; it MUST route laterally (switchbacks).
 *
 * Used to verify ROAD-03 (switchback emergence) in isolation from live noise.
 *
 * @param {number} wx — world X coordinate (unused; ramp is Z-only)
 * @param {number} wz — world Z coordinate
 * @returns {number} raw height in metres
 */
export function mockCoarseHeight(wx, wz) {
    return wz * 0.5
}

// ── TEST_PARAMS ────────────────────────────────────────────────────────────────
/**
 * Minimal RANGER_PARAMS mirror for road routing tests.
 * Mirrors the Phase 7 coarse-layer block (frozen) and Phase 8 routing params.
 * Tests import this instead of the full data/ranger.js to stay self-contained.
 *
 * Coarse-layer values are locked at Phase 7 completion values.
 * Road routing values match data/ranger.js Phase 8 block defaults.
 */
export const TEST_PARAMS = {
    // ── Coarse terrain layer (Phase 7 locked) ──────────────────────────────
    coarseAmplitude:  150,     // m
    coarseFreq:       0.0005,  // 1/m
    coarseOctaves:    4,
    ridgeSharpness:   1.6,
    terrainAmplitude: 1.0,     // Y-rescale only — router must ignore this

    // ── Phase 8 Road Routing ───────────────────────────────────────────────
    maxRoadGrade:    0.12,   // ratio (12%) — hard grade limit
    routeGridSize:   16,     // cells/side — 4 m cells at 64 m tile
    roadSlopePenalty: 50,   // quadratic slope cost multiplier
    roadAltWeight:   0.1,   // valley-seeking altitude cost weight
    spurProbability: 0.15,  // per-tile spur branch probability
}
