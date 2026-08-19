// test/road-connectivity.mjs — FEAT-68: the registered network is ONE component on the eval seeds.
//
// Connectivity is the project's #1 road priority (owner ruling 2026-08-18: connectivity > grade
// ceiling > performance), and this gate exists because it regressed SILENTLY once: the v1-era
// crossing/clearance culls, judging v2's switchback geometry by v1's wander heuristics, deleted
// 11-21 good edges per seed (mean largest-component share 54%, 0/10 seeds fully connected) while
// preventing zero real crossings. The integration battery tracked grades and marks but never
// components, so only the owner's eyes caught it. Never again: every registered network on the
// eval trio must be a single connected component, and no non-adjacent pair of runs may cross.
//
// Run: node test/road-connectivity.mjs   (exit 0 = all seeds one component, zero real crossings)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const seed of [20, 11, 67]) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.setRadius(1400)
    road.update(new THREE.Vector3(0, 0, 0))
    const parent = new Map()
    const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); let c = k; while (parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n } return r }
    const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
    const key = (c) => `${c[0]},${c[1]},${c[2]}`
    const polys = []
    for (const [, e] of road._network) {
        if (!e.cellA || !e.cellB) continue
        const a = key(e.cellA), b = key(e.cellB)
        if (!parent.has(a)) parent.set(a, a)
        if (!parent.has(b)) parent.set(b, b)
        uni(a, b)
        polys.push({ a, b, pts: e.points.filter((_, i) => i % 3 === 0) })
    }
    const comps = new Set()
    for (const k of parent.keys()) comps.add(find(k))
    log(comps.size === 1, `CONNECTED seed=${seed}`,
        `${polys.length} runs over ${parent.size} nodes → ${comps.size} component(s)`)

    // real crossings between runs that share no node (the thing the deleted culls guarded — must
    // stay ~zero BY GEOMETRY now; a nonzero here means v2 corridors started genuinely overlapping)
    const segX = (p1, p2, p3, p4) => {
        const d1 = (p2.x - p1.x) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.x - p1.x)
        const d2 = (p2.x - p1.x) * (p4.z - p1.z) - (p2.z - p1.z) * (p4.x - p1.x)
        const d3 = (p4.x - p3.x) * (p1.z - p3.z) - (p4.z - p3.z) * (p1.x - p3.x)
        const d4 = (p4.x - p3.x) * (p2.z - p3.z) - (p4.z - p3.z) * (p2.x - p3.x)
        return d1 * d2 < 0 && d3 * d4 < 0
    }
    let X = 0
    for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
        const A = polys[i], B = polys[j]
        if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue
        let hit = false
        for (let m = 1; m < A.pts.length && !hit; m++) for (let n = 1; n < B.pts.length; n++)
            if (segX(A.pts[m - 1], A.pts[m], B.pts[n - 1], B.pts[n])) { hit = true; break }
        if (hit) X++
    }
    log(X === 0, `NO-REAL-CROSSINGS seed=${seed}`, `${X} crossing pair(s) among non-adjacent runs`)
}

console.log('\n' + '='.repeat(64))
console.log(`ROAD-CONNECTIVITY GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
