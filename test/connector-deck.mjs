// test/connector-deck.mjs — BUG-90 gate: the wheels ride the deg-2 connector strip that is DRAWN.
//
// A deg-2 kink's connector (_buildDeg2Ribbon) sweeps a full-width asphalt strip along its fillet, and
// the fillet cuts the inside of the bend PAST both legs' ribbon edges. Each strip vertex sits on
// sampleRoadTopY. The physics carve (_sampleCarveWorld) only rode that deck where the RUN's |lat| <
// halfWidth, so inside the bend the wheel fell clearanceMargin (0.15 m) into the dirt under visible
// asphalt, then hit a 0.15 m lip climbing back onto the next leg's ribbon — the owner's vault at
// 10 m/s (seed 477662008, node 188,1003).
//
// For every deg-2 connector in the windows: sample the strip interior OFF the run ribbons (the band
// the bug lived in) and assert physics (analyticHeight) == drawn deck (sampleRoadTopY).
// RED on the pre-fix carve (≈0.150 m everywhere in that band); GREEN after.
//
// Run: node test/connector-deck.mjs   (exit 0 = physics rides the drawn connector deck)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed } from '../src/seed.js'

const TOL = 0.05        // m — well under the 0.15 m clearance step; mesh chord sag is ~1 cm
const EDGE_IN = 0.3     // m — stay this far inside the strip edge (strip frame vs projection frame)
const END_IN = 1.0      // m — and this far from the strip ends
const RUN_OFF = 0.2     // m — only points this far OFF every run ribbon (the band the bug lived in)
const hw = P.roadHalfWidth ?? 5

const windows = [
  ...WINDOWS.filter(w => ['seed6 origin', 'seed7 origin', 'seed3 origin'].includes(w.name)),
  { name: 'BUG-90 capture', seed: '477662008', cx: 197, cz: 999 },
]

let fail = 0, totalPts = 0, totalArcs = 0
for (const W of windows) {
  const road = W.r ? buildWindow(W, P) : new RoadSystem(parseWorldSeed(W.seed), P)
  if (!W.r) road.update(new THREE.Vector3(W.cx, 0, W.cz))
  const ws = parseWorldSeed(W.seed)
  const terr = makeTerrainHeadless(ws, P, road)
  road._detectNodeJunctions()
  let worst = 0, worstAt = null, n = 0, arcs = 0
  for (const node of road._nodeJunctions.values()) {
    const arc = node.deg2
    if (!arc?.points || arc.points.length < 2) continue
    arcs++
    const pts = arc.points, cum = arc.polyCum, L = cum[cum.length - 1]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], seg = cum[i + 1] - cum[i]
      if (seg < 1e-6) continue
      const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg
      for (let d = 0; d < seg; d += 0.5) {
        const s = cum[i] + d
        if (s < END_IN || s > L - END_IN) continue
        for (let lat = -hw + EDGE_IN; lat <= hw - EDGE_IN + 1e-9; lat += 0.5) {
          const x = a.x + tx * d - tz * lat, z = a.z + tz * d + tx * lat
          const nr = road._resolveRoadSurface(x, z)
          if (nr && Math.abs((x - nr.point.x) * nr.tangent.z - (z - nr.point.z) * nr.tangent.x) < hw + RUN_OFF) continue
          const deck = road.sampleRoadTopY(x, z)
          if (deck == null) continue
          const err = Math.abs(terr.analyticHeight(x, z) - deck)
          n++
          if (err > worst) { worst = err; worstAt = { x, z } }
        }
      }
    }
  }
  const ok = worst <= TOL
  if (!ok) fail++
  totalPts += n; totalArcs += arcs
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${W.name}: ${arcs} connectors, ${n} off-run strip pts, ` +
    `worst |physics − deck| ${worst.toFixed(3)} m${worstAt ? ` @ (${worstAt.x.toFixed(1)}, ${worstAt.z.toFixed(1)})` : ''} (tol ${TOL})`)
}
if (!totalPts) { console.log('[FAIL] ✗ no connector strip points sampled — the gate measured nothing'); fail++ }
console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${totalArcs} connectors, ${totalPts} points`)
process.exit(fail ? 1 : 0)
