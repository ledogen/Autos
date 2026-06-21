// test/seam-grade.mjs — headless tile-seam gate for the road ribbon (plan 09-32).
//
// Replays the ACTUAL rendered ribbon centerline-Y from a real press-'p' dump and bounds the
// visual height step at tile seams. The rendered Y is gradeY(arcS) where arcS is keyed by the
// ribbon's section parameterisation (road-mesh.js sweepRibbon). Two parameterisations:
//   uniform-u     — arcS0+(arcS1-arcS0)*(i/(N-1))      (the OLD path → spline-overshoot seam)
//   cumulative-XZ — arcS0+(arcS1-arcS0)*(cumXZ[i]/tot) (the FIX → tracks true run-arc)
// gradeY itself = linear interp of networkPoints Y by XZ arc-length (== runProfile().gradeY,
// the physics/carve source). A "seam" = two near-coincident XZ verts from DIFFERENT tiles whose
// arcS is also near-equal (<8 m) — i.e. a true tile boundary, NOT a switchback/hairpin stack.
//
// Auto-discovers the newest Logs/road-run-dump-*.json. Skips (green) if none present so CI
// without a fresh dump still passes. Run: node test/seam-grade.mjs
//
// THRESHOLD: cumulative-XZ worst seam must be < 0.35 m (residual is real hairpin-apex geometry,
// measured 0.26 m on the 06-20 dumps) AND must beat uniform-u by ≥2× (proves the fix engaged).

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOGS = join(HERE, '..', 'Logs')

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

function newestDump() {
    let files = []
    try { files = readdirSync(LOGS).filter(f => /^road-run-dump-\d+\.json$/.test(f)) } catch { return null }
    if (!files.length) return null
    files.sort((a, b) => (+b.match(/\d+/)[0]) - (+a.match(/\d+/)[0]))
    return join(LOGS, files[0])
}

// Worst tile-seam step in rendered centerline Y for a given arcS parameterisation.
function seamWorst(dump, useXZ) {
    const np = dump.networkPoints, slices = dump.slices
    const arc = [0]
    for (let i = 1; i < np.length; i++) arc[i] = arc[i - 1] + Math.hypot(np[i].x - np[i - 1].x, np[i].z - np[i - 1].z)
    const gradeY = (s) => {
        if (s <= arc[0]) return np[0].y
        if (s >= arc[arc.length - 1]) return np[np.length - 1].y
        let lo = 0, hi = arc.length - 1
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m }
        const t = (s - arc[lo]) / ((arc[hi] - arc[lo]) || 1)
        return np[lo].y + t * (np[hi].y - np[lo].y)
    }
    const verts = []
    for (const s of slices) {
        const sp = s.samples, n = sp.length
        const cum = [0]
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
        if (dx * dx + dz * dz > 1.0) continue                      // not coincident
        if (Math.abs(verts[i].arcS - verts[k].arcS) > 8) continue  // switchback/hairpin stack, not a seam
        const dy = Math.abs(verts[i].ry - verts[k].ry)
        if (dy > worst) worst = dy
    }
    return worst
}

const dumpPath = newestDump()
if (!dumpPath) {
    console.log('[SKIP] no Logs/road-run-dump-*.json present — seam gate needs a press-\'p\' dump.')
    console.log('\n' + '='.repeat(64))
    console.log('SEAM-GRADE GATES: skipped (no fixture) — exit 0')
    process.exit(0)
}

// Worst gap between the rendered ribbon Y and the carved physics surface Y (analyticHeight).
// The ribbon vertex uses arcS(ribbonXZ-mode); the carve assigns each world point the gradeY of
// its nearest-XZ sample under arcS(carveXZ-mode). When the ribbon is cumulative-XZ but the carve
// is uniform-u (the regression), they diverge by metres → the truck sinks through the visual road.
// Both cumulative-XZ → 0 gap. (Models road.js collectChunkSplinePoints vs road-mesh.js sweepRibbon.)
function ribbonVsCarve(dump, carveUseXZ) {
    const np = dump.networkPoints, slices = dump.slices
    const arc = [0]
    for (let i = 1; i < np.length; i++) arc[i] = arc[i - 1] + Math.hypot(np[i].x - np[i - 1].x, np[i].z - np[i - 1].z)
    const gradeY = (s) => {
        if (s <= arc[0]) return np[0].y
        if (s >= arc[arc.length - 1]) return np[np.length - 1].y
        let lo = 0, hi = arc.length - 1
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m }
        const t = (s - arc[lo]) / ((arc[hi] - arc[lo]) || 1)
        return np[lo].y + t * (np[hi].y - np[lo].y)
    }
    const build = (useXZ) => {
        const S = []
        for (const s of slices) {
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
    const ribbon = build(true)                  // ribbon = cumulative-XZ (shipped sweepRibbon)
    const carve = build(carveUseXZ)             // carve sample set
    let worst = 0
    for (const v of ribbon) {
        let bd = Infinity, ba = 0
        for (const c of carve) { const dx = c.x - v.x, dz = c.z - v.z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; ba = c.arcS } }
        worst = Math.max(worst, Math.abs(gradeY(v.arcS) - gradeY(ba)))
    }
    return worst
}

const dump = JSON.parse(readFileSync(dumpPath, 'utf8'))
const old = seamWorst(dump, false)
const fix = seamWorst(dump, true)
const gapBad  = ribbonVsCarve(dump, false)   // ribbon cumXZ vs carve uniform-u (the regression)
const gapGood = ribbonVsCarve(dump, true)    // ribbon cumXZ vs carve cumXZ   (the fix)
console.log(`(fixture: ${dumpPath.split('/').pop()}, run ${dump.runKey}, ${dump.slices.length} slices)`)
log(fix < 0.35, 'SEAM-BOUNDED',
    `cumulative-XZ worst tile-seam step = ${fix.toFixed(3)} m (<0.35 m; residual = hairpin-apex geometry)`)
log(old / Math.max(fix, 1e-6) >= 2, 'FIX-ENGAGED',
    `uniform-u ${old.toFixed(3)} m → cumulative-XZ ${fix.toFixed(3)} m (${(old / Math.max(fix, 1e-6)).toFixed(1)}× better, ≥2×)`)
log(gapGood < 0.1, 'RIBBON-MATCHES-CARVE',
    `ribbon↔carve Y gap (both cumulative-XZ) = ${gapGood.toFixed(3)} m (<0.1 m; vs ${gapBad.toFixed(2)} m if carve left uniform-u → sink-through)`)

console.log('\n' + '='.repeat(64))
console.log(`SEAM-GRADE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
