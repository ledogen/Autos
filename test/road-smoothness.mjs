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

// BUG-127: a run's centerline runs on into its node, but inside a junction end's trim the ribbon is not drawn (the pad
// is, or at a deg-2 bend the connector strip), and at a sharp bend the line crosses the gravel outer corner, then
// climbs the connector's real kerb. A step counts only between two samples that both stand on drawn asphalt.
function drawnAt (road, terr, x, z) {
  const hw = P.roadHalfWidth ?? 5, raw = terr.rawHeightWorld(x, z), nr = road._resolveRoadSurface(x, z)
  if (nr) {
    const dx = x - nr.point.x, dz = z - nr.point.z, arc = nr.arcS + dx * nr.tangent.x + dz * nr.tangent.z
    if (Math.abs(dx * nr.tangent.z - dz * nr.tangent.x) < hw && road._ribbonDrawnAt(nr.runKey, arc)) return true
  }
  const co = road._connectorCarve(x, z, raw); if (co && co.lat < hw) return true
  return road._junctionPadCarve(x, z, raw)?.padTopY != null
}

function scanSeed (seedStr) {
  const { road, terr } = streamSpawnRegion(seedStr)
  road._detectNodeJunctions()
  let steps = 0, worst = 0, worstAt = null, scannedM = 0
  for (const [runKey, { points, polyCum }] of road._network) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const segLen = Math.hypot(b.x - a.x, b.z - a.z)
      scannedM += segLen
      const n = Math.max(1, Math.round(segLen / STEP))
      let prev = null, px = 0, pz = 0
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t
        // FEAT-40: probe at wheel height — the DRIVEN profile (runProfile, junction-blended;
        // near nodes it diverges up to ~10 m from raw points[].y) + 1 m, like the truck's
        // contact query. Inside a bore span analyticHeight serves the bore floor to below-apex
        // probes and the raw hill overhead to Y-less/above-apex callers.
        const qy = polyCum
          ? road.runProfile(polyCum[i] + (polyCum[i + 1] - polyCum[i]) * t, runKey).gradeY + 1
          : a.y + (b.y - a.y) * t + 1
        const h = terr.analyticHeight(x, z, undefined, qy)
        if (prev !== null) {
          const d = Math.abs(h - prev)
          if (d > WALL && drawnAt(road, terr, x, z) && drawnAt(road, terr, px, pz)) { steps++; if (d > worst) { worst = d; worstAt = { x, z } } }
        }
        prev = h; px = x; pz = z
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
