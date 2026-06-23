// test/ribbon-carve.mjs — synthetic ribbon↔carve agreement gate (plan 09 INVARIANCE-HARNESS, Phase 1.2).
//
// PERMANENT, DUMP-FREE REPLACEMENT for the retired test/seam-grade.mjs. Same three validated checks
// and thresholds, but the road geometry comes from the headless harness (a real RoadSystem built over
// synthetic deterministic terrain) via the real `road.debugDumpNearestRun()` — NOT from a press-'p'
// dump file. So it runs in CI with no game and no fixture, and can never go stale.
//
// What it proves:
//   1. SEAM-BOUNDED        — worst rendered-centerline Y step at a true tile seam < 0.35 m
//                            (residual = hairpin-apex geometry).
//   2. SEAM-PARAM-ROBUST   — Road Overhaul: now that the ribbon samples ONE continuous, arc-length-
//                            EXACT primitive centerline (CenterlineCurve) per run, the seam is small
//                            under BOTH the uniform-u and cumulative-XZ parameterisations. The old
//                            FIX-ENGAGED check asserted cumulative-XZ was ≥2× better than uniform-u —
//                            that gap only existed because the Catmull-Rom slice spline was NOT arc-
//                            length-uniform (it overshot, BUG-12). With the fold fixed at the source
//                            (the exact centerline) that compensation is structurally unnecessary;
//                            this gate now guards that both parameterisations stay below the floor.
//   3. RIBBON-MATCHES-CARVE— ribbon arcS (cumulative-XZ) and carve arcS (cumulative-XZ) resolve the
//                            SAME gradeY at the same world point (<0.1 m); vs metres if carve were
//                            left uniform-u → the truck would sink through the visual road.
//
// The arcS→gradeY model below is byte-identical to test/seam-grade.mjs (which was validated against
// real dumps). road.debugDumpNearestRun returns exactly the {networkPoints, slices[{samples, arcS0,
// arcS1, tileKey}]} shape seam-grade consumed — so feeding it harness geometry is a true drop-in.
//
// Run: node test/ribbon-carve.mjs   (exit 0 = agreement holds)

import { buildNetwork } from './lib/road-headless.mjs'

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// gradeY(arcS): linear interp of the run's networkPoints Y by XZ arc-length — IS runProfile().gradeY,
// the physics/carve source of truth. Shared by both checks below.
function makeGradeY(np) {
    const arc = [0]
    for (let i = 1; i < np.length; i++) arc[i] = arc[i - 1] + Math.hypot(np[i].x - np[i - 1].x, np[i].z - np[i - 1].z)
    return (s) => {
        if (s <= arc[0]) return np[0].y
        if (s >= arc[arc.length - 1]) return np[np.length - 1].y
        let lo = 0, hi = arc.length - 1
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m }
        const t = (s - arc[lo]) / ((arc[hi] - arc[lo]) || 1)
        return np[lo].y + t * (np[hi].y - np[lo].y)
    }
}

// Worst tile-seam step in rendered centerline Y for a given arcS parameterisation (verbatim seam-grade).
// A "seam" = two near-coincident XZ verts from DIFFERENT tiles whose arcS is near-equal (<8 m) — a true
// tile boundary, not a switchback/hairpin stack.
function seamWorst(dump, useXZ) {
    const gradeY = makeGradeY(dump.networkPoints)
    const verts = []
    for (const s of dump.slices) {
        const sp = s.samples, n = sp.length, cum = [0]
        for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z)
        const tot = cum[n - 1] || 1
        for (let i = 0; i < n; i++) {
            const f = useXZ ? cum[i] / tot : (n > 1 ? i / (n - 1) : 0)
            const arcS = s.arcS0 + (s.arcS1 - s.arcS0) * f
            verts.push({ t: s.tileKey, x: sp[i].x, z: sp[i].z, ry: gradeY(arcS), arcS })
        }
    }
    let worst = 0
    for (let i = 0; i < verts.length; i++) for (let k = i + 1; k < verts.length; k++) {
        if (verts[i].t === verts[k].t) continue
        const dx = verts[i].x - verts[k].x, dz = verts[i].z - verts[k].z
        if (dx * dx + dz * dz > 1.0) continue
        if (Math.abs(verts[i].arcS - verts[k].arcS) > 8) continue
        const dy = Math.abs(verts[i].ry - verts[k].ry)
        if (dy > worst) worst = dy
    }
    return worst
}

// Worst gap between the ribbon Y (always cumulative-XZ) and the carve surface Y (nearest-XZ sample's
// arcS under `carveUseXZ`). Both cumulative-XZ → 0 gap; carve uniform-u → metres (sink-through). Verbatim.
function ribbonVsCarve(dump, carveUseXZ) {
    const gradeY = makeGradeY(dump.networkPoints)
    const build = (useXZ) => {
        const S = []
        for (const s of dump.slices) {
            const sp = s.samples, n = sp.length, cum = [0]
            for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z)
            const tot = cum[n - 1] || 1
            for (let i = 0; i < n; i++) {
                const f = useXZ ? cum[i] / tot : (n > 1 ? i / (n - 1) : 0)
                S.push({ x: sp[i].x, z: sp[i].z, arcS: s.arcS0 + (s.arcS1 - s.arcS0) * f })
            }
        }
        return S
    }
    const ribbon = build(true), carve = build(carveUseXZ)
    let worst = 0
    for (const v of ribbon) {
        let bd = Infinity, ba = 0
        for (const c of carve) { const dx = c.x - v.x, dz = c.z - v.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; ba = c.arcS } }
        worst = Math.max(worst, Math.abs(gradeY(v.arcS) - gradeY(ba)))
    }
    return worst
}

// Build the harness network and pick the run with the MOST slices (most tile seams → strongest test)
// by probing a coarse world grid with the real nearest-run dumper.
const road = buildNetwork({ x: 0, z: 0 })
let dump = null
for (let x = -360; x <= 360; x += 60) for (let z = -360; z <= 360; z += 60) {
    const d = road.debugDumpNearestRun(x, z)
    if (d && d.slices.length > (dump?.slices.length || 0)) dump = d
}
if (!dump || dump.slices.length < 3) {
    console.log('[FAIL] ✗ NO-MULTI-SLICE-RUN — harness produced no run with ≥3 slices to seam-test')
    console.log('\n' + '='.repeat(64))
    console.log('RIBBON-CARVE GATES: 0 pass, 1 FAIL — exit 1')
    process.exit(1)
}

const old = seamWorst(dump, false)
const fix = seamWorst(dump, true)
const gapBad = ribbonVsCarve(dump, false)
const gapGood = ribbonVsCarve(dump, true)
console.log(`(harness run ${dump.runKey}, ${dump.slices.length} slices — geometry from debugDumpNearestRun, no dump file)`)
log(fix < 0.35, 'SEAM-BOUNDED',
    `cumulative-XZ worst tile-seam step = ${fix.toFixed(3)} m (<0.35 m; residual = hairpin-apex geometry)`)
log(old < 0.35 && fix < 0.35, 'SEAM-PARAM-ROBUST',
    `exact-centerline ribbon: seam step bounded under BOTH params — uniform-u ${old.toFixed(3)} m, ` +
    `cumulative-XZ ${fix.toFixed(3)} m (both <0.35 m → the BUG-12 overshoot the remap compensated is gone)`)
log(gapGood < 0.1, 'RIBBON-MATCHES-CARVE',
    `ribbon↔carve Y gap (both cumulative-XZ) = ${gapGood.toFixed(3)} m (<0.1 m; vs ${gapBad.toFixed(2)} m if carve left uniform-u → sink-through)`)

console.log('\n' + '='.repeat(64))
console.log(`RIBBON-CARVE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
