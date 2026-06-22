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

/**
 * Defect B fix (09-31): longitudinal road-grade smoothing — low-pass a centerline
 * polyline's Y over an arc-length box window, IN PLACE. Only `.y` is touched; XZ is
 * untouched so arc min-radius (valid-by-construction) and camber (XZ curvature) are
 * unaffected. The arc-primitive router stamps each point Y = coarseHeight(x,z), so
 * without this the road RIDES raw ridged terrain (launches the truck); smoothing grades
 * it (cut-and-fill) and the terrain carve raises/cuts dirt to meet it.
 *
 * Two-pointer O(N) arc-length box mean. Reads raw Y into a buffer first so the running
 * sum is never contaminated by already-written points.
 *
 * Window-invariance: a point's smoothed Y depends only on neighbours within ±window, so
 * any point ≥window from a truncated polyline end is identical regardless of how far the
 * polyline extends past it — the caller guarantees consumed geometry sits inside that margin.
 *
 * Pure + deterministic (D-16).
 * @param {Array<{x:number,z:number,y:number}>} pts — polyline (mutated: only .y changes)
 * @param {number} window — box half-width in metres (arc-length)
 */
export function smoothGradeInPlace(pts, window) {
    const N = pts.length
    if (N < 3 || !(window > 0)) return
    const rawY   = new Float32Array(N)
    const arcPos = new Float32Array(N)
    rawY[0] = pts[0].y
    for (let i = 1; i < N; i++) {
        const dx = pts[i].x - pts[i - 1].x
        const dz = pts[i].z - pts[i - 1].z
        arcPos[i] = arcPos[i - 1] + Math.sqrt(dx * dx + dz * dz)
        rawY[i]   = pts[i].y
    }
    let lo = 0, hi = 0, sum = 0
    while (hi < N && arcPos[hi] - arcPos[0] < window) { sum += rawY[hi]; hi++ }
    for (let i = 0; i < N; i++) {
        pts[i].y = sum / (hi - lo)
        const ref = arcPos[i + 1 < N ? i + 1 : i]
        while (hi < N && arcPos[hi] - ref < window) { sum += rawY[hi]; hi++ }
        while (lo < hi && ref - arcPos[lo] >= window) { sum -= rawY[lo]; lo++ }
    }
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

// ── arcPrimitiveConnect search scratch (module-scope, reused + generation-stamped) ──────────────
// The cold network stream routes ~80 connections at once (spawn lag). Per-call Map/Set/object-per-node
// allocation + hashing + GC dominated that. These typed arrays are indexed by state id and allocated
// ONCE (grown as needed), reused across every call. A per-call generation stamp (_apcGen) marks which
// entries are live this call, so we never memset the (large) arrays between calls.
let _apcCap = 0
let _apcG, _apcGStamp, _apcClosed, _apcX, _apcZ, _apcTh, _apcSh, _apcKi, _apcParent
let _apcGen = 0
const _apcHPri = [], _apcHSt = []   // heap as parallel arrays (reset length each call; no per-node alloc)
function _apcEnsure(n) {
    if (n <= _apcCap) return
    _apcCap = n
    _apcG = new Float64Array(n); _apcGStamp = new Uint32Array(n); _apcClosed = new Uint32Array(n)
    _apcX = new Float64Array(n); _apcZ = new Float64Array(n); _apcTh = new Float64Array(n)
    _apcSh = new Float64Array(n); _apcKi = new Int8Array(n); _apcParent = new Int32Array(n)
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
    const hbins    = opts.hbins    ?? 24      // heading discretization (15°) — fewer states = faster cold route
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

    // Typed-array lattice with a generation stamp — same algorithm as a Map/Set/heap-of-arrays A*,
    // but no per-call allocation/clears (this is the cold-stream speedup). State id = cellOf*hbins+binOf.
    // Heap comparison is PRIORITY-ONLY (matches the prior implementation exactly → identical routes).
    const NSTATES = NX * NZ * hbins
    _apcEnsure(NSTATES)
    const gen = ++_apcGen
    const G = _apcG, GS = _apcGStamp, CL = _apcClosed
    const SX = _apcX, SZ = _apcZ, STh = _apcTh, SSh = _apcSh, SKi = _apcKi, SP = _apcParent
    const HP = _apcHPri, HS = _apcHSt
    HP.length = 0; HS.length = 0
    let hlen = 0
    const hpush = (pri, st) => {
        let i = hlen++
        HP[i] = pri; HS[i] = st
        while (i > 0) { const p = (i - 1) >> 1; if (HP[p] <= HP[i]) break
            const tp = HP[p], ts = HS[p]; HP[p] = HP[i]; HS[p] = HS[i]; HP[i] = tp; HS[i] = ts; i = p }
    }
    const hpopState = () => {
        const top = HS[0]; hlen--
        if (hlen > 0) {
            HP[0] = HP[hlen]; HS[0] = HS[hlen]; let i = 0
            for (;;) { let l = 2 * i + 1, r = 2 * i + 2, m = i
                if (l < hlen && HP[l] < HP[m]) m = l
                if (r < hlen && HP[r] < HP[m]) m = r
                if (m === i) break
                const tp = HP[m], ts = HS[m]; HP[m] = HP[i]; HS[m] = HS[i]; HP[i] = tp; HS[i] = ts; i = m }
        }
        return top
    }

    const heur = (x, z) => wHeur * wDist * Math.hypot(bx - x, bz - z)
    const th0 = Math.atan2(bz - az, bx - ax)
    const goalR = Math.max(cell, stepLen), goalR2 = goalR * goalR
    const startState = stateOf(ax, az, th0)
    G[startState] = 0; GS[startState] = gen
    SX[startState] = ax; SZ[startState] = az; STh[startState] = th0; SSh[startState] = hAt(ax, az)
    SP[startState] = -1; SKi[startState] = 0
    hpush(heur(ax, az), startState)

    let goalState = -1, expanded = 0
    let bestState = startState, bestD2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az)
    while (hlen > 0 && expanded < maxNodes) {
        const sid = hpopState()
        if (CL[sid] === gen) continue
        CL[sid] = gen
        const cx = SX[sid], cz = SZ[sid], cth = STh[sid], csh = SSh[sid], cg = G[sid]
        const dgx = bx - cx, dgz = bz - cz, d2 = dgx * dgx + dgz * dgz
        if (d2 < bestD2) { bestD2 = d2; bestState = sid }
        if (d2 <= goalR2) { goalState = sid; break }
        expanded++
        for (let ki = 0; ki < kappas.length; ki++) {
            const k = kappas[ki]
            const [nx, nz, nth] = arcEnd(cx, cz, cth, k, stepLen)
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue
            const nst = stateOf(nx, nz, nth)
            if (CL[nst] === gen) continue
            const nH = hAt(nx, nz)
            const grade = Math.abs(nH - csh) / stepLen
            const ng = cg + wDist * stepLen + wGrade * grade * grade + wOver * Math.max(0, grade - maxGrade)
                     + wAlt * nH + wCurv * Math.abs(k) * stepLen
            if (GS[nst] !== gen || ng < G[nst]) {
                G[nst] = ng; GS[nst] = gen
                SX[nst] = nx; SZ[nst] = nz; STh[nst] = nth; SSh[nst] = nH; SP[nst] = sid; SKi[nst] = ki
                hpush(ng + heur(nx, nz), nst)
            }
        }
    }

    // Fallback: if the goal was never captured (capped/blocked), end at the closest expanded node.
    const endState = goalState !== -1 ? goalState : bestState
    // Walk the parent chain, then re-integrate each primitive from its parent's stored pose so the
    // emitted polyline lies exactly on the valid-radius arcs (G1 across joints).
    const chain = []
    for (let st = endState; st !== -1; st = SP[st]) chain.push(st)
    chain.reverse()
    const pts2d = [[ax, az]]
    for (let i = 1; i < chain.length; i++) {
        const par = chain[i - 1]
        arcPoints(SX[par], SZ[par], STh[par], kappas[SKi[chain[i]]], stepLen, pts2d)
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
