import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
// Camber-distribution probe for the saturating superelevation model (src/road.js camberFromCurvature).
// Reports banking the graph network produces at the current camberMaxAngleDeg / camberKneeRadiusM, and
// bins by curvature so you can see the "more on sweepers, less on hairpins" shape. Override via env:
//   camberMaxAngleDeg=25 camberKneeRadiusM=80 node test/_camber-compare.mjs
const maxDeg = Number(process.env.camberMaxAngleDeg ?? RANGER_PARAMS.camberMaxAngleDeg)
const kneeM  = Number(process.env.camberKneeRadiusM ?? RANGER_PARAMS.camberKneeRadiusM)
const r = new RoadSystem(6, { ...RANGER_PARAMS, camberMaxAngleDeg: maxDeg, camberKneeRadiusM: kneeM })
r.setRadius(1600); r.update(new THREE.Vector3(4500, 0, 600))
// bins by local radius (m): hairpin <25, sweeper 25–90, long ≥90
const bins = { hairpin: [], sweeper: [], long: [] }
let maxAbs = 0
for (const [k, e] of r._network) {
  const pts = e.points; if (pts.length < 3) continue
  let s = -(e.arcOrigin || 0)
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    const camDeg = Math.abs(r.camberProfile(s, k)) * 180 / Math.PI
    if (camDeg > maxAbs) maxAbs = camDeg
    if (i === 0 || i === pts.length - 1) continue
    const A = pts[i - 1], B = pts[i], C = pts[i + 1]
    const a = Math.hypot(C.x - B.x, C.z - B.z), b = Math.hypot(C.x - A.x, C.z - A.z), c = Math.hypot(B.x - A.x, B.z - A.z)
    const area = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2
    if (area < 1e-6) continue
    const R = (a * b * c) / (4 * area)
    const bin = R < 25 ? 'hairpin' : R < 90 ? 'sweeper' : 'long'
    bins[bin].push(camDeg)
  }
}
const stat = (arr) => arr.length ? `avg ${(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1)}°  max ${Math.max(...arr).toFixed(1)}°  n=${arr.length}` : 'n=0'
console.log(`maxAngle=${maxDeg}°  kneeRadius=${kneeM}m   overall max camber=${maxAbs.toFixed(1)}°`)
console.log(`  hairpin (R<25m):    ${stat(bins.hairpin)}`)
console.log(`  sweeper (25-90m):   ${stat(bins.sweeper)}`)
console.log(`  long    (R>=90m):   ${stat(bins.long)}`)
