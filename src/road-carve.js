/**
 * src/road-carve.js — Pure no-import carve functions for RangerSim road surface.
 *
 * Worker-safe: NO imports. Function BODIES (no `export` keyword) are copied verbatim
 * into terrain.js WORKER_SOURCE and terrain-worker.js — same discipline as the
 * height() / seed utility sync (T-07-03-SYNC).
 *
 * SYNC RULE: any edit here must be reflected in:
 *   (1) terrain.js WORKER_SOURCE carve section   ← search for "CARVE SYNC"
 *   (2) terrain-worker.js carve section           ← search for "CARVE SYNC"
 * Edit all three in the same commit (T-07-03-SYNC mitigation).
 *
 * Pure functions — deterministic (D-16). No Math.random, no Date, no session state.
 */

// ── CARVE SYNC: function bodies below are embedded verbatim in WORKER_SOURCE and terrain-worker.js ──

/**
 * Bilinear lookup into a per-chunk carve table.
 *
 * The table layout is flat Float32Array with 2 values per vertex (row-major, same layout as
 * chunk.heights): [blendW_0, gradeY_0, blendW_1, gradeY_1, ...].  Indices follow the same
 * grid convention as sampleHeight in terrain.js (zi * N + xi).
 *
 * Returns { blendW, gradeY } bilinearly interpolated at world position (wx, wz).
 * blendW ∈ [0,1]: 0 = raw terrain; 1 = fully on design grade.
 * gradeY: smoothed road design grade height (world-space metres, amplitude already included).
 *
 * @param {number} wx        — world X
 * @param {number} wz        — world Z
 * @param {Float32Array} carveTable — 2*N*N float table [blendW, gradeY, ...]
 * @param {number} N         — grid sample count per side (e.g. 65)
 * @param {number} originX   — chunk world-space X origin (cx * CHUNK_SIZE)
 * @param {number} originZ   — chunk world-space Z origin (cz * CHUNK_SIZE)
 * @param {number} cellSize  — metres per grid cell (CHUNK_SIZE / (N-1))
 * @returns {{ blendW: number, gradeY: number }}
 *
 * Pure function — deterministic (D-16).
 */
export function sampleCarve(wx, wz, carveTable, N, originX, originZ, cellSize) {
    const lx = wx - originX
    const lz = wz - originZ
    const xi = Math.max(0, Math.min(N - 2, Math.floor(lx / cellSize)))
    const zi = Math.max(0, Math.min(N - 2, Math.floor(lz / cellSize)))
    const fx = (lx / cellSize) - xi
    const fz = (lz / cellSize) - zi

    const i00 = (zi     * N +  xi   ) * 2
    const i10 = (zi     * N + (xi+1)) * 2
    const i01 = ((zi+1) * N +  xi   ) * 2
    const i11 = ((zi+1) * N + (xi+1)) * 2

    const w00 = (1-fx) * (1-fz)
    const w10 =    fx  * (1-fz)
    const w01 = (1-fx) *    fz
    const w11 =    fx  *    fz

    const blendW = carveTable[i00    ] * w00 + carveTable[i10    ] * w10
                 + carveTable[i01    ] * w01 + carveTable[i11    ] * w11
    const gradeY = carveTable[i00 + 1] * w00 + carveTable[i10 + 1] * w10
                 + carveTable[i01 + 1] * w01 + carveTable[i11 + 1] * w11

    return { blendW, gradeY }
}

/**
 * Parabolic crown profile: raised at centerline, tapers to 0 at the ribbon edge.
 *
 * @param {number} uLat        — signed lateral distance from centerline (m); sign ignored.
 * @param {number} halfWidth   — half ribbon width (m)
 * @param {number} crownHeight — height at centerline above edge (m)
 * @returns {number} Crown height at this lateral position (0 at edges, crownHeight at center).
 *
 * Pure function — deterministic (D-16).
 */
export function crownProfile(uLat, halfWidth, crownHeight) {
    const t = uLat / halfWidth
    // Parabola: peak at t=0 (centerline), 0 at t=±1 (ribbon edge)
    return crownHeight * (1.0 - t * t)
}

/**
 * Carve blend: compute the carved terrain height at a point given its lateral distance from
 * the road centerline and the smoothed design grade Y.
 *
 * On the ribbon (dist < halfWidth): returns designGradeY (full carve).
 * In the shoulder zone (dist ∈ [halfWidth, halfWidth+shoulderWidth]): linear blend back to raw.
 * Beyond shoulder: returns raw (unaffected terrain).
 *
 * The blend function is the single shared formula called by all four sites:
 *   _flushPendingQueue, analyticHeight, sampleHeight, and the Worker height loop.
 * Crown/camber tilt is folded into gradeY by the carve table builder (Plan 09-03), not here.
 *
 * @param {number} raw            — raw terrain height (with terrainAmplitude applied, metres)
 * @param {number} dist           — lateral distance from road centerline (m, always ≥ 0)
 * @param {number} designGradeY   — smoothed road design grade height (metres)
 * @param {number} halfWidth      — half ribbon width (m), e.g. 5 for a 10 m road
 * @param {number} shoulderWidth  — blend zone width beyond ribbon edge (m), e.g. 2.5
 * @returns {number} Carved terrain height at this position (metres).
 *
 * Pure function — deterministic (D-16).
 */
export function carveBlend(raw, dist, designGradeY, halfWidth, shoulderWidth) {
    if (dist < halfWidth) return designGradeY
    const t = Math.max(0.0, 1.0 - (dist - halfWidth) / shoulderWidth)
    return raw + t * (designGradeY - raw)
}
