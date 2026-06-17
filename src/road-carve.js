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

/**
 * arcFilletWaypoints — constructive minimum-turn-radius pass.
 *
 * Works on the SPARSE A* waypoints (before CR densification). At each interior
 * waypoint B between A and C, the DEFLECTION ANGLE φ (exterior turn angle) is
 * computed. The implied minimum spline radius near B is approximately:
 *   r_implied ≈ min(|AB|, |BC|) / (2 × |sin(φ/2)|)
 * (This is the inscribed-circle radius for a sharp corner — the CR spline
 * will produce at least this radius near B.)
 *
 * If r_implied < minRadius: replace B with a proper circular arc of radius = minRadius
 * tangent to both legs (constructive, NOT relaxation). This is the MINIMAL fix:
 * straights and already-OK geometry pass through untouched (PROPERTY B).
 *
 * Algorithm per interior waypoint B between A and C:
 *   1. Compute XZ leg directions dAB (A→B) and dBC (B→C).
 *   2. Deflection angle φ = π − acos(dot(dAB, dBC)).
 *   3. Implied spline radius r = min(|AB|,|BC|) / (2 × sin(φ/2)), or Infinity if φ < 1e-4.
 *   4. If r ≥ minRadius: pass through unchanged.
 *   5. Tangent length t = minRadius × tan(φ/2). If t > 0.9 × min leg: skip (degenerate).
 *   6. Trim points T1 = B − t×dAB, T2 = B + t×dBC (XZ); Y linearly blended.
 *   7. Arc center at T1 + minRadius × inward_normal_to_dAB.
 *   8. Insert N = max(4, ceil(arcLen/2)) arc points from T1 to T2 (inclusive), then
 *      emit T2 as the leg-resume point so the downstream leg BC starts correctly.
 *
 * Pure function of (points, minRadius) — deterministic (D-16).
 * NOT synced to WORKER_SOURCE (main-thread centerline geometry only).
 *
 * @param {Array<{x:number,y:number,z:number}>} points — sparse A* waypoints (≥3). Not mutated.
 * @param {number} minRadius — fold-safe floor (m); typically halfWidth + clearance ≈ 5.6 m.
 * @returns {Array<{x:number,y:number,z:number}>} new waypoint array with sharp corners replaced by arcs.
 */
export function arcFilletWaypoints(points, minRadius) {
    const n = points.length
    if (n < 3 || !(minRadius > 0)) return points.map(p => ({ x: p.x, y: p.y, z: p.z }))

    const out = [{ x: points[0].x, y: points[0].y, z: points[0].z }]

    // Track whether the previous iteration pushed a T2 point (ending an arc).
    // If so, the current waypoint B is already "pre-empted" by that T2, and
    // we should NOT push B separately — instead, start the next leg from T2.
    let prevT2 = null   // { x, y, z } of the T2 trim point from the last arc, or null

    for (let i = 1; i < n - 1; i++) {
        const rawA = prevT2 ?? points[i - 1]  // effective incoming point (post-trim from last arc)
        const B = points[i]
        const C = points[i + 1]

        // Leg vectors (XZ only for direction; Y for height blending)
        const abX = B.x - rawA.x, abZ = B.z - rawA.z
        const bcX = C.x - B.x,   bcZ = C.z - B.z
        const lenAB = Math.sqrt(abX*abX + abZ*abZ)
        const lenBC = Math.sqrt(bcX*bcX + bcZ*bcZ)

        if (lenAB < 1e-6 || lenBC < 1e-6) {
            // Degenerate leg — emit B and clear prevT2
            out.push({ x: B.x, y: B.y, z: B.z })
            prevT2 = null
            continue
        }

        // Unit leg directions
        const dABx = abX / lenAB, dABz = abZ / lenAB
        const dBCx = bcX / lenBC, dBCz = bcZ / lenBC

        // Deflection angle φ = exterior turn angle
        const dot = dABx * dBCx + dABz * dBCz
        const interiorAngle = Math.acos(Math.max(-1, Math.min(1, dot)))
        const phi = Math.PI - interiorAngle

        if (phi < 1e-4) {
            // Nearly straight — no fillet
            out.push({ x: B.x, y: B.y, z: B.z })
            prevT2 = null
            continue
        }

        // Implied minimum spline radius near B
        const sinHalfPhi = Math.sin(phi / 2)
        const rImplied = sinHalfPhi < 1e-6 ? Infinity : Math.min(lenAB, lenBC) / (2 * sinHalfPhi)

        if (rImplied >= minRadius) {
            // Already OK — pass through unchanged (PROPERTY B)
            out.push({ x: B.x, y: B.y, z: B.z })
            prevT2 = null
            continue
        }

        // Tangent length for the arc
        const tanHalfPhi = Math.tan(phi / 2)
        const t = minRadius * tanHalfPhi

        if (t > lenAB * 0.9 || t > lenBC * 0.9) {
            // Arc won't fit — emit B unchanged (degenerate; can't fillet)
            out.push({ x: B.x, y: B.y, z: B.z })
            prevT2 = null
            continue
        }

        // Trim points in XZ; Y linearly interpolated
        const T1x = B.x - t * dABx, T1z = B.z - t * dABz
        const T2x = B.x + t * dBCx, T2z = B.z + t * dBCz
        const T1y = rawA.y + (lenAB - t) / lenAB * (B.y - rawA.y)
        const T2y = B.y + t / lenBC * (C.y - B.y)

        // Arc center: minRadius × inward normal from T1 (perpendicular to dAB, pointing toward turn center)
        const cross = dABx * dBCz - dABz * dBCx  // + = CCW/left turn
        let nx, nz
        if (cross >= 0) { nx = -dABz; nz = dABx  }   // left turn: center to the left
        else             { nx =  dABz; nz = -dABx }   // right turn: center to the right

        const Cx = T1x + minRadius * nx
        const Cz = T1z + minRadius * nz

        // Arc angles
        const aT1 = Math.atan2(T1z - Cz, T1x - Cx)
        const aT2 = Math.atan2(T2z - Cz, T2x - Cx)

        // Sweep direction (same as turn direction)
        let sweepAngle = aT2 - aT1
        if (cross >= 0) { if (sweepAngle < 0) sweepAngle += 2 * Math.PI }  // CCW: keep positive
        else            { if (sweepAngle > 0) sweepAngle -= 2 * Math.PI }  // CW: keep negative

        // Insert arc points (including T1 and T2)
        const arcLen = minRadius * Math.abs(sweepAngle)
        const N = Math.max(4, Math.ceil(arcLen / 2.0))
        for (let k = 0; k <= N; k++) {
            const frac = k / N
            const angle = aT1 + frac * sweepAngle
            out.push({
                x: Cx + minRadius * Math.cos(angle),
                y: T1y + frac * (T2y - T1y),
                z: Cz + minRadius * Math.sin(angle),
            })
        }

        // Record T2 so the next iteration uses it as the incoming point (instead of B)
        prevT2 = { x: T2x, y: T2y, z: T2z }
    }

    // Push the last endpoint
    const last = points[n - 1]
    out.push({ x: last.x, y: last.y, z: last.z })

    return out
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

// ──────────────────────────────────────────────────────────────────────────────
//  NOT part of CARVE SYNC. The functions below are road CENTERLINE geometry used
//  only on the main thread by src/road.js (_streamNetwork). The Worker never runs
//  them — do NOT copy them into terrain.js WORKER_SOURCE / terrain-worker.js.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Circumradius of triangle ABC in the XZ plane (Y ignored). Returns Infinity when
 * the three points are (nearly) collinear — a straight run has infinite turn radius.
 * Pure/deterministic.
 */
export function circumradiusXZ(ax, az, bx, bz, cx, cz) {
    const a = Math.hypot(cx - bx, cz - bz)   // |BC|
    const b = Math.hypot(ax - cx, az - cz)   // |CA|
    const c = Math.hypot(bx - ax, bz - az)   // |AB|
    // 2*Area via the cross product of AB and AC.
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax))
    if (area2 < 1e-9) return Infinity        // collinear → straight → infinite radius
    return (a * b * c) / (2 * area2)         // R = abc / (4·Area) = abc / (2·area2)
}

/**
 * filletMinRadius — D0. Enforce a minimum turn radius on a centerline polyline so a
 * ribbon swept at ±halfWidth (halfWidth < minRadius) can never fold its inner edge.
 *
 * The input is a DENSELY-sampled spline (CatmullRom). A per-vertex corner fillet is
 * the wrong tool here: at a hairpin the tight samples have local radius far below
 * minRadius and the tangent (minRadius·tan(φ/2)) cannot fit between adjacent dense
 * samples, so a corner fillet bails and leaves the apex sharp → the ribbon folds.
 *
 * Instead we iteratively RELAX (straighten) every vertex whose local turn radius is
 * below minRadius toward the midpoint of its neighbours. Straightening monotonically
 * increases the local circumradius, so the loop converges to a polyline whose every
 * interior turn radius is ≥ minRadius — densely-sampled tight turns become smooth
 * arcs of radius ≈ minRadius (hairpins round into U-turns whose arms separate by
 * ≥ 2·minRadius). Endpoints are pinned, so run connectivity is preserved. Only tight
 * vertices move — straights and gentle curves are untouched. Deterministic (D-16).
 *
 * @param {Array<{x:number,y:number,z:number}>} points — input polyline (≥3). Not mutated.
 * @param {number} minRadius — target minimum turn radius (m), measured in XZ.
 * @param {object} [opts]
 * @param {number} [opts.maxIters=300] — relaxation iteration cap.
 * @param {number} [opts.lambda=0.5]   — relaxation step fraction (0..1).
 * @param {number} [opts.tol=0.02]     — radius tolerance fraction (accept ≥ minRadius·(1−tol)).
 * @returns {Array<{x:number,y:number,z:number}>} new polyline; interior turn radius ≥ minRadius·(1−tol).
 */
export function filletMinRadius(points, minRadius, opts = {}) {
    const n = points.length
    if (n < 3 || !(minRadius > 0)) return points.map(p => ({ x: p.x, y: p.y, z: p.z }))
    const maxIters = opts.maxIters ?? 300
    const lambda   = opts.lambda   ?? 0.5
    const tol      = opts.tol      ?? 0.02
    const target   = minRadius * (1 - tol)

    const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n)
    for (let i = 0; i < n; i++) { px[i] = points[i].x; py[i] = points[i].y; pz[i] = points[i].z }

    const dx = new Float64Array(n), dy = new Float64Array(n), dz = new Float64Array(n)
    for (let iter = 0; iter < maxIters; iter++) {
        let anyTight = false
        dx.fill(0); dy.fill(0); dz.fill(0)
        // Jacobi sweep: compute all displacements from the CURRENT state, then apply once
        // (so the pass is order-independent → deterministic regardless of array direction).
        for (let i = 1; i < n - 1; i++) {
            const r = circumradiusXZ(px[i - 1], pz[i - 1], px[i], pz[i], px[i + 1], pz[i + 1])
            if (r >= target) continue
            anyTight = true
            // Step toward the neighbour midpoint; tighter turns take a larger step (capped by lambda).
            const deficit = Math.min(1, (target - r) / target)   // 0..1
            const w  = lambda * deficit
            const mx = 0.5 * (px[i - 1] + px[i + 1])
            const my = 0.5 * (py[i - 1] + py[i + 1])
            const mz = 0.5 * (pz[i - 1] + pz[i + 1])
            dx[i] = w * (mx - px[i])
            dy[i] = w * (my - py[i])
            dz[i] = w * (mz - pz[i])
        }
        if (!anyTight) break
        for (let i = 1; i < n - 1; i++) { px[i] += dx[i]; py[i] += dy[i]; pz[i] += dz[i] }
    }

    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = { x: px[i], y: py[i], z: pz[i] }
    return out
}

/**
 * arcPrimitiveConnect — hybrid-A* router between two anchors using ARC MOTION PRIMITIVES.
 *
 * Replaces the 8-grid cell A* whose 45°-per-cell turns produced sub-floor corners that the
 * post-hoc fillet/cleanup stack could not repair (folds). Here every search expansion is a
 * fixed-length ARC at a curvature in {0 (straight), ±1/gentleR, ±1/hardR}. Because the hardest
 * primitive has radius hardR and consecutive primitives are G1-continuous (each starts at the
 * previous arc's end heading), the emitted centerline is min-turn-radius-VALID BY CONSTRUCTION:
 * dense XZ radius ≥ hardR everywhere except short endpoint stubs. No fillet/relaxation needed.
 *
 * State = (position-cell, heading-bin). Cost mirrors _protoEdgeCost semantics:
 *   wDist·L + wGrade·grade² + wOver·max(0,grade−maxGrade) + wAlt·height + wCurv·|κ|·L
 * The wCurv·|κ|·L term makes the straight primitive (κ=0) cheapest → long near-straights on
 * gentle ground; the grade terms make tight switchbacks worth their curvature cost up a steep
 * pass → variety is TERRAIN-DRIVEN and deterministic (no Math.random). Heuristic = wDist·‖·→b‖.
 *
 * Pure/deterministic (D-16): lattice search, stable heap tie-break, no random/Date/session state.
 * Window-invariant by construction when called per anchor-pair (independent of stream center).
 * NOT part of CARVE SYNC — main-thread centerline geometry only.
 *
 * @param {number} ax @param {number} az — start anchor (XZ)
 * @param {number} bx @param {number} bz — goal anchor (XZ)
 * @param {(x:number,z:number)=>number} heightFn — terrain height sampler (coarseHeight)
 * @param {object} [opts] — hardR, gentleR, stepLen, hbins, cell, margin, emitDs, maxNodes + cost weights
 * @returns {Array<{x:number,y:number,z:number}>} dense valid-radius centerline from a to b (y = heightFn)
 */
export function arcPrimitiveConnect(ax, az, bx, bz, heightFn, opts = {}) {
    const hardR    = opts.hardR    ?? 8       // m — tightest turn (hardest primitive); ≥ geometric floor
    const gentleR  = opts.gentleR  ?? 30      // m — gentle turn radius
    const stepLen  = opts.stepLen  ?? 8       // m — arc length per search primitive
    const hbins    = opts.hbins    ?? 32      // heading discretization (11.25°)
    const cell     = opts.cell     ?? 8       // m — position lattice cell
    const margin   = opts.margin   ?? 200     // m — detour room around the a–b bbox (wrap a peak)
    const emitDs   = opts.emitDs   ?? 4       // m — arc emission spacing (≥ this keeps 3-pt circumradius on the floor circle; finer just multiplies downstream slice/ribbon/carve cost)
    const maxNodes = opts.maxNodes ?? 200000  // expansion cap (never hang)
    const wDist    = opts.wDist    ?? 1
    const wAlt     = opts.wAlt     ?? 0.85
    const wGrade   = opts.wGrade   ?? 400
    const wOver    = opts.wOver    ?? 8000
    const maxGrade = opts.maxGrade ?? 0.15
    const wCurv    = opts.wCurv    ?? 120      // curvature penalty (replaces wTurn) → straight-biased
    const wHeur    = opts.wHeur    ?? 1.5       // weighted-A* heuristic inflation (>1 = greedier, far
                                               // fewer node expansions → faster streaming; paths stay near-optimal)

    const minX = Math.min(ax, bx) - margin, maxX = Math.max(ax, bx) + margin
    const minZ = Math.min(az, bz) - margin, maxZ = Math.max(az, bz) + margin
    const NX = Math.max(2, Math.ceil((maxX - minX) / cell)) + 1
    const NZ = Math.max(2, Math.ceil((maxZ - minZ) / cell)) + 1
    const TAU = Math.PI * 2
    const binOf = (th) => ((Math.round(th / TAU * hbins) % hbins) + hbins) % hbins
    const cxOf  = (x) => Math.max(0, Math.min(NX - 1, Math.round((x - minX) / cell)))
    const czOf  = (z) => Math.max(0, Math.min(NZ - 1, Math.round((z - minZ) / cell)))
    const cellOf = (x, z) => czOf(z) * NX + cxOf(x)
    const stateOf = (x, z, th) => cellOf(x, z) * hbins + binOf(th)

    // PERF: cache terrain height per lattice cell (compute heightFn once per cell, not per node
    // expansion). _coarseHeight is multi-octave ridged noise — recomputing it for every one of the
    // hundreds of thousands of node expansions was the streaming-stutter cost. Search cost uses the
    // cell-center height (same approach as the old grid A*); emitted point Y stays exact (heightFn).
    const hH = new Float64Array(NX * NZ), hSeen = new Uint8Array(NX * NZ)
    const hAt = (x, z) => {
        const ci = cellOf(x, z)
        if (!hSeen[ci]) { hH[ci] = heightFn(minX + (ci % NX) * cell, minZ + ((ci / NX) | 0) * cell); hSeen[ci] = 1 }
        return hH[ci]
    }

    const kappas = [0, 1 / gentleR, -1 / gentleR, 1 / hardR, -1 / hardR]

    const arcEnd = (x, z, th, k, L) => {
        if (Math.abs(k) < 1e-12) return [x + L * Math.cos(th), z + L * Math.sin(th), th]
        const th2 = th + k * L
        return [x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k, th2]
    }
    // Dense points along an arc (excludes the start point, includes the end) → push [x,z] to `out`.
    const arcPoints = (x, z, th, k, L, out) => {
        const n = Math.max(1, Math.ceil(L / emitDs))
        for (let i = 1; i <= n; i++) {
            const s = L * i / n
            if (Math.abs(k) < 1e-12) { out.push([x + s * Math.cos(th), z + s * Math.sin(th)]); continue }
            const th2 = th + k * s
            out.push([x + (Math.sin(th2) - Math.sin(th)) / k, z - (Math.cos(th2) - Math.cos(th)) / k])
        }
    }

    const node = new Map()   // state → { g, x, z, th, parent, sh }
    const heap = []          // [priority, counter, state] binary min-heap (counter = stable tie-break)
    const hpush = (pri, cnt, st) => {
        heap.push([pri, cnt, st]); let i = heap.length - 1
        while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
    }
    const hpop = () => {
        const top = heap[0], last = heap.pop()
        if (heap.length) {
            heap[0] = last; let i = 0; const n = heap.length
            for (;;) { let l = 2 * i + 1, r = 2 * i + 2, m = i
                if (l < n && heap[l][0] < heap[m][0]) m = l
                if (r < n && heap[r][0] < heap[m][0]) m = r
                if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m }
        }
        return top
    }

    const heur = (x, z) => wHeur * wDist * Math.hypot(bx - x, bz - z)
    const th0 = Math.atan2(bz - az, bx - ax)
    const startState = stateOf(ax, az, th0)
    node.set(startState, { g: 0, x: ax, z: az, th: th0, parent: -1, sh: hAt(ax, az) })
    let counter = 0
    hpush(heur(ax, az), counter++, startState)

    const goalR = Math.max(cell, stepLen)
    const closed = new Set()
    let goalState = -1, expanded = 0
    while (heap.length && expanded < maxNodes) {
        const [, , sid] = hpop()
        if (closed.has(sid)) continue
        closed.add(sid)
        const cur = node.get(sid)
        if (Math.hypot(bx - cur.x, bz - cur.z) <= goalR) { goalState = sid; break }
        expanded++
        for (let ki = 0; ki < kappas.length; ki++) {
            const k = kappas[ki]
            const [nx, nz, nth] = arcEnd(cur.x, cur.z, cur.th, k, stepLen)
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue
            const nst = stateOf(nx, nz, nth)
            if (closed.has(nst)) continue
            const nH = hAt(nx, nz)
            const grade = Math.abs(nH - cur.sh) / stepLen
            const stepCost = wDist * stepLen + wGrade * grade * grade + wOver * Math.max(0, grade - maxGrade)
                           + wAlt * nH + wCurv * Math.abs(k) * stepLen
            const ng = cur.g + stepCost
            const ex = node.get(nst)
            if (!ex || ng < ex.g) {
                node.set(nst, { g: ng, x: nx, z: nz, th: nth, parent: sid, sh: nH, k })
                hpush(ng + heur(nx, nz), counter++, nst)
            }
        }
    }

    // Fallback: if the goal was never captured (capped/blocked), end at the node closest to b.
    let endState = goalState
    if (endState === -1) {
        let best = Infinity
        for (const [st, nd] of node) { const d = Math.hypot(bx - nd.x, bz - nd.z); if (d < best) { best = d; endState = st } }
    }
    // Walk the parent chain, then re-integrate each primitive from its parent's stored pose so the
    // emitted polyline lies exactly on the valid-radius arcs (G1 across joints).
    const chain = []
    for (let st = endState; st !== -1 && st !== undefined; st = node.get(st).parent) chain.push(st)
    chain.reverse()
    const pts2d = [[ax, az]]
    for (let i = 1; i < chain.length; i++) {
        const par = node.get(chain[i - 1])
        arcPoints(par.x, par.z, par.th, node.get(chain[i]).k, stepLen, pts2d)
    }
    pts2d.push([bx, bz])   // anchor the exact goal endpoint (C0 join with the next connection)

    const out = []
    for (let i = 0; i < pts2d.length; i++) {
        const x = pts2d[i][0], z = pts2d[i][1]
        if (out.length) { const lp = out[out.length - 1]; if ((x - lp.x) ** 2 + (z - lp.z) ** 2 < 1e-6) continue }
        out.push({ x, y: heightFn(x, z), z })
    }
    return out
}
