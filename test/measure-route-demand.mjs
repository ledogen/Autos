// test/measure-route-demand.mjs — PERF-31 lever-5 instrument (rainy-day script, NOT a gate).
//
// Answers the go/no-go question from .planning/research/ROUTER-REUSE-AND-PARALLELISM.md §2:
// what fraction of the route keys a network build demands is predictable up front by the
// warm-scan enumeration (warmBandComplete/_warmScan)? Predictable routes can be fanned out to
// the route-worker pool BEFORE the serial plan layer runs; everything else stays on the build
// thread and Amdahl caps the win.
//
// Method: per window, (A) pump warmBandComplete with a dispatcher that routes each job
// synchronously via the real routeEdgeV2 (the road-worker-parity pattern) and records every
// dispatched cache key; (B) run a cold synchronous build with _edgeCenterline wall-clock
// wrapped, then read every key the build left in _proto.cls. Classify demanded keys:
// in-warm-set / #g hard-grade rung / plan-demanded-only. The plan-demanded class is dominated
// by PIN-VARIANT mismatches (same edge, different #p fingerprint — the settle pass routes
// margin edges under band-fringe pins the warm scan does not derive); see the sample dump.
//
// First run (2026-09-04, seed 6, three 1400 m windows, M4):
//   build total 17.4 s · inside _edgeCenterline 7.8 s (45%)
//   demanded 214 keys · predicted 136 · predictable 112 (52%) · #g 0 · plan-only 102
//
// Run: node test/measure-route-demand.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { buildRouteFields } from '../src/road-route-worker.js'
import { routeEdgeV2 } from '../src/corridor-router.js'

const SEED = 6, R = 1400
const CENTERS = [{ x: 139, z: 341 }, { x: 1539, z: 341 }, { x: 139, z: 1741 }]
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const noGo = (x, z) => water.isRoadNoGo(x, z)
const discs = (a, b, c, d) => { const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o }
const fields = buildRouteFields(SEED, RANGER_PARAMS)

const mk = () => { const r = new RoadSystem(SEED, RANGER_PARAMS); r.setWaterNoGo(noGo, discs); r.setRadius(R); return r }

const predictedAll = new Set(), demandedAll = new Set()
let routeMs = 0, totalMs = 0
for (const C of CENTERS) {
  const w = mk()
  w.setRouteDispatcher((jobs, epoch) => {
    const results = jobs.map((job) => {
      predictedAll.add(job.key)
      const res = routeEdgeV2(job, fields.hTrunc, fields.hCoarse)
      return { key: job.key, prims: res.cl.primitives, v2Dirs: !!job.dirs,
               pinFallback: !!(res.pinRequested && res.feasible && !res.usedPin) }
    })
    w.ingestRoutedConnections(results, epoch)
  })
  const c = new THREE.Vector3(C.x, 0, C.z)
  for (let i = 0; i < 200 && !w.warmBandComplete(c); i++) {}

  const d = mk()
  const orig = d._edgeCenterline.bind(d)
  d._edgeCenterline = (...a) => { const t0 = performance.now(); const r = orig(...a); routeMs += performance.now() - t0; return r }
  const t0 = performance.now()
  d.update(new THREE.Vector3(C.x, 0, C.z))
  totalMs += performance.now() - t0
  for (const k of d._proto.cls.keys()) demandedAll.add(k)
}
let hit = 0, gRung = 0, planOnly = 0
for (const k of demandedAll) {
  if (predictedAll.has(k)) hit++
  else if (k.includes('#g')) gRung++
  else planOnly++
}
console.log(`three ${R} m windows, seed ${SEED}`)
console.log(`build total: ${(totalMs / 1000).toFixed(1)} s · inside _edgeCenterline (routing on the build thread): ${(routeMs / 1000).toFixed(1)} s (${Math.round(100 * routeMs / totalMs)}%)`)
console.log(`demanded route keys: ${demandedAll.size} · predicted by warm scan: ${predictedAll.size}`)
console.log(`  predictable (in warm set): ${hit} (${Math.round(100 * hit / demandedAll.size)}%)`)
console.log(`  #g hard-grade rungs (unpredictable by design): ${gRung}`)
console.log(`  plan-demanded, not in warm set: ${planOnly}`)
console.log('  sample unpredicted keys:')
for (const k of [...demandedAll].filter((k2) => !predictedAll.has(k2) && !k2.includes('#g')).slice(0, 6)) console.log('   ', k)
