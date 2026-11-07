// GATE (BUG-121): queryNearest answers the nearest road, off the footprint as well as on it.
//
// The D4 interior rule ("prefer a road whose footprint the query is in") once measured the query against a sample's
// tangent LINE, which is infinite: from ~9 m off a road, a sample 100+ m up a bend whose straight continuation passed
// the query counted as interior and beat the true nearest road (87 % of off-footprint queries, worst +189 m). The
// spawn (main.js resolveSpawn and test/lib/spawn-decision.mjs), the POI keep-out, the camp tether and the prop
// scatter's road bands all ask it from off the road.
//
// On random seeds (pond no-go wired, R 1400), queries step sideways off random road points by 0–40 m. Each answer is
// checked against brute force: the nearest point on any run's polyline. GATING: no answer more than 2 m past it.
// Reported: per-offset worst.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed, mulberry32 } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const SEEDS = ['1041979632', '2741256656']   // random seeds (BUG-121's probe set)
const OFFS = [0, 4, 7, 9, 12, 20, 40], N = 250, TOL = 2
let fails = 0
const worst = Object.fromEntries(OFFS.map((o) => [o, 0]))
for (const s of SEEDS) {
  const ws = parseWorldSeed(s), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(1400); road.update(new THREE.Vector3(0, 0, 0))
  const runs = [...road._network.values()].filter((e) => e.points?.length > 2)
  const segs = []; for (const e of runs) for (let i = 0; i + 1 < e.points.length; i++) segs.push([e.points[i], e.points[i + 1]])
  const truth = (x, z) => { let b = Infinity
    for (const [a, c] of segs) { const dx = c.x - a.x, dz = c.z - a.z, L2 = dx * dx + dz * dz
      const t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0
      const d = Math.hypot(a.x + t * dx - x, a.z + t * dz - z); if (d < b) b = d }
    return b }
  const rng = mulberry32(ws ^ 0x121)
  let n = 0
  for (let k = 0; k < N * 4 && n < N; k++) {
    const e = runs[Math.floor(rng() * runs.length)], i = 1 + Math.floor(rng() * (e.points.length - 2))
    const p = e.points[i], q = e.points[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z) || 1
    if (Math.hypot(p.x, p.z) > 1100) continue   // well inside the window
    n++
    const side = rng() < 0.5 ? -1 : 1, nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L
    for (const o of OFFS) {
      const x = p.x + side * nx * o, z = p.z + side * nz * o, r = road.queryNearest(x, z)
      if (!r) continue
      const ex = Math.hypot(r.point.x - x, r.point.z - z) - truth(x, z)
      if (ex > worst[o]) worst[o] = ex
      if (ex > TOL) { fails++; if (fails <= 5) console.log(`  FAIL seed ${s} (${x.toFixed(1)}, ${z.toFixed(1)}), ${o} m off: answered ${ex.toFixed(1)} m past the nearest road`) }
    }
  }
  console.log(`seed ${s}: ${n} road points × ${OFFS.length} offsets`)
}
console.log('worst past the nearest road, by offset: ' + OFFS.map((o) => `${o} m +${worst[o].toFixed(2)}`).join(' · '))
console.log(fails ? `FAIL: ${fails} answers more than ${TOL} m past the nearest road` : 'PASS')
process.exit(fails ? 1 : 0)
