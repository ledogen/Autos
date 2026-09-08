// test/centerline-nearest-parity.mjs — PERF-32 gate: the Lipschitz-pruned Centerline.nearest scan
// returns BIT-IDENTICAL results to the unpruned linear scan it replaced.
//
// nearest() walks a fixed arc-length grid and keeps the strict argmin. PERF-32 skips grid points that
// the 1-Lipschitz bound (|P(s2)-P(s1)| <= |s2-s1|, exact for an arc-length parameterization) proves
// cannot strictly beat the best distance seen so far. That is a pure evaluation-count optimisation:
// same grid, same visit order, same strict-`<` update rule, so the answer must be identical to the
// LAST BIT, not merely close. This gate holds that claim, because everything downstream is a physical
// surface — _runGradeAt feeds the connector carve the road height the wheels ride on, and the mesh
// carve table samples the same function, so a 1-ulp drift here is a mesh-vs-physics disagreement.
//
// It also asserts the parameterization the prune STANDS ON (|dP/ds| == 1). If a future primitive type
// were added with a non-unit-speed parameterization the prune would become unsound while still looking
// correct on curved-but-slow curves, so the premise is checked directly rather than assumed.
//
// Run: node test/centerline-nearest-parity.mjs   (exit 0 = all green)

import * as THREE from 'three'
import { buildNetwork } from './lib/road-headless.mjs'

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// The pre-PERF-32 scan, verbatim — the reference the optimisation must reproduce.
function refNearest(cl, x, z, ds, sMin, sMax) {
    if (cl.primitives.length === 0) return null
    const lo = Math.max(0, Math.min(cl.length, sMin))
    const hi = Math.max(lo, Math.min(cl.length, sMax))
    let bestS = lo, bestD2 = Infinity
    const n = Math.max(1, Math.ceil((hi - lo) / ds))
    const q = { x: 0, z: 0, theta: 0, kappa: 0 }
    for (let i = 0; i <= n; i++) {
        const s = lo + (hi - lo) * i / n
        cl._poseInto(s, q)
        const d2 = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z)
        if (d2 < bestD2) { bestD2 = d2; bestS = s }
    }
    cl._poseInto(bestS, q)
    const along = (x - q.x) * Math.cos(q.theta) + (z - q.z) * Math.sin(q.theta)
    bestS = Math.max(lo, Math.min(hi, bestS + along))
    cl._poseInto(bestS, q)
    return {
        s: bestS, x: q.x, z: q.z,
        dist: Math.hypot(q.x - x, q.z - z),
        tangent: { x: Math.cos(q.theta), z: Math.sin(q.theta) },
        curvature: q.kappa,
    }
}

const road = buildNetwork({ x: 0, z: 0 })
const cls = [...road._network.values()].map(ce => ce.centerline).filter(cl => cl && cl.length > 1e-6)

// ── (1) the premise: arc-length parameterization ⇒ d(s) is 1-Lipschitz ────────────────────────────
{
    let worst = 0, n = 0
    const q1 = { x: 0, z: 0, theta: 0, kappa: 0 }, q2 = { x: 0, z: 0, theta: 0, kappa: 0 }
    for (const cl of cls) {
        const step = cl.length / 400
        for (let s = 0; s + step <= cl.length; s += step) {
            cl._poseInto(s, q1); cl._poseInto(s + step, q2)
            // chord <= arc always, so only an OVERSHOOT (ratio > 1) breaks the bound.
            worst = Math.max(worst, Math.hypot(q2.x - q1.x, q2.z - q1.z) / step - 1); n++
        }
    }
    log(worst <= 1e-6, 'PREMISE:unit-speed',
        `|ΔP|/Δs over ${n} samples on ${cls.length} centerlines overshoots 1 by at most ${worst.toExponential(2)} (chord ≤ arc ⇒ 1-Lipschitz)`)
}

// ── (2) bit-identity against the unpruned scan ────────────────────────────────────────────────────
// Sweeps the shapes that actually occur: on-curve and far-off-curve queries (the connector footprint
// samples up to ~15 m off a leg), both DS values in use (0.25 in _runGradeAt, 1.0 in the resolver),
// narrow and window-exceeding spans, and windows clamped at both ends of the curve.
{
    let rng = 20260907
    const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const OFFS = [0, 0.05, 1, 5, 15, 40, 200]
    const DSS  = [0.25, 0.5, 1.0, 2.0]
    const HALF = [0.5, 2, 20, 50, 1e9]
    let checks = 0, mismatch = 0, worstS = 0, evalsRef = 0, evalsNew = 0
    for (const cl of cls) {
        const q = { x: 0, z: 0, theta: 0, kappa: 0 }
        const poseInto = cl._poseInto.bind(cl)
        for (let t = 0; t < 3000; t++) {
            cl._poseInto(rnd() * cl.length, q)
            const off = OFFS[Math.floor(rnd() * OFFS.length)]
            const a = rnd() * Math.PI * 2
            const x = q.x + off * Math.cos(a), z = q.z + off * Math.sin(a)
            const ds = DSS[Math.floor(rnd() * DSS.length)]
            const half = HALF[Math.floor(rnd() * HALF.length)]
            const c = rnd() * cl.length
            let nNew = 0, nRef = 0
            cl._poseInto = (s, o) => { nNew++; return poseInto(s, o) }
            const A = cl.nearest(x, z, ds, c - half, c + half)
            cl._poseInto = (s, o) => { nRef++; return poseInto(s, o) }
            const B = refNearest(cl, x, z, ds, c - half, c + half)
            cl._poseInto = poseInto
            evalsNew += nNew; evalsRef += nRef; checks++
            if ((A === null) !== (B === null)) { mismatch++; continue }
            if (!A) continue
            if (A.s !== B.s || A.x !== B.x || A.z !== B.z || A.dist !== B.dist ||
                A.curvature !== B.curvature || A.tangent.x !== B.tangent.x || A.tangent.z !== B.tangent.z) {
                mismatch++
                worstS = Math.max(worstS, Math.abs(A.s - B.s))
                if (mismatch <= 3) console.log(`        first mismatches: ds=${ds} half=${half} off=${off}  s ${A.s} vs ${B.s}`)
            }
        }
    }
    log(checks > 0 && mismatch === 0, 'PARITY:pruned-vs-linear',
        `${checks} queries over ${cls.length} centerlines, ${mismatch} mismatched (worst Δs ${worstS}); ` +
        `${(evalsRef / checks).toFixed(1)} → ${(evalsNew / checks).toFixed(1)} pose evaluations per call ` +
        `(${(evalsRef / evalsNew).toFixed(1)}× fewer)`)
}

console.log(`\n================================================================`)
console.log(`CENTERLINE-NEAREST-PARITY GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
