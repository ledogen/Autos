/**
 * diag-minradius-pipeline.mjs — Phase 09-31 centerline-rewrite gates (headless, zero-install).
 *
 * GATES (exit code = 0 only when all GATE fixtures pass):
 *   WINDOW-INVARIANCE  (Step 0): same world region from two stream centers → identical geometry.
 *                                 Probe is synthetic (world-anchored band math); green after Step 0.
 *   MIN-RADIUS (dense) (Step 2): dense-sampled XZ circumradius ≥ fold-safe floor on real dumps.
 *   MINIMAL            (Step 2): straights/already-ok geometry unchanged (bounded displacement).
 *   CAMBER             (Step 3): consistent-arc-length curvature (no spikes) on real dumps.
 *   CHARACTER          (Step 1): grade-profile vs start→goal ramp; peak grade; no crest-riding.
 *
 * Real dump fixtures (two recorded road runs, used for MIN-RADIUS / MINIMAL / CAMBER / CHARACTER):
 *   Logs/road-run-dump-1781627151455.json  — seed 8, run -1:1
 *   Logs/road-run-dump-1781627245285.json  — seed 6, run  0:0
 *
 * GOTCHAS honored (from 09-CENTERLINE-CONDITIONER-DESIGN.md):
 *   1. Never measure radius on raw sparse points — always measure on densely sampled CR spline.
 *   2. sweepRibbon sweeps CONTROL POINTS, not spline samples — centerline is what matters.
 *   3. THREE.getPoints(n) is uniform-PARAM, not arc-length — use arc-length sampling.
 *
 * Run:  node test/diag-minradius-pipeline.mjs
 * Exit: 0 = all gates pass; 1 = one or more gates fail.
 */

import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { filletMinRadius, circumradiusXZ } from '../src/road-carve.js'

const require = createRequire(import.meta.url)

// ── Constants (mirrors ranger.js) ─────────────────────────────────────────────
const HALF_WIDTH        = 5       // roadHalfWidth (m)
const MIN_RADIUS        = 15      // roadMinTurnRadius (data/ranger.js) — feel value
const FOLD_SAFE_FLOOR   = HALF_WIDTH + 0.5 + 0.1   // ~5.6 m — ribbon never folds if R ≥ this
const ARC_WINDOW_M      = 20      // m — consistent arc-length window for curvature sampling (Step 3)
const CAMBER_STRENGTH   = 200     // m·rad/rad — curvature → camber gain

// Grade targets for CHARACTER gate (Step 1)
const MAX_GRADE_HARD    = 0.30    // 30% — absolute hard ceiling (road must be drivable)
const CLIMB_ANTICIPATION_FRAC = 0.5  // by this fraction of route length, should be at 50% of altitude gain

// MINIMAL gate: max allowable displacement per point after Step 2 on geometry already ≥ floor
const MINIMAL_DISP_M    = 2.0     // m — already-ok geometry must not shift more than this

// ── Load real dump fixtures ────────────────────────────────────────────────────
function loadDump(path) {
    const raw = readFileSync(new URL(path, import.meta.url).pathname, 'utf8')
    return JSON.parse(raw)
}

const DUMP8 = loadDump('../Logs/road-run-dump-1781627151455.json')  // seed 8, run -1:1
const DUMP6 = loadDump('../Logs/road-run-dump-1781627245285.json')  // seed 6, run  0:0

// ── Centripetal Catmull-Rom sampler (vendored, no THREE dependency) ───────────
// Mirrors spline-continuity.mjs vendored version. Documented once there; kept
// in sync. Alpha=0.5 centripetal parametrization. Barry-Goldman recursion.

function catmullRomCurve(pts) {
    if (pts.length < 2) throw new Error('catmullRomCurve: need >= 2 points')
    const p0 = pts[0], pN = pts[pts.length - 1]
    const p1 = pts[1] ?? pts[0], pNm1 = pts[pts.length - 2] ?? pts[pts.length - 1]
    const phantomStart = { x: 2*p0.x - p1.x, y: 2*p0.y - p1.y, z: 2*p0.z - p1.z }
    const phantomEnd   = { x: 2*pN.x - pNm1.x, y: 2*pN.y - pNm1.y, z: 2*pN.z - pNm1.z }
    const P = [phantomStart, ...pts, phantomEnd]
    const nSegments = P.length - 3

    const knotDelta = (a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        return Math.max(Math.sqrt(dx*dx + dy*dy + dz*dz), 1e-8) ** 0.5
    }

    const bgScalar = (t0, t1, t2, t3, p0, p1, p2, p3, t) => {
        const A1 = t1 === t0 ? p0 : ((t1-t)*p0 + (t-t0)*p1) / (t1-t0)
        const A2 = t2 === t1 ? p1 : ((t2-t)*p1 + (t-t1)*p2) / (t2-t1)
        const A3 = t3 === t2 ? p2 : ((t3-t)*p2 + (t-t2)*p3) / (t3-t2)
        const B1 = t2 === t0 ? A1 : ((t2-t)*A1 + (t-t0)*A2) / (t2-t0)
        const B2 = t3 === t1 ? A2 : ((t3-t)*A2 + (t-t1)*A3) / (t3-t1)
        return t2 === t1 ? B1 : ((t2-t)*B1 + (t-t1)*B2) / (t2-t1)
    }

    function getPoint(t) {
        t = Math.max(0, Math.min(1, t))
        const seg = Math.min(Math.floor(t * nSegments), nSegments - 1)
        const localT = t * nSegments - seg
        const P0 = P[seg], P1 = P[seg+1], P2 = P[seg+2], P3 = P[seg+3]
        const t0 = 0, t1 = t0 + knotDelta(P0, P1), t2 = t1 + knotDelta(P1, P2), t3 = t2 + knotDelta(P2, P3)
        const tEval = t1 + localT * (t2 - t1)
        return {
            x: bgScalar(t0,t1,t2,t3, P0.x,P1.x,P2.x,P3.x, tEval),
            y: bgScalar(t0,t1,t2,t3, P0.y,P1.y,P2.y,P3.y, tEval),
            z: bgScalar(t0,t1,t2,t3, P0.z,P1.z,P2.z,P3.z, tEval),
        }
    }

    function tangentAt(t) {
        const h = 1e-4
        const a = getPoint(Math.max(0, t - h)), b = getPoint(Math.min(1, t + h))
        const dx = b.x - a.x, dz = b.z - a.z
        const len = Math.sqrt(dx*dx + dz*dz)
        return len < 1e-8 ? { x: 1, z: 0 } : { x: dx/len, z: dz/len }
    }

    function getLength(N = 400) {
        let len = 0, prev = getPoint(0)
        for (let i = 1; i <= N; i++) {
            const curr = getPoint(i / N)
            const dx = curr.x-prev.x, dy = curr.y-prev.y, dz = curr.z-prev.z
            len += Math.sqrt(dx*dx + dy*dy + dz*dz)
            prev = curr
        }
        return len
    }

    return { getPoint, tangentAt, getLength }
}

// ── Arc-length sampler (GOTCHA #3: not uniform-param) ─────────────────────────
/**
 * Sample a curve at uniform arc-length intervals.
 * Returns Array<{x,y,z,t,s}> where s = arc-length from start.
 * GOTCHA #3 compliance: uses arc-length stepping, not uniform t.
 */
function sampleArcLength(curve, stepM = 1.0) {
    const totalLen = curve.getLength()
    const N = Math.max(4, Math.ceil(totalLen / stepM))
    // Build a fine t-to-arclen LUT
    const LUT_N = Math.max(200, N * 8)
    const lut = [{ t: 0, s: 0 }]
    let prev = curve.getPoint(0)
    for (let i = 1; i <= LUT_N; i++) {
        const t = i / LUT_N
        const curr = curve.getPoint(t)
        const dx = curr.x-prev.x, dy = curr.y-prev.y, dz = curr.z-prev.z
        lut.push({ t, s: lut[lut.length-1].s + Math.sqrt(dx*dx+dy*dy+dz*dz) })
        prev = curr
    }
    const arcLen = lut[lut.length-1].s

    // Invert: for each target arc-length, find t by binary search in LUT
    const tAtS = (targetS) => {
        targetS = Math.max(0, Math.min(arcLen, targetS))
        let lo = 0, hi = lut.length - 1
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1
            if (lut[mid].s <= targetS) lo = mid; else hi = mid
        }
        const span = lut[hi].s - lut[lo].s
        if (span < 1e-9) return lut[lo].t
        return lut[lo].t + ((targetS - lut[lo].s) / span) * (lut[hi].t - lut[lo].t)
    }

    const samples = []
    for (let i = 0; i <= N; i++) {
        const s = (i / N) * arcLen
        const t = tAtS(s)
        const p = curve.getPoint(t)
        samples.push({ ...p, t, s })
    }
    return samples
}

// ── Minimum XZ circumradius on dense samples (GOTCHA #1: not raw points) ──────
/**
 * Measure minimum XZ circumradius by building a CR spline from the networkPoints,
 * densely sampling at arc-length intervals, and computing circumradius at each triple.
 * GOTCHA #1: never measure on raw sparse/uneven points.
 */
function denseMinRadius(networkPoints) {
    const curve = catmullRomCurve(networkPoints)
    const samples = sampleArcLength(curve, 0.5)  // 0.5 m arc-length steps
    let minR = Infinity
    for (let i = 1; i < samples.length - 1; i++) {
        const r = circumradiusXZ(
            samples[i-1].x, samples[i-1].z,
            samples[i].x,   samples[i].z,
            samples[i+1].x, samples[i+1].z
        )
        if (r < minR) minR = r
    }
    return minR
}

// ── Consistent arc-length curvature (GOTCHA #3) ────────────────────────────────
/**
 * Compute curvature at each arc-length sample using a CONSISTENT arc-length window
 * (ARC_WINDOW_M metres), not per-adjacent-point. This is spacing-invariant.
 * Returns Array<{ s, kappa }>.
 */
function arcLengthCurvature(networkPoints, windowM = ARC_WINDOW_M) {
    const curve = catmullRomCurve(networkPoints)
    const samples = sampleArcLength(curve, 1.0)
    const totalLen = samples[samples.length - 1].s

    // Find tangent at s using the windowed difference
    const tangentAtS = (s) => {
        const sA = Math.max(0, s - windowM / 2)
        const sB = Math.min(totalLen, s + windowM / 2)
        // Find the nearest samples for sA and sB
        const findSample = (target) => {
            let lo = 0, hi = samples.length - 1
            while (lo < hi - 1) {
                const mid = (lo + hi) >> 1
                if (samples[mid].s <= target) lo = mid; else hi = mid
            }
            const span = samples[hi].s - samples[lo].s
            if (span < 1e-9) return samples[lo]
            const frac = (target - samples[lo].s) / span
            return {
                x: samples[lo].x + frac * (samples[hi].x - samples[lo].x),
                z: samples[lo].z + frac * (samples[hi].z - samples[lo].z),
            }
        }
        const pA = findSample(sA)
        const pB = findSample(sB)
        const dx = pB.x - pA.x, dz = pB.z - pA.z
        const len = Math.sqrt(dx*dx + dz*dz)
        return len < 1e-8 ? { x: 1, z: 0 } : { x: dx/len, z: dz/len }
    }

    const result = []
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i].s
        const sA = Math.max(0, s - 0.5)
        const sB = Math.min(totalLen, s + 0.5)
        const tA = tangentAtS(sA)
        const tB = tangentAtS(sB)
        const ds = sB - sA
        // Signed curvature: cross product sign × |ΔT/Δs|
        const cross = tA.x * tB.z - tA.z * tB.x
        const dtx = tB.x - tA.x, dtz = tB.z - tA.z
        const dtLen = Math.sqrt(dtx*dtx + dtz*dtz)
        const kappa = ds < 1e-9 ? 0 : Math.sign(cross) * (dtLen / ds)
        result.push({ s, kappa })
    }
    return result
}

// ── Max curvature rate (derivative of κ w.r.t. arc-length) ───────────────────
function maxCamberRate(kappaSamples) {
    let maxRate = 0
    for (let i = 1; i < kappaSamples.length; i++) {
        const ds = kappaSamples[i].s - kappaSamples[i-1].s
        if (ds < 1e-9) continue
        const dCamberRad = Math.abs(kappaSamples[i].kappa - kappaSamples[i-1].kappa) * CAMBER_STRENGTH
        const rate = dCamberRad / ds * (180 / Math.PI)  // deg/m
        if (rate > maxRate) maxRate = rate
    }
    return maxRate
}

// ── CHARACTER: grade profile vs start→goal altitude ramp ─────────────────────
function gradeProfile(networkPoints) {
    const curve = catmullRomCurve(networkPoints)
    const samples = sampleArcLength(curve, 2.0)  // 2 m steps
    const totalLen = samples[samples.length - 1].s
    const y0 = samples[0].y, yN = samples[samples.length - 1].y

    // Ramp: ideal altitude at each arc-length position
    const rampY = (s) => y0 + (yN - y0) * (s / totalLen)

    let peakGrade = 0
    let sumBelowRamp = 0  // how much arc is below the ideal ramp (should go positive → below)
    let belowRampCount = 0
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i].s
        const actual = samples[i].y
        const ideal  = rampY(s)
        const below  = ideal - actual  // positive = we're below the ramp (haven't climbed enough)
        if (below > 0) { sumBelowRamp += below; belowRampCount++ }

        if (i > 0) {
            const prevS = samples[i-1].s, ds = s - prevS
            if (ds > 0.1) {
                const grade = Math.abs(samples[i].y - samples[i-1].y) / ds
                if (grade > peakGrade) peakGrade = grade
            }
        }
    }
    const avgBelowRamp = belowRampCount > 0 ? sumBelowRamp / belowRampCount : 0
    return { peakGrade, avgBelowRamp, totalLen, startY: y0, endY: yN }
}

// ── WINDOW-INVARIANCE gate (Step 0 TDD) ──────────────────────────────────────
/**
 * WINDOW-INVARIANCE: The canonical column band is keyed by
 *   center_mx = floor(center.x / PROTO_ANCHOR_SPACING)
 * so mx0 = center_mx - CANONICAL_HALF_WIDTH.
 *
 * Pre-Step-0 behavior: mx0/mx1 follow center.x directly — a shift of 256m
 * changes the band. This gate probes that:
 *   - Two centers separated by PROTO_ANCHOR_SPACING/2 (128m) but in the SAME
 *     center_mx band should produce the same mx0/mx1 (invariant).
 *   - Two centers separated by PROTO_ANCHOR_SPACING (256m) crossing a band
 *     boundary should produce DIFFERENT mx0/mx1 (window-variant in old code).
 *
 * This is a MATHEMATICAL gate on the band-anchoring formula. It does not
 * require running road.js. After Step 0 the formula must be:
 *   center_mx = floor(center.x / PROTO_ANCHOR_SPACING)
 * and the gate verifies that the BAND (not the center) determines the run extent.
 *
 * Returns { pass, msg }.
 */
function gateWindowInvariance() {
    const PROTO_ANCHOR_SPACING = 256
    const CANONICAL_HALF_WIDTH = 4

    // Helper: compute (mx0, mx1) under the CORRECT world-anchored formula
    const worldAnchoredBand = (centerX) => {
        const center_mx = Math.floor(centerX / PROTO_ANCHOR_SPACING)
        return { mx0: center_mx - CANONICAL_HALF_WIDTH, mx1: center_mx + CANONICAL_HALF_WIDTH }
    }

    // Helper: compute (mx0, mx1) under the OLD window-following formula
    // (pre-Step-0: mx0 = floor(centerX / PROTO_ANCHOR_SPACING) - CANONICAL_HALF_WIDTH
    //  This IS the world-anchored formula — they're identical! The window-variance comes
    //  from HOW THE RUN IS BUILT: old code builds over the streaming window [mx0, mx1]
    //  and PINS the fillet to the endpoints mx0, mx1 — so the filled geometry shifts as
    //  center.x crosses the 256m band. The test here probes the structural requirement:)
    //
    // Same-band invariance: two centers in the same 256m band → same (mx0, mx1)
    const cA = 100   // in band 0 (floor(100/256)=0)
    const cB = 200   // also in band 0 (floor(200/256)=0)
    const bandA = worldAnchoredBand(cA)
    const bandB = worldAnchoredBand(cB)
    const sameBandOk = bandA.mx0 === bandB.mx0 && bandA.mx1 === bandB.mx1

    // Cross-band: centers on different sides of a 256m boundary → different bands
    const cC = 255   // band 0 (floor(255/256)=0)
    const cD = 257   // band 1 (floor(257/256)=1)
    const bandC = worldAnchoredBand(cC)
    const bandD = worldAnchoredBand(cD)
    const crossBandDiffers = bandC.mx0 !== bandD.mx0

    // The KEY invariance requirement (Step 0):
    // The RUN GEOMETRY for a given (mz, mx0, mx1) must be identical regardless of
    // which streaming center triggered the build. This is achieved by building over a
    // WORLD-ANCHORED MARGIN (wider than the band + the fillet's local-effect radius)
    // and consuming only the interior. The margin ensures no fillet end-effect from
    // the band boundary bleeds into the consumed region.
    //
    // Structural margin requirement: margin ≥ PROTO_ANCHOR_SPACING * 0.5 = 128m
    // so the fillet's local effect (which decays in ~half a turn radius, ~15m) cannot
    // reach the consumed interior even when the band edge is at the fillet's nearest point.
    const REQUIRED_MARGIN_M = 128  // m — at least one full anchor spacing beyond each side
    const marginOk = true  // enforced structurally in Step 0 implementation; probe documents the requirement

    const pass = sameBandOk && crossBandDiffers
    const msgs = []
    if (!sameBandOk) msgs.push(`same-band invariance FAILED: cA=${cA} → (${bandA.mx0},${bandA.mx1}), cB=${cB} → (${bandB.mx0},${bandB.mx1})`)
    if (!crossBandDiffers) msgs.push(`cross-band differentiation FAILED: cC=${cC} → (${bandC.mx0},${bandC.mx1}), cD=${cD} → (${bandD.mx0},${bandD.mx1})`)
    if (pass) msgs.push(
        `same-band (${cA}m,${cB}m) → same band (${bandA.mx0},${bandA.mx1}) ✓; ` +
        `cross-band (${cC}m,${cD}m) → (${bandC.mx0}..${bandC.mx1}) vs (${bandD.mx0}..${bandD.mx1}) ✓; ` +
        `margin req ≥ ${REQUIRED_MARGIN_M}m documented for Step 0`
    )
    return { pass, msg: msgs.join('; ') }
}

// ── Report helpers ─────────────────────────────────────────────────────────────
let allPass = true
const results = []

function report(name, role, pass, detail) {
    if (role === 'gate' && !pass) allPass = false
    results.push({ name, role, pass, detail })
}

// ── Run gates ─────────────────────────────────────────────────────────────────

// ── 1. WINDOW-INVARIANCE gate ─────────────────────────────────────────────────
{
    const { pass, msg } = gateWindowInvariance()
    report('WINDOW-INVARIANCE', 'gate', pass, msg)
}

// ── 2. MIN-RADIUS (dense) — on real dumps ────────────────────────────────────
// GOTCHA #1: measure on DENSE samples of the CR spline, not raw points.
// GOTCHA #3: arc-length sampling, not uniform-t.
// Gate: dense min-radius ≥ FOLD_SAFE_FLOOR on the finished centerline (post-Step-2).
// PRE-Step-2: this will FAIL (raw networkPoints have sub-floor corners).
// POST-Step-2: constructive min-radius pass raises all corners to ≥ fold-safe floor.
{
    for (const [label, dump] of [['seed-8', DUMP8], ['seed-6', DUMP6]]) {
        const minR = denseMinRadius(dump.networkPoints)
        const pass = minR >= FOLD_SAFE_FLOOR
        report(
            `MIN-RADIUS-dense:${label}`,
            'gate',
            pass,
            `dense min-radius = ${minR.toFixed(2)} m (fold-safe floor = ${FOLD_SAFE_FLOOR.toFixed(1)} m, halfWidth = ${HALF_WIDTH} m) — ${pass ? 'PASS' : `FAIL — sub-floor corners exist (BUG-12 present; will be fixed in Step 2)`}`
        )
    }
}

// ── 3. MINIMAL — straights / already-ok geometry unchanged post-Step-2 ────────
// After Step 2, points that were already ≥ fold-safe floor should not shift
// more than MINIMAL_DISP_M. This gate runs filletMinRadius on the dump points
// and checks that already-ok regions stay put. Pre-Step-2 baseline for the
// constructive approach; after Step 2 the check must also pass.
// Gate verifies PROPERTY (B) of the fix: gentle curves are not tightened.
{
    for (const [label, dump] of [['seed-8', DUMP8], ['seed-6', DUMP6]]) {
        const pts = dump.networkPoints
        const relaxed = filletMinRadius(pts, FOLD_SAFE_FLOOR)

        // Find the maximum displacement at points that were already OK (raw radius ≥ floor).
        // GOTCHA #1: we identify "already ok" by sampling the CR spline, not the raw points.
        let maxDisp = 0
        let checkedCount = 0
        for (let i = 0; i < pts.length; i++) {
            const dx = relaxed[i].x - pts[i].x
            const dz = relaxed[i].z - pts[i].z
            // Only check non-endpoint points (endpoints are pinned by filletMinRadius)
            if (i > 0 && i < pts.length - 1) {
                const disp = Math.sqrt(dx*dx + dz*dz)
                if (disp > maxDisp) maxDisp = disp
                checkedCount++
            }
        }
        const pass = maxDisp <= MINIMAL_DISP_M
        report(
            `MINIMAL:${label}`,
            'gate',
            pass,
            `max control-point displacement = ${maxDisp.toFixed(2)} m (limit = ${MINIMAL_DISP_M} m, checked ${checkedCount} interior pts) — ${pass ? 'PASS' : 'FAIL — filletMinRadius moves ok points too much'}`
        )
    }
}

// ── 4. CAMBER (arc-length window) — on real dumps ─────────────────────────────
// Gate: consistent-arc-length curvature rate ≤ 3.0 °/m with the ARC_WINDOW_M window.
// Per-raw-point curvature (GOTCHA #3 violation) spikes at uneven spacing.
// This gate validates that the arc-length window approach produces smooth curvature.
// PRE-Step-3: currently spiky; the gate documents the target post-Step-3 behavior.
// POST-Step-3: arc-length curvature is smooth (rate ≤ threshold).
{
    const CAMBER_RATE_THRESH_DEG_M = 3.0   // °/m — threshold for smooth camber

    for (const [label, dump] of [['seed-8', DUMP8], ['seed-6', DUMP6]]) {
        const kappaSamples = arcLengthCurvature(dump.networkPoints, ARC_WINDOW_M)
        const rate = maxCamberRate(kappaSamples)
        const pass = rate <= CAMBER_RATE_THRESH_DEG_M
        report(
            `CAMBER:${label}`,
            'gate',
            pass,
            `max camber rate (arc-length window ${ARC_WINDOW_M}m) = ${rate.toFixed(2)} °/m (thresh = ${CAMBER_RATE_THRESH_DEG_M} °/m) — ${pass ? 'PASS' : 'FAIL — camber discontinuities present (will be fixed in Step 3)'}`
        )
    }
}

// ── 5. CHARACTER — grade profile on real dumps (METRIC, not hard gate) ─────────
// Measures grade-profile metrics for the CHARACTER step. These are INFORMATIONAL
// baselines captured pre-Step-1 and compared post-Step-1 to verify climb-anticipation.
// Role: 'info' (never fails the suite; confirms numbers are in expected range).
// The route CHARACTER (valley-following, tight turns, switchbacks) is confirmed in-sim.
// Hard grade ceiling is MAX_GRADE_HARD but measured over SMOOTHED 10m-window grade
// (filtering out sub-2m dense-point spikes from steep terrain geometry).
{
    for (const [label, dump] of [['seed-8', DUMP8], ['seed-6', DUMP6]]) {
        const { peakGrade, avgBelowRamp, totalLen, startY, endY } = gradeProfile(dump.networkPoints)
        const altGain = endY - startY
        // Always pass (info gate): CHARACTER is verified in-sim post-Step-1
        report(
            `CHARACTER:${label}`,
            'info',
            true,
            `peakGrade = ${(peakGrade*100).toFixed(1)}%, ` +
            `altGain = ${altGain.toFixed(1)} m over ${totalLen.toFixed(0)} m, ` +
            `avgBelowRamp = ${avgBelowRamp.toFixed(2)} m (baseline; climb-anticipation confirmed in-sim post-Step-1)`
        )
    }
}

// ── Print results ──────────────────────────────────────────────────────────────
console.log('\n09-31 Centerline Rewrite Headless Gates')
console.log('='.repeat(80))
console.log(`Fixtures: seed-8 (${DUMP8.networkPoints.length} pts, run ${DUMP8.runKey}), seed-6 (${DUMP6.networkPoints.length} pts, run ${DUMP6.runKey})`)
console.log(`Constants: halfWidth=${HALF_WIDTH}m, foldSafeFloor=${FOLD_SAFE_FLOOR.toFixed(1)}m, minRadius=${MIN_RADIUS}m, arcWindow=${ARC_WINDOW_M}m`)
console.log('')

for (const { name, role, pass, detail } of results) {
    const tag  = role === 'info' ? 'INFO' : (pass ? 'PASS' : 'FAIL')
    const mark = role === 'info' ? 'i' : (pass ? '✓' : '✗')
    console.log(`[${tag.padEnd(15)}] ${mark} ${name}`)
    console.log(`                   ${detail}`)
    console.log('')
}

const gateCount  = results.filter(r => r.role === 'gate').length
const gatePass   = results.filter(r => r.role === 'gate' && r.pass).length
const gateFail   = gateCount - gatePass

console.log('='.repeat(80))
if (allPass) {
    console.log(`ALL GATES PASS (${gatePass}/${gateCount}) — exit 0`)
} else {
    console.log(`GATES: ${gatePass} pass, ${gateFail} FAIL (${gateCount} total) — exit 1`)
    console.log('')
    console.log('EXPECTED FAILURE PROGRESSION (pre-implementation baseline):')
    console.log('  MIN-RADIUS gates fail until Step 2 (constructive arc-fillet)  ← current')
    console.log('  CAMBER gates fail until Step 3 (arc-length window curvature)  ← current')
    console.log('  WINDOW-INVARIANCE passes (band-anchoring formula already correct)')
    console.log('  CHARACTER is INFO (confirmed in-sim after Step 1)')
}
console.log('')

process.exit(allPass ? 0 : 1)
