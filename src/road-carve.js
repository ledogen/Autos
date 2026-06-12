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

// ── SURF-06: Pothole / crack micro-noise (D-03) ───────────────────────────────
// NOT synced into WORKER_SOURCE — carve table gradeY_preamp is built main-thread only
// (the Worker stores RAW heights; it never applies carve). This function is called at
// the THREE sites where on-ribbon gradeY is produced on the main thread:
//   (a) road.js _sampleCarveWorld     (physics — analyticHeight)
//   (b) terrain.js _buildCarveTable   (physics/mesh — sampleHeight + _flushPendingQueue)
//   (c) road-mesh.js sweepRibbon      (visual ribbon)
// These three sites all have (wx, wz) world coordinates for the vertex, which is the
// canonical key — using world position ensures identical output at each site without
// requiring arcS propagation through the carve table builder.
//
// Deviation note: plan specified potholeNoise(arcS, uLat, ...) but _buildCarveTable
// iterates a grid and does not track arcS. Using (wx, wz) as the hash key achieves
// the same determinism guarantee and is the only input available at all three sites.

/**
 * Deterministic pothole / crack micro-noise for road surfaces.
 *
 * Returns a small signed Y perturbation (metres) at a world position.
 * Applied ONLY to on-ribbon vertices (latDist < halfWidth) by the caller;
 * must be zero-called for shoulder/terrain vertices to avoid bleeding.
 *
 * Severity scales with (1 - roadQuality):
 *   roadQuality ≈ 1 (high quality): perturbation → 0
 *   roadQuality ≈ 0 (low quality): perturbation at full amplitude
 *
 * Hash lattice: value-noise at two integer grid layers derived from world
 * coordinates snapped to a 1/potholeFrequency spacing. Two-octave sum gives
 * potholes (low freq) + crack texture (high freq). No Math.random, no Date.
 *
 * SURF-06 / D-03: same roadQuality value drives both markings (road-mesh.js)
 * and pothole severity (here).
 *
 * @param {number} wx           — world X of the vertex (metres)
 * @param {number} wz           — world Z of the vertex (metres)
 * @param {number} rq           — road quality in [0,1]; 1=smooth, 0=rough
 * @param {object} params       — RANGER_PARAMS (potholeEnabled, potholeAmplitude, potholeFrequency)
 * @returns {number} Signed Y perturbation (metres). Always 0 when potholeEnabled is falsy.
 *
 * Pure function — no imports, no side effects. Deterministic (D-16). Worker-safe.
 */
export function potholeNoise(wx, wz, rq, params) {
    if (!params.potholeEnabled) return 0

    const amplitude  = params.potholeAmplitude  ?? 0.04   // m (default 4 cm)
    const frequency  = params.potholeFrequency  ?? 0.3    // per m

    // Severity: (1 - roadQuality) so high quality → near zero.
    const severity = 1.0 - Math.max(0, Math.min(1, rq))
    if (severity < 1e-6) return 0

    // ── Value-noise hash (no Math.random / no Date) ──────────────────────────
    // Integer lattice hash: multiplies primes, bit-mixed by >>> 0.
    // Two-octave sum: pothole layer + crack layer.

    // Octave 1 (potholes): spacing = 1/frequency
    const freq1 = frequency
    const gx1 = Math.floor(wx * freq1)
    const gz1 = Math.floor(wz * freq1)
    const fx1 = (wx * freq1) - gx1  // fractional [0,1)
    const fz1 = (wz * freq1) - gz1

    // Smoothstep for lattice interpolation
    const sx1 = fx1 * fx1 * (3 - 2 * fx1)
    const sz1 = fz1 * fz1 * (3 - 2 * fz1)

    // Hash unsigned 32-bit integer from 2D lattice coords, mapped to [-1, 1]
    const _h = (ix, iz) => {
        let v = (Math.imul(ix + 3251, 2654435761) ^ Math.imul(iz + 1019, 2246822519)) >>> 0
        v = (Math.imul(v ^ (v >>> 16), 2246822519)) >>> 0
        v = (Math.imul(v ^ (v >>> 13), 3266489917)) >>> 0
        v = (v ^ (v >>> 16)) >>> 0
        return (v / 0xFFFFFFFF) * 2 - 1  // [-1, 1]
    }

    const v1_00 = _h(gx1,     gz1)
    const v1_10 = _h(gx1 + 1, gz1)
    const v1_01 = _h(gx1,     gz1 + 1)
    const v1_11 = _h(gx1 + 1, gz1 + 1)
    const noise1 = v1_00 * (1-sx1) * (1-sz1)
                 + v1_10 *    sx1  * (1-sz1)
                 + v1_01 * (1-sx1) *    sz1
                 + v1_11 *    sx1  *    sz1

    // Octave 2 (cracks): 2× frequency, 0.4× amplitude
    const freq2 = frequency * 2.0
    const gx2 = Math.floor(wx * freq2)
    const gz2 = Math.floor(wz * freq2)
    const fx2 = (wx * freq2) - gx2
    const fz2 = (wz * freq2) - gz2
    const sx2 = fx2 * fx2 * (3 - 2 * fx2)
    const sz2 = fz2 * fz2 * (3 - 2 * fz2)

    const v2_00 = _h(gx2 + 7919, gz2 + 6271)  // offset to decorrelate from octave 1
    const v2_10 = _h(gx2 + 7920, gz2 + 6271)
    const v2_01 = _h(gx2 + 7919, gz2 + 6272)
    const v2_11 = _h(gx2 + 7920, gz2 + 6272)
    const noise2 = v2_00 * (1-sx2) * (1-sz2)
                 + v2_10 *    sx2  * (1-sz2)
                 + v2_01 * (1-sx2) *    sz2
                 + v2_11 *    sx2  *    sz2

    // Combined noise: primary pothole + 40% crack
    const combined = noise1 + 0.4 * noise2

    return combined * amplitude * severity
}

// ── CR-02: Shared signed-curvature helper (SURF-03 / plan 09-08) ─────────────
// EXPORTED so it is NOT swept into the byte-identical Worker CARVE SYNC mirror
// (the Worker never computes curvature; sampleCarve only reads the pre-baked table).
// Called at all THREE sites with IDENTICAL arguments: ds = 2.0 m world-space.
//   (a) road.js _sampleCarveWorld
//   (b) terrain.js _buildCarveTable
//   (c) road-mesh.js sweepRibbon (via _splineCurvatureSigned thin wrapper)

/**
 * Signed curvature from two unit tangent vectors and the arc-length span between them.
 *
 * Returns Math.sign(cross) * (dtLen / ds) where:
 *   cross  = T0x*T1z - T0z*T1x  (positive = left turn / CCW)
 *   dtLen  = |T1 - T0|           (chord of tangent change)
 *   ds     = arc-length span between the two tangent sample points (metres)
 *
 * Degenerate guards (T-09-04):
 *   - Either tangent length < 1e-8 → 0 (collapsed spline)
 *   - ds < 1e-10 → 0 (zero span)
 *
 * @param {number} T0x — XZ tangent 0, X component (unit vector)
 * @param {number} T0z — XZ tangent 0, Z component (unit vector)
 * @param {number} T1x — XZ tangent 1, X component (unit vector)
 * @param {number} T1z — XZ tangent 1, Z component (unit vector)
 * @param {number} ds  — arc-length span between the two sample points (metres)
 * @returns {number} Signed curvature κ (1/m). Positive = left turn (CCW).
 *
 * Pure function — no imports, no side effects. Deterministic (D-16).
 */
export function signedCurvature(T0x, T0z, T1x, T1z, ds) {
    // Degenerate guard: zero tangent or zero span
    const l0 = Math.sqrt(T0x * T0x + T0z * T0z)
    const l1 = Math.sqrt(T1x * T1x + T1z * T1z)
    if (l0 < 1e-8 || l1 < 1e-8 || ds < 1e-10) return 0

    // Signed cross product: > 0 = left turn (bank right), < 0 = right turn (bank left)
    const cross = T0x * T1z - T0z * T1x

    // Curvature magnitude: |dT/ds| approximation (T is unit tangent)
    const dtx = T1x - T0x
    const dtz = T1z - T0z
    const dtLen = Math.sqrt(dtx * dtx + dtz * dtz)

    return Math.sign(cross) * (dtLen / ds)
}

// ── Junction polygon utilities (P9 plan 04) ──────────────────────────────────
// No imports — Worker-safe discipline maintained for future use.
// NOTE: junction footprint is main-thread only; these are NOT synced into WORKER_SOURCE.
// Used by road-mesh.js buildJunctionFootprint + road.js _detectJunctions.

/**
 * Test if a closed polygon (array of {x,z}) is convex.
 * Returns true if all cross-products of consecutive edge pairs have the same sign.
 * A polygon with < 3 points is treated as degenerate (returns false).
 *
 * Pure function — deterministic (D-16).
 * @param {Array<{x:number,z:number}>} poly — closed polygon vertices (last → first implicit)
 * @returns {boolean}
 */
export function isConvexPolygon(poly) {
    const n = poly.length
    if (n < 3) return false
    let sign = 0
    for (let i = 0; i < n; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % n]
        const c = poly[(i + 2) % n]
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)
        if (Math.abs(cross) < 1e-10) continue  // collinear edge — skip
        if (sign === 0) {
            sign = Math.sign(cross)
        } else if (Math.sign(cross) !== sign) {
            return false  // mixed sign → non-convex
        }
    }
    return sign !== 0  // degenerate (all collinear) → treated as non-convex
}

/**
 * Triangulate a convex polygon using a fan from its centroid.
 *
 * Returns a flat array of triangle vertex indices. The centroid is appended by the
 * caller at index poly.length in their position array; this function generates
 * indices referencing that slot as `cIdx = poly.length`.
 *
 * Triangle winding: (centroid, poly[i], poly[i+1]) — CCW if polygon is CCW.
 *
 * @param {Array<{x:number,z:number}>} poly — closed polygon (CCW expected)
 * @returns {number[]} Flat triangle index array; centroid index = poly.length
 *
 * Pure function — deterministic (D-16).
 */
export function triangulateConvexFan(poly) {
    const n = poly.length
    if (n < 3) return []
    const cIdx = n  // centroid will be appended by caller at this index
    const tris = []
    for (let i = 0; i < n; i++) {
        tris.push(cIdx, i, (i + 1) % n)
    }
    return tris
}

/**
 * Ear-clipping polygon triangulation. Works on simple (non-self-intersecting) polygons,
 * both convex and concave. Returns a flat array of triangle indices into the original
 * polygon array.
 *
 * Bounded at n*3 total ear-find attempts (DoS guard — T-09-06): if exceeded, falls back
 * to a simple fan from the first vertex (degenerate recovery, not correct for non-convex
 * polygons but avoids hanging on adversarial input).
 *
 * @param {Array<{x:number,z:number}>} polygon — simple polygon vertices (CCW expected)
 * @returns {number[]} Flat triangle index array (indices into the original polygon)
 *
 * Pure function — no imports (Worker-safe discipline; NOT synced to WORKER_SOURCE).
 * Deterministic (D-16).
 */
export function earClip(polygon) {
    const n = polygon.length
    if (n < 3) return []
    if (n === 3) return [0, 1, 2]

    // Mutable index list — idx[i] = original polygon vertex index for working slot i.
    const idx = Array.from({ length: n }, (_, i) => i)
    const tris = []

    // 2D point-in-triangle test (sign-of-cross-product for each edge).
    const pointInTriangle = (ax, az, bx, bz, cx, cz, px, pz) => {
        const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz)
        const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz)
        const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az)
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
        return !(hasNeg && hasPos)
    }

    // isEar(i): true if the triple (prev, cur, next) at working-index i forms a valid ear.
    const isEar = (i) => {
        const m = idx.length
        const pi = idx[(i - 1 + m) % m]
        const ci = idx[i]
        const ni = idx[(i + 1) % m]
        const ax = polygon[pi].x, az = polygon[pi].z
        const bx = polygon[ci].x, bz = polygon[ci].z
        const cx = polygon[ni].x, cz = polygon[ni].z
        // Must be CCW (positive cross) to be a convex/ear vertex.
        const cross = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx)
        if (cross <= 0) return false
        // No other polygon vertex may lie strictly inside the ear triangle.
        for (let j = 0; j < m; j++) {
            if (j === (i - 1 + m) % m || j === i || j === (i + 1) % m) continue
            const oj = idx[j]
            if (pointInTriangle(ax, az, bx, bz, cx, cz, polygon[oj].x, polygon[oj].z)) {
                return false
            }
        }
        return true
    }

    // DoS guard (T-09-06): bound total ear-find scan iterations.
    let attempts = 0
    const maxAttempts = n * 3

    while (idx.length > 3 && attempts < maxAttempts) {
        let clipped = false
        for (let i = 0; i < idx.length; i++) {
            attempts++
            if (attempts >= maxAttempts) break
            if (isEar(i)) {
                const m = idx.length
                tris.push(idx[(i - 1 + m) % m], idx[i], idx[(i + 1) % m])
                idx.splice(i, 1)
                clipped = true
                break
            }
        }
        if (!clipped) break  // no ear found (degenerate) — stop
    }

    // Emit remaining vertices (either exactly 3 left, or DoS fallback fan).
    if (idx.length === 3) {
        tris.push(idx[0], idx[1], idx[2])
    } else if (idx.length > 3) {
        // DoS guard tripped — fall back to simple fan from idx[0].
        for (let i = 1; i < idx.length - 1; i++) {
            tris.push(idx[0], idx[i], idx[i + 1])
        }
    }

    return tris
}
