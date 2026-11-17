// test/deg2-leg-trim.mjs — BUG-201 gate: at a deg-2 bend each leg's ribbon ends ON the connector's mouth.
//
// A deg-2 connector (_buildDeg2ArcGeom) leaves each leg at its mouth (cutback + halfWidth/2, plus up to 8 m of
// sharp-kink pullback) and cuts the corner from there. The legs' ribbons used to be trimmed at the bare cutback
// instead, so each ran on 2.5–10.5 m past the point the connector turns off it, and on the bend's OUTER side that
// overrun stuck out of the connector's edge — the owner's light sliver (1.02 m at the BUG-179 #17 bend). Now the
// ribbon ends with a section exactly on the mouth, as a padded junction's legs do (DEC-068's weld).
//
// Read from the generated mesh (RoadMeshSystem._buildRoadTile ribbons, the geometry the colliders are built from):
// for every deg-2 connector in the windows and each of its legs,
//   • no ribbon top vertex nearer the node than the mouth (0.5 m clear of the weld section) lies more than TOL
//     outside the connector strip's edge (the sliver);
//   • the ribbon reaches the mouth to within REACH (no hole between ribbon and connector).
//
// Run: node test/deg2-leg-trim.mjs   (exit 0 = every deg-2 leg ends on its connector's mouth)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { CHUNK_SIZE } from '../src/terrain.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const TOL = 0.05     // m outside the connector edge
const REACH = 0.3    // m — the ribbon's end may sit this far beyond the mouth
const hw = P.roadHalfWidth ?? 5
const SIDE = 13      // sweepRibbon verts per section: 11 top + 2 skirt

// Random seeds (never "the world"): the #17 chained-fork bend of BUG-179's sheet and the ordinary bends near it.
const windows = [
  { name: 'BUG-179 #17 chained-fork bend', seed: '1019019281', cx: -2902, cz: -645, r: 60 },
  { name: 'seed 1019019281 ordinary bends', seed: '1019019281', cx: -700, cz: -400, r: 700 },
  { name: 'seed 3865194206 origin', seed: '3865194206', cx: 0, cz: 0, r: 900 },
]

let fail = 0, legs = 0
for (const W of windows) {
  const ws = parseWorldSeed(W.seed), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(W.r + 300); road.update(new THREE.Vector3(W.cx, 0, W.cz))
  const nodes = [...road._detectNodeJunctions().values()].filter((n) => n.deg2 && Math.hypot(n.pos.x - W.cx, n.pos.z - W.cz) < W.r)
  let cur = null
  const mesh = new RoadMeshSystem({ add (o) { if (o.material === mesh._material) cur.push(o.geometry) } }, road, null, P, ws)
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  const byTile = new Map()
  const geosOf = (n) => {
    const tx = Math.floor(n.pos.x / CHUNK_SIZE), tz = Math.floor(n.pos.z / CHUNK_SIZE), out = []
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = `${tx + dx},${tz + dz}`
      if (!byTile.has(k)) { cur = []; mesh._buildRoadTile(tx + dx, tz + dz, k); byTile.set(k, cur) }
      out.push(...byTile.get(k))
    }
    return out
  }
  let worst = 0, worstAt = '', worstGap = 0, gapAt = ''
  for (const node of nodes) {
    const geos = geosOf(node), arc = node.deg2
    node.legs.forEach((leg, i) => {
      legs++
      const e = road._network.get(leg.runKey), mouthD = arc.mouthD[i], far = mouthD + 1.5 * hw
      let minD = Infinity
      for (const g of geos) {
        const p = g.attributes.position.array
        for (let v = 0; v < p.length / 3; v++) {
          if (v % SIDE > 10) continue
          const x = p[v * 3], z = p[v * 3 + 2]
          if (Math.hypot(x - node.pos.x, z - node.pos.z) > far + hw) continue
          const pr = road._projectOntoRun(e, x, z)
          if (!pr || pr.d2 > (hw + 0.05) ** 2) continue
          const d = Math.abs(pr.arcS - leg.arc)
          if (d > far) continue
          if (d < minD) minD = d
          if (d >= mouthD - 0.5) continue
          const pc = road._projectOntoDeg2Arc(arc, x, z)
          const over = pc ? Math.abs(pc.signedLat) - hw : 0
          if (over > worst) { worst = over; worstAt = `(${x.toFixed(1)}, ${z.toFixed(1)}) ${(mouthD - d).toFixed(1)} m past the mouth` }
        }
      }
      const gap = minD - mouthD
      if (gap > worstGap) { worstGap = gap; gapAt = `node (${node.pos.x.toFixed(1)}, ${node.pos.z.toFixed(1)})` }
    })
  }
  const ok = nodes.length > 0 && worst <= TOL && worstGap <= REACH
  if (!ok) fail++
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${W.name}: ${nodes.length} connectors · worst ribbon outside the connector edge ` +
    `${worst.toFixed(3)} m${worstAt ? ` @ ${worstAt}` : ''} (tol ${TOL}) · worst ribbon end short of the mouth ${worstGap.toFixed(2)} m${gapAt ? ` @ ${gapAt}` : ''} (tol ${REACH})`)
}
console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${legs} deg-2 legs`)
process.exit(fail ? 1 : 0)
