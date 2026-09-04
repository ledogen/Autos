// FEAT-68 M0 workbench — corridorConnect over EVERY graph edge of a seed (arg 1, default 20). Not a gate.
// Run: node test/corridor-sweep.mjs [seed], K=2 vs K=3 corridor field.
// Census: time, feasibility, detour, structures, grade mix. The M0 exit measurement.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { truncatedHeightField, corridorConnect, CLS } from '../src/corridor-router.js'

const seed = Number(process.argv[2] || 20)
const road = new RoadSystem(seed, RANGER_PARAMS)
road.setRadius(1400)
road.update(new THREE.Vector3(0, 0, 0))
const hFull = (x, z) => road._coarseH(x, z)
const posOf = new Map()
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++)
  for (const s of road._aliveSitesIn(cx, cz)) posOf.set(`${s.id[0]},${s.id[1]},${s.id[2]}`, s.pos)
const g = road._proto.graph

for (const K of [2, 3]) {
  const hTrunc = truncatedHeightField(road._noiseCoarse, RANGER_PARAMS, K)
  let n = 0, infeasible = 0, bores = 0, bridges = 0, boreLen = 0, bridgeLen = 0
  let detourSum = 0, detourMax = 0, steep = 0 /* edges with any grade > 0.30 */, totalLen = 0
  let g20 = 0 // total m over 20%
  const t0 = performance.now()
  for (const [a, b] of g.edges) {
    const A = posOf.get(g.key(a)), B = posOf.get(g.key(b))
    if (!A || !B) continue
    const res = corridorConnect({ x: A.x, z: A.z, y: hFull(A.x, A.z) }, { x: B.x, z: B.z, y: hFull(B.x, B.z) }, hTrunc, hFull)
    n++
    if (!res) { infeasible++; continue }
    const L = res.stations.s[res.stations.s.length - 1]
    const chord = Math.hypot(B.x - A.x, B.z - A.z)
    totalLen += L
    detourSum += L / chord
    detourMax = Math.max(detourMax, L / chord)
    let hasSteep = false
    for (let i = 1; i < res.pts.length; i++) {
      const ds = res.stations.s[i] - res.stations.s[i - 1]
      const gr = Math.abs(res.profile.y[i] - res.profile.y[i - 1]) / ds
      if (gr > 0.30) hasSteep = true
      if (gr > 0.20) g20 += ds
    }
    if (hasSteep) steep++
    for (const sg of res.profile.segs) {
      if (sg.cls === CLS.BORE) { bores++; boreLen += sg.len }
      if (sg.cls === CLS.BRIDGE) { bridges++; bridgeLen += sg.len }
    }
  }
  const ms = performance.now() - t0
  console.log(`K=${K}: ${n} edges in ${ms.toFixed(0)} ms (${(ms / n).toFixed(1)} ms/edge) | infeasible ${infeasible} | ` +
    `detour mean x${(detourSum / (n - infeasible)).toFixed(2)} max x${detourMax.toFixed(2)} | ` +
    `bores ${bores} (${boreLen.toFixed(0)} m) | bridges ${bridges} (${bridgeLen.toFixed(0)} m) | ` +
    `edges w/ >30% ${steep} | m over 20%: ${g20.toFixed(0)} of ${totalLen.toFixed(0)}`)
}
