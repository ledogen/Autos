/**
 * src/road-carve.js — Pure no-import carve functions for AUTOS road surface.
 *
 * Main-thread only: the terrain Worker returns raw heights and the carve is a main-thread blend.
 *
 * Pure functions — deterministic (D-16). No Math.random, no Date, no session state.
 *
 * FEAT-68: this file is CARVE ONLY again. The v1 arc-lattice router that lived below the carve
 * section (arcPrimitiveConnect + its search scratch, the self-clearance repair loop, the Dubins
 * terminal/fillet helpers, the de-quantize refit — the whole ROUTE SYNC region and its verbatim
 * Worker mirror) is DELETED with the router it served, as are smoothGradeInPlace (v1 design-grade
 * smoothing; v2 solves the exact profile) and applyTunnelPassInPlace (FEAT-40's tunnel DETECTION
 * pass; a bore is now a priced state the router chose). Routing lives in src/corridor-router.js,
 * which the Worker IMPORTS — there is no route mirror to keep in sync any more.
 */

// ── FEAT-40: deep-bank toe extension ─────────────────────────────────────────────────────
// How far the fill/cut toe cap may stretch BEYOND carveHalfWidth + roadMaxEmbankmentToe when
// the bank is deep. Normal road earthwork stays under the grade-deviation cap, so its toe
// never hits the base cap and nothing changes; the tunnel pass's summit cuts run 15–25 m deep,
// and squeezing that wall into the 10 m base apron made a near-vertical face that staircased
// on the terrain grid (QUAL-06 residual). The extension lets a deep cut keep its design slope
// (roadCutSlope) out to ~28 m of depth. ONE constant, THREE synced consumers (they must agree
// or a wheel on the outer bank falls through the mesh):
//   road.js _carveCrossSection  (toe cap)  ·  road.js _resolveRoadSurface (interior footprint)
//   terrain.js _buildCarveTable (maxExt query bound)
// NOT worker-mirrored (the carve table is main-thread; the Worker stores raw heights).
export const DEEP_BANK_TOE_EXTRA = 18  // m

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

// ── SURF-06: Pothole / crack micro-noise (D-03) ───────────────────────────────
// Main-thread only — the carve table gradeY_preamp is built on the main thread
// (the Worker stores RAW heights; it never applies carve). This function is called at
// the THREE sites where on-ribbon gradeY is produced on the main thread:
//   (a) road.js _sampleCarveWorld     (physics — analyticHeight)
//   (b) terrain.js _carveTableGen     (the terrain mesh carve — via the shared road resolver)
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
// Called with IDENTICAL arguments at every site: ds = 2.0 m world-space.

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
// NOTE: junction footprint is main-thread only.
// Used by road-mesh.js buildJunctionFootprint.
// QUAL-27: isConvexPolygon + triangulateConvexFan deleted — earClip handles convex rings too and
// was the only one anything called.

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
 * Pure function — no imports.
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
