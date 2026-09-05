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
// wrapped, then read every key the build left in _proto.cls.
//
// PERF-31 W1 classification (2026-09-04): every demanded key is tagged with
//   - its PRODUCER: the RoadSystem method chain that first demanded it (stack capture at
//     cache-miss time), collapsed to the plan-layer pass that asked;
//   - whether it was actually COMPUTED (routeEdgeV2 ran — _v2EdgeSpec built) or merely DERIVED
//     (the reversed spelling of an already-cached forward: reversePrimitives, ~free);
//   - its MISMATCH class vs the warm set: warm-hit / #g hard-grade / pin-variant (same edge +
//     spelling, different #p fingerprint) / direction-variant (reverse spelling of a warm edge)
//     / unlisted-edge (never enumerated by the warm scan at all).
//
// First run (2026-09-04, seed 6, three 1400 m windows, M4):
//   build total 17.4 s · inside _edgeCenterline 7.8 s (45%)
//   demanded 214 keys · predicted 136 · predictable 112 (52%) · #g 0 · plan-only 102
//
// PERF-31 W1+W2 (2026-09-05, same windows/machine):
//   flip fix (sibs carried through the reversed spelling): predictable 52% -> 62%
//   + plan-warm waves (warmPlanDemand): predictable 178/186 computed = 95.7% (bar was ≥90%);
//     residual = 8 keys, all 2-ring _v2NodeMerges demand (~0.5 s)
//   worker-thread cost, warm->carried build vs cold build (scratch bench, same windows):
//     18.2 s cold -> 6.0 s warm scans + 5.2 s carried build = 11.1 s on-thread,
//     6.5 s of routing CPU fanned to the pool (~1.6 s wall at 4 workers, overlapped)
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

// ── key surgery ─────────────────────────────────────────────────────────────────────────────
// key = `g{c1}>{c2}:{ax},{az}>{bx},{bz}` [+ `#g{mult}`] [+ `#p{pins}`]
const baseOf = (k) => k.split('#')[0]
const reverseBase = (b) => {
  const ci = b.indexOf(':')
  const [ids, pos] = [b.slice(1, ci), b.slice(ci + 1)]
  const [i1, i2] = ids.split('>'), [p1, p2] = pos.split('>')
  return `g${i2}>${i1}:${p2}>${p1}`
}

// Collapse a stack capture into the plan-layer producer that demanded the route. We skip the
// route plumbing itself and name the first real asker (plus one caller of _v2RunSample, since
// "run sample" says nothing about WHICH pass wanted it).
const PLUMBING = new Set(['_edgeCenterline', '_v2EdgeSpec', '_v2RunSample'])
const producerOf = (stack) => {
  const frames = []
  for (const line of stack.split('\n')) {
    const m = line.match(/RoadSystem\.([_A-Za-z0-9]+)/)
    if (m) frames.push(m[1])
  }
  const asker = frames.filter((f) => !PLUMBING.has(f))
  const viaSample = frames.includes('_v2RunSample')
  return (viaSample ? 'runSample<' : '') + (asker[0] || '?') + (asker[1] ? '<' + asker[1] : '')
}

const predictedAll = new Set(), demandedAll = new Set()
const computedKeys = new Set()               // keys routeEdgeV2 actually ran for during the build
const producerByKey = new Map()              // key -> producer tag (first demand)
const msByKey = new Map()                    // key -> wall-clock ms attributed at top-level demand
let routeMs = 0, totalMs = 0
for (const C of CENTERS) {
  const w = mk()
  w.warmPlanDemand = true   // PERF-31 W2: opt into the plan-layer warm waves (worker-side flag)
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
  const origCl = d._edgeCenterline.bind(d)
  const origSpec = d._v2EdgeSpec.bind(d)
  d._v2EdgeSpec = (...a) => { const s = origSpec(...a); computedKeys.add(s.key); return s }
  let depth = 0
  d._edgeCenterline = (c1, c2, dirs, hardGrade) => {
    const key = d._edgeClsKey(c1, c2) + (hardGrade ? `#g${hardGrade}` : '') + d._v2DirsNS(dirs)
    const cached = d._proto.cls?.get(key)
    const miss = !(cached && (!dirs || cached._v2Dirs))
    if (miss && !producerByKey.has(key)) producerByKey.set(key, producerOf(new Error().stack))
    depth++
    const t0 = performance.now()
    const r = origCl(c1, c2, dirs, hardGrade)
    const dt = performance.now() - t0
    depth--
    if (depth === 0) { routeMs += dt; if (miss) msByKey.set(key, (msByKey.get(key) || 0) + dt) }
    return r
  }
  const t0 = performance.now()
  d.update(new THREE.Vector3(C.x, 0, C.z))
  totalMs += performance.now() - t0
  for (const k of d._proto.cls.keys()) demandedAll.add(k)
}

// ── mismatch classification ─────────────────────────────────────────────────────────────────
const predictedBases = new Set([...predictedAll].map(baseOf))
const classOf = (k) => {
  if (predictedAll.has(k)) return 'warm-hit'
  if (k.includes('#g')) return 'hard-grade'
  const b = baseOf(k)
  if (predictedBases.has(b)) return 'pin-variant'
  if (predictedBases.has(reverseBase(b))) return 'direction-variant'
  return 'unlisted-edge'
}
const byClass = new Map()
for (const k of demandedAll) {
  const cls = classOf(k)
  const g = byClass.get(cls) || byClass.set(cls, []).get(cls)
  g.push(k)
}

console.log(`three ${R} m windows, seed ${SEED}`)
console.log(`build total: ${(totalMs / 1000).toFixed(1)} s · inside _edgeCenterline (routing on the build thread): ${(routeMs / 1000).toFixed(1)} s (${Math.round(100 * routeMs / totalMs)}%)`)
console.log(`demanded route keys: ${demandedAll.size} · predicted by warm scan: ${predictedAll.size} · actually computed in build: ${computedKeys.size}`)
const msOf = (keys) => keys.reduce((s, k) => s + (msByKey.get(k) || 0), 0)
for (const cls of ['warm-hit', 'hard-grade', 'pin-variant', 'direction-variant', 'unlisted-edge']) {
  const keys = byClass.get(cls) || []
  const computed = keys.filter((k) => computedKeys.has(k))
  console.log(`  ${cls}: ${keys.length} keys · ${computed.length} computed · ${(msOf(keys) / 1000).toFixed(2)} s`)
}
console.log('\nproducers (per class, computed keys only):')
for (const cls of ['warm-hit', 'pin-variant', 'direction-variant', 'unlisted-edge']) {
  const keys = (byClass.get(cls) || []).filter((k) => computedKeys.has(k))
  if (!keys.length) continue
  const agg = new Map()
  for (const k of keys) {
    const p = producerByKey.get(k) || 'unobserved'
    const a = agg.get(p) || agg.set(p, { n: 0, ms: 0 }).get(p)
    a.n++; a.ms += msByKey.get(k) || 0
  }
  console.log(`  ${cls}:`)
  for (const [p, a] of [...agg].sort((x, y) => y[1].ms - x[1].ms))
    console.log(`    ${p}: ${a.n} keys · ${(a.ms / 1000).toFixed(2)} s`)
}
console.log('\nsample keys per non-warm class:')
for (const cls of ['pin-variant', 'direction-variant', 'unlisted-edge'])
  for (const k of (byClass.get(cls) || []).slice(0, 3)) console.log(`  [${cls}] ${k}`)
