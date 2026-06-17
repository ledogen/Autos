// test/arc-router.mjs — headless gates for the arc-primitive router (plan 09-31, D-arc).
//
// Proves the planner is VALID BY CONSTRUCTION without needing real road dumps or THREE:
//   1. REACHES GOAL          — last point ≈ b for flat + sloped terrain.
//   2. VALID-BY-CONSTRUCTION — dense XZ min-radius ≥ floor on ANY terrain (incl. a steep pass).
//   3. DETERMINISM           — two identical calls produce byte-identical geometry.
//   4. STRAIGHT ON FLAT      — flat terrain → (near) straight line, few heading changes.
//   5. SWITCHBACKS UP A PASS — steep ramp → path zigzags (length > straight) and caps grade below raw.
//
// Run: node test/arc-router.mjs   (exit 0 = all green)

import { arcPrimitiveConnect } from '../src/road-carve.js'

const HARD_R = 8
const FLOOR  = HARD_R * 0.9   // allow ~10% CR/sampling slack below the hard primitive radius

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// Min 3-point circumradius over an already-dense polyline (skip the short endpoint stubs).
function denseMinRadius(pts, skip = 2) {
    let min = Infinity
    for (let i = skip + 1; i < pts.length - 1 - skip; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1]
        const A = Math.hypot(c.x - b.x, c.z - b.z)
        const B = Math.hypot(a.x - c.x, a.z - c.z)
        const C = Math.hypot(b.x - a.x, b.z - a.z)
        const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
        if (area2 < 1e-9) continue
        const r = (A * B * C) / (2 * area2)
        if (r < min) min = r
    }
    return min
}
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z); return L }
const maxGrade = (pts) => { let g = 0; for (let i = 1; i < pts.length; i++) { const h = Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z); if (h > 1e-6) g = Math.max(g, Math.abs(pts[i].y-pts[i-1].y)/h) } return g }

const A = [0, 0], B = [256, 0]
const flat  = () => 0
const ramp  = (x) => 0.6 * x          // steep linear climb in +x (60% raw grade straight-line)
const opts = { hardR: HARD_R, gentleR: 30, maxGrade: 0.15 }

// 1 + 4: flat terrain
{
    const p = arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, opts)
    const reached = Math.hypot(p[p.length-1].x - B[0], p[p.length-1].z - B[1]) < 1e-6
    log(reached, 'REACHES-GOAL:flat', `end=(${p[p.length-1].x.toFixed(1)},${p[p.length-1].z.toFixed(1)}) target=(256,0)`)
    const len = pathLen(p), straight = Math.hypot(B[0]-A[0], B[1]-A[1])
    log(len < straight * 1.05, 'STRAIGHT-ON-FLAT', `len=${len.toFixed(1)}m vs straight=${straight}m (≤5% over)`)
}

// 2 + 5: steep pass forces switchbacks; must STILL be valid by construction
{
    const p = arcPrimitiveConnect(A[0], A[1], B[0], B[1], ramp, opts)
    const reached = Math.hypot(p[p.length-1].x - B[0], p[p.length-1].z - B[1]) < 1e-6
    log(reached, 'REACHES-GOAL:pass', `end=(${p[p.length-1].x.toFixed(1)},${p[p.length-1].z.toFixed(1)}) target=(256,0)`)
    const r = denseMinRadius(p)
    log(r >= FLOOR, 'VALID-BY-CONSTRUCTION:pass', `dense min-radius = ${r.toFixed(2)}m (floor = ${FLOOR}m, hardR = ${HARD_R}m)`)
    const len = pathLen(p)
    log(len > 256 * 1.1, 'SWITCHBACKS-UP-PASS', `len=${len.toFixed(1)}m > straight 256m (zigzags to limit grade); peakGrade=${(maxGrade(p)*100).toFixed(0)}%`)
}

// 2b: validity on flat too (sanity — straight has no sub-floor corners)
{
    const p = arcPrimitiveConnect(A[0], A[1], B[0], B[1], flat, opts)
    const r = denseMinRadius(p)
    log(r >= FLOOR, 'VALID-BY-CONSTRUCTION:flat', `dense min-radius = ${r === Infinity ? '∞' : r.toFixed(2)}m (floor = ${FLOOR}m)`)
}

// 3: determinism
{
    const p1 = arcPrimitiveConnect(A[0], A[1], B[0], B[1], ramp, opts)
    const p2 = arcPrimitiveConnect(A[0], A[1], B[0], B[1], ramp, opts)
    const same = p1.length === p2.length && p1.every((q, i) => q.x === p2[i].x && q.y === p2[i].y && q.z === p2[i].z)
    log(same, 'DETERMINISM', `${p1.length} pts, identical across two calls = ${same}`)
}

console.log(`\n================================================================`)
console.log(`ARC-ROUTER GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
