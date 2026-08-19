// test/road-worker-parity.mjs — FEAT-68: route Worker / synchronous-path parity.
//
// The route Worker (src/road-route-worker.js) IMPORTS the same routeEdgeV2 the synchronous
// fallback calls, so the algorithm cannot drift — the one derivation that can is the worker's
// height-field rebuild from its init subset {worldSeed, 4 coarse params}. This gate pins it:
//   1. buildRouteFields (the worker's own exported derivation) must reproduce RoadSystem's
//      _v2Trunc / _coarseH closures to the last bit on sampled points;
//   2. routeEdgeV2 fed the worker-derived fields must return byte-identical primitive
//      descriptors to the geometry the RoadSystem registered, for real edges WITH their deg-2
//      heading pins (the spec is rebuilt exactly as _warmScan builds a job).
// (Replaces route-worker-sync.mjs, which byte-compared the retired verbatim-mirror string.)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { buildRouteFields } from '../src/road-route-worker.js'
import { routeEdgeV2 } from '../src/corridor-router.js'

let fails = 0
const check = (ok, msg) => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${msg}`)
  if (!ok) fails++
}

for (const seed of [20, 11]) {
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.setRadius(1400)
  road.update(new THREE.Vector3(0, 0, 0))

  // 1. field derivation parity — the exact init subset RoadRouteWorker.init sends
  const fields = buildRouteFields(seed, {
    coarseAmplitude: RANGER_PARAMS.coarseAmplitude,
    coarseFreq:      RANGER_PARAMS.coarseFreq,
    coarseOctaves:   RANGER_PARAMS.coarseOctaves,
    ridgeSharpness:  RANGER_PARAMS.ridgeSharpness,
  })
  const trunc = road._v2Trunc()
  let worstT = 0, worstC = 0
  for (let i = 0; i < 200; i++) {
    const x = ((i * 7919) % 4000) - 2000, z = ((i * 104729) % 4000) - 2000
    worstT = Math.max(worstT, Math.abs(fields.hTrunc(x, z) - trunc(x, z)))
    worstC = Math.max(worstC, Math.abs(fields.hCoarse(x, z) - road._coarseH(x, z)))
  }
  check(worstT === 0, `seed ${seed}: worker hTrunc == RoadSystem._v2Trunc on 200 samples (worst |Δ| ${worstT})`)
  check(worstC === 0, `seed ${seed}: worker hCoarse == RoadSystem._coarseH on 200 samples (worst |Δ| ${worstC})`)

  // 2. route parity on real edges, pins included — specs rebuilt exactly as _warmScan builds jobs
  const g = road._proto.graph
  let compared = 0, mismatches = 0
  for (const [c1, c2] of g.edges) {
    if (compared >= 8) break
    if ((c1[0] - c2[0] || c1[1] - c2[1] || c1[2] - c2[2]) > 0) continue   // canonical spellings only
    const key = road._edgeClsKey(c1, c2)
    const registered = road._proto.cls.get(key)
    if (!registered || !(registered.length > 1e-6)) continue
    const dirs = road._v2EdgeDirs(g, null, g.key(c1), g.key(c2))
    const spec = road._v2EdgeSpec(c1, c2, dirs)
    const res = routeEdgeV2(spec, fields.hTrunc, fields.hCoarse)
    const a = JSON.stringify(res.cl.primitives)
    const b = JSON.stringify(registered.primitives)
    if (a !== b) mismatches++
    compared++
  }
  check(compared >= 4 && mismatches === 0,
    `seed ${seed}: worker-field routeEdgeV2 == registered geometry on ${compared} edges (${mismatches} mismatches)`)
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL ROAD-WORKER-PARITY CHECKS PASSED')
process.exit(fails ? 1 : 0)
