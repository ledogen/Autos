// test/junction-atgrade.mjs — FEAT-07 Step 2 acceptance gate: the AT_GRADE mid-span junction flatten.
//
// The crossing classifier marks crossings AT_GRADE (dY ≤ roadCrossMergeDY) vs GRADE_SEP. Step 2 eases
// BOTH strands of an AT_GRADE crossing to the shared node.nodeY so they MEET at one elevation there —
// the truck can drive across the junction (no step) and the flat pad mesh sits coplanar with the
// strands (mesh == collision). This gate locks that behaviour:
//   (a) AT_GRADE crossings clear of run endpoints flatten to a near-zero strand-Y gap (driveable).
//   (b) GRADE_SEP crossings are NOT flattened — their strand gap stays ≈ the raw dY (those are
//       overpasses, Step 3; flattening them would be wrong).
//   (c) the flattened gaps are window-invariant (identical from two stream centers).
// road-smoothness.mjs already guards that the flatten does NOT break longitudinal C0 at run boundaries
// (the endpoint taper); this gate guards the lateral driveability the flatten exists to provide.
//
// Run: node test/junction-atgrade.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const SEED = 6
const Rj = P.roadJunctionBlendLength ?? 30
const FLAT_TOL = 0.20   // m — an interior AT_GRADE crossing must collapse to ≤ this strand gap (driveable)

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// Strand-Y gap at a crossing = |runProfile(arcA).gradeY − runProfile(arcB).gradeY| (the flattened surface).
function strandGap(road, r) {
    const a = road.runProfile(r.arcA, r.runA), b = road.runProfile(r.arcB, r.runB)
    if (!a || !b) return null
    return Math.abs(a.gradeY - b.gradeY)
}
// Both crossing arcs are ≥ Rj from their run's endpoints → flatten is NOT endpoint-tapered.
function interior(road, r) {
    const lenA = road._network.get(r.runA)?.polyCum?.at(-1) ?? 0
    const lenB = road._network.get(r.runB)?.polyCum?.at(-1) ?? 0
    return Math.min(r.arcA, lenA - r.arcA) >= Rj && Math.min(r.arcB, lenB - r.arcB) >= Rj
}

// Pinned to ROWS: this gate checks rows-mode at-grade crossing flatten/meet behavior. Graph is now the
// shipped default (data/ranger.js) but culls those crossings; rows remains a valid selectable mode.
const road = new RoadSystem(SEED, { ...P, roadNetworkMode: 'rows' }); road.update(new THREE.Vector3(4500, 0, 600))
const list = road.crossingList()

// (a) Interior AT_GRADE crossings flatten to a driveable gap. ────────────────────────────────────
{
    const interiorAG = list.filter(r => r.kind === 'AT_GRADE' && interior(road, r))
    let worst = 0, worstAt = '', n = 0
    for (const r of interiorAG) {
        const g = strandGap(road, r); if (g == null) continue
        n++; if (g > worst) { worst = g; worstAt = `${r.runA}×${r.runB} rawDY=${r.dY.toFixed(2)}` }
    }
    log(n >= 2 && worst <= FLAT_TOL, 'ATGRADE-STRANDS-MEET',
        `${n} interior AT_GRADE crossings; worst flattened strand gap = ${worst.toFixed(3)} m (${worstAt}) ≤ ${FLAT_TOL} m`)
}

// (b) GRADE_SEP crossings are NOT flattened (gap stays ≈ raw dY). ──────────────────────────────────
{
    const gsep = list.filter(r => r.kind === 'GRADE_SEP')
    let flattenedWrong = 0, n = 0, sample = ''
    for (const r of gsep) {
        const g = strandGap(road, r); if (g == null) continue
        n++
        if (g < r.dY * 0.5) { if (flattenedWrong++ === 0) sample = `${r.runA}×${r.runB} dY=${r.dY.toFixed(2)} gap=${g.toFixed(2)}` }
    }
    log(n >= 1 && flattenedWrong === 0, 'GRADESEP-NOT-FLATTENED',
        `${n} GRADE_SEP crossings keep their gap (no erroneous flatten); offenders=${flattenedWrong}${sample ? ` | ${sample}` : ''}`)
}

// (c) Flattened gaps are window-invariant across stream centers. ──────────────────────────────────
{
    const roadB = new RoadSystem(SEED, { ...P, roadNetworkMode: 'rows' }); roadB.update(new THREE.Vector3(4756, 0, 600))
    const keyOf = (r) => `${r.runA}#${r.segA}|${r.runB}#${r.segB}`
    const gapsB = new Map(roadB.crossingList().map(r => [keyOf(r), strandGap(roadB, r)]))
    let both = 0, mism = 0, worst = 0, sample = ''
    for (const r of list) {
        if (r.kind !== 'AT_GRADE') continue
        const gB = gapsB.get(keyOf(r)); if (gB == null) continue
        const gA = strandGap(road, r); if (gA == null) continue
        both++
        const d = Math.abs(gA - gB); if (d > worst) worst = d
        if (d > 1e-3) { if (mism++ === 0) sample = `${keyOf(r)}: A=${gA.toFixed(3)} B=${gB.toFixed(3)}` }
    }
    log(both >= 3 && mism === 0, 'FLATTEN-WINDOW-INVARIANT',
        `${both} shared AT_GRADE crossings; worst cross-center gap delta = ${worst.toFixed(4)} m; mismatches=${mism}${sample ? ` | ${sample}` : ''}`)
}

// (d) Shared-anchor junctions sit at the AVERAGE incident ROAD grade, not the terrain valley floor. ──
// Regression for the ~10 m junction hump (user 2026-06-28): anchors gradient-descend to terrain minima,
// so easing the road toward the anchor Y collapsed fill junctions down to the valley. _anchorJunctionGradeY
// must return the mean incident road grade.
{
    let checked = 0, worstErr = 0, worstCollapse = 0, sample = ''
    for (let mz = -2; mz <= 5; mz++) for (let mx = 14; mx <= 24; mx++) {
        if (!road._isJunctionNode(mx, mz)) continue
        const Pn = road._protoAnchor(mx, mz)
        const grades = []
        for (let cz = mz - 2; cz <= mz + 2; cz++) for (let cx = mx - 2; cx <= mx + 2; cx++) {
            const e = road._network.get(`${cz}:${cx}`); if (!e || e.points.length < 2) continue
            const a0 = road._protoAnchor(cx, cz), a1 = road._protoAnchor(cx + 1, cz)
            if (Math.abs(a0.x - Pn.x) < 0.5 && Math.abs(a0.z - Pn.z) < 0.5) grades.push(e.points[0].y)
            if (Math.abs(a1.x - Pn.x) < 0.5 && Math.abs(a1.z - Pn.z) < 0.5) grades.push(e.points[e.points.length - 1].y)
        }
        if (grades.length < 2) continue
        const avg = grades.reduce((a, b) => a + b, 0) / grades.length
        const nodeY = road._anchorJunctionGradeY(mx, mz)
        checked++
        const err = Math.abs(nodeY - avg)               // node Y must equal the incident road-grade mean
        const collapse = (avg - Pn.y) - (nodeY - Pn.y)   // how far the node still drops below road grade toward terrain
        if (err > worstErr) { worstErr = err; sample = `(${mx},${mz}) nodeY=${nodeY.toFixed(1)} avg=${avg.toFixed(1)} terrain=${Pn.y.toFixed(1)}` }
        if (collapse > worstCollapse) worstCollapse = collapse
    }
    log(checked >= 3 && worstErr < 1e-6 && worstCollapse < 0.01, 'JUNCTION-AT-ROAD-GRADE',
        `${checked} shared-anchor junctions; node Y == incident road-grade mean (worstErr=${worstErr.toFixed(4)} m, worstCollapse-to-terrain=${worstCollapse.toFixed(2)} m)${sample ? ` | ${sample}` : ''}`)
}

console.log(`\nJUNCTION-ATGRADE: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
