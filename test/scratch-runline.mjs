// Launch metric along the run that passes through a captured mark (works merged or not).
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
const cap = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const WIN = Number(process.argv[3] ?? 60)
const { seed, params } = cap.world, { mark } = cap.place
const road = new RoadSystem(seed, params)
road.update(new THREE.Vector3(mark.x, 0, mark.z))
const at = road.debugSampleAt(mark.x, mark.z)
const runKey = at.runKey, S0 = at.arcS
const e = road._network.get(runKey)
console.log(`run ${runKey}  len ${e.polyCum.at(-1).toFixed(0)} m  markArcS ${S0.toFixed(1)}  prims ${e.centerline?.primitives?.length}`)
const surf = (x,z) => { const raw = road._coarseH(x,z)
    const c = road._sampleCarveWorld(x,z,raw,undefined,undefined)
    return c && c.blendW>1e-6 ? raw + c.blendW*(c.gradeY-raw) : raw }
const DS = 0.5, ys = [], ss = [], xs = []
for (let s = S0-WIN; s <= S0+WIN; s += DS) {
    const q = road.runPointAt(runKey, s); if (!q) continue
    ss.push(s); xs.push(q); ys.push(surf(q.x, q.z))
}
const W = Math.round(2.85/DS)
let worst = 0, worstS = 0
const rows = []
for (let i = W; i < ys.length - W; i++) {
    const g1 = (ys[i+W]-ys[i])/(W*DS), g0 = (ys[i]-ys[i-W])/(W*DS)
    const dg = (g1-g0)/(W*DS), load = Math.abs(dg)*400/9.81
    if (load > worst) { worst = load; worstS = ss[i] }
    rows.push(`${ss[i].toFixed(1).padStart(7)} (${xs[i].x.toFixed(0)},${xs[i].z.toFixed(0)})`.padEnd(22)+`${ys[i].toFixed(3).padStart(9)} ${(g0*100).toFixed(1).padStart(7)}% ${load.toFixed(2).padStart(7)} g${Math.abs(ss[i]-S0)<0.3?'  <<MARK':''}`)
}
if (process.argv[4] === '-v') for (const r of rows) console.log(r)
console.log(`worst vertical demand at 20 m/s over ±${WIN} m of the mark: ${worst.toFixed(2)} g at arcS ${worstS.toFixed(1)}`)
