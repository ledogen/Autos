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
// (roadCutSlope) out to ~28 m of depth. ONE constant, THREE consumers in road.js (they must agree
// or a wheel on the outer bank falls through the mesh):
//   _carveCrossSection (toe cap)  ·  _resolveRoadSurface (interior footprint)
//   carveReach (how far from a road the terrain carve and the adopt dirty-discs look)
export const DEEP_BANK_TOE_EXTRA = 18  // m

/**
 * Full-depth carve band OUTSIDE a pad's edge (m) — ≥ the terrain-grid cell diagonal (1 m grid →
 * 1.42 m) so no terrain triangle straddling the edge interpolates above the pad (see road.js
 * _junctionPadCarve). Ground within this band of any pad is graded flat, which is what lets a POI
 * model hang a little past its pad (FEAT-71: the broadside barn). Geometry only.
 */
export const PAD_RIM_HOLD = 1.6

/**
 * Signed distance (m, negative inside) from a pad's centre-relative point (dx, dz) to its edge.
 * The shape is a rounded rectangle, halfLen along the pad tangent (tx, tz) by halfWid across it,
 * with corner radius `cornerR` — which DEFAULTS TO halfWid, and a rounded rectangle whose corner
 * radius is its half width is exactly the old stadium (a disc when halfLen == halfWid, as camp pads
 * are). So only a pad that asks for square-ish corners changes shape, and the stadium branch keeps
 * its original arithmetic bit-for-bit. FEAT-71: POI lay-by pads ask (poiPadCornerR), so a
 * building can sit against the back edge and leave its yard on the road side; viability
 * (poi.js _footprint) already tested the full rectangle, so this costs no pads.
 */
export function padSd(q, dx, dz) {
    if (q.cornerR == null) {
        // Stadium: project onto the spine (± (halfLen − halfWid) along the tangent), subtract the
        // half width. Degenerate halfLen ≤ halfWid → a disc.
        const a = Math.max(0, q.halfLen - q.halfWid)
        let t = dx * q.tx + dz * q.tz
        t = t < -a ? -a : t > a ? a : t
        return Math.hypot(dx - q.tx * t, dz - q.tz * t) - q.halfWid
    }
    const r = q.cornerR
    const u = Math.abs(dx * q.tx + dz * q.tz) - (q.halfLen - r)
    const v = Math.abs(dz * q.tx - dx * q.tz) - (q.halfWid - r)
    return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - r
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
 * Either winding. The ear test reads convexity against the polygon's OWN orientation (signed
 * area): it used to assume CCW, and the junction pad ring is built CW (legs sorted by bearing), so
 * every REFLEX vertex passed as an ear — each concave crotch between two roads was clipped off and
 * PAVED, up to 3.6 m outside the ring physics rides (owner capture 1791128824374: a wheel dropped
 * 0.3 m through drawn asphalt onto dirt). The pad's per-triangle up-winding pass hid it.
 *
 * Bounded at n² ear-find attempts (DoS guard — T-09-06; a full clip needs ≤ n²/2, the old n*3
 * tripped on any 50-point ring): if exceeded, falls back to a simple fan from the first vertex
 * (degenerate recovery, not correct for non-convex polygons but avoids hanging).
 *
 * @param {Array<{x:number,z:number}>} polygon — simple polygon vertices (CW or CCW)
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
    // Orientation: +1 for the CCW convention the ear test is written in, −1 for a CW polygon.
    let area2 = 0
    for (let i = 0; i < n; i++) { const a = polygon[i], b = polygon[(i + 1) % n]; area2 += (b.x - a.x) * (b.z + a.z) }
    const orient = area2 < 0 ? 1 : -1

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
        // Must turn the polygon's own way (convex) to be an ear vertex.
        const cross = orient * ((bx - ax) * (cz - bz) - (bz - az) * (cx - bx))
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
    const maxAttempts = n * n

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

/**
 * BUG-82: well-shaped pad fill — the junction pad's triangulation. earClip spans every triangle
 * from one side of the ring to another, and halving those slivers leaves slivers, so the averaged
 * vertex normals tilted up to 11° and streaked the asphalt. Instead:
 *   1. Even outline: ring edge i is split into `pieces(i, length)` equal steps, every original ring
 *      point kept (the mouth corners are where the pad welds exactly to the ribbon end).
 *   2. Interior: a hex lattice at spacing s, kept only inside the ring and ≥ 0.5·s clear of it.
 *   3. Delaunay (Bowyer–Watson: insert each point, delete the triangles whose circumcircle holds it,
 *      re-fan the hole from the point) — the triangulation with the largest smallest angle, so no
 *      slivers. Triangles whose centroid is outside the ring are dropped.
 *   4. Guard: every outline step must survive as a triangle edge (a Delaunay mesh can cut across a
 *      concave corner). If one doesn't, returns null and the caller falls back to earClip.
 * ponytail: naive Bowyer–Watson scans every live triangle per insertion — O(n²), ~0.1 ms at the
 * ~300 points of a pad; walk-to-containing-triangle point location if pads ever get much bigger.
 *
 * @param {Array<{x:number,z:number}>} ring — simple XZ boundary (open), either winding
 * @param {number} s — target spacing (m)
 * @param {(i:number, length:number)=>number} pieces — outline steps for ring edge i → i+1
 * @returns {{verts:Array<{x:number,z:number}>, tris:number[]}|null} tris UP-facing (signed XZ area < 0)
 *
 * Pure function — no imports. Deterministic (D-16).
 */
export function padFillDelaunay(ring, s, pieces) {
    const n = ring.length
    const xs = [], zs = []
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n]
        const k = Math.max(1, pieces(i, Math.hypot(b.x - a.x, b.z - a.z)))
        for (let j = 0; j < k; j++) { xs.push(a.x + (b.x - a.x) * j / k); zs.push(a.z + (b.z - a.z) * j / k) }
        x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); z0 = Math.min(z0, a.z); z1 = Math.max(z1, a.z)
    }
    const nOut = xs.length
    // −1 outside the ring, else the squared distance to it.
    const ringDist2 = (x, z) => {
        let inside = false, d2 = Infinity
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const a = ring[i], b = ring[j]
            if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside
            const ex = b.x - a.x, ez = b.z - a.z
            const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)))
            const dx = a.x + ex * t - x, dz = a.z + ez * t - z
            d2 = Math.min(d2, dx * dx + dz * dz)
        }
        return inside ? d2 : -1
    }
    const h = s * Math.sqrt(3) / 2, clear2 = 0.25 * s * s
    for (let row = 0, z = z0 + h / 2; z < z1; row++, z += h) {
        for (let x = x0 + (row & 1 ? s : s / 2); x < x1; x += s) {
            if (ringDist2(x, z) >= clear2) { xs.push(x); zs.push(z) }
        }
    }

    // Bowyer–Watson. Triangles stored CCW (signed area > 0) with their circumcircle.
    const N = xs.length, M = N + 3
    const R = 100 * Math.max(x1 - x0, z1 - z0, 1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    xs.push(mx, mx - 1.8 * R, mx + 1.8 * R); zs.push(mz + 2 * R, mz - R, mz - R)  // super-triangle
    const T = new Int32Array(3 * (2 * M + 4)), C = new Float64Array(3 * (2 * M + 4))
    let nT = 0
    const addTri = (a, b, c) => {
        const ax = xs[a], az = zs[a], bx = xs[b] - ax, bz = zs[b] - az, qx = xs[c] - ax, qz = zs[c] - az
        const d = 2 * (bx * qz - bz * qx), B = bx * bx + bz * bz, Q = qx * qx + qz * qz
        const ux = d ? (qz * B - bz * Q) / d : 0, uz = d ? (bx * Q - qx * B) / d : 0
        T[3 * nT] = a; T[3 * nT + 1] = d < 0 ? c : b; T[3 * nT + 2] = d < 0 ? b : c
        C[3 * nT] = ax + ux; C[3 * nT + 1] = az + uz; C[3 * nT + 2] = d ? ux * ux + uz * uz : Infinity
        nT++
    }
    addTri(N, N + 1, N + 2)
    const hole = new Map()
    for (let p = 0; p < N; p++) {
        const px = xs[p], pz = zs[p]
        hole.clear()
        for (let t = 0; t < nT;) {
            const dx = px - C[3 * t], dz = pz - C[3 * t + 1]
            if (dx * dx + dz * dz >= C[3 * t + 2]) { t++; continue }
            for (let e = 0; e < 3; e++) {
                const a = T[3 * t + e], b = T[3 * t + (e + 1) % 3], key = a < b ? a * M + b : b * M + a
                if (hole.has(key)) hole.delete(key); else hole.set(key, a)
            }
            nT--
            for (let k = 0; k < 3; k++) { T[3 * t + k] = T[3 * nT + k]; C[3 * t + k] = C[3 * nT + k] }
        }
        for (const key of hole.keys()) addTri(Math.floor(key / M), key % M, p)
    }

    const tris = [], edges = new Set()
    for (let t = 0; t < nT; t++) {
        const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]
        if (a >= N || b >= N || c >= N) continue
        if (ringDist2((xs[a] + xs[b] + xs[c]) / 3, (zs[a] + zs[b] + zs[c]) / 3) < 0) continue
        tris.push(a, c, b)                                                   // CCW → up-facing
        edges.add(a < b ? a * M + b : b * M + a).add(b < c ? b * M + c : c * M + b).add(a < c ? a * M + c : c * M + a)
    }
    for (let i = 0; i < nOut; i++) {
        const a = i, b = (i + 1) % nOut
        if (!edges.has(a < b ? a * M + b : b * M + a)) return null
    }
    const verts = new Array(N)
    for (let v = 0; v < N; v++) verts[v] = { x: xs[v], z: zs[v] }
    return { verts, tris }
}
