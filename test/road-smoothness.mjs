// GATE (run-all): node test/road-smoothness.mjs
// Asserts the PHYSICS collision surface (terrain.analyticHeight → road._sampleCarveWorld) is smooth
// along every road centerline — no vertical step the rendered ribbon doesn't have. The visual ribbon
// (road-mesh.js sweepRibbon) is smooth by construction; the physics carve historically tore where
// queryNearest's nearest-centerline resolution flipped runs or lurched arcS near curves/crossings
// (the "invisible cliff" that pinned the truck at the lone-pine spawn). See
// project_carve_invisible_cliff. This gate locks the collision surface to the visual road.
//
// Metric: walk each streamed run's centerline at 0.10 m; the physics surface there should follow the
// road grade (≤ ~18° ≈ 3.2 cm / 0.1 m). Flag any single 0.1 m step whose vertical delta exceeds a
// WALL threshold (0.15 m / 0.1 m ≈ 56°) — no real road grade is that steep, so a flagged step is a
// collision-only discontinuity. RED before the topmost-surface carve fix, GREEN after.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const CS = 64
const SEEDS = ['lone-pine', '6', '7']
const STEP = 0.1            // m, sampling pitch along centerline
const WALL = 0.15           // m per 0.1 m step — above any real grade; flags collision-only cliffs

function streamSpawnRegion (seedStr) {
  const ws = parseWorldSeed(seedStr)
  const road = new RoadSystem(ws, P)
  const ss = seedFor(ws, 'spawn')
  const bx = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
  const bz = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
  road.ensureTile(Math.floor(bx / CS), Math.floor(bz / CS))
  let n = road.queryNearest(bx, bz, 200)
  const terr = makeTerrainHeadless(ws, P, road)
  if (n) {
    road.ensureTile(Math.floor(n.point.x / CS), Math.floor(n.point.z / CS))
    n = road.queryNearest(n.point.x, n.point.z, 100) || n
    road.update(new THREE.Vector3(n.point.x, 0, n.point.z))
  }
  return { road, terr }
}

function scanSeed (seedStr) {
  const { road, terr } = streamSpawnRegion(seedStr)
  let steps = 0, worst = 0, worstAt = null, scannedM = 0
  for (const [, { points }] of road._network) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const segLen = Math.hypot(b.x - a.x, b.z - a.z)
      scannedM += segLen
      const n = Math.max(1, Math.round(segLen / STEP))
      let prev = null
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
        const h = terr.analyticHeight(x, z)
        if (prev !== null) {
          const d = Math.abs(h - prev)
          if (d > WALL) { steps++; if (d > worst) { worst = d; worstAt = { x, z } } }
        }
        prev = h
      }
    }
  }
  return { steps, worst, worstAt, scannedM }
}

let totalFail = 0
for (const seed of SEEDS) {
  const r = scanSeed(seed)
  const ok = r.steps === 0
  if (!ok) totalFail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  seed=${seed.padEnd(10)} ` +
    `${(r.scannedM / 1000).toFixed(1)} km centerline · ` +
    `${r.steps} collision-only steps >${WALL}m/0.1m · ` +
    `worst ${(r.worst * 100).toFixed(0)} cm` +
    (r.worstAt ? ` at (${r.worstAt.x.toFixed(0)},${r.worstAt.z.toFixed(0)})` : '')
  )
}

if (totalFail > 0) {
  console.error(`\nFAIL: ${totalFail}/${SEEDS.length} seeds have invisible collision steps in the road surface.`)
  process.exit(1)
}
console.log('\nPASS: collision surface is smooth along every road centerline (matches the visual ribbon).')
