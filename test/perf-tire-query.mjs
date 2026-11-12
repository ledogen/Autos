// test/perf-tire-query.mjs — PERF-39 rainy-day bench (NOT a gate): the cost of one wheel's ground query on REAL roads for a
// MOVING truck (new 5 cm memo cells every step, as in play), and how far the cheaper variants move the answer.
//   node test/perf-tire-query.mjs [seed]
// Wheel positions walk every run's centreline at 33 cm a step (20 m/s at 60 Hz) at lateral offsets across the deck, the
// deck edge and the shoulder. Variants: per-sample road resolves (as shipped) vs one resolve at the hub; 9+10 vs 9+6.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { tireContact, TIRE_CONTACT } from '../src/tire-contact.js'
const SEED = Number(process.argv[2] || 3583777560)
const road = new RoadSystem(SEED, P); road.setRadius(900); road.update(new THREE.Vector3(0, 0, 0))
const T = makeTerrainHeadless(SEED, P, road)
const R = P.wheelRadius, W = P.wheelWidth, hw = P.roadHalfWidth ?? 5
const pts = []
for (const [, e] of road._network) {
  const cl = e.centerline; if (!cl) continue
  for (let s = 5; s < cl.length - 5 && pts.length < 6000; s += 0.33) {
    const p = cl.pointAt(s), q = cl.pointAt(Math.min(cl.length, s + 0.5)), tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1
    const lat = [-hw - 1.5, -hw - 0.2, -hw + 0.3, 0, hw - 0.3, hw + 0.2, hw + 1.5][pts.length % 7]
    const x = p.x - (tz / l) * lat, z = p.z + (tx / l) * lat
    pts.push({ x, z, A: { x: -tz / l, y: 0, z: tx / l } })
  }
}
let mode = 'per'
let hint
const H = (x, z) => T.analyticHeight(x, z, hint !== undefined ? hint : road.carveHint(x, z))
const N = (x, z) => T.analyticNormal(x, z, hint !== undefined ? hint : road.carveHint(x, z))
for (const p of pts) p.y = T.analyticHeight(p.x, p.z, road.carveHint(p.x, p.z)) + R - 0.02
const o = {}
const q = (p) => { hint = mode === 'hub' ? road.carveHint(p.x, p.z) : undefined; const c = tireContact(H, N, p.x, p.y, p.z, R, W, p.A, o); hint = undefined; return c ? c.depth : 0 }
const bench = (label) => {
  road._hintCache = null; for (let i = 0; i < 200; i++) q(pts[i])   // warm the JIT
  road._hintCache = null   // cold memo, as a moving truck sees it
  const t0 = performance.now(), out = pts.map(q), us = (performance.now() - t0) * 1000 / pts.length
  return { label, us, out }
}
const runs = []
for (const [c, f] of [[9, 10], [9, 6]]) for (const m of ['per', 'hub']) { Object.assign(TIRE_CONTACT, { coarse: c, refine: f }); mode = m; runs.push(bench(`${c}+${f} ${m === 'per' ? 'resolve per sample' : 'resolve at hub   '}`)) }
const base = runs[0].out
console.log(`seed ${SEED}: ${pts.length} wheel positions on ${road._network.size} runs (deck, edge, shoulder)`)
for (const r of runs) {
  const d = r.out.map((v, i) => Math.abs(v - base[i])).sort((a, b) => a - b)
  console.log(`  ${r.label}  ${r.us.toFixed(1).padStart(5)} µs a wheel query (${(r.us * 4 * 60 / 1000).toFixed(1)} ms/s for 4 wheels at 60 Hz) · depth vs shipped: p99 ${(d[Math.floor(d.length * .99)] * 1000).toFixed(2)} mm, max ${(d.at(-1) * 1000).toFixed(2)} mm`)
}
if (process.env.DIAG) {
  const hubRun = runs[1].out, key = (nr) => nr ? `${nr.runKey ?? nr.key ?? '?'}|${(nr.rivals ?? nr.inter ?? []).length}` : 'null'
  const bad = pts.map((p, i) => ({ p, i, d: Math.abs(hubRun[i] - base[i]) })).filter(b => b.d > 0.005)
  console.log(`${bad.length} positions differ > 5 mm`)
  for (const b of bad.slice(0, 12)) {
    const nr = road.carveHint(b.p.x, b.p.z), f = road.carveHint(b.p.x + 0.3 * -b.p.A.z, b.p.z + 0.3 * b.p.A.x), bk = road.carveHint(b.p.x - 0.3 * -b.p.A.z, b.p.z - 0.3 * b.p.A.x)
    console.log(`  ${(b.d * 1000).toFixed(1)} mm  hub ${nr ? Object.keys(nr).join(',') : 'null'}  ${nr?.runKey ?? ''} | fwd ${f?.runKey ?? 'null'} back ${bk?.runKey ?? 'null'}  pad ${!!road.junctionPadBlocked?.(b.p.x, b.p.z, 0)}`)
  }
}
