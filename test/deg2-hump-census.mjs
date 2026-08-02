// scratch: census of deg-2 connector "humps" across a streamed network.
// For every connector, walk each leg's centreline through the connector footprint and measure
//   hump   = max(final surface − that leg's own ribbon surface)      [m]
//   break  = max longitudinal grade CHANGE per metre of the final surface (the launch metric)
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const seed = Number(process.argv[2] ?? 6)
const R = Number(process.argv[3] ?? 900)
const params = RANGER_PARAMS
const road = new RoadSystem(seed, params)
road.update(new THREE.Vector3(0, 0, 0))
for (const c of [[R,0],[0,R],[-R,0],[0,-R]]) road.update(new THREE.Vector3(c[0], 0, c[1]))
road.update(new THREE.Vector3(0, 0, 0))
if (road._nodeJunctionsRev !== road._networkRev) road._detectNodeJunctions()

const clear = params.roadClearanceMargin ?? 0.25
const surfAt = (x, z) => {
    const raw = road._coarseH(x, z)
    const c = road._sampleCarveWorld(x, z, raw, undefined, undefined)
    return c && c.blendW > 1e-6 ? raw + c.blendW * (c.gradeY - raw) : raw
}
const legY = (x, z) => {
    const nr = road._resolveRoadSurface(x, z)
    if (!nr) return null
    return road._carveDirtY(0, nr.arcS, nr.runKey, nr.camberSign ?? 1, nr.point.x, nr.point.z) + clear
}

const results = []
for (const node of road._nodeJunctions.values()) {
    if (!node.deg2) continue
    for (const leg of node.legs) {
        const e = road._network.get(leg.runKey); if (!e) continue
        const L = e.polyCum?.at(-1); if (!L) continue
        let hump = 0, brk = 0, hx = 0, hz = 0
        const ys = [], DS = 0.5
        const dir = leg.arc > L / 2 ? -1 : +1          // walk INTO the run from the node end
        for (let d = 0; d <= 30; d += DS) {
            const s = leg.arc + dir * d
            const q = road.runPointAt(leg.runKey, s); if (!q) { ys.push(NaN); continue }
            const y = surfAt(q.x, q.z), lg = legY(q.x, q.z)
            ys.push(y)
            if (lg != null && y - lg > hump) { hump = y - lg; hx = q.x; hz = q.z }
        }
        for (let i = 2; i < ys.length - 1; i++) {
            const g1 = (ys[i+1] - ys[i]) / DS, g0 = (ys[i] - ys[i-1]) / DS
            if (isFinite(g1) && isFinite(g0)) brk = Math.max(brk, Math.abs(g1 - g0) / DS)
        }
        results.push({ node: `${node.pos.x.toFixed(0)},${node.pos.z.toFixed(0)}`, run: leg.runKey, hump, brk, hx, hz })
    }
}
results.sort((a, b) => b.hump - a.hump)
console.log(`seed ${seed}: ${road._network.size} runs, ${results.length / 2 | 0} deg-2 connectors (${results.length} leg approaches)\n`)
console.log('  hump(m)  break(1/m)   @world           node          run')
for (const r of results.slice(0, 20))
    console.log(`${r.hump.toFixed(3).padStart(9)} ${r.brk.toFixed(4).padStart(10)}   (${r.hx.toFixed(0)},${r.hz.toFixed(0)})`.padEnd(46) + `${r.node.padEnd(14)} ${r.run}`)
const hs = results.map(r => r.hump).sort((a,b)=>a-b)
const q = (p) => hs[Math.floor(hs.length*p)]
console.log(`\nhump distribution: median ${q(0.5).toFixed(3)}  p75 ${q(0.75).toFixed(3)}  p90 ${q(0.9).toFixed(3)}  p99 ${q(0.99).toFixed(3)}  max ${hs.at(-1).toFixed(3)} m`)
console.log(`approaches with hump > 0.20 m: ${results.filter(r=>r.hump>0.20).length} / ${results.length}`)
// launch check: at 20 m/s a surface curvature |dg/ds| > g/v² = 9.81/400 = 0.0245 /m throws the car
console.log(`approaches whose grade BREAK exceeds 1 g at 20 m/s (>0.0245 /m): ${results.filter(r=>r.brk>0.0245).length} / ${results.length}`)
