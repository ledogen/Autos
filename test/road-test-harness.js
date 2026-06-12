/**
 * test/road-test-harness.js — Test helpers for RangerSim road routing
 *
 * ES6 module. Exported from here, imported by test/test-road.html.
 *
 * Exports:
 *   assert(label, condition) — logs PASS:/FAIL: prefix to console
 *   mockCoarseHeight(wx, wz) — deterministic 50% steep ramp terrain (wz * 0.5)
 *   ribbonCenterlineVertex(geo, sectionIdx, crossSegs) — read {x,y,z} of the centerline
 *     vertex for section sectionIdx from a ribbon BufferGeometry produced by sweepRibbon
 *   TEST_PARAMS — minimal RANGER_PARAMS mirror with coarse + road routing fields
 *
 * Purpose: Isolate road routing tests from live simplex noise and full RANGER_PARAMS.
 * mockCoarseHeight returns a 50% grade ramp in +Z — far exceeding the 15% soft maxGrade
 * target (D-09) — so the turn-penalty A* MUST switchback laterally rather than climbing
 * straight up.
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

// ── ribbonCenterlineVertex ─────────────────────────────────────────────────────
/**
 * Read the world-space {x, y, z} of the centerline vertex for a given longitudinal
 * section from a ribbon BufferGeometry produced by sweepRibbon().
 *
 * sweepRibbon() vertex layout:
 *   vertex index = sectionIdx * (CROSS_SEGS + 1) + lateralIdx
 *   lateralIdx 0 = left edge, lateralIdx CROSS_SEGS = right edge
 *   Centerline = lateralIdx = Math.floor(CROSS_SEGS / 2) = CROSS_SEGS/2 for even CROSS_SEGS
 *
 * Used by test-road-height-agreement.html to extract ribbon vertex Y for cross-checking
 * against the physics surface (_sampleCarveWorld) at the same world XZ (Plan 09-09 exit gate).
 *
 * @param {THREE.BufferGeometry} geo         — ribbon geometry from sweepRibbon
 * @param {number}               sectionIdx  — longitudinal section index (0 .. N_LONG-1)
 * @param {number}               [crossSegs=8] — CROSS_SEGS value used when sweeping
 * @returns {{ x: number, y: number, z: number }} world-space position of the centerline vertex
 */
export function ribbonCenterlineVertex(geo, sectionIdx, crossSegs = 8) {
    const pos       = geo.attributes.position
    const latIdx    = Math.floor(crossSegs / 2)
    const vertIdx   = sectionIdx * (crossSegs + 1) + latIdx
    return {
        x: pos.getX(vertIdx),
        y: pos.getY(vertIdx),
        z: pos.getZ(vertIdx),
    }
}

// ── mockCoarseHeight ───────────────────────────────────────────────────────────
/**
 * Synthetic steep-ramp terrain: height = wz * 0.5 (50% grade in +Z direction).
 *
 * Grade = |dh/dz| = 0.5 — far exceeds the 15% soft maxGrade target (D-09).
 * The turn-penalty A* (soft cost, never hard-blocks) will route laterally
 * (switchbacks) on this surface because the altitude + grade costs strongly
 * discourage climbing straight in +Z.
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
 * Mirrors the Phase 7 coarse-layer block (frozen) and Phase 8 D-09 locked routing params.
 * Tests import this instead of the full data/ranger.js to stay self-contained.
 *
 * Coarse-layer values are locked at Phase 7 completion values — do NOT change.
 * Road routing values are the D-09 locked cost-model params (valley-trunk architecture).
 */
export const TEST_PARAMS = {
    // ── Coarse terrain layer (Phase 7 locked) ──────────────────────────────
    coarseAmplitude:  150,     // m
    coarseFreq:       0.0005,  // 1/m
    coarseOctaves:    4,
    ridgeSharpness:   1.6,
    terrainAmplitude: 1.0,     // Y-rescale only — router must ignore this

    // ── Phase 8 Road Routing — D-09 locked cost model ─────────────────────
    // Valley-trunk architecture: soft cost model, turn-penalty A*, no hard grade block.
    maxRoadGrade:    0.15,   // ratio (15%) — soft target; over-cap penalty kicks in above this
    roadWDist:       1,      // directness weight
    roadWAlt:        0.85,   // valley-seeking altitude weight (stay low)
    roadWGrade:      400,    // quadratic grade penalty weight (gentle discouragement)
    roadWOver:       8000,   // soft over-cap penalty (expensive but finite — never hard-blocks)
    roadWTurn:       120,    // per-45° turn penalty (long straights + true switchbacks)
    spurProbability: 0.15,   // per-tile spur branch probability (stub — no spur generation yet)
}
