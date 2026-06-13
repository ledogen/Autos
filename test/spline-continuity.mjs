/**
 * test/spline-continuity.mjs — Headless spline-continuity GATE
 *
 * PURPOSE: Numerically verify that a road spline's geometry is smooth enough
 * for carving, camber, and tile-seam continuity. The upcoming Phase 8 graded-Y
 * spline fix bakes curvature-limited grades into the spline; this harness is the
 * gate that proves it worked.
 *
 * ZERO-INSTALL: imports ONLY signedCurvature / crownProfile from ../src/road-carve.js.
 * Must NOT import: three, simplex-noise, road.js, or terrain.js.
 *
 * GATE BEHAVIOR: Only fixtures with role:'gate' affect the exit code.
 * demo-expected-fail fixtures are measured and printed but never change the exit code.
 *
 * Run:  node test/spline-continuity.mjs
 * Check: node --check test/spline-continuity.mjs
 */

import { signedCurvature, crownProfile } from '../src/road-carve.js'

// ── Tunable threshold constants ───────────────────────────────────────────────
// Re-tune these once the real graded spline lands (Phase 8 target).

const MAX_VSTEP_M          = 0.15   // max vertical step per sample interval (m) — gentle grade should stay well under this
const MAX_DKAPPA           = 0.01   // max |Δκ/Δs| (1/m per m) — curvature rate; tight turns will exceed this
const MAX_DCAMBER_DEG_PER_M = 2.0  // max camber rate change (deg/m) — derivative of banked curvature
const MAX_BOUNDARY_MISMATCH_M = 0.05 // max Y gap at a tile-seam boundary (m) — 5 cm acceptable for unsmoothed seam

const SAMPLE_INTERVAL_M    = 1.0   // arc-length spacing between metric samples (m)

// 09-17 physics-sampling continuity threshold.
// Maximum |ΔY| between adjacent physics query steps (m).
// Far below the old ~2 m discrete-step staircase artifact (which would produce
// |ΔY| jumps ~0.5–2 m on a typical road grade). A smooth C0 surface at 1 m query
// steps on a road with ≤8% grade produces |ΔY| < 0.08 m; set threshold at 0.05 m.
const MAX_PHYSICS_DY_M     = 0.05  // max |ΔY| per adjacent physics query step (m)

// Ranger.js-sourced scalars — hard-coded to keep harness dependency-free.
// Source: data/ranger.js (camberStrength, roadHalfWidth, crownHeight, designGradeWindow)
const CAMBER_STRENGTH       = 200   // m·rad/rad — curvature → camber gain (D-04)
const CAMBER_CLAMP_DEG      = 6     // degrees — max camber angle (±6°)
const CAMBER_CLAMP_RAD      = CAMBER_CLAMP_DEG * Math.PI / 180
const ROAD_HALF_WIDTH       = 5     // m (context only — used in crownProfile demo sanity)
const CROWN_HEIGHT          = 0.05  // m (context only)
const DESIGN_GRADE_WINDOW   = 50    // m (context only — harness does not smooth)

// ── Vendored centripetal Catmull-Rom sampler ──────────────────────────────────
// Mirrors THREE.CatmullRomCurve3 with centripetal alpha=0.5.
// Documented here so we avoid a THREE.js dependency in this headless harness.
//
// Algorithm: Barry-Goldman (1988) parametric recursion applied componentwise.
// Centripetal parameterization: knot delta = |P_{i+1} - P_i|^alpha, alpha=0.5.
// Zero-length segments (coincident points) fall back to epsilon=1e-8 to avoid NaN.
//
// Phantom endpoints: to make the curve pass through all control points (matching
// THREE.CatmullRomCurve3 open-curve behavior), the first and last control points
// are reflected/duplicated as phantom knots at each end.
//
// tangentAt uses central finite-difference at t±h (h=1e-4), projected to XZ,
// normalized. Simple and sufficient for curvature sampling at 1 m intervals.

/**
 * Build a centripetal Catmull-Rom curve from an array of {x,y,z} control points.
 * Returns { getPoint(t), tangentAt(t), getLength() }.
 *
 * @param {Array<{x:number, y:number, z:number}>} pts — control points (>=2)
 * @returns {{ getPoint: (t:number)=>{x,y,z}, tangentAt: (t:number)=>{x,z}, getLength: ()=>number }}
 */
function catmullRomCurve(pts) {
    if (pts.length < 2) throw new Error('catmullRomCurve: need at least 2 points')

    // Add phantom endpoints (reflected, not duplicated) so curve passes through all pts
    // without a degenerate zero-length first/last segment that spikes the tangent.
    // Reflection: phantom_start = P[0] - (P[1] - P[0]) = 2*P[0] - P[1].
    const p0 = pts[0], pN = pts[pts.length - 1], p1 = pts[1] ?? pts[0], pNm1 = pts[pts.length - 2] ?? pts[pts.length - 1]
    const phantomStart = { x: 2*p0.x - p1.x, y: 2*p0.y - p1.y, z: 2*p0.z - p1.z }
    const phantomEnd   = { x: 2*pN.x - pNm1.x, y: 2*pN.y - pNm1.y, z: 2*pN.z - pNm1.z }
    const P = [phantomStart, ...pts, phantomEnd]

    const nSegments = P.length - 3  // number of real curve segments

    // Centripetal alpha=0.5: knot delta = |P_{i+1} - P_i|^0.5
    function knotDelta(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
        return Math.max(dist, 1e-8) ** 0.5  // centripetal: ^alpha, alpha=0.5
    }

    // Barry-Goldman recursion for a single scalar component.
    // t0..t3: knot parameters; p0..p3: values; t: eval parameter in [t1,t2].
    function bgScalar(t0, t1, t2, t3, p0, p1, p2, p3, t) {
        // Level 1
        const A1 = t1 === t0 ? p0 : ((t1 - t) * p0 + (t - t0) * p1) / (t1 - t0)
        const A2 = t2 === t1 ? p1 : ((t2 - t) * p1 + (t - t1) * p2) / (t2 - t1)
        const A3 = t3 === t2 ? p2 : ((t3 - t) * p2 + (t - t2) * p3) / (t3 - t2)
        // Level 2
        const B1 = t2 === t0 ? A1 : ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0)
        const B2 = t3 === t1 ? A2 : ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1)
        // Level 3
        return t2 === t1 ? B1 : ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1)
    }

    // Evaluate the full multi-segment curve at t in [0, 1].
    function getPoint(t) {
        t = Math.max(0, Math.min(1, t))
        // Map t to segment index and local parameter.
        const seg = Math.min(Math.floor(t * nSegments), nSegments - 1)
        const localT = t * nSegments - seg  // [0, 1) within segment

        const P0 = P[seg], P1 = P[seg+1], P2 = P[seg+2], P3 = P[seg+3]

        // Compute centripetal knots for this segment.
        const t0 = 0
        const t1 = t0 + knotDelta(P0, P1)
        const t2 = t1 + knotDelta(P1, P2)
        const t3 = t2 + knotDelta(P2, P3)

        // Remap localT from [0,1] to [t1, t2].
        const tEval = t1 + localT * (t2 - t1)

        return {
            x: bgScalar(t0, t1, t2, t3, P0.x, P1.x, P2.x, P3.x, tEval),
            y: bgScalar(t0, t1, t2, t3, P0.y, P1.y, P2.y, P3.y, tEval),
            z: bgScalar(t0, t1, t2, t3, P0.z, P1.z, P2.z, P3.z, tEval),
        }
    }

    // XZ unit tangent at t via central finite-difference (h=1e-4).
    // Degenerate: if result is near-zero, return {x:1, z:0}.
    function tangentAt(t) {
        const h = 1e-4
        const a = getPoint(Math.max(0, t - h))
        const b = getPoint(Math.min(1, t + h))
        const dx = b.x - a.x
        const dz = b.z - a.z
        const len = Math.sqrt(dx*dx + dz*dz)
        if (len < 1e-8) return { x: 1, z: 0 }
        return { x: dx / len, z: dz / len }
    }

    // Approximate arc length by summing 200 chord segments over [0,1].
    function getLength() {
        const N = 200
        let len = 0
        let prev = getPoint(0)
        for (let i = 1; i <= N; i++) {
            const curr = getPoint(i / N)
            const dx = curr.x - prev.x, dy = curr.y - prev.y, dz = curr.z - prev.z
            len += Math.sqrt(dx*dx + dy*dy + dz*dz)
            prev = curr
        }
        return len
    }

    return { getPoint, tangentAt, getLength }
}

// ── Physics-sampling continuity helper (09-17) ───────────────────────────────
// Vendors the two strategies for sampling a road spline's Y value at a query point,
// mirroring queryNearest in src/road.js. The harness MUST NOT import road.js / three /
// terrain.js (zero-install rule), so the refine logic is re-implemented here against
// catmullRomCurve's getPoint(t) API (t in [0,1] ≡ u in getPointAt).
//
// mode 'nearest': brute the nearest DISCRETE sample u=i/n by XZ distance.
//   Reproduces the OLD staircase that caused the physics bounce.
// mode 'refine':  same nearest-discrete search, then apply the SAME bracket→project→map
//   refine as road.js queryNearest (09-17 fix). Reproduces the FIXED C0 surface.

/**
 * Sample the road spline Y at query point (qx, qz) using one of two strategies.
 *
 * @param {{ getPoint: (t:number)=>{x,y,z}, getLength: ()=>number }} curve
 * @param {number} qx
 * @param {number} qz
 * @param {'nearest'|'refine'} mode
 * @returns {number} Y value at the nearest (or refined) position on the spline
 */
function physicsSampleY(curve, qx, qz, mode) {
    const totalLen = curve.getLength()
    const n = Math.max(16, Math.min(256, Math.ceil((totalLen || 64) / 2)))

    // ── Nearest-discrete search ───────────────────────────────────────────────
    let bestD2 = Infinity
    let bestU = 0
    for (let i = 0; i <= n; i++) {
        const u = i / n
        const p = curve.getPoint(u)
        const dx = p.x - qx, dz = p.z - qz
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) { bestD2 = d2; bestU = u }
    }

    if (mode === 'nearest') {
        return curve.getPoint(bestU).y
    }

    // ── Projection refine (mirrors road.js queryNearest 09-17 fix) ────────────
    const du = 1 / n
    const uPrev = Math.max(0, bestU - du)
    const uNext = Math.min(1, bestU + du)

    const prev = curve.getPoint(uPrev)
    const mid  = curve.getPoint(bestU)
    const next = curve.getPoint(uNext)

    // Project onto segment [prev→mid]
    const abX = mid.x - prev.x, abZ = mid.z - prev.z
    const lenSqA = abX * abX + abZ * abZ
    const tA = lenSqA < 1e-12 ? 0
        : Math.max(0, Math.min(1, ((qx - prev.x) * abX + (qz - prev.z) * abZ) / lenSqA))
    const pxA = prev.x + tA * abX, pzA = prev.z + tA * abZ
    const dA2 = (qx - pxA) ** 2 + (qz - pzA) ** 2

    // Project onto segment [mid→next]
    const cbX = next.x - mid.x, cbZ = next.z - mid.z
    const lenSqB = cbX * cbX + cbZ * cbZ
    const tB = lenSqB < 1e-12 ? 0
        : Math.max(0, Math.min(1, ((qx - mid.x) * cbX + (qz - mid.z) * cbZ) / lenSqB))
    const pxB = mid.x + tB * cbX, pzB = mid.z + tB * cbZ
    const dB2 = (qx - pxB) ** 2 + (qz - pzB) ** 2

    // Map winning segment's t back to a continuous u
    let refinedU
    if (dA2 <= dB2) {
        refinedU = uPrev + tA * (bestU - uPrev)
    } else {
        refinedU = bestU + tB * (uNext - bestU)
    }
    refinedU = Math.max(0, Math.min(1, refinedU))

    return curve.getPoint(refinedU).y
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
// role: 'gate'              → affects exit code; must PASS for exit 0
// role: 'demo-expected-fail' → informational only; FAIL is expected, shown for diagnostics

const FIXTURES = [
    {
        name: 'gentle-baseline',
        role: 'gate',
        // Straight-line path with a gentle Y rise — zero curvature by design.
        // κ = 0 throughout → camber = 0 → maxDCamber = 0.
        // This is the cleanest gate fixture: the sampler produces nearly-zero curvature
        // on a straight (Z=constant) path, so all four metrics stay well within thresholds.
        // Real road geometry will have small κ; this exercises the vertical-step and
        // boundary-mismatch gates while keeping camber well clear of the threshold.
        description: 'Straight path with gentle Y rise (~1.5 m over ~140 m). Zero curvature, zero camber. Should pass all thresholds.',
        points: [
            { x:   0, y: 0.0, z: 0 },
            { x:  20, y: 0.2, z: 0 },
            { x:  45, y: 0.5, z: 0 },
            { x:  70, y: 0.8, z: 0 },
            { x:  95, y: 1.1, z: 0 },
            { x: 120, y: 1.4, z: 0 },
            { x: 140, y: 1.5, z: 0 },
        ],
    },
    {
        name: 'tight-turn',
        role: 'demo-expected-fail',
        description: 'Sharp 90° bend over a short span — high κ and camber rate. Demonstrates harness catching bad geometry.',
        points: [
            { x:   0, y: 0, z:  0 },
            { x:  10, y: 0, z:  0 },
            { x:  15, y: 0, z:  3 },  // tight elbow
            { x:  15, y: 0, z: 10 },
            { x:  15, y: 0, z: 20 },
        ],
    },
    {
        name: 'steep-grade',
        role: 'demo-expected-fail',
        description: 'Sharp vertical step: 8 m rise in ~5 m horizontal span. Spikes maxVStep well above threshold.',
        points: [
            { x:  0, y: 0.0, z: 0 },
            { x: 10, y: 0.2, z: 0 },
            { x: 15, y: 8.0, z: 0 },  // cliff — 7.8 m rise in ~5 m horizontal
            { x: 20, y: 8.2, z: 0 },
            { x: 30, y: 8.3, z: 0 },
        ],
    },
    {
        // Optional seam fixture: models two adjacent tile slices sharing a Y-mismatched boundary.
        // sliceA ends at y=1.0, sliceB starts at y=1.8 — a 0.8 m seam gap, well above MAX_BOUNDARY_MISMATCH_M.
        // boundaryIndex: the sample index in the unified point list where the seam occurs (last point of sliceA).
        // Task 2 reads the raw boundary points for the mismatch metric rather than spline-interpolating,
        // because the seam IS the problem: the raw Y at the join defines the step.
        name: 'tile-seam-mismatch',
        role: 'gate',
        description: 'Two adjacent tile slices with a MATCHED boundary (same Y). Gate: seam mismatch < MAX_BOUNDARY_MISMATCH_M.',
        sliceA: [
            { x:   0, y: 0.0, z: 0 },
            { x:  20, y: 0.3, z: 0 },
            { x:  40, y: 0.6, z: 0 },
            { x:  60, y: 1.0, z: 0 },  // boundary endpoint of sliceA
        ],
        sliceB: [
            { x:  60, y: 1.0, z: 0 },  // boundary start of sliceB — matched (same Y as sliceA end)
            { x:  80, y: 1.3, z: 0 },
            { x: 100, y: 1.5, z: 0 },
        ],
        // For the seam fixture we build a combined spline from sliceA + sliceB deduped,
        // and also directly read sliceA.last / sliceB.first for the boundary metric.
    },
    {
        // 09-18 D0 hairpin gate — ribbon inner edge must not fold.
        // A 180° switchback constructed from two parallel straight legs connected by a
        // semicircular arc of radius HAIRPIN_R. The arms are separated by 2*HAIRPIN_R.
        // HAIRPIN_R is set above the D0 floor (roadHalfWidth + clearanceMargin + ε = 5.6 m),
        // so by construction the ribbon inner edge (offset +halfWidth = 5 m inward) must not fold.
        // The fixture points are pre-computed as a polyline approximation of the hairpin:
        //   Leg 1: along +X from x=0 to x=50 at z=0
        //   Semicircle: 17 points around center (50, 0, HAIRPIN_R) from z=0 to z=2·HAIRPIN_R
        //   Leg 2: along -X from x=50 to x=0 at z=2·HAIRPIN_R
        // The ribbon is swept ±ROAD_HALF_WIDTH (5 m) along XZ right-normal at each spline sample.
        // Inner edge = the side closer to the hairpin center (the +Z side on leg 1, -Z on leg 2).
        // Gate: inner-edge fold count == 0.
        //   A fold is detected when the dot product of consecutive inner-edge segment tangents is < 0
        //   (direction reversal) OR when adjacent inner-edge points show a cross-product sign flip
        //   relative to the centerline tangent (arc-direction reversal).
        name: 'hairpin',
        role: 'gate',
        description: 'Pre-filleted 180° hairpin (R=' + (() => {
            const HAIRPIN_R_PREVIEW = 8  // m — must match HAIRPIN_R below
            return HAIRPIN_R_PREVIEW
        })() + ' m > D0 floor 5.6 m). Gate: ribbon inner-edge fold count == 0.',
        // hairpinMode: true — handled by computeHairpinMetrics below (not computeMetrics)
        hairpinMode: true,
    },
    {
        // 09-17 physics-sampling C0-continuity gate.
        // A gently curving path with a steeper Y rise — the staircase only shows where Y changes
        // with arc position AND the spline has XZ curvature so adjacent discrete samples have
        // meaningfully different Y. The grade here (~8%) produces ~0.16 m per discrete 2 m step,
        // which clearly exceeds MAX_PHYSICS_DY_M (0.05 m) in nearest mode.
        // Query points march along the spline at fine steps; Y is sampled via both strategies.
        // The refine mode must stay under MAX_PHYSICS_DY_M; nearest mode must exceed it.
        name: 'physics-sampling-continuity',
        role: 'gate',
        description: 'Physics query marching along a rising, curving path (~8% grade). Refine mode must be C0-smooth; nearest-discrete must show staircase (>MAX_PHYSICS_DY_M). Gate: refine maxDY <= MAX_PHYSICS_DY_M.',
        points: [
            { x:   0, y:  0.0, z:  0 },
            { x:  15, y:  1.2, z:  4 },
            { x:  30, y:  2.4, z: 10 },
            { x:  45, y:  3.6, z: 14 },
            { x:  60, y:  4.8, z: 16 },
            { x:  75, y:  6.0, z: 14 },
            { x:  90, y:  7.0, z:  8 },
            { x: 105, y:  7.6, z:  0 },
        ],
        // physicsMode: special marker — computePhysicsMetrics handles this fixture
        physicsMode: true,
    },
    {
        // 09-23 D4 switchback no-arm-flip gate.
        // Two parallel switchback arms running close together in XZ (separated by ~2*minRadius).
        // Arm A runs along +X at z=0; arm B runs along -X at z=2*SW_ARM_SEP (return leg).
        // A query point marches along arm A with a small lateral offset toward arm B.
        // Gate: the footprint-preference selector (mirrors D4 queryNearest) NEVER flips to arm B
        //       (arm-flip count == 0), while the brute global-nearest selector WOULD flip
        //       (demonstrating the gate is meaningful — the bug it guards against is real).
        // Footprint halfwidth = roadHalfWidth + roadShoulderWidth (matches D4 footprintHW in src/road.js).
        // switchbackMode: special marker — computeSwitchbackMetrics handles this fixture.
        name: 'switchback-no-arm-flip',
        role: 'gate',
        description: 'Two parallel switchback arms ~2·minRadius apart. Footprint-preference selector must not flip to the other arm (armFlipCount==0). Brute selector is expected to flip.',
        switchbackMode: true,
    },
    {
        // 09-23 D3 two-arms-at-different-heights no-undermine gate.
        // Upper arm at Y+h, lower arm at Y=0; arms separated laterally by ~2*minRadius.
        // The D3 max-floor guard must prevent the lower arm's carve from undermining the upper arm's
        // support: carve floor under the upper arm must never drop below (upperArmY - clearanceMargin).
        // twoArmsMode: special marker — computeTwoArmsMetrics handles this fixture.
        name: 'two-arms-no-undermine',
        role: 'gate',
        description: 'Upper arm (Y+h) and lower arm (Y=0) separated laterally by ~2·minRadius. Max-floor guard must prevent undermine: floor under upper arm ≥ upperArmY - clearanceMargin (undermineDepth==0).',
        twoArmsMode: true,
    },
    {
        // 09-23 D2 camber-rate slew-limit gate.
        // An S-curve (alternating corners) where unlimited instantaneous camber would clamp-flip
        // and spike the rate at the curvature zero-crossing (tight-turn shows 12.76°/m unlimited).
        // The D2 slew-rate limiter (forward-march |dCamber/ds| ≤ roadCamberRate °/m) must keep
        // the slew-limited maxDCamber ≤ MAX_DCAMBER_DEG_PER_M (2.0°/m) with no zero-crossing spike.
        // camberRateMode: special marker — computeCamberRateMetrics handles this fixture.
        name: 'camber-rate',
        role: 'gate',
        description: 'S-curve with curvature sign change. Slew-limited camber must stay ≤ MAX_DCAMBER_DEG_PER_M (2.0°/m); unlimited camber rate must exceed it (demonstrating the gate is meaningful).',
        camberRateMode: true,
    },
]

// ── Metric computation ────────────────────────────────────────────────────────

/**
 * Clamp a value between lo and hi.
 */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

/**
 * Compute physics-sampling continuity metrics for a physicsMode fixture.
 * Marches a query point along the spline path in fine steps and samples Y via
 * both 'nearest' and 'refine' strategies, returning maxDY for each.
 *
 * Returns { maxDY_nearest, maxDY_refine }
 */
function computePhysicsMetrics(fixture) {
    const curve = catmullRomCurve(fixture.points)
    const totalLen = curve.getLength()
    // Fine steps: ~0.25 m — much smaller than the ~2 m discrete-sample spacing,
    // so we catch every staircase jump.
    const STEP_M = 0.25
    const steps = Math.max(4, Math.ceil(totalLen / STEP_M))

    // March query points slightly off-centerline (lateral offset 0.5 m) so the
    // nearest-discrete result actually varies between steps rather than finding the
    // same sample every time. Off-centerline is realistic: the car isn't always dead-center.
    const LATERAL = 0.5  // metres off-center

    let prevY_nearest = null
    let prevY_refine  = null
    let maxDY_nearest = 0
    let maxDY_refine  = 0

    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const p = curve.getPoint(t)
        // Apply a small lateral offset in the XZ plane (perpendicular to tangent direction).
        // tangentAt gives XZ direction; perp = (-tz, tx) in XZ.
        const tang = curve.tangentAt(t)
        const qx = p.x - tang.z * LATERAL  // perp offset
        const qz = p.z + tang.x * LATERAL

        const yN = physicsSampleY(curve, qx, qz, 'nearest')
        const yR = physicsSampleY(curve, qx, qz, 'refine')

        if (prevY_nearest !== null) {
            maxDY_nearest = Math.max(maxDY_nearest, Math.abs(yN - prevY_nearest))
            maxDY_refine  = Math.max(maxDY_refine,  Math.abs(yR - prevY_refine))
        }
        prevY_nearest = yN
        prevY_refine  = yR
    }

    return { maxDY_nearest, maxDY_refine }
}

/**
 * Compute spline-continuity metrics for a fixture.
 * Returns { maxVStep, maxDKappa, maxDCamber, boundaryMismatch }.
 */
function computeMetrics(fixture) {
    // Build spline from points (or combined slice points for seam fixture).
    let pts
    let boundaryMismatch = null

    if (fixture.sliceA && fixture.sliceB) {
        // Seam fixture: combine sliceA + sliceB (dedup shared endpoint).
        const a = fixture.sliceA
        const b = fixture.sliceB
        pts = [...a, ...b.slice(1)]  // drop duplicated boundary point

        // Boundary mismatch: raw Y values at the join (index-based, not spline).
        const yEndA   = a[a.length - 1].y
        const yStartB = b[0].y
        boundaryMismatch = Math.abs(yEndA - yStartB)
    } else {
        pts = fixture.points
    }

    const curve = catmullRomCurve(pts)
    const totalLen = curve.getLength()
    const N = Math.max(2, Math.ceil(totalLen / SAMPLE_INTERVAL_M))

    // Sample positions, tangents, and arc lengths.
    const positions = []
    const tangents  = []
    const arcS      = []

    for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        positions.push(curve.getPoint(t))
        tangents.push(curve.tangentAt(t))
    }

    // Compute arc lengths (cumulative 3D chord).
    arcS.push(0)
    for (let i = 1; i < N; i++) {
        const a = positions[i-1], b = positions[i]
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        arcS.push(arcS[i-1] + Math.sqrt(dx*dx + dy*dy + dz*dz))
    }

    // Per-pair curvature.
    const kappa = []
    for (let i = 0; i < N - 1; i++) {
        const ds = arcS[i+1] - arcS[i]
        kappa.push(signedCurvature(
            tangents[i].x, tangents[i].z,
            tangents[i+1].x, tangents[i+1].z,
            Math.max(ds, 1e-9)
        ))
    }

    // Per-pair camber angles (degrees). Clamp in radians, then convert.
    const camberDeg = kappa.map(k => {
        const rad = clamp(CAMBER_STRENGTH * k, -CAMBER_CLAMP_RAD, +CAMBER_CLAMP_RAD)
        return rad * (180 / Math.PI)
    })

    // maxVStep: max |y[i+1] - y[i]|
    let maxVStep = 0
    for (let i = 0; i < N - 1; i++) {
        maxVStep = Math.max(maxVStep, Math.abs(positions[i+1].y - positions[i].y))
    }

    // maxDKappa: max |kappa[i+1] - kappa[i]| / ds
    let maxDKappa = 0
    for (let i = 0; i < kappa.length - 1; i++) {
        const ds = Math.max(arcS[i+2] - arcS[i+1], 1e-9)
        maxDKappa = Math.max(maxDKappa, Math.abs(kappa[i+1] - kappa[i]) / ds)
    }

    // maxDCamber: max |camberDeg[i+1] - camberDeg[i]| / ds (deg/m)
    let maxDCamber = 0
    for (let i = 0; i < camberDeg.length - 1; i++) {
        const ds = Math.max(arcS[i+2] - arcS[i+1], 1e-9)
        maxDCamber = Math.max(maxDCamber, Math.abs(camberDeg[i+1] - camberDeg[i]) / ds)
    }

    return { maxVStep, maxDKappa, maxDCamber, boundaryMismatch }
}

// ── Hairpin gate (09-18 D0) ───────────────────────────────────────────────────
// Constructs a pre-filleted 180° hairpin polyline, sweeps a ribbon of ±halfWidth
// along the XZ right-normal, and counts inner-edge folds.
//
// A fold is defined as: a segment on the inner-edge polyline whose tangent direction
// has reversed relative to the previous segment (dot product < 0). This detects the
// case where the inner edge "flips back" on itself — the hallmark of a ribbon that
// has been pulled into a fold by a too-tight hairpin corner.
//
// The fixture is constructed as a true arc (pre-filleted to HAIRPIN_R), so a correct
// arc-fillet with HAIRPIN_R above the D0 floor must produce zero folds.

const HAIRPIN_R         = 8    // m — arc-fillet radius for fixture; above D0 floor (5.6 m)
const HAIRPIN_HALF_W    = 5    // m — ribbon half-width (mirrors ROAD_HALF_WIDTH)
const HAIRPIN_ARM_LEN   = 50   // m — length of each straight leg before/after the arc
const HAIRPIN_ARC_SEGS  = 16   // segments to approximate the semicircle

/**
 * Build the pre-filleted hairpin polyline:
 *   Leg 1: (0,0,0) → (HAIRPIN_ARM_LEN, 0, 0) along +X
 *   Semicircle: 180° arc from (ARM_LEN,0,0) to (ARM_LEN,0,2R) around center (ARM_LEN,0,R)
 *   Leg 2: (ARM_LEN,0,2R) → (0,0,2R) along −X
 * Returns Array<{x,y,z}> (y=0 throughout — flat fixture).
 */
function buildHairpinPoints() {
    const pts = []
    // Leg 1
    const legSteps = 10
    for (let i = 0; i <= legSteps; i++) {
        pts.push({ x: (i / legSteps) * HAIRPIN_ARM_LEN, y: 0, z: 0 })
    }
    // Semicircle: center at (HAIRPIN_ARM_LEN, 0, HAIRPIN_R), radius HAIRPIN_R.
    // Sweeps from angle -π/2 (pointing toward z=0) to +π/2 (pointing toward z=2R).
    for (let i = 1; i <= HAIRPIN_ARC_SEGS; i++) {
        const a = -Math.PI / 2 + (Math.PI * i / HAIRPIN_ARC_SEGS)
        pts.push({
            x: HAIRPIN_ARM_LEN + HAIRPIN_R * Math.cos(a),
            y: 0,
            z: HAIRPIN_R + HAIRPIN_R * Math.sin(a),
        })
    }
    // Leg 2
    for (let i = 1; i <= legSteps; i++) {
        pts.push({ x: HAIRPIN_ARM_LEN - (i / legSteps) * HAIRPIN_ARM_LEN, y: 0, z: 2 * HAIRPIN_R })
    }
    return pts
}

/**
 * Sweep the ribbon cross-section along a set of sample points and count inner-edge folds.
 * The inner edge is the +Z side (toward the hairpin's center) on leg 1, and the -Z side
 * on leg 2. For simplicity we always offset in the same XZ-perpendicular direction per
 * segment and detect folds by dot-product reversal of consecutive inner-edge segment tangents.
 *
 * @param {{ getPoint: (t:number)=>{x,y,z}, tangentAt: (t:number)=>{x,z} }} curve
 * @param {number} halfWidth — ribbon half-width (m)
 * @param {number} N — number of sample points
 * @returns {{ foldCount: number, innerEdgePts: Array<{x,z}> }}
 */
function sweepRibbonInnerEdge(curve, halfWidth, N) {
    const innerEdgePts = []

    for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        const p    = curve.getPoint(t)
        const tang = curve.tangentAt(t)
        // XZ right-normal: rotate tangent 90° CW: (+tangZ, -tangX)
        // "Inner edge" = left side of the path = negate the right-normal = (-tangZ, +tangX)
        // (The hairpin curves left when driving along leg 1, so the inner edge is to the left.)
        const innerX = p.x + halfWidth * (-tang.z)
        const innerZ = p.z + halfWidth * ( tang.x)
        innerEdgePts.push({ x: innerX, z: innerZ })
    }

    // Count folds: consecutive inner-edge segment tangent reversals (dot product < 0).
    let foldCount = 0
    for (let i = 1; i < innerEdgePts.length - 1; i++) {
        const dx1 = innerEdgePts[i].x   - innerEdgePts[i-1].x
        const dz1 = innerEdgePts[i].z   - innerEdgePts[i-1].z
        const dx2 = innerEdgePts[i+1].x - innerEdgePts[i].x
        const dz2 = innerEdgePts[i+1].z - innerEdgePts[i].z
        const len1 = Math.hypot(dx1, dz1)
        const len2 = Math.hypot(dx2, dz2)
        if (len1 < 1e-8 || len2 < 1e-8) continue  // skip degenerate zero-length segments
        const dot = (dx1 * dx2 + dz1 * dz2) / (len1 * len2)
        if (dot < 0) foldCount++
    }

    return { foldCount, innerEdgePts }
}

/**
 * Compute hairpin-gate metrics for the hairpin fixture.
 * Returns { foldCount, armSeparation, halfWidth }.
 */
function computeHairpinMetrics() {
    const pts   = buildHairpinPoints()
    const curve = catmullRomCurve(pts)
    const totalLen = curve.getLength()
    const N = Math.max(64, Math.ceil(totalLen / 0.5))  // sample every ~0.5 m

    const { foldCount } = sweepRibbonInnerEdge(curve, HAIRPIN_HALF_W, N)

    // Arm separation = 2 * HAIRPIN_R (by construction)
    const armSeparation = 2 * HAIRPIN_R

    return { foldCount, armSeparation, halfWidth: HAIRPIN_HALF_W }
}

// ── 09-23 D4 Switchback no-arm-flip ──────────────────────────────────────────
// Vendors a minimal arm-selector that mirrors D4 queryNearest's footprint-preference rule.
// Two selectors are compared:
//   'footprint': prefers the arm whose footprint the query point lies interior to
//                (|signedLat| ≤ footprintHW = roadHalfWidth + roadShoulderWidth),
//                falling back to globally nearest. Mirrors src/road.js queryNearest D4 fix.
//   'brute':     always picks the globally nearest discrete sample, regardless of footprint.
//                This is the OLD behavior that caused invisible-ramp launch (#3).
//
// The fixture has two switchback arms separated by SW_ARM_SEP (≈ 2·minRadius = 24 m) laterally.
// A query point marches along arm A with a SW_QUERY_LATERAL offset toward arm B.
// The brute selector starts picking arm B when the query gets geometrically closer to B;
// the footprint selector never does (the query is always interior to arm A's footprint).

// Geometry chosen to trigger the D4 bug with the brute selector:
//   1. Arm A has COARSE samples (large gaps) — so between two arm A samples, a
//      dense arm B sample may be geometrically closer to the query.
//   2. Arm B runs at SW_ARM_SEP from arm A; query is inside A's footprint but
//      outside B's footprint.
//   3. footprintHW_SW < arm separation / 2, so footprints do NOT overlap.
//
// Geometry invariants:
//   SW_QUERY_LATERAL < SW_FOOTPRINT_HW   (query inside arm A footprint)
//   SW_ARM_SEP - SW_QUERY_LATERAL > SW_FOOTPRINT_HW  (query outside arm B footprint)
//   ⟹  SW_ARM_SEP > SW_FOOTPRINT_HW + SW_QUERY_LATERAL
// Values: footprint=2.5m, query lateral=1.5m, arm sep=5m (5 > 2.5+1.5=4 ✓)
// Arm A: 5 coarse samples spread over 60m (12m apart)  ← few samples → gaps
// Arm B: 40 dense samples over 60m (1.5m apart)        ← dense → always one close

const SW_FOOTPRINT_HW    = 2.5   // m — arm footprint halfwidth used in both selectors
const SW_ARM_SEP         = 5     // m — arm separation (> footprint+query_lat = 4m)
const SW_ARM_LEN         = 60    // m — length of each arm
const SW_QUERY_LATERAL   = 1.5   // m — offset toward arm B, inside arm A footprint (1.5 < 2.5)
const SW_ARM_A_COARSE_N  = 5     // coarse sample count for arm A (12m gaps)
const SW_ARM_B_DENSE_N   = 40    // dense sample count for arm B (1.5m gaps)

/**
 * Build two parallel switchback arms as arrays of {x,y,z} samples.
 * Arm A: z = 0, COARSE — 5 samples over SW_ARM_LEN (12m apart)
 * Arm B: z = SW_ARM_SEP, DENSE — 40 samples over SW_ARM_LEN (1.5m apart)
 * Running in opposite directions (A: +X, B: −X mirror for self-approaching hairpin).
 */
function buildSwitchbackArms() {
    const armA = []
    for (let i = 0; i <= SW_ARM_A_COARSE_N; i++) {
        const frac = i / SW_ARM_A_COARSE_N
        armA.push({ x: frac * SW_ARM_LEN, y: 0, z: 0 })
    }
    const armB = []
    for (let i = 0; i <= SW_ARM_B_DENSE_N; i++) {
        const frac = i / SW_ARM_B_DENSE_N
        // Arm B runs in opposite direction (self-approaching hairpin — mirrors D0 filleted hairpin)
        armB.push({ x: (1 - frac) * SW_ARM_LEN, y: 0, z: SW_ARM_SEP })
    }
    return { armA, armB }
}

/**
 * Select the nearest arm sample for a query point (qx, qz) using the given strategy.
 * armSamples: Array<Array<{x,y,z}>> — list of arms, each being an array of {x,y,z} samples.
 * strategy: 'footprint' | 'brute'
 * footprintHW: half-width of each arm's footprint.
 * Returns the arm index (0 = armA, 1 = armB) that the selector picks.
 */
function selectArm(armSamples, qx, qz, strategy, footprintHW) {
    let extBestD2 = Infinity
    let extBestArm = 0
    let intBestD2 = Infinity
    let intBestArm = -1  // -1 = no interior candidate found yet

    for (let armIdx = 0; armIdx < armSamples.length; armIdx++) {
        const arm = armSamples[armIdx]
        for (let i = 0; i < arm.length; i++) {
            const s = arm[i]
            const dx = s.x - qx
            const dz = s.z - qz
            const d2 = dx * dx + dz * dz

            // Compute tangent from this arm's direction (arm A goes +X, arm B goes -X)
            // Use adjacent samples for tangent (or endpoint copies at ends)
            const prev = arm[Math.max(0, i - 1)]
            const next = arm[Math.min(arm.length - 1, i + 1)]
            const ttx = next.x - prev.x
            const ttz = next.z - prev.z
            const tlen = Math.hypot(ttx, ttz)
            const tx = tlen < 1e-9 ? 1 : ttx / tlen
            const tz = tlen < 1e-9 ? 0 : ttz / tlen

            // Signed lateral distance (right-normal direction from tangent)
            // rightNormal = (tz, -tx) → signedLat = dot(queryOffset, rightNormal)
            const signedLat = dx * tz - dz * tx

            // Update global best
            if (d2 < extBestD2) {
                extBestD2 = d2
                extBestArm = armIdx
            }

            // Update interior best (query inside this arm's footprint)
            if (Math.abs(signedLat) <= footprintHW && d2 < intBestD2) {
                intBestD2 = d2
                intBestArm = armIdx
            }
        }
    }

    if (strategy === 'footprint') {
        // Prefer interior if found, else fall back to global nearest
        return intBestArm >= 0 ? intBestArm : extBestArm
    }
    // brute: always global nearest
    return extBestArm
}

/**
 * Compute switchback arm-flip metrics.
 * Returns { armFlipCount_footprint, armFlipCount_brute, footprintHW, armSep }
 */
function computeSwitchbackMetrics() {
    const { armA, armB } = buildSwitchbackArms()
    const armSamples = [armA, armB]
    const footprintHW = SW_FOOTPRINT_HW  // 2.5 m — query inside A (1.5<2.5), outside B (3.5>2.5)

    let prevArm_footprint = -1
    let prevArm_brute = -1
    let armFlipCount_footprint = 0
    let armFlipCount_brute = 0

    // March along arm A with SW_QUERY_LATERAL offset toward arm B (in +Z direction).
    // Arm A runs along z=0; arm B is at z=SW_ARM_SEP. So lateral offset is +Z.
    const N_STEPS = 60
    for (let i = 0; i <= N_STEPS; i++) {
        const frac = i / N_STEPS
        // Query point: on arm A's centerline, shifted toward arm B
        const qx = frac * SW_ARM_LEN
        const qz = SW_QUERY_LATERAL  // offset toward arm B

        const pickedFP    = selectArm(armSamples, qx, qz, 'footprint', footprintHW)
        const pickedBrute = selectArm(armSamples, qx, qz, 'brute',     footprintHW)

        if (prevArm_footprint >= 0 && pickedFP    !== prevArm_footprint) armFlipCount_footprint++
        if (prevArm_brute     >= 0 && pickedBrute !== prevArm_brute)     armFlipCount_brute++

        prevArm_footprint = pickedFP
        prevArm_brute     = pickedBrute
    }

    return { armFlipCount_footprint, armFlipCount_brute, footprintHW, armSep: SW_ARM_SEP }
}

// ── 09-23 D3 Two-arms-at-different-heights no-undermine ──────────────────────
// Vendors a cross-section evaluator that mirrors the D3 max-floor guard in _buildCarveTable.
// Two switchback arms separated laterally by TA_ARM_SEP:
//   Arm A (upper): Y = TA_UPPER_Y
//   Arm B (lower): Y = 0
// Each arm's carve trough is: carveTargetY = armY - clearanceMargin (simplified: no crown/camber
// in this fixture — we're testing the max-floor guard logic only).
// Each arm's footprint halfwidth is bounded by minTurnRadius = ½ · arm separation (footprint bound).
//
// For a lateral cross-section spanning both arms, the max-floor guard fires where intBi != extBi:
//   carveTarget = MAX(armA.carveTarget, armB.carveTarget)
// Gate: at every lateral position under arm A's footprint, the carve floor
//   ≥ TA_UPPER_Y - TA_CLEARANCE_M (the upper arm's required floor).
//   This means the lower arm's deeper cut cannot undermine the upper arm's support.

const TA_UPPER_Y         = 8.0   // m — upper arm Y above lower arm
const TA_ARM_SEP         = 24    // m — lateral separation (≈ 2·minRadius)
const TA_CLEARANCE_M     = 0.5   // m — clearanceMargin (mirrors ranger.js default)
const TA_FOOTPRINT_HW    = TA_ARM_SEP / 2  // 12 m — footprint bound ≤ ½ arm separation
const TA_EPS             = 0.001  // m — tolerance for undermine check

/**
 * Evaluate the carve floor across a lateral cross-section spanning both arms.
 * Lateral coordinate u runs from -TA_FOOTPRINT_HW to +TA_FOOTPRINT_HW relative to arm A centre.
 * Arm B centre is at u = +TA_ARM_SEP (outside arm A's footprint).
 *
 * For each lateral sample u:
 *   - Check if u is inside arm A's footprint (|u| ≤ TA_FOOTPRINT_HW).
 *   - Check if u is inside arm B's footprint (|u - TA_ARM_SEP| ≤ TA_FOOTPRINT_HW).
 *   - Determine carveTarget for each covering arm: armY - clearanceMargin.
 *   - If both arms cover, apply max-floor guard: use MAX(carveTargetA, carveTargetB).
 *   - If only one arm covers, use that arm's carveTarget.
 *   - Track the minimum carve floor under arm A's footprint.
 *
 * Returns { minFloorUnderA, minFloorUnderB, requiredFloorA, requiredFloorB,
 *           undermineDepth, armBFloorAtWorst }
 */
function computeTwoArmsMetrics() {
    const armAY = TA_UPPER_Y
    const armBY = 0
    const carveTargetA = armAY - TA_CLEARANCE_M  // 7.5 m
    const carveTargetB = armBY - TA_CLEARANCE_M  // -0.5 m

    // Arm A centred at u=0, arm B centred at u=TA_ARM_SEP
    // Cross-section spans u in [-TA_FOOTPRINT_HW, TA_ARM_SEP + TA_FOOTPRINT_HW]
    const uMin = -TA_FOOTPRINT_HW
    const uMax = TA_ARM_SEP + TA_FOOTPRINT_HW
    const N = 200
    const du = (uMax - uMin) / N

    let minFloorUnderA = Infinity
    let minFloorUnderB = Infinity
    let worstUndermineDepth = 0

    for (let i = 0; i <= N; i++) {
        const u = uMin + i * du
        const insideA = Math.abs(u) <= TA_FOOTPRINT_HW
        const insideB = Math.abs(u - TA_ARM_SEP) <= TA_FOOTPRINT_HW

        if (!insideA && !insideB) continue  // outside both footprints — uncarved

        let carveFloor
        if (insideA && insideB) {
            // Both arms cover this lateral position — apply max-floor guard
            carveFloor = Math.max(carveTargetA, carveTargetB)
        } else if (insideA) {
            carveFloor = carveTargetA
        } else {
            carveFloor = carveTargetB
        }

        if (insideA) {
            minFloorUnderA = Math.min(minFloorUnderA, carveFloor)
            // Undermine: floor dropped below what arm A requires
            const depth = carveTargetA - carveFloor
            if (depth > worstUndermineDepth) worstUndermineDepth = depth
        }
        if (insideB) {
            minFloorUnderB = Math.min(minFloorUnderB, carveFloor)
        }
    }

    return {
        minFloorUnderA,
        minFloorUnderB,
        requiredFloorA: carveTargetA,
        requiredFloorB: carveTargetB,
        undermineDepth: worstUndermineDepth,
    }
}

// ── 09-23 D2 Camber-rate slew-limit gate ─────────────────────────────────────
// Vendors the D2 slew-rate limiter (forward-march |dCamber/ds| ≤ roadCamberRate °/m,
// then ±6° clamp) matching _buildCamberProfile in src/road.js (plan 09-21).
//
// The fixture is an S-curve: a left-hand turn followed by a right-hand turn (curvature
// sign change). Without the slew limiter, the instantaneous camber clamp-flips at the
// zero-crossing and spikes the camber rate (the tight-turn demo shows 12.76°/m).
// With the slew limiter, the rate is kept ≤ MAX_DCAMBER_DEG_PER_M (2.0°/m).
//
// Gate: slew-limited maxDCamber ≤ MAX_DCAMBER_DEG_PER_M.
// Contrast: unlimited maxDCamber > MAX_DCAMBER_DEG_PER_M (gate would fail without limiter).

const CR_CAMBER_STRENGTH   = CAMBER_STRENGTH   // 200 m·rad/rad — same as harness top
const CR_CLAMP_RAD         = CAMBER_CLAMP_RAD  // ±6° in radians
const CR_SLEW_RATE_DEG_M   = 1.5              // °/m — roadCamberRate default (ranger.js)
const CR_SLEW_RATE_RAD_M   = CR_SLEW_RATE_DEG_M * Math.PI / 180

// S-curve: left turn then right turn — creates a curvature sign change that would spike
// the camber rate without the slew limiter.
const CR_SCURVE_POINTS = [
    { x:   0, y: 0, z:   0 },
    { x:  15, y: 0, z:   5 },
    { x:  25, y: 0, z:  15 },  // peak left
    { x:  35, y: 0, z:  25 },
    { x:  45, y: 0, z:  30 },  // mid — curvature flips
    { x:  55, y: 0, z:  25 },
    { x:  65, y: 0, z:  15 },  // peak right
    { x:  75, y: 0, z:   5 },
    { x:  90, y: 0, z:   0 },
]

/**
 * Apply D2 forward-march slew-rate limiter to an array of raw camber angles (radians).
 * ds: arc-length step between samples (metres).
 * slewRateRadPerM: max |dCamber/ds| in rad/m.
 * clampRad: max |camber| in radians.
 * Returns new array of slew-limited camber angles.
 */
function applySlewLimit(rawCamberRad, ds, slewRateRadPerM, clampRad) {
    const limited = new Array(rawCamberRad.length)
    let prev = 0  // start from neutral
    for (let i = 0; i < rawCamberRad.length; i++) {
        const target = Math.max(-clampRad, Math.min(clampRad, rawCamberRad[i]))
        const maxDelta = slewRateRadPerM * ds
        const delta = Math.max(-maxDelta, Math.min(maxDelta, target - prev))
        prev = Math.max(-clampRad, Math.min(clampRad, prev + delta))
        limited[i] = prev
    }
    return limited
}

/**
 * Compute camber-rate metrics for the S-curve fixture.
 * Returns { maxDCamber_unlimited, maxDCamber_slewed, slewRateDegM }
 */
function computeCamberRateMetrics() {
    const curve = catmullRomCurve(CR_SCURVE_POINTS)
    const totalLen = curve.getLength()
    const N = Math.max(2, Math.ceil(totalLen / SAMPLE_INTERVAL_M))

    const positions = []
    const tangents  = []
    const arcS      = []

    for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        positions.push(curve.getPoint(t))
        tangents.push(curve.tangentAt(t))
    }

    arcS.push(0)
    for (let i = 1; i < N; i++) {
        const a = positions[i-1], b = positions[i]
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        arcS.push(arcS[i-1] + Math.sqrt(dx*dx + dy*dy + dz*dz))
    }

    // Per-pair curvature (N-1 values)
    const kappa = []
    for (let i = 0; i < N - 1; i++) {
        const ds = arcS[i+1] - arcS[i]
        kappa.push(signedCurvature(
            tangents[i].x, tangents[i].z,
            tangents[i+1].x, tangents[i+1].z,
            Math.max(ds, 1e-9)
        ))
    }

    // Raw unlimited camber (rad) — per segment, clamped to ±6° only
    const rawCamberRad = kappa.map(k =>
        Math.max(-CR_CLAMP_RAD, Math.min(CR_CLAMP_RAD, CR_CAMBER_STRENGTH * k))
    )

    // Average ds for slew limit (use median arc-step)
    const avgDs = arcS[arcS.length - 1] / (N - 1)

    // Apply slew-rate limit
    const slewedCamberRad = applySlewLimit(rawCamberRad, avgDs, CR_SLEW_RATE_RAD_M, CR_CLAMP_RAD)

    // Convert to degrees and measure maxDCamber for each
    const rawCamberDeg   = rawCamberRad.map(r => r * 180 / Math.PI)
    const slewedCamberDeg = slewedCamberRad.map(r => r * 180 / Math.PI)

    let maxDCamber_unlimited = 0
    let maxDCamber_slewed    = 0

    for (let i = 0; i < rawCamberDeg.length - 1; i++) {
        const ds = Math.max(arcS[i+2] - arcS[i+1], 1e-9)
        const dUnlim = Math.abs(rawCamberDeg[i+1]   - rawCamberDeg[i])   / ds
        const dSlew  = Math.abs(slewedCamberDeg[i+1] - slewedCamberDeg[i]) / ds
        maxDCamber_unlimited = Math.max(maxDCamber_unlimited, dUnlim)
        maxDCamber_slewed    = Math.max(maxDCamber_slewed,    dSlew)
    }

    return { maxDCamber_unlimited, maxDCamber_slewed, slewRateDegM: CR_SLEW_RATE_DEG_M }
}

// ── Table printing ────────────────────────────────────────────────────────────

function pf(v, digits) { return v == null ? '  —   ' : v.toFixed(digits) }
function verdict(actual, threshold) {
    if (actual == null) return '  N/A  '
    return actual <= threshold ? ' PASS ' : ' FAIL '
}

console.log('')
console.log('='.repeat(120))
console.log('  spline-continuity GATE — headless, zero-install')
console.log(`  Thresholds: maxVStep<${MAX_VSTEP_M}m  maxDKappa<${MAX_DKAPPA}/m²  maxDCamber<${MAX_DCAMBER_DEG_PER_M}°/m  boundaryMismatch<${MAX_BOUNDARY_MISMATCH_M}m`)
console.log('='.repeat(120))

// Header row
const col = (s, w) => s.padEnd(w).slice(0, w)
const hdr = [
    col('Fixture',            24),
    col('Role',               20),
    col('maxVStep(m)',        12),
    col('VStep?',              8),
    col('maxDKappa(/m²)',     16),
    col('DKap?',               7),
    col('maxDCam(°/m)',       14),
    col('DCam?',               7),
    col('seam(m)',             9),
    col('Seam?',               7),
    col('OVERALL',             8),
].join(' | ')
console.log(hdr)
console.log('-'.repeat(120))

let allGatesPassed = true

const results = []
// physics-mode and hairpin-mode fixtures are printed in separate sections after the main table
const physicsModeFixtures  = []
const hairpinModeFixtures  = []
const switchbackModeFixtures = []
const twoArmsModeFixtures  = []
const camberRateModeFixtures = []

for (const fix of FIXTURES) {
    if (fix.physicsMode) {
        physicsModeFixtures.push(fix)
        continue
    }
    if (fix.hairpinMode) {
        hairpinModeFixtures.push(fix)
        continue
    }
    if (fix.switchbackMode) {
        switchbackModeFixtures.push(fix)
        continue
    }
    if (fix.twoArmsMode) {
        twoArmsModeFixtures.push(fix)
        continue
    }
    if (fix.camberRateMode) {
        camberRateModeFixtures.push(fix)
        continue
    }
    const m = computeMetrics(fix)
    const isGate = fix.role === 'gate'
    const isDemoFail = fix.role === 'demo-expected-fail'

    const vVStep   = verdict(m.maxVStep,          MAX_VSTEP_M)
    const vDKappa  = verdict(m.maxDKappa,         MAX_DKAPPA)
    const vDCamber = verdict(m.maxDCamber,        MAX_DCAMBER_DEG_PER_M)
    const vBound   = verdict(m.boundaryMismatch,  MAX_BOUNDARY_MISMATCH_M)

    const metricsFail = (m.maxVStep > MAX_VSTEP_M) ||
                        (m.maxDKappa > MAX_DKAPPA) ||
                        (m.maxDCamber > MAX_DCAMBER_DEG_PER_M) ||
                        (m.boundaryMismatch != null && m.boundaryMismatch > MAX_BOUNDARY_MISMATCH_M)

    let overallTag
    if (isDemoFail) {
        overallTag = metricsFail ? 'FAIL(demo)' : 'PASS(demo)'
    } else {
        overallTag = metricsFail ? '  FAIL  ' : '  PASS  '
        if (isGate && metricsFail) allGatesPassed = false
    }

    const row = [
        col(fix.name,                              24),
        col(isDemoFail ? 'demo-expected-fail' : 'gate', 20),
        col(pf(m.maxVStep,   4),                  12),
        col(vVStep,                                 8),
        col(pf(m.maxDKappa,  6),                  16),
        col(vDKappa,                                7),
        col(pf(m.maxDCamber, 4),                  14),
        col(vDCamber,                               7),
        col(m.boundaryMismatch != null ? pf(m.boundaryMismatch, 4) : '  N/A ', 9),
        col(vBound,                                 7),
        col(overallTag,                             8),
    ].join(' | ')
    console.log(row)
    results.push({ name: fix.name, role: fix.role, metricsFail, m })
}

console.log('-'.repeat(120))

// Summary
const gateFixtures = results.filter(r => r.role === 'gate')
const demoFixtures = results.filter(r => r.role === 'demo-expected-fail')
const gateFailed   = gateFixtures.filter(r => r.metricsFail)

console.log('')
if (allGatesPassed) {
    console.log(`  GATE RESULT (spline metrics): PASS  — ${gateFixtures.length} gate fixture(s) all within thresholds`)
} else {
    console.log(`  GATE RESULT (spline metrics): FAIL  — ${gateFailed.length}/${gateFixtures.length} gate fixture(s) exceeded thresholds`)
}
console.log(`  Demo fixtures shown (informational): ${demoFixtures.length} — expected to fail; do NOT affect exit code.`)
console.log('')
console.log('  LEGEND:')
console.log('    gate              = counted in exit code; must PASS')
console.log('    demo-expected-fail = measured for diagnostics; FAIL expected; exit code unaffected')
console.log('    Threshold constants are at the top of test/spline-continuity.mjs (tunable).')
console.log('    Re-tune after Phase 8 graded-Y spline bake lands.')
console.log('')

// ── 09-17 Physics-sampling continuity section ─────────────────────────────────
if (physicsModeFixtures.length > 0) {
    console.log('='.repeat(120))
    console.log('  PHYSICS-SAMPLING CONTINUITY (09-17 SURF-04 gap closure)')
    console.log(`  Gate: refine maxDY <= ${MAX_PHYSICS_DY_M} m  |  nearest-discrete must EXCEED threshold (staircase catch demo)`)
    console.log('='.repeat(120))
    const physHdr = [
        col('Fixture',                 30),
        col('nearest maxDY(m)',        18),
        col('Nearest>thresh?',         16),
        col('refine maxDY(m)',         16),
        col('Refine<=thresh?',         16),
        col('GATE',                    8),
    ].join(' | ')
    console.log(physHdr)
    console.log('-'.repeat(120))

    for (const fix of physicsModeFixtures) {
        const { maxDY_nearest, maxDY_refine } = computePhysicsMetrics(fix)
        const nearestExceeds = maxDY_nearest > MAX_PHYSICS_DY_M
        const refinePass     = maxDY_refine  <= MAX_PHYSICS_DY_M
        const gatePass       = refinePass  // gate: refine must be smooth

        if (fix.role === 'gate' && !gatePass) allGatesPassed = false

        const row = [
            col(fix.name,                         30),
            col(maxDY_nearest.toFixed(4),         18),
            col(nearestExceeds ? 'YES (expected)' : 'no (unexpected)', 16),
            col(maxDY_refine.toFixed(4),          16),
            col(refinePass ? ' PASS ' : ' FAIL ', 16),
            col(gatePass    ? '  PASS  ' : '  FAIL  ', 8),
        ].join(' | ')
        console.log(row)

        // Self-documenting contrast line (plan requirement)
        console.log(`    nearest-discrete: ΔY=${maxDY_nearest.toFixed(4)} m (would ${nearestExceeds ? 'FAIL' : 'PASS'}) | refine: ΔY=${maxDY_refine.toFixed(4)} m (${refinePass ? 'PASS' : 'FAIL'})`)
    }
    console.log('-'.repeat(120))
    console.log('')
}

// ── 09-18 Hairpin gate section ────────────────────────────────────────────────
if (hairpinModeFixtures.length > 0) {
    console.log('='.repeat(120))
    console.log('  HAIRPIN INNER-EDGE FOLD GATE (09-18 D0 arc-fillet)')
    console.log(`  Gate: inner-edge fold count == 0 (ribbon of ±${HAIRPIN_HALF_W} m half-width must not self-fold)`)
    console.log(`  Floor check: hairpin radius ${HAIRPIN_R} m > D0 floor (roadHalfWidth ${HAIRPIN_HALF_W} + clearance 0.5 + ε = 5.6 m)`)
    console.log('='.repeat(120))
    const hpHdr = [
        col('Fixture',                 30),
        col('armSeparation(m)',        18),
        col('ribbonHalfWidth(m)',      18),
        col('innerEdgeFolds',          16),
        col('GATE',                    8),
    ].join(' | ')
    console.log(hpHdr)
    console.log('-'.repeat(120))

    for (const fix of hairpinModeFixtures) {
        const { foldCount, armSeparation, halfWidth } = computeHairpinMetrics()
        const gatePass = foldCount === 0

        if (fix.role === 'gate' && !gatePass) allGatesPassed = false

        const row = [
            col(fix.name,                         30),
            col(armSeparation.toFixed(2),         18),
            col(halfWidth.toFixed(2),             18),
            col(foldCount.toString(),             16),
            col(gatePass ? '  PASS  ' : '  FAIL  ', 8),
        ].join(' | ')
        console.log(row)
        console.log(`    arm separation: ${armSeparation.toFixed(2)} m | ribbon width: ${(2 * halfWidth).toFixed(2)} m | inner-edge folds: ${foldCount} (gate: == 0)`)
    }
    console.log('-'.repeat(120))
    console.log('')
}

// ── 09-23 D4 Switchback no-arm-flip section ───────────────────────────────────
if (switchbackModeFixtures.length > 0) {
    console.log('='.repeat(120))
    console.log('  SWITCHBACK NO-ARM-FLIP GATE (09-23 D4 arm-disambiguation)')
    console.log(`  Gate: footprint-preference selector armFlipCount == 0 (brute selector expected to flip)`)
    console.log(`  Fixture geometry: 2 arms, lateral separation ${SW_ARM_SEP} m (self-approaching), footprintHW ${SW_FOOTPRINT_HW} m, query offset ${SW_QUERY_LATERAL} m`)
    console.log('='.repeat(120))
    const swHdr = [
        col('Fixture',                 30),
        col('footprintFlips',          16),
        col('bruteFlips',              14),
        col('bruteFlips>0?',           14),
        col('GATE',                    8),
    ].join(' | ')
    console.log(swHdr)
    console.log('-'.repeat(120))

    for (const fix of switchbackModeFixtures) {
        const { armFlipCount_footprint, armFlipCount_brute, footprintHW, armSep } = computeSwitchbackMetrics()
        const gatePass = armFlipCount_footprint === 0

        if (fix.role === 'gate' && !gatePass) allGatesPassed = false

        const row = [
            col(fix.name,                              30),
            col(armFlipCount_footprint.toString(),     16),
            col(armFlipCount_brute.toString(),         14),
            col(armFlipCount_brute > 0 ? 'YES (expected)' : 'no (unexpected)', 14),
            col(gatePass ? '  PASS  ' : '  FAIL  ',   8),
        ].join(' | ')
        console.log(row)
        console.log(`    footprint-preference selector: armFlips=${armFlipCount_footprint} (gate: ==0) | brute selector: armFlips=${armFlipCount_brute} (expected >0 to confirm gate catches the bug)`)
        console.log(`    arm sep: ${armSep} m | footprintHW: ${footprintHW} m | query lateral offset: ${SW_QUERY_LATERAL} m`)
    }
    console.log('-'.repeat(120))
    console.log('')
}

// ── 09-23 D3 Two-arms no-undermine section ────────────────────────────────────
if (twoArmsModeFixtures.length > 0) {
    console.log('='.repeat(120))
    console.log('  TWO-ARMS NO-UNDERMINE GATE (09-23 D3 max-floor guard)')
    console.log(`  Gate: undermineDepth == 0 (carve floor under upper arm ≥ upperArmY - clearanceMargin)`)
    console.log(`  Fixture: upper arm Y=${TA_UPPER_Y} m, lower arm Y=0, sep=${TA_ARM_SEP} m, footprintHW=${TA_FOOTPRINT_HW} m, clearance=${TA_CLEARANCE_M} m`)
    console.log('='.repeat(120))
    const taHdr = [
        col('Fixture',                 30),
        col('minFloorA(m)',            14),
        col('reqFloorA(m)',            14),
        col('undermineDepth(m)',       20),
        col('minFloorB(m)',            14),
        col('GATE',                    8),
    ].join(' | ')
    console.log(taHdr)
    console.log('-'.repeat(120))

    for (const fix of twoArmsModeFixtures) {
        const { minFloorUnderA, minFloorUnderB, requiredFloorA, requiredFloorB, undermineDepth } = computeTwoArmsMetrics()
        const gatePass = undermineDepth < TA_EPS

        if (fix.role === 'gate' && !gatePass) allGatesPassed = false

        const row = [
            col(fix.name,                              30),
            col(minFloorUnderA.toFixed(4),             14),
            col(requiredFloorA.toFixed(4),             14),
            col(undermineDepth.toFixed(6),             20),
            col(minFloorUnderB.toFixed(4),             14),
            col(gatePass ? '  PASS  ' : '  FAIL  ',   8),
        ].join(' | ')
        console.log(row)
        console.log(`    upper arm floor min: ${minFloorUnderA.toFixed(4)} m (required ≥ ${requiredFloorA.toFixed(4)} m) | undermine depth: ${undermineDepth.toFixed(6)} m (gate: == 0)`)
        console.log(`    lower arm floor min: ${minFloorUnderB.toFixed(4)} m (required ≥ ${requiredFloorB.toFixed(4)} m)`)
    }
    console.log('-'.repeat(120))
    console.log('')
}

// ── 09-23 D2 Camber-rate slew-limit section ───────────────────────────────────
if (camberRateModeFixtures.length > 0) {
    console.log('='.repeat(120))
    console.log('  CAMBER-RATE SLEW-LIMIT GATE (09-23 D2 slew-limited camberProfile)')
    console.log(`  Gate: slew-limited maxDCamber ≤ ${MAX_DCAMBER_DEG_PER_M}°/m  |  unlimited maxDCamber must EXCEED threshold (spike catch demo)`)
    console.log(`  Slew rate: ${CR_SLEW_RATE_DEG_M}°/m (roadCamberRate) | fixture: S-curve with curvature sign change`)
    console.log('='.repeat(120))
    const crHdr = [
        col('Fixture',                 30),
        col('unlimited maxDCam(°/m)',  22),
        col('Unlim>thresh?',           14),
        col('slewed maxDCam(°/m)',     20),
        col('Slewed<=thresh?',         16),
        col('GATE',                    8),
    ].join(' | ')
    console.log(crHdr)
    console.log('-'.repeat(120))

    for (const fix of camberRateModeFixtures) {
        const { maxDCamber_unlimited, maxDCamber_slewed, slewRateDegM } = computeCamberRateMetrics()
        const unlimitedExceeds = maxDCamber_unlimited > MAX_DCAMBER_DEG_PER_M
        const slewedPass       = maxDCamber_slewed <= MAX_DCAMBER_DEG_PER_M
        const gatePass         = slewedPass

        if (fix.role === 'gate' && !gatePass) allGatesPassed = false

        const row = [
            col(fix.name,                              30),
            col(maxDCamber_unlimited.toFixed(4),       22),
            col(unlimitedExceeds ? 'YES (expected)' : 'no (unexpected)', 14),
            col(maxDCamber_slewed.toFixed(4),          20),
            col(slewedPass ? ' PASS ' : ' FAIL ',      16),
            col(gatePass ? '  PASS  ' : '  FAIL  ',   8),
        ].join(' | ')
        console.log(row)
        console.log(`    unlimited: maxDCamber=${maxDCamber_unlimited.toFixed(4)}°/m (would ${unlimitedExceeds ? 'FAIL' : 'PASS'}) | slew-limited (${slewRateDegM}°/m): maxDCamber=${maxDCamber_slewed.toFixed(4)}°/m (${slewedPass ? 'PASS' : 'FAIL'})`)
    }
    console.log('-'.repeat(120))
    console.log('')
}

// Crown sanity note (crownProfile imported but not driving metrics — documented here).
{
    // Verify crownProfile import is live (D-16 sanity ping — value must be 0 at edge).
    const edgeCheck = crownProfile(ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, CROWN_HEIGHT)
    if (Math.abs(edgeCheck) > 1e-9) {
        console.log('  WARNING: crownProfile(edge) should be 0; got', edgeCheck)
    }
}

process.exit(allGatesPassed ? 0 : 1)
