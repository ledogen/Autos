// GATE (BUG-233): inside every ringed (≥ 3-leg) junction pad, sampleRoadTopY is the surface the truck rides there.
//
// The drawn pad and the physics overlay both ride padTopY (_nodeSurfaceTop + apron lift). sampleRoadTopY took the free
// _resolveRoadSurface's one leg instead, and at a pad's tear line that is another leg: up to 0.863 m under the pad
// (3524018126 (25.2, 583.7)). Its readers seat the truck (_groundSampleY's four corners), land papers and site POIs.
// Check: a 1 m grid inside each ring (signed ring distance < −0.1 m) on two random seeds; |sampleRoadTopY − physics|
// (terrain analyticHeight, potholes off) ≤ MAX_D everywhere.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = process.argv.length > 2 ? process.argv.slice(2) : ['3524018126', '3358923599'], RAD = 900, MAX_D = 0.01   // argv: a census seed list
const P = { ...RANGER_PARAMS, potholeEnabled: false }
let fails = 0, n = 0, pads = 0, worst = 0, at = ''
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  const water = wirePondNoGo(road, ws, P); road.setRadius(RAD + 300); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(ws, P, road, { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) })
  for (const node of road._detectNodeJunctions().values()) {
    if (!node.ring || node.legs.length < 3 || Math.hypot(node.pos.x, node.pos.z) > RAD) continue
    pads++
    const R = Math.ceil(node.ringMaxR ?? 0)
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const x = node.pos.x + dx + 0.37, z = node.pos.z + dz + 0.61
      if (road._signedRingDist(node.ring, x, z) > -0.1) continue
      const top = road.sampleRoadTopY(x, z)
      if (top == null) continue
      const d = Math.abs(top - T.analyticHeight(x, z, undefined, top + 0.3))
      n++
      if (d > MAX_D) fails++
      if (d > worst) { worst = d; at = `${S} (${x.toFixed(1)}, ${z.toFixed(1)})` }
    }
  }
}
console.log(`  ${pads} ringed pads, ${n} points inside: worst |sampleRoadTopY − physics| ${(worst * 100).toFixed(2)} cm at ${at} (bar ${MAX_D * 100} cm; main 91.7 cm, 1136 of 2691 points over 1 cm)`)
if (fails) { console.log(`FAIL: ${fails} pad points where sampleRoadTopY is not the pad surface`); process.exit(1) }
console.log('PASS')
process.exit(0)
