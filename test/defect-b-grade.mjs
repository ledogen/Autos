// test/defect-b-grade.mjs — headless gates for defect B (vertical airborne peaks), plan 09-31.
//
// Proves smoothGradeInPlace() (road-carve.js) grades the centerline WITHOUT needing THREE/terrain:
//   1. GRADE-FLIP COLLAPSE — a ridged terrain-following profile (the arc router's Y=coarseHeight)
//      has many >30° vertical grade-flips that LAUNCH the truck; smoothing must crush them.
//   2. WINDOW-INVARIANCE   — interior points (≥window from either truncated end) get IDENTICAL Y
//      regardless of how far the polyline extends past them (the re-stream invariance property).
//   3. RAMP PRESERVED      — a pure linear grade is (near) unchanged in the interior (no flattening
//      of real mountains — only the fine ridge texture is removed).
//   4. DETERMINISM         — two identical calls produce byte-identical Y.
//
// Run: node test/defect-b-grade.mjs   (exit 0 = all green)

import { smoothGradeInPlace } from '../src/road-carve.js'

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

const WINDOW = 50  // designGradeWindow default (m)
const DS = 4       // ~arc router emitDs spacing (m)

// Synthetic centerline running +x at ~4 m spacing. Y = slow coarse grade (a real hill) PLUS
// fine ridge texture (period ~16 m, ±4 m) — i.e. the raw coarseHeight a terrain-following road rides.
function makeProfile(x0, x1, withRidges = true) {
    const pts = []
    for (let x = x0; x <= x1; x += DS) {
        const grade = 0.04 * x                                   // 4% real hill (kept)
        const ridge = withRidges ? 4.0 * Math.sin(x * (2 * Math.PI / 16)) : 0   // fine texture (removed)
        pts.push({ x, z: 0, y: grade + ridge })
    }
    return pts
}

// Count interior grade-flips sharper than `deg` between consecutive segments (vertical plane).
function gradeFlips(pts, deg) {
    const lim = deg * Math.PI / 180
    let n = 0, worst = 0
    for (let i = 1; i < pts.length - 1; i++) {
        const a0 = Math.atan2(pts[i].y - pts[i - 1].y, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
        const a1 = Math.atan2(pts[i + 1].y - pts[i].y, Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z))
        const d = Math.abs(a1 - a0)
        worst = Math.max(worst, d)
        if (d > lim) n++
    }
    return { n, worstDeg: worst * 180 / Math.PI }
}

// ── 1. GRADE-FLIP COLLAPSE ────────────────────────────────────────────────────
{
    const raw = makeProfile(0, 800)
    const before = gradeFlips(raw, 30)
    const sm = raw.map(p => ({ ...p }))
    smoothGradeInPlace(sm, WINDOW)
    const after = gradeFlips(sm, 30)
    const ok = before.n > 0 && after.n === 0 && after.worstDeg < 10
    log(ok, 'GRADE-FLIP-COLLAPSE',
        `>30° flips: ${before.n} (worst ${before.worstDeg.toFixed(1)}°) → ${after.n} (worst ${after.worstDeg.toFixed(1)}°)`)
}

// ── 2. WINDOW-INVARIANCE ────────────────────────────────────────────────────────
// Same world span [0,800] but one polyline extends to 1400 (margin past the consumed region).
// Interior points (x in [WINDOW, 800-WINDOW] for the short one) must match within 1e-6.
{
    const shortP = makeProfile(0, 800)
    const longP  = makeProfile(0, 1400)
    smoothGradeInPlace(shortP, WINDOW)
    smoothGradeInPlace(longP, WINDOW)
    let maxDiff = 0, checked = 0
    for (let i = 0; i < shortP.length; i++) {
        const x = shortP[i].x
        if (x < WINDOW || x > 800 - WINDOW) continue   // skip the short polyline's truncated ends
        const j = Math.round(x / DS)                    // longP shares the same x grid
        maxDiff = Math.max(maxDiff, Math.abs(shortP[i].y - longP[j].y))
        checked++
    }
    const ok = checked > 50 && maxDiff < 1e-6
    log(ok, 'WINDOW-INVARIANCE',
        `${checked} interior pts, max |Δy| short-vs-long = ${maxDiff.toExponential(2)} m (<1e-6)`)
}

// ── 3. RAMP PRESERVED (real hills survive) ────────────────────────────────────────
{
    const ramp = makeProfile(0, 800, /*withRidges*/ false)   // pure 4% grade
    const sm = ramp.map(p => ({ ...p }))
    smoothGradeInPlace(sm, WINDOW)
    let maxDiff = 0
    for (let i = 0; i < sm.length; i++) {
        const x = sm[i].x
        if (x < WINDOW || x > 800 - WINDOW) continue
        maxDiff = Math.max(maxDiff, Math.abs(sm[i].y - ramp[i].y))
    }
    const ok = maxDiff < 0.05   // box mean of a linear fn = centre value (tiny asymmetry at grid edges)
    log(ok, 'RAMP-PRESERVED', `max interior |Δy| on a pure 4% grade = ${maxDiff.toFixed(4)} m (<0.05)`)
}

// ── 4. DETERMINISM ────────────────────────────────────────────────────────────────
{
    const a = makeProfile(0, 600); const b = makeProfile(0, 600)
    smoothGradeInPlace(a, WINDOW); smoothGradeInPlace(b, WINDOW)
    let same = a.length === b.length
    for (let i = 0; i < a.length && same; i++) if (a[i].y !== b[i].y) same = false
    log(same, 'DETERMINISM', `${a.length} pts, identical across two calls = ${same}`)
}

console.log('\n' + '='.repeat(64))
console.log(`DEFECT-B GRADE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
