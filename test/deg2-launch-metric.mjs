// test/deg2-launch-metric.mjs — rainy-day tool (BUG-40). Vertical LAUNCH metric along the true driving
// line across a deg-2 elbow: leg A tail → connector fillet arc → leg B tail.
//
//   node test/deg2-launch-metric.mjs <place-capture.json>
//
// Prints, per 0.5 m, the drivable surface height, the grade over one wheelbase (2.85 m — what the
// chassis actually spans), and the vertical acceleration the surface DEMANDS at 20 m/s. Above 1 g the
// wheels leave the ground: that is a launch ramp, not a bump. The 20 m/s reference is deliberately
// fixed — scale by (v/20)² to read it at another speed, and remember a tight fillet caps v at
// sqrt(µ·g·R) anyway, so a peak inside the bend matters far less than the same peak on the approach.
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
const cap = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const { seed, params } = cap.world, { mark } = cap.place
const road = new RoadSystem(seed, params)
road.update(new THREE.Vector3(mark.x, 0, mark.z))
if (road._nodeJunctionsRev !== road._networkRev) road._detectNodeJunctions()
let arc = null, node = null
for (const n of road._nodeJunctions.values())
    if (n.deg2 && Math.hypot(n.pos.x-mark.x, n.pos.z-mark.z) < 60) { arc = n.deg2; node = n }
const surf = (x,z) => { const raw = road._coarseH(x,z)
    const c = road._sampleCarveWorld(x,z,raw,undefined,undefined)
    return c && c.blendW>1e-6 ? raw + c.blendW*(c.gradeY-raw) : raw }
// leg tail before the connector's first point, and after its last
const legTail = (runKey, px, pz, back, dirSign) => {
    const e = road._network.get(runKey)
    const pr = road._projectOntoRun(e, px, pz)
    const out = []
    for (let d = back; d > 0; d -= 0.5) { const q = road.runPointAt(runKey, pr.arcS + (e.arcOrigin??0) + dirSign*d); if (q) out.push(q) }
    return out
}
const A = arc.points[0], B = arc.points.at(-1)
const eA = road._network.get(arc.netKeys[0]), eB = road._network.get(arc.netKeys[1])
const prA = road._projectOntoRun(eA, A.x, A.z), prB = road._projectOntoRun(eB, B.x, B.z)
const LA = eA.polyCum.at(-1), LB = eB.polyCum.at(-1)
const sgnA = prA.arcS > LA/2 ? -1 : +1, sgnB = prB.arcS > LB/2 ? -1 : +1
const line = [...legTail(arc.netKeys[0], A.x, A.z, 40, sgnA), ...arc.points, ...legTail(arc.netKeys[1], B.x, B.z, 40, sgnB).reverse()]
// resample to 0.5 m and sample the surface
const pts = [], DS = 0.5
let acc = 0
for (let i = 1; i < line.length; i++) {
    const L = Math.hypot(line[i].x-line[i-1].x, line[i].z-line[i-1].z); if (L < 1e-6) continue
    for (let u = 0; u < L; u += DS) { const t = u/L
        const p = { d: acc+u, x: line[i-1].x + t*(line[i].x-line[i-1].x), z: line[i-1].z + t*(line[i].z-line[i-1].z) }
        const last = pts.at(-1)
        if (last && Math.hypot(p.x-last.x, p.z-last.z) < DS*0.5) continue   // no duplicate joins
        pts.push(p) }
    acc += L
}
// re-stamp d on the deduped line so spacing matches the finite differences
for (let i = 1; i < pts.length; i++) pts[i].d = pts[i-1].d + Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z)
const ys = pts.map(p => surf(p.x, p.z))
const W = Math.round(2.85/DS)
let worst = 0, worstD = 0
const rows = []
for (let i = W; i < ys.length - W; i++) {
    const g1 = (ys[i+W]-ys[i])/(W*DS), g0 = (ys[i]-ys[i-W])/(W*DS)
    const dg = (g1-g0)/(W*DS), load = Math.abs(dg)*400/9.81
    if (load > worst) { worst = load; worstD = pts[i].d }
    rows.push(`${pts[i].d.toFixed(1).padStart(7)} (${pts[i].x.toFixed(0)},${pts[i].z.toFixed(0)})`.padEnd(22) + `${ys[i].toFixed(3).padStart(9)} ${(g0*100).toFixed(1).padStart(8)}% ${load.toFixed(2).padStart(8)} g`)
}
console.log('   dist   (x,z)              surfY    grade   g-load@20m/s')
for (const r of rows) console.log(r)
console.log(`\nTHROUGH-LINE worst vertical demand at 20 m/s: ${worst.toFixed(2)} g at d=${worstD.toFixed(1)} m   (>1 g = airborne)`)
