// Windiness / character metrics harness for the road network (FEAT-13 windiness stage).
// Builds a RoadSystem at a center, walks _network edges, and reports the character signals the
// handoff §6 names: turning angle (windiness), chord-deviation (bow), detour ratio, crossings,
// overshoot edges, min radius, loopers. Mode-agnostic (uses edge.points endpoints as the chord).
//
//   node windiness-metrics.mjs                 # default graph at current knobs
//   node windiness-metrics.mjs rows            # rows mode (the target character)
//   node windiness-metrics.mjs graph k=v k=v   # graph with knob overrides (numbers/bools)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const argv = process.argv.slice(2)
const mode = (argv[0] === 'rows' || argv[0] === 'graph') ? argv[0] : 'graph'
const overrides = {}
for (const a of argv) {
    const m = a.match(/^([A-Za-z]+)=(.+)$/)
    if (!m) continue
    const v = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2])
    overrides[m[1]] = v
}

const P = { ...RANGER_PARAMS, roadNetworkMode: mode, ...overrides }
const SEED = Number(process.env.SEED ?? 6)
const r = new RoadSystem(SEED, P)
r.setRadius(1600)
r.update(new THREE.Vector3(4500, 0, 600))

const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
const turning = (pts) => {
    let t = 0
    for (let i = 1; i < pts.length - 1; i++) {
        const ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z
        const bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z
        t += Math.atan2(ax * bz - az * bx, ax * bx + az * bz)
    }
    return Math.abs(t * 180 / Math.PI)
}
// max signed perpendicular distance of any point from the chord, and overshoot past the endpoints
const chordStats = (pts) => {
    const a = pts[0], b = pts[pts.length - 1]
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2)
    let maxDev = 0, maxOver = 0
    for (const p of pts) {
        const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2
        const px = a.x + t * dx, pz = a.z + t * dz
        const dev = Math.hypot(p.x - px, p.z - pz)
        if (dev > maxDev) maxDev = dev
        const over = t < 0 ? -t * L : t > 1 ? (t - 1) * L : 0
        if (over > maxOver) maxOver = over
    }
    return { dev: maxDev, over: maxOver, chord: L }
}
const minRadius = (pts) => {
    let mr = Infinity
    for (let i = 1; i < pts.length - 1; i++) {
        const A = pts[i - 1], B = pts[i], C = pts[i + 1]
        const a = dist(B, C), b = dist(A, C), c = dist(A, B)
        const area = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2
        if (area < 1e-6) continue
        const R = (a * b * c) / (4 * area)
        if (R < mr) mr = R
    }
    return mr
}

let n = 0, sumTurn = 0, sumDetour = 0, sumDev = 0, sumChord = 0
let loopers = 0, overshooters = 0, maxOver = 0, minR = Infinity, maxTurn = 0
const turns = []
for (const [, e] of r._network) {
    const pts = e.points
    if (pts.length < 3) continue
    const routed = (() => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s })()
    const cs = chordStats(pts)
    const t = turning(pts)
    const mr = minRadius(pts)
    n++
    sumTurn += t; turns.push(t)
    sumDetour += routed / (cs.chord || 1)
    sumDev += cs.dev
    sumChord += cs.chord
    if (t > 200) loopers++
    if (t > maxTurn) maxTurn = t
    if (cs.over > 6) overshooters++
    if (cs.over > maxOver) maxOver = cs.over
    if (mr < minR) minR = mr
}
turns.sort((a, b) => a - b)
const median = turns.length ? turns[turns.length >> 1] : 0
const crossings = r.crossingList().length

const f = (x, d = 1) => x.toFixed(d)
console.log(`\n=== ${mode}  seed=${SEED}  ${JSON.stringify(overrides)} ===`)
console.log(`edges=${n}  avgChord=${f(sumChord / n)}m  crossings=${crossings}`)
console.log(`WINDINESS turn/edge: avg=${f(sumTurn / n)}°  median=${f(median)}°  max=${f(maxTurn)}°`)
console.log(`BOW chordDev: avg=${f(sumDev / n)}m   DETOUR routed/chord: avg=${f(sumDetour / n, 3)}`)
console.log(`minRadius=${f(minR)}m  loopers(>200°)=${loopers}  overshooters(>6m)=${overshooters} maxOver=${f(maxOver)}m`)
