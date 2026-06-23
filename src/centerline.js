// src/centerline.js — the curvature-bounded road centerline model (Road Overhaul, Phase A).
//
// THE WHOLE POINT (see .planning/ROAD-OVERHAUL-HANDOFF.md): carry ONE exact, curvature-bounded
// centerline from the router to every consumer and SAMPLE it — never re-interpolate, never patch.
// BUG-12 (ribbon fold) was caused by re-fitting the already-valid routed path with overshooting
// centripetal Catmull-Rom in road.js `_assignSlice`. A Centerline made of typed primitives
// (line / circular-arc / clothoid) has curvature known ANALYTICALLY and bounded BY CONSTRUCTION,
// so sampling it at any density can never fold (radius ≥ minR everywhere by definition).
//
// One primitive = a clothoid (Euler spiral) whose curvature is LINEAR in arc length:
//     κ(s) = κ0 + (κ1 − κ0)·s/L          s ∈ [0, L]
//   • line   : κ0 = κ1 = 0
//   • arc    : κ0 = κ1 = k ≠ 0
//   • clothoid: κ0 ≠ κ1   (curvature ramp — the G2 join primitive)
// Heading integrates in closed form; position is closed-form for line/arc and a cached Fresnel
// (numeric) table for the clothoid (clothoids are short terminals/joins, built once).
//
// Pure + deterministic (D-16): a primitive is a function of its start pose + length + endpoint
// curvatures only — no RNG, no Date, no stream/session state. Built per anchor-pair from anchor-
// derived canonical headings, so a Centerline is window-invariant by construction. XZ only; Y
// (gradeY) is owned by road.js's grade layer, sampled by arc-length the same way.

import * as THREE from 'three'

const EPS_K = 1e-9   // |κ| below this ⇒ treat as straight (closed-form line, avoids 1/κ blowup)

// Type tag from the curvature endpoints — purely descriptive (sampling branches on κ, not on type).
function primType(kappa0, kappa1) {
    if (Math.abs(kappa0) < EPS_K && Math.abs(kappa1) < EPS_K) return 'line'
    if (Math.abs(kappa0 - kappa1) < EPS_K) return 'arc'
    return 'clothoid'
}

// Pose along a constant-κ primitive (line or arc) at local arc length ls ∈ [0, L].
function constKappaPose(x0, z0, theta0, k, ls) {
    if (Math.abs(k) < EPS_K) {
        return { x: x0 + ls * Math.cos(theta0), z: z0 + ls * Math.sin(theta0), theta: theta0 }
    }
    const th2 = theta0 + k * ls
    return {
        x: x0 + (Math.sin(th2) - Math.sin(theta0)) / k,
        z: z0 - (Math.cos(th2) - Math.cos(theta0)) / k,
        theta: th2,
    }
}

// Build a cumulative XZ table for a clothoid by integrating cos/sin θ(s). Fixed step ⇒ deterministic.
// Stored as flat [x,z, x,z, ...] at node arc-lengths 0, h, 2h, …, L (linear-interp between nodes —
// the table is dense (≤0.5 m) so interpolation error is far below ribbon/physics tolerance).
const CLOTHOID_STEP = 0.5
function buildClothoidTable(x0, z0, theta0, kappa0, kappa1, L) {
    const n = Math.max(1, Math.ceil(L / CLOTHOID_STEP))
    const h = L / n
    const dk = (kappa1 - kappa0) / L
    const tab = new Float64Array((n + 1) * 2)
    let x = x0, z = z0
    tab[0] = x; tab[1] = z
    // Trapezoid integration of (cosθ, sinθ); θ(s) closed form so each node is exact in heading.
    const thetaAt = (s) => theta0 + kappa0 * s + 0.5 * dk * s * s
    let cPrev = Math.cos(theta0), sPrev = Math.sin(theta0)
    for (let i = 1; i <= n; i++) {
        const s = i * h
        const th = thetaAt(s)
        const c = Math.cos(th), sn = Math.sin(th)
        x += 0.5 * (cPrev + c) * h
        z += 0.5 * (sPrev + sn) * h
        tab[i * 2] = x; tab[i * 2 + 1] = z
        cPrev = c; sPrev = sn
    }
    return { tab, h, n }
}

/**
 * makePrimitive — one centerline segment.
 * @returns {object} { type, x0, z0, theta0, length, kappa0, kappa1, x1, z1, theta1 } (+ private table for clothoids)
 */
export function makePrimitive(x0, z0, theta0, length, kappa0, kappa1 = kappa0) {
    const type = primType(kappa0, kappa1)
    const p = { type, x0, z0, theta0, length, kappa0, kappa1, x1: 0, z1: 0, theta1: 0, _tab: null }
    if (type === 'clothoid') {
        p._tab = buildClothoidTable(x0, z0, theta0, kappa0, kappa1, length)
        const last = p._tab.tab
        p.x1 = last[last.length - 2]; p.z1 = last[last.length - 1]
        p.theta1 = theta0 + kappa0 * length + 0.5 * (kappa1 - kappa0) * length
    } else {
        const e = constKappaPose(x0, z0, theta0, kappa0, length)
        p.x1 = e.x; p.z1 = e.z; p.theta1 = e.theta
    }
    return p
}

// Pose {x,z,theta,kappa} at local arc length ls within primitive p (ls clamped to [0,L]).
function primPose(p, ls) {
    const L = p.length
    if (ls <= 0) return { x: p.x0, z: p.z0, theta: p.theta0, kappa: p.kappa0 }
    if (ls >= L) return { x: p.x1, z: p.z1, theta: p.theta1, kappa: p.kappa1 }
    const kappa = p.kappa0 + (p.kappa1 - p.kappa0) * ls / L
    if (p.type !== 'clothoid') {
        const e = constKappaPose(p.x0, p.z0, p.theta0, p.kappa0, ls)
        return { x: e.x, z: e.z, theta: e.theta, kappa }
    }
    const { tab, h, n } = p._tab
    const fi = ls / h
    const i = Math.min(n - 1, Math.floor(fi))
    const t = fi - i
    const x = tab[i * 2] * (1 - t) + tab[(i + 1) * 2] * t
    const z = tab[i * 2 + 1] * (1 - t) + tab[(i + 1) * 2 + 1] * t
    const theta = p.theta0 + p.kappa0 * ls + 0.5 * (p.kappa1 - p.kappa0) * ls * ls / L
    return { x, z, theta, kappa }
}

/**
 * CenterlineCurve — a THREE.Curve-compatible adapter so road consumers (sweepRibbon, queryNearest,
 * carve sampler, seam harness) sample the EXACT bounded primitive curve in place of the old
 * per-slice centripetal-Catmull-Rom spline — the BUG-12 fold fix. XZ position/tangent come from the
 * run centerline over arc [s0, s1] (s0>s1 ⇒ slice runs E→W; u still 0→1 along the slice). Y is
 * carried from the slice's already-graded control points `cleanPts` (interp by u) so gradeY agreement
 * — ribbon Y, carve p.y, queryNearest point.y — is unchanged; only XZ stops overshooting.
 *
 * @param {Centerline} centerline — the run's own centerline (0..L_run)
 * @param {number} s0,s1 — arc on `centerline` at slice u=0 / u=1
 * @param {THREE.Vector3[]} cleanPts — slice control points (carry graded Y at u=0..1)
 */
export class CenterlineCurve {
    constructor(centerline, s0, s1, cleanPts) {
        this._cl = centerline
        this._s0 = s0; this._s1 = s1
        this._len = Math.abs(s1 - s0)
        // Y(u) table from the graded control points, keyed by their cumulative-XZ fraction.
        const N = cleanPts.length
        this._yFrac = new Float64Array(N)
        this._y = new Float64Array(N)
        let acc = 0
        for (let i = 0; i < N; i++) {
            if (i > 0) acc += Math.hypot(cleanPts[i].x - cleanPts[i - 1].x, cleanPts[i].z - cleanPts[i - 1].z)
            this._yFrac[i] = acc; this._y[i] = cleanPts[i].y
        }
        const tot = acc || 1
        for (let i = 0; i < N; i++) this._yFrac[i] /= tot
    }
    getLength() { return this._len }
    _yAt(u) {
        const f = this._yFrac, y = this._y, n = f.length
        if (n === 0) return 0
        if (u <= f[0]) return y[0]
        if (u >= f[n - 1]) return y[n - 1]
        let lo = 0, hi = n - 1
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f[mid] <= u) lo = mid; else hi = mid - 1 }
        const hiIdx = Math.min(n - 1, lo + 1)
        const span = f[hiIdx] - f[lo] || 1
        const t = (u - f[lo]) / span
        return y[lo] + t * (y[hiIdx] - y[lo])
    }
    getPoint(u, target = new THREE.Vector3()) { return this.getPointAt(u, target) }
    getPointAt(u, target = new THREE.Vector3()) {
        const s = this._s0 + u * (this._s1 - this._s0)
        const p = this._cl.pointAt(s)
        return target.set(p.x, this._yAt(u), p.z)
    }
    getTangentAt(u, target = new THREE.Vector3()) {
        const s = this._s0 + u * (this._s1 - this._s0)
        const t = this._cl.tangentAt(s)
        const sgn = this._s1 >= this._s0 ? 1 : -1
        return target.set(sgn * t.x, 0, sgn * t.z).normalize()
    }
    getTangent(u, target) { return this.getTangentAt(u, target) }
    getSpacedPoints(n = 5) {
        const out = []
        for (let i = 0; i <= n; i++) out.push(this.getPointAt(i / n))
        return out
    }
    getPoints(n = 5) { return this.getSpacedPoints(n) }
}

// Wrap plain primitive descriptors {x0,z0,theta0,length,kappa0,kappa1} (as emitted by
// arcPrimitiveConnect({emitPrimitives:true}) / dubinsPrimitives) into a Centerline. Descriptors are
// kept dependency-free on the router side; this is the single place they become live primitives.
export function centerlineFromDescriptors(descs) {
    return new Centerline((descs || []).map(d =>
        makePrimitive(d.x0, d.z0, d.theta0, d.length, d.kappa0, d.kappa1 ?? d.kappa0)))
}

/**
 * Centerline — an ordered list of primitives forming one continuous (G1+) road run, arc-length
 * parameterised. Closed-form sampling; nothing is re-interpolated. XZ only.
 */
export class Centerline {
    constructor(primitives) {
        this.primitives = primitives || []
        this.starts = new Float64Array(this.primitives.length + 1)   // cumulative arc-length per primitive
        let acc = 0
        for (let i = 0; i < this.primitives.length; i++) {
            this.starts[i] = acc
            acc += this.primitives[i].length
        }
        this.starts[this.primitives.length] = acc
        this.length = acc
    }

    // Locate primitive index + local arc length for global s (clamped to [0, length]).
    _locate(s) {
        const n = this.primitives.length
        if (n === 0) return { i: -1, ls: 0 }
        if (s <= 0) return { i: 0, ls: 0 }
        if (s >= this.length) return { i: n - 1, ls: this.primitives[n - 1].length }
        // Binary search the cumulative-start array.
        let lo = 0, hi = n - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (this.starts[mid] <= s) lo = mid; else hi = mid - 1
        }
        return { i: lo, ls: s - this.starts[lo] }
    }

    pointAt(s) {
        const { i, ls } = this._locate(s)
        if (i < 0) return { x: 0, z: 0 }
        const q = primPose(this.primitives[i], ls)
        return { x: q.x, z: q.z }
    }

    tangentAt(s) {
        const { i, ls } = this._locate(s)
        if (i < 0) return { x: 1, z: 0 }
        const th = primPose(this.primitives[i], ls).theta
        return { x: Math.cos(th), z: Math.sin(th) }
    }

    // Signed curvature (1/m). Sign convention matches the router's κ (left turn positive).
    curvatureAt(s) {
        const { i, ls } = this._locate(s)
        if (i < 0) return 0
        return primPose(this.primitives[i], ls).kappa
    }

    // Minimum |radius| over the whole centerline (exact: the extremum of |1/κ| is at a primitive
    // endpoint since κ is monotone-linear within each primitive). This is the BUG-12 fold metric,
    // computed on the EXACT curve instead of a sampled polyline circumradius.
    minRadius() {
        let maxAbsK = 0
        for (const p of this.primitives) {
            maxAbsK = Math.max(maxAbsK, Math.abs(p.kappa0), Math.abs(p.kappa1))
        }
        return maxAbsK < EPS_K ? Infinity : 1 / maxAbsK
    }

    // Nearest point on the centerline to (x,z): coarse arc-length scan + one Newton refine.
    // Optional [sMin, sMax] window bounds the scan (cheaper, and disambiguates switchbacks/loops by
    // searching only near an expected arc) — used by per-slice projection in road.js.
    nearest(x, z, ds = 1.0, sMin = 0, sMax = this.length) {
        if (this.primitives.length === 0) return null
        const lo = Math.max(0, Math.min(this.length, sMin))
        const hi = Math.max(lo, Math.min(this.length, sMax))
        let bestS = lo, bestD2 = Infinity
        const n = Math.max(1, Math.ceil((hi - lo) / ds))
        for (let i = 0; i <= n; i++) {
            const s = lo + (hi - lo) * i / n
            const q = this.pointAt(s)
            const d2 = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z)
            if (d2 < bestD2) { bestD2 = d2; bestS = s }
        }
        // One projection refine: step along/against the tangent toward the foot of the perpendicular.
        const q = this.pointAt(bestS)
        const t = this.tangentAt(bestS)
        const along = (x - q.x) * t.x + (z - q.z) * t.z
        bestS = Math.max(lo, Math.min(hi, bestS + along))
        const fp = this.pointAt(bestS)
        return {
            s: bestS,
            x: fp.x, z: fp.z,
            dist: Math.hypot(fp.x - x, fp.z - z),
            tangent: this.tangentAt(bestS),
            curvature: this.curvatureAt(bestS),
        }
    }
}
