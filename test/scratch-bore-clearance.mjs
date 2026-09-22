// test/scratch-bore-clearance.mjs — rainy-day, NOT a gate.
// Census of the two bore hazards the owner reported (capture 1788933513716):
//   (1) a PORTAL that opens inside a junction's convergence zone, and
//   (2) two bore CYLINDERS that overlap in space (no merge machinery exists, so one
//       lining wall cuts off the other's mouth).
// Also reports how deep the open cut would be if a span were clipped back, so a standoff
// can be sized from data.
// USAGE: node test/scratch-bore-clearance.mjs [radius] [seed ...]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const RADIUS = Number(process.argv[2] || 1400)
const SEEDS = process.argv.slice(3).length ? process.argv.slice(3) : ['0']
const R = P.tunnelBoreRadius ?? 8

// min distance between two 3D segments
function segSegDist (p0, p1, q0, q1) {
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z
    const vx = q1.x - q0.x, vy = q1.y - q0.y, vz = q1.z - q0.z
    const wx = p0.x - q0.x, wy = p0.y - q0.y, wz = p0.z - q0.z
    const a = ux*ux+uy*uy+uz*uz, b = ux*vx+uy*vy+uz*vz, c = vx*vx+vy*vy+vz*vz
    const d = ux*wx+uy*wy+uz*wz, e = vx*wx+vy*wy+vz*wz
    const D = a*c - b*b
    let s, t
    if (D < 1e-9) { s = 0; t = (b > c ? d/b : e/c) }
    else { s = (b*e - c*d)/D; t = (a*e - b*d)/D }
    s = Math.max(0, Math.min(1, s)); t = Math.max(0, Math.min(1, t))
    const dx = wx + s*ux - t*vx, dy = wy + s*uy - t*vy, dz = wz + s*uz - t*vz
    return Math.hypot(dx, dy, dz)
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, P)
    road.setRadius(RADIUS)
    road.update(new THREE.Vector3(0, 0, 0))

    // Collect every bore as a polyline of world points (sampled from the edge inside the span).
    const bores = []
    for (const [runKey, e] of road._network) {
        if (!e.tunnelSpans) continue
        const L = e.polyCum[e.points.length - 1]
        for (const sp of e.tunnelSpans) {
            const pts = []
            for (let s = sp.s0; s <= sp.s1 + 1e-6; s += 4) {
                const ss = Math.min(s, sp.s1)
                const p = road.runPointAt(runKey, ss)
                if (p) pts.push({ x: p.x, z: p.z, y: road.runProfile(ss, runKey).gradeY })
            }
            if (pts.length < 2) continue
            bores.push({ runKey, s0: sp.s0, s1: sp.s1, len: sp.s1 - sp.s0, L, pts,
                         dA: sp.s0, dB: L - sp.s1 })
        }
    }

    console.log(`\n===== seed ${seed}  r=${RADIUS} m  edges ${road._network.size}  bores ${bores.length}  boreR ${R} m =====`)

    // (1) PORTAL vs its own edge's nodes.
    const nearNode = bores.map(b => ({ b, d: Math.min(b.dA, b.dB) })).sort((x, y) => x.d - y.d)
    console.log(`\n-- (1) portal distance to the edge's own node (arc) --`)
    const hist = [0, 10, 20, 30, 40, 60, 100, 1e9]
    for (let i = 0; i < hist.length - 1; i++) {
        const n = nearNode.filter(x => x.d >= hist[i] && x.d < hist[i+1]).length
        if (n) console.log(`   ${String(hist[i]).padStart(4)}-${hist[i+1] > 1e8 ? 'inf' : hist[i+1]} m: ${n}`)
    }
    for (const { b, d } of nearNode.slice(0, 8)) {
        const nearA = b.dA < b.dB
        const p = b.pts[nearA ? 0 : b.pts.length - 1]
        const g = road._coarseH(p.x, p.z)
        // Cover profile walking OUT of the portal toward the node — how deep an open cut would be
        // if the span were clipped back by `k` metres.
        const prof = []
        for (const k of [0, 10, 20, 30, 40, 60]) {
            const s = nearA ? b.s0 + k : b.s1 - k
            if (s < 0 || s > b.L) { prof.push('  -  '); continue }
            const q = road.runPointAt(b.runKey, s)
            prof.push((road._coarseH(q.x, q.z) - road.runProfile(s, b.runKey).gradeY).toFixed(1).padStart(5))
        }
        const ed = road._network.get(b.runKey)
        console.log(`   ${d.toFixed(1).padStart(6)} m  run ${b.runKey.padEnd(34)} len ${b.len.toFixed(0).padStart(4)} m  portal (${p.x.toFixed(0)}, ${p.z.toFixed(0)})  cover@[0,10,20,30,40,60] ${prof.join(' ')}`)
    }

    // (2) bore vs bore.
    console.log(`\n-- (2) bore-vs-bore minimum centerline separation (cylinders touch below ${2*R} m) --`)
    const pairs = []
    for (let i = 0; i < bores.length; i++) {
        for (let j = i + 1; j < bores.length; j++) {
            const A = bores[i], B = bores[j]
            if (A.runKey === B.runKey) continue
            let best = Infinity, bp = null
            for (let a = 1; a < A.pts.length; a++) {
                for (let c = 1; c < B.pts.length; c++) {
                    const dd = segSegDist(A.pts[a-1], A.pts[a], B.pts[c-1], B.pts[c])
                    if (dd < best) { best = dd; bp = A.pts[a] }
                }
            }
            if (best < 4 * R) pairs.push({ A, B, d: best, p: bp })
        }
    }
    pairs.sort((x, y) => x.d - y.d)
    const shareNode = (a, b) => {
        const [, a1, a2] = a.split(':'), [, b1, b2] = b.split(':')
        return a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2
    }
    console.log(`   pairs within ${4*R} m: ${pairs.length}   OVERLAPPING (< ${2*R} m): ${pairs.filter(x => x.d < 2*R).length}`)
    for (const q of pairs.slice(0, 12)) {
        console.log(`   ${q.d.toFixed(1).padStart(6)} m  ${q.A.runKey} x ${q.B.runKey}  ${shareNode(q.A.runKey, q.B.runKey) ? 'SHARE NODE' : 'parallel  '}  at (${q.p.x.toFixed(0)}, ${q.p.z.toFixed(0)})`)
    }
}
