// src/centerline.js — the curvature-bounded road centerline model (Road Overhaul, Phase A).
//
// THE WHOLE POINT (see .planning/ROAD-OVERHAUL-HANDOFF.md): carry ONE exact, curvature-bounded
// centerline from the router to every consumer and SAMPLE it — never re-interpolate, never patch.
// BUG-12 (ribbon fold) was caused by re-fitting the already-valid routed path with overshooting
// centripetal Catmull-Rom in road.js `_assignSlice`. A Centerline made of typed primitives
// (line / circular-arc) has curvature known ANALYTICALLY and bounded BY CONSTRUCTION,
// so sampling it at any density can never fold (radius ≥ minR everywhere by definition).
//
// One primitive = a CONSTANT-curvature segment:
//     κ(s) = κ                            s ∈ [0, L]
//   • line : κ = 0
//   • arc  : κ ≠ 0
// Both heading and position are closed form — no tables, no numeric integration.
//
// QUAL-27: the clothoid (Euler-spiral) third case is DELETED. It existed for v1's Dubins terminals
// and its κ box-filter refit; the corridor router's stage 3 is lineArcFit, which only ever emits
// κ0 = κ1 (measured: seeds 6/20/11 streamed at 900 m — 553 line + 463 arc + 0 clothoid). It cost a
// Fresnel table per primitive and a branch in the two hottest samplers for a case that never
// occurred. A future G2 upgrade re-adds the ramp here; it does not get to live unused until then.
//
// Pure + deterministic (D-16): a primitive is a function of its start pose + length + endpoint
// curvatures only — no RNG, no Date, no stream/session state. Built per anchor-pair from anchor-
// derived canonical headings, so a Centerline is window-invariant by construction. XZ only; Y
// (gradeY) is owned by road.js's grade layer, sampled by arc-length the same way.

import * as THREE from 'three'

const EPS_K = 1e-9   // |κ| below this ⇒ treat as straight (closed-form line, avoids 1/κ blowup)

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

/**
 * makePrimitive — one centerline segment of CONSTANT curvature.
 * @returns {object} { x0, z0, theta0, length, kappa, x1, z1, theta1 }
 */
export function makePrimitive(x0, z0, theta0, length, kappa) {
    const e = constKappaPose(x0, z0, theta0, kappa, length)
    return { x0, z0, theta0, length, kappa, x1: e.x, z1: e.z, theta1: e.theta }
}

// Pose {x,z,theta,kappa} at local arc length ls within primitive p (ls clamped to [0,L]).
function primPose(p, ls) {
    const L = p.length
    if (ls <= 0) return { x: p.x0, z: p.z0, theta: p.theta0, kappa: p.kappa }
    if (ls >= L) return { x: p.x1, z: p.z1, theta: p.theta1, kappa: p.kappa }
    const e = constKappaPose(p.x0, p.z0, p.theta0, p.kappa, ls)
    return { x: e.x, z: e.z, theta: e.theta, kappa: p.kappa }
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
    getSpacedPoints(n = 5) {
        const out = []
        for (let i = 0; i <= n; i++) out.push(this.getPointAt(i / n))
        return out
    }
    getPoints(n = 5) { return this.getSpacedPoints(n) }
}

// ── Primitive-list surgery ────────────────────────────────────────────────────────────────────
// Work in DESCRIPTOR space, never on the sampled polyline: a result built from primitives is still a
// Centerline of typed primitives, so curvature stays bounded BY CONSTRUCTION (BUG-12), the analytic
// `nearest` refine still works, and nothing is re-interpolated. (QUAL-27: the deg-2 chain-merge
// splice these were written for is gone — FEAT-68 made runs 1:1 with edges — but the router's own
// stage-3 emit reads poses, and road.js builds the reverse spelling of an edge from reversePrimitives.)

/**
 * Pose (x, z, theta, kappa) at local arc `ls` along one primitive. Exported so the router can read
 * the exact frame at a join — the same closed form the sampler uses, so the join is exact.
 */
export function primitivePose(p, ls) { return primPose(p, ls) }

/**
 * `prims` traversed backwards. Each primitive restarts at its own END pose facing the other way with
 * its curvature NEGATED — going the other way round a bend turns the opposite hand. Needed because
 * an edge is stored A→B but a chain may traverse it B→A.
 */
export function reversePrimitives(prims) {
    const out = []
    for (let i = prims.length - 1; i >= 0; i--) {
        const p = prims[i]
        out.push(makePrimitive(p.x1, p.z1, p.theta1 + Math.PI, p.length, -p.kappa))
    }
    return out
}

// Wrap plain primitive descriptors {x0,z0,theta0,length,kappa} (the shape routeEdgeV2 hands back —
// and the shape that crosses the route/network Worker boundary by structured clone) into a
// Centerline. Descriptors stay dependency-free on the router side; this is the single place they
// become live primitives.
export function centerlineFromDescriptors(descs) {
    return new Centerline((descs || []).map(d =>
        makePrimitive(d.x0, d.z0, d.theta0, d.length, d.kappa)))
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

    // Minimum |radius| over the whole centerline (exact: κ is constant within each primitive, so the
    // extremum of |1/κ| is just the largest |κ| in the list). This is the BUG-12 fold metric, computed
    // on the EXACT curve instead of a sampled polyline circumradius.
    minRadius() {
        let maxAbsK = 0
        for (const p of this.primitives) maxAbsK = Math.max(maxAbsK, Math.abs(p.kappa))
        return maxAbsK < EPS_K ? Infinity : 1 / maxAbsK
    }

    // PERF-25: alloc-free pose evaluation — the SAME maths as _locate + primPose (and the
    // tangent/curvature reads that share them), fused into one scratch write so the hot
    // `nearest` scan below doesn't allocate 3 objects per sample. Bit-identical by construction:
    // every expression is copied verbatim from _locate/primPose/constKappaPose.
    _poseInto(s, out) {
        const n = this.primitives.length
        if (n === 0) { out.x = 0; out.z = 0; out.theta = 0; out.kappa = 0; return out }
        let i, ls
        if (s <= 0) { i = 0; ls = 0 }
        else if (s >= this.length) { i = n - 1; ls = this.primitives[n - 1].length }
        else {
            let lo = 0, hi = n - 1
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1
                if (this.starts[mid] <= s) lo = mid; else hi = mid - 1
            }
            i = lo; ls = s - this.starts[lo]
        }
        const p = this.primitives[i]
        const L = p.length
        out.kappa = p.kappa
        if (ls <= 0) { out.x = p.x0; out.z = p.z0; out.theta = p.theta0; return out }
        if (ls >= L) { out.x = p.x1; out.z = p.z1; out.theta = p.theta1; return out }
        const k = p.kappa
        if (Math.abs(k) < EPS_K) {
            out.x = p.x0 + ls * Math.cos(p.theta0)
            out.z = p.z0 + ls * Math.sin(p.theta0)
            out.theta = p.theta0
        } else {
            const th2 = p.theta0 + k * ls
            out.x = p.x0 + (Math.sin(th2) - Math.sin(p.theta0)) / k
            out.z = p.z0 - (Math.cos(th2) - Math.cos(p.theta0)) / k
            out.theta = th2
        }
        return out
    }

    /**
     * FEAT-76: the sub-curve over [s0, s1], re-based so the slice starts at arc 0.
     *
     * EXACT, not a re-fit: a constant-curvature primitive cut anywhere is two constant-curvature
     * primitives, so the result is still a Centerline of typed primitives and keeps every
     * guarantee that buys — bounded curvature by construction (BUG-12), analytic pointAt/nearest,
     * a truthful minRadius(). Used when a T promotion splits a trunk run at a departure node:
     * each half has to be ORDINARY road, which means an ordinary centerline, not a sampler shim.
     */
    slice(s0, s1) {
        const a = Math.max(0, Math.min(this.length, Math.min(s0, s1)))
        const b = Math.max(0, Math.min(this.length, Math.max(s0, s1)))
        const out = []
        for (let i = 0; i < this.primitives.length; i++) {
            const p = this.primitives[i]
            const ps = this.starts[i], pe = ps + p.length
            if (pe <= a + 1e-9 || ps >= b - 1e-9) continue
            const c0 = Math.max(a, ps) - ps, c1 = Math.min(b, pe) - ps
            const L = c1 - c0
            if (!(L > 1e-9)) continue
            if (c0 <= 1e-9 && c1 >= p.length - 1e-9) { out.push(p); continue }   // whole primitive
            const q = primPose(p, c0)
            out.push(makePrimitive(q.x, q.z, q.theta, L, p.kappa))
        }
        return new Centerline(out)
    }

    // Nearest point on the centerline to (x,z): coarse arc-length scan + one Newton refine.
    // Optional [sMin, sMax] window bounds the scan (cheaper, and disambiguates switchbacks/loops by
    // searching only near an expected arc) — used by per-slice projection in road.js.
    // PERF-25: runs on _poseInto (fused _locate+primPose, zero-alloc) — identical scan grid,
    // identical refine, identical returned values; only the intermediate allocations are gone.
    //
    // PERF-32 (LIPSCHITZ SKIP — same grid, same argmin, fewer evaluations):
    // The scan is a linear walk over a fixed grid, and callers hand it wide windows: _runGradeAt asks
    // for +/-20 m at ds 0.25 (162 poses) because the polyline foot it centres on can be ~2 m off. Nearly
    // all of that window is far from the foot and cannot possibly win, but the plain walk still poses
    // every point of it — and the wheel contact path calls this ~1600 times per physics step on a
    // connector (8.5 ms of a 16.7 ms frame; the PERF-32 lag).
    //
    // Primitives are ARC-LENGTH parameterized, so chord <= arc gives |P(s2)-P(s1)| <= |s2-s1| exactly,
    // and therefore d(s) = |P(s)-q| is 1-Lipschitz: knowing d at one grid point bounds it at every
    // other. After posing s_i we can skip the next k-1 points, k = floor((d_i - dBound)/step), because
    // each of them satisfies d >= d_i - (k-1)*step >= dBound + step — a FULL grid step clear of the
    // best distance seen anywhere, so none can strictly beat it. (float slack here is ~1e-12 against a
    // 0.25 m margin.)
    //
    // Why the result is bit-identical, not merely close:
    //   · the surviving points are posed on the SAME grid, in the SAME increasing-index order;
    //   · bestS/bestD2 still update on strict `<` only, so ties resolve to the same lowest index;
    //   · every skipped point is proven to lie STRICTLY above dBound >= the grid minimum, so it is not
    //     an argmin and could not have updated bestS even if it had been posed.
    // dBound is a pure pruning bound and never writes bestS, which is why the mid-window warm probe
    // below (out of index order, to arm the skip before the walk reaches the foot) cannot bias the
    // tie-break. Verified against the unpruned scan by the `centerline-nearest-parity` gate.
    nearest(x, z, ds = 1.0, sMin = 0, sMax = this.length) {
        if (this.primitives.length === 0) return null
        const lo = Math.max(0, Math.min(this.length, sMin))
        const hi = Math.max(lo, Math.min(this.length, sMax))
        let bestS = lo, bestD2 = Infinity
        const n = Math.max(1, Math.ceil((hi - lo) / ds))
        const q = this._scratchPose || (this._scratchPose = { x: 0, z: 0, theta: 0, kappa: 0 })
        const step = (hi - lo) / n
        // Warm probe at the window centre — callers centre the window on their best estimate of the
        // foot, so this is usually within a metre of the winner and arms the skip immediately. Prune
        // bound only: it must not touch bestS (see the tie-break note above).
        let dBound = Infinity
        if (n > 3) {
            this._poseInto(lo + (hi - lo) * (n >> 1) / n, q)
            dBound = Math.hypot(q.x - x, q.z - z)
        }
        for (let i = 0; i <= n; i++) {
            const s = lo + (hi - lo) * i / n
            this._poseInto(s, q)
            const d2 = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z)
            if (d2 < bestD2) { bestD2 = d2; bestS = s }
            const d = Math.sqrt(d2)
            if (d < dBound) dBound = d
            if (step > 0) {
                const k = Math.floor((d - dBound) / step)
                if (k > 1) i += k - 1
            }
        }
        // One projection refine: step along/against the tangent toward the foot of the perpendicular.
        this._poseInto(bestS, q)
        const along = (x - q.x) * Math.cos(q.theta) + (z - q.z) * Math.sin(q.theta)
        bestS = Math.max(lo, Math.min(hi, bestS + along))
        this._poseInto(bestS, q)
        return {
            s: bestS,
            x: q.x, z: q.z,
            dist: Math.hypot(q.x - x, q.z - z),
            tangent: { x: Math.cos(q.theta), z: Math.sin(q.theta) },
            curvature: q.kappa,
        }
    }
}
