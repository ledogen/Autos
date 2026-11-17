// RAINY-DAY (BUG-179): census of junction legs that still SHARE PAVEMENT past the deck hold. Not a gate.
//
//   node test/leg-overlap-census.mjs <seed,seed,…> [--r=1000] [--top=8]
//
// For every node within R of the origin, every pair of its incident runs: walk run a out from the node at 1 m
// (to 80 m) and find the nearest point of run b's first 120 m. Where the two centrelines are closer than one road
// width (2·roadHalfWidth: the two decks overlap) the midpoint between them lies on BOTH decks, so the physics ground
// (analyticHeight with the road carve) must be continuous there; the resolver's winner flips somewhere on the segment
// between them (bisected to 1 mm), and a 5 cm move across that flip rising more than STEP_MIN is two disagreeing decks: the tear (BUG-179: 3.3 m at the
// owner's capture). A pair is counted when its worst such step exceeds STEP_MIN; the report gives the count and the
// worst step per seed, then the worst pairs with the node, the arc out from it, the centre-to-centre separation and
// the two centreline grades' gap there.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const args = process.argv.slice(2), opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]
const SEEDS = (args.find(a => !a.startsWith('--')) ?? '').split(',').filter(Boolean)
const R = +opt('r', 1000), TOP = +opt('top', 8), STEP_MIN = 0.10, OUT = 80, WIN = 120
const W2 = 2 * (P.roadHalfWidth ?? 5)

// position at polyline arc c, and the nearest point of polyline e within arc window [lo, hi]
const pos = (e, c) => { const C = e.polyCum, Q = e.points; let i = 1; while (i < C.length - 1 && C[i] < c) i++
  const t = (c - C[i - 1]) / Math.max(1e-9, C[i] - C[i - 1]); return { x: Q[i - 1].x + t * (Q[i].x - Q[i - 1].x), z: Q[i - 1].z + t * (Q[i].z - Q[i - 1].z) } }
const nearest = (e, x, z, lo, hi) => { const C = e.polyCum, Q = e.points; let best = null
  for (let i = 1; i < Q.length; i++) { if (C[i] < lo || C[i - 1] > hi) continue
    const ax = Q[i - 1].x, az = Q[i - 1].z, dx = Q[i].x - ax, dz = Q[i].z - az, l2 = dx * dx + dz * dz || 1e-12
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz)
    if (!best || d < best.d) best = { d, cum: C[i - 1] + t * (C[i] - C[i - 1]) } }
  return best }

export function legOverlaps (road, H, R, cx = 0, cz = 0) {
  const g = road._proto.graph, out = []
  out.pairs = 0; out.flips = 0
  for (const [nk, inc] of road._proto.nodeInc) {
    if (!inc || inc.length < 2) continue
    const legs = inc.map(k => ({ k, e: road._network.get(k) })).filter(l => l.e?.points?.length >= 2 && l.e.polyCum)
    for (const l of legs) { l.L = l.e.polyCum.at(-1); l.atStart = g.key(l.e.cellA) === nk; l.out = (d) => l.atStart ? d : l.L - d }
    if (!legs.length) continue
    const n0 = legs[0].atStart ? legs[0].e.points[0] : legs[0].e.points.at(-1)
    if (Math.hypot(n0.x - cx, n0.z - cz) > R) continue
    for (const a of legs) for (const b of legs) {
      if (a.k >= b.k) continue
      const [lo, hi] = b.atStart ? [0, Math.min(b.L, WIN)] : [Math.max(0, b.L - WIN), b.L]
      let worst = null
      out.pairs++
      for (let d = 1; d <= Math.min(OUT, a.L); d++) {
        const ca = a.out(d), p = pos(a.e, ca), h = nearest(b.e, p.x, p.z, lo, hi)
        if (!h || h.d >= W2) continue
        // the winner flip on the segment p → q (bisected to 1 mm), then the ground across it in a 5 cm move
        const q = pos(b.e, h.cum), win = (t) => road._resolveRoadSurface(p.x + t * (q.x - p.x), p.z + t * (q.z - p.z))?.runKey
        const w0 = win(0)
        if (w0 === win(1)) continue
        out.flips++
        let t0 = 0, t1 = 1
        while ((t1 - t0) * h.d > 1e-3) { const tm = (t0 + t1) / 2; if (win(tm) === w0) t0 = tm; else t1 = tm }
        const tm = (t0 + t1) / 2, dt = 0.025 / Math.max(h.d, 1e-3)
        const mx = p.x + tm * (q.x - p.x), mz = p.z + tm * (q.z - p.z)
        const step = Math.abs(H(p.x + (tm + dt) * (q.x - p.x), p.z + (tm + dt) * (q.z - p.z)) - H(p.x + (tm - dt) * (q.x - p.x), p.z + (tm - dt) * (q.z - p.z)))
        if (!worst || step > worst.step) worst = { step, d, sep: h.d, x: mx, z: mz,
          gap: Math.abs(road.runProfile(ca - (a.e.arcOrigin ?? 0), a.k).gradeY - road.runProfile(h.cum - (b.e.arcOrigin ?? 0), b.k).gradeY) }
      }
      if (worst && worst.step > STEP_MIN) out.push({ node: nk, a: a.k, b: b.k, ...worst })
    }
  }
  out.sort((p, q) => q.step - p.step)
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!SEEDS.length) { console.error('usage: node test/leg-overlap-census.mjs <seed,seed,…> (there is no default seed)'); process.exit(2) }
  const all = []
  for (const S of SEEDS) {
    const t0 = Date.now(), ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
    wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
    const terrain = makeTerrainHeadless(ws, P, road)
    const rows = legOverlaps(road, (x, z) => terrain.analyticHeight(x, z), R)
    for (const r of rows) all.push({ seed: S, ...r })
    console.log(`seed ${S}: ${rows.length} leg pairs tear on shared pavement (5 cm step > ${STEP_MIN} m) · worst ${rows.length ? rows[0].step.toFixed(2) : '0.00'} m · ${rows.pairs} pairs walked, ${rows.flips} shared-pavement flips · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  all.sort((p, q) => q.step - p.step)
  for (const r of all.slice(0, TOP)) console.log(`  step ${r.step.toFixed(2)} m (grades ${r.gap.toFixed(2)} m apart)  seed ${r.seed} node ${r.node} (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) ${r.d} m out, ${r.sep.toFixed(1)} m apart  ${r.a} × ${r.b}`)
  console.log(`CENSUS: ${all.length} pairs over ${SEEDS.length} seeds, worst step ${all.length ? all[0].step.toFixed(2) : '0.00'} m`)
}
