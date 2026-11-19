// GATE (BUG-230): a BARE degree-2 join — two runs meeting at a graph node with no connector strip (first-chord kink ≤
// roadJunctionKinkDeg) — is one continuous road, in physics AND in the drawn ribbon.
//
// Main before BUG-230 stepped there by up to 0.27 m at the pavement edge, three ways (src/road.js):
//   (a) BUG-90's bank run-off flattened ONE leg's bank where no connector was built (3343754777: −3.42° met 0°, 0.267 m);
//   (b) an end-end / start-start join had two independent banks (3299356612: 0° met 3.01°, 0.232 m);
//   (c) physics framed each run on its analytic end tangent while the ribbon frames on FEAT-10's weld bisector, so the
//       sections overlapped on a kink's inside (2832975687: 0.10 m; the ribbon sat up to 8 cm under physics).
// Checks, on those three seeds (every bare and connector join within RAD of the origin):
//   1. the tire deck (terrain analyticHeight, potholes off) walked across each join along the shared tangent at lat
//      ±2.5 / ±4.5 in 5 cm steps: no jump beyond the local grade > MAX_STEP;
//   2. each ribbon pavement vertex drawn within NEAR of a bare join (|lat| < hw − 0.05) vs physics at its x,z: < MAX_MP;
//   3. connector joins keep their step ≤ MAX_CONN (they are not touched).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { CHUNK_SIZE } from '../src/terrain.js'

const SEEDS = ['3343754777', '3299356612', '2832975687']   // random seeds holding (a), (b), (c)
const RAD = 1000, NEAR = 8, MAX_STEP = 0.05, MAX_MP = 0.02, MAX_CONN = 0.01
const P = { ...RANGER_PARAMS, potholeEnabled: false }, hw = P.roadHalfWidth ?? 5, W = P.roadWidth ?? 10
const kinkMin = (P.roadJunctionKinkDeg ?? 0) * Math.PI / 180
let fails = 0, nBare = 0, nV = 0
const worst = { step: 0, conn: 0, mp: 0 }, at = {}
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  const water = wirePondNoGo(road, ws, P); road.setRadius(RAD + 300); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(ws, P, road, { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) })
  road._detectNodeJunctions()
  const ends = new Map()
  for (const [k, e] of road._network) for (const [id, isStart] of [[e.cellA, true], [e.cellB, false]]) {
    if (!id) continue
    const key = road._proto.graph.key(id); (ends.get(key) ?? ends.set(key, []).get(key)).push({ k, e, isStart, id })
  }
  const bare = []
  for (const [, arr] of ends) {
    if (arr.length !== 2 || road._graphDegreeOf(arr[0].id) !== 2) continue
    const [a, b] = arr, pa = a.isStart ? a.e.points[0] : a.e.points.at(-1)
    if (Math.hypot(pa.x, pa.z) > RAD) continue
    const sa = road._strandAtEnd(a.e.points, a.isStart), sb = road._strandAtEnd(b.e.points, b.isStart)
    const kink = Math.PI - Math.acos(Math.max(-1, Math.min(1, sa.wx * sb.wx + sa.wz * sb.wz)))
    if (kink > 120 * Math.PI / 180) continue   // an elbow: the straight walk leaves the road
    const isBare = !(kinkMin > 0 && kink > kinkMin)
    const pr = road.runProfile(a.isStart ? 0 : a.e.polyCum.at(-1), a.k), tx = pr.tx, tz = pr.tz
    let step = 0
    for (const l of [-4.5, -2.5, 2.5, 4.5]) {
      const y = (u) => T.analyticHeight(pa.x + tx * u + tz * l, pa.z + tz * u - tx * l, undefined, pa.y + 3)
      const g = (y(1.5) - y(-1.5)) / 3
      let prev = y(-1.5)
      for (let u = -1.45; u <= 1.5001; u += 0.05) { const c = y(u); step = Math.max(step, Math.abs(c - prev - g * 0.05)); prev = c }
    }
    const tag = `${S} (${pa.x.toFixed(1)}, ${pa.z.toFixed(1)})`
    if (isBare) {
      nBare++; bare.push(pa)
      if (step > MAX_STEP) fails++
      if (step > worst.step) { worst.step = step; at.step = tag }
    } else {
      if (step > MAX_CONN) fails++
      if (step > worst.conn) { worst.conn = step; at.conn = tag }
    }
  }
  // 2. the drawn ribbon at the bare joins
  const mesh = new RoadMeshSystem({ add () {} }, road, null, P, ws)
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  const secs = [], section = mesh._ribbonSection
  mesh._ribbonSection = function (px, pz, arcS, runKey, cs, params, out) {
    const q = section.call(this, px, pz, arcS, runKey, cs, params, out)
    secs.push(Float64Array.from(out))
    return q
  }
  const tiles = new Set(bare.map(p => `${Math.floor(p.x / CHUNK_SIZE)},${Math.floor(p.z / CHUNK_SIZE)}`))
  for (const p of bare) for (const [dx, dz] of [[-NEAR, 0], [NEAR, 0], [0, -NEAR], [0, NEAR]]) tiles.add(`${Math.floor((p.x + dx) / CHUNK_SIZE)},${Math.floor((p.z + dz) / CHUNK_SIZE)}`)
  for (const t of tiles) { const [a, b] = t.split(',').map(Number); mesh._buildRoadTile(a, b, t) }
  for (const v of secs) for (let j = 0; j < v.length / 3; j++) {
    const lat = (j / (v.length / 3 - 1) - 0.5) * W
    if (Math.abs(lat) > hw - 0.05) continue
    const x = v[3 * j], y = v[3 * j + 1], z = v[3 * j + 2]
    if (!bare.some(p => Math.hypot(p.x - x, p.z - z) < NEAR)) continue
    const ph = road._sampleCarveWorld(x, z, T.rawHeightWorld(x, z), undefined, y + 0.3)?.gradeY
    if (ph == null) continue
    const d = Math.abs(ph - y)
    nV++
    if (d >= MAX_MP) fails++
    if (d > worst.mp) { worst.mp = d; at.mp = `${S} (${x.toFixed(1)}, ${z.toFixed(1)}) lat ${lat.toFixed(2)}` }
  }
}
console.log(`  ${nBare} bare deg-2 joins: worst deck step ${(worst.step * 100).toFixed(1)} cm at ${at.step} (bar ${MAX_STEP * 100} cm; main 26.7 cm)`)
console.log(`  ribbon vs physics, ${nV} pavement vertices within ${NEAR} m of them: worst ${(worst.mp * 100).toFixed(1)} cm at ${at.mp} (bar ${MAX_MP * 100} cm; main 22 cm)`)
console.log(`  connector joins: worst step ${(worst.conn * 100).toFixed(1)} cm at ${at.conn} (bar ${MAX_CONN * 100} cm, untouched)`)
if (fails) { console.log(`FAIL: ${fails} bare-join steps or ribbon/physics gaps over the bar`); process.exit(1) }
console.log('PASS')
process.exit(0)
