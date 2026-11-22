// GATE (BUG-234, DEC-471): two roads never cross with no junction there. The plan's crossing rung let some crossings
// ship (classes A-F in the ticket), and FEAT-19's at-grade lift then ramped one deck onto the other: 279 % at seed
// 1960791808, decks 55 m apart. The assembly now cuts each into an X junction (_v2JoinCrossings), and the overlap
// join takes two roads that ride each other's pavement and cross on the way (the owner's 2711103901, 164 m doubled).
// The traced seeds, one per class, each built as the game builds the story region (spawn, warm radius, pond no-go):
//   1. no two different runs' shipped polylines cross > 30 m from every end of both, anywhere in the region
//      (the BUG-232/234 census rule; main: 1-3 per seed; one seed keeps a ceiling, below);
//   2. at each traced site every run within 60 m has its steepest 10 m at or under the 38 % ceiling (main: 39-279 %);
//   3. every promoted node has 3 legs, or 4 for an X, and every leg's deck at the node is the node's (< 1 cm).
// The owner's world (terrain coarseAmplitude 75, wGrade 290; his capture's centre and radius): no two runs sharing
// no node lie under 2·HW apart for the overlap join's 20 m within 150 m of his mark (main: 164 m), and no crossing.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const SITES = [   // seed, the main-branch crossing (x, z), its class
    ['1960791808', 617.8, -1722.5, 'F'], ['1315540905', 1360.7, -1528.6, 'B', 2], ['2080966469', 1736.7, -1424.5, 'B'],
    ['908965980', 1270.9, -1082.5, 'A'], ['4071845502', -564.4, -375.9, 'D'], ['1297855292', -2168.8, -329.9, 'E'],
]
// CEILING (the 5th field): 1315540905's other two crossings are one pair of roads crossing twice 70 m apart where no X
// can solve (a side road would climb 28 m in 56 m to the through deck, the through road 43 m in 102 m to the side's):
// they decline and ship as on main. The owner's call (BUG-234 Open questions); the ceiling only stops it growing.
const OWNER = { s: '2711103901', mark: [933, -1575], C: [-137.552, -97.83], R: 2800,
    P: { ...RANGER_PARAMS, coarseAmplitude: 75, roadV2: { ...RANGER_PARAMS.roadV2, wGrade: 290 } } }
const END_CLEAR = 30, NEAR = 60, STEP = 5, CAP = 38, G = 32

const segX = (a, b, c, d) => {
    const ex = b.x - a.x, ez = b.z - a.z, fx = d.x - c.x, fz = d.z - c.z, den = ex * fz - ez * fx
    if (Math.abs(den) < 1e-10) return null
    const t = ((c.x - a.x) * fz - (c.z - a.z) * fx) / den, u = ((c.x - a.x) * ez - (c.z - a.z) * ex) / den
    return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + t * ex, z: a.z + t * ez } : null
}
// every crossing of two different runs farther than END_CLEAR from all four ends
function crossings(road) {
    const grid = new Map(), out = []
    for (const [k, e] of road._network) {
        const p = e.points
        if (!p || p.length < 2) continue
        for (let i = 0; i < p.length - 1; i++) {
            const x0 = Math.floor(Math.min(p[i].x, p[i + 1].x) / G), x1 = Math.floor(Math.max(p[i].x, p[i + 1].x) / G)
            const z0 = Math.floor(Math.min(p[i].z, p[i + 1].z) / G), z1 = Math.floor(Math.max(p[i].z, p[i + 1].z) / G)
            for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) (grid.get(x + ',' + z) ?? grid.set(x + ',' + z, []).get(x + ',' + z)).push({ k, i })
        }
    }
    const seen = new Set(), ends = (k) => { const p = road._network.get(k).points; return [p[0], p.at(-1)] }
    for (const arr of grid.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const A = arr[i], B = arr[j]
        if (A.k === B.k) continue
        const pk = A.k < B.k ? `${A.k}#${A.i}|${B.k}#${B.i}` : `${B.k}#${B.i}|${A.k}#${A.i}`
        if (seen.has(pk)) continue
        seen.add(pk)
        const a = road._network.get(A.k).points, b = road._network.get(B.k).points
        const h = segX(a[A.i], a[A.i + 1], b[B.i], b[B.i + 1])
        if (h && [...ends(A.k), ...ends(B.k)].every((q) => Math.hypot(q.x - h.x, q.z - h.z) > END_CLEAR)) out.push({ ...h, kA: A.k, kB: B.k })
    }
    return out
}
// steepest 10 m of a run among its samples within NEAR of (x, z), or null when it does not pass there
function steepestNear(road, key, x, z) {
    const e = road._network.get(key), L = e.polyCum.at(-1), o = e.arcOrigin ?? 0
    let j = 0, max = null
    const at = (s) => {
        while (j < e.points.length - 2 && e.polyCum[j + 1] < s) j++
        const t = Math.min(1, Math.max(0, (s - e.polyCum[j]) / ((e.polyCum[j + 1] - e.polyCum[j]) || 1)))
        return { x: e.points[j].x + (e.points[j + 1].x - e.points[j].x) * t, z: e.points[j].z + (e.points[j + 1].z - e.points[j].z) * t }
    }
    for (let s = STEP; s <= L - STEP; s += STEP) {
        const p = at(s); if (Math.hypot(p.x - x, p.z - z) > NEAR) continue
        const g = 100 * Math.abs(road.runProfile(s + STEP - o, key).gradeY - road.runProfile(s - STEP - o, key).gradeY) / (2 * STEP)
        max = Math.max(max ?? 0, g)
    }
    return max
}
// promoted nodes whose leg count is not 3 (a T) or 4 (an X), or whose legs' decks at the node part by >= 1 cm
function badNodes(road) {
    const bad = []
    let xs = 0
    for (const [nk, inc] of road._proto.nodeInc) {
        const pr = road._promoted.get(nk)
        if (!pr) continue
        if (inc.length === 4) xs++
        if (inc.length !== 3 && inc.length !== 4) { bad.push(`${nk}: ${inc.length} legs`); continue }
        for (const k of inc) {
            const e = road._network.get(k), atA = road._proto.graph.key(e.cellA) === nk
            const dy = Math.abs(road.runProfile(atA ? 0 : e.polyCum.at(-1), k).gradeY - pr.pos.y)
            if (dy >= 0.01) bad.push(`${nk}: leg ${k} deck ${dy.toFixed(3)} m off the node`)
        }
    }
    return { bad, xs }
}
const build = (s, P, C, R) => {
    const seed = parseWorldSeed(s), road = new RoadSystem(seed, P)
    C ??= spawnDecision(seed, P)
    wirePondNoGo(road, seed, P); road.setRadius(R ?? REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x ?? C[0], 0, C.z ?? C[1]))
    road._detectJunctions()
    return road
}

let fail = 0
const ok = (c, msg) => { console.log(`[${c ? 'PASS' : 'FAIL'}] ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++ }
for (const [s, x, z, cls, ceil = 0] of SITES) {
    const road = build(s, RANGER_PARAMS)
    const X = crossings(road)
    ok(X.length <= ceil, `seed ${s} (class ${cls}): ${road._network.size} runs, ${X.length} no-junction crossings (ceiling ${ceil})${X.length ? ': ' + X.slice(0, 3).map((h) => `${h.kA} x ${h.kB} @ (${h.x.toFixed(0)}, ${h.z.toFixed(0)})`).join(', ') : ''}`)
    let worst = 0, worstKey = '', near = 0
    for (const key of road._network.keys()) {
        const g = steepestNear(road, key, x, z)
        if (g != null) { near++; if (g > worst) { worst = g; worstKey = key } }
    }
    // a ceiling seed's unfixed pair is 50 m from its fixed site, so its grade there is the unfixed lift's: reported only
    const msg = `seed ${s} site (${x}, ${z}): ${near} runs within ${NEAR} m, steepest 10 m ${worst.toFixed(1)} % (${worstKey}; cap ${CAP} %)`
    if (ceil) console.log(`[REPORT] ${msg}`); else ok(worst <= CAP, msg)
    const { bad, xs } = badNodes(road)
    ok(bad.length === 0, `seed ${s}: ${road._promoted.size} promoted nodes (${xs} X), every one 3 or 4 legs on the node's deck${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`)
}
{
    const { s, mark: [mx, mz], C, R, P } = OWNER, road = build(s, P, C, R)
    const runs = [...road._network].filter(([, e]) => e.points?.some((p) => Math.hypot(p.x - mx, p.z - mz) < 150))
    let worst = 0, pair = ''
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
        const [ka, a] = runs[i], [kb, b] = runs[j]
        const cells = (e) => [e.cellA, e.cellB].map(String)
        if (cells(a).some((c) => cells(b).includes(c))) continue   // legs of one node: its throat is the hold's
        let run = 0, prev = null
        for (let n = 0; n < a.points.length; n++) {
            const p = a.points[n]
            const close = Math.hypot(p.x - mx, p.z - mz) < 150 && b.points.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2 * (P.roadHalfWidth ?? 5))
            if (close && prev != null) run += a.polyCum[n] - a.polyCum[prev]
            else if (!close) run = 0
            prev = close ? n : null
            if (run > worst) { worst = run; pair = `${ka} x ${kb}` }
        }
    }
    ok(worst < 20, `owner world ${s} mark (${mx}, ${mz}): longest stretch of two runs sharing no node under 2·HW apart ${worst.toFixed(0)} m (${pair}; the join's floor 20 m; main 164 m)`)
    const X = crossings(road).filter((h) => Math.hypot(h.x - mx, h.z - mz) < 150)
    ok(X.length === 0, `owner world ${s}: ${X.length} no-junction crossings within 150 m of the mark`)
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
