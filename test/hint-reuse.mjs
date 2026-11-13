// test/hint-reuse.mjs — PERF-42 gate: a wheel's ONE road resolve (at its hub, world-contacts.js) reused for every tread
// and normal sample within 1 m gives the height a fresh resolve at that sample gives.
//
// The tread solve (src/tire-contact.js) samples ~65 heights per wheel per step. PERF-39 resolves the road once at the hub
// and reuses it wherever road.js _hintHolds says the reuse is exact; elsewhere every sample resolves afresh. PERF-42 made
// the reuse hold on the shoulder and verge of a road with no rival in reach (`solo`) — off the deck it had been refused
// everywhere, which doubled a wheel's cost there (the bench's physics spike seconds). This proves the reuse exact:
//   hubs   every run, every 2.7 m of arc, at laterals −22…22 m (deck, edge, shoulder, bank, toe, beyond)
//   points 6 per hub within 1 m (the tread lies within 0.39 m, a normal's ±0.5 m differences round it)
//   check  |analyticHeight(p, hub hint) − analyticHeight(p, fresh)| ≤ TOL (PERF-39's first reuse broke it by 48 mm: a
//          BUG-154 band frame reused as a straight line), and the hint held (solo) off the deck on
//          at least MIN_SOLO of the off-deck points (non-vacuous: the fix is actually in force)
// Seeds: two drawn at random (2026-11-12) and pinned — CLAUDE.md § Seeds: not "the world", a fixed sample.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = [1768572700, 759313244]
// m — the reuse re-projects on the winner's line or arc while a fresh resolve searches the centreline numerically; they
// agree to < 1 µm almost everywhere, and to 1–2 mm on the 0.15 m deck-edge lip of the tightest (12 m) arcs, where a
// millimetre of lateral is a millimetre of height. The tread solve's own budget is 2 mm (test/tire-contact.mjs).
const TOL = 2.5e-3
const MIN_SOLO = 0.3    // share of off-deck points the solo reuse must cover (measured ~0.6–0.8)
const LATS = [-22, -17, -13, -9.5, -7, -5.6, -5.05, -4.6, -2, 0, 2, 4.6, 5.05, 5.6, 7, 9.5, 13, 17, 22]
let fail = 0
for (const seed of SEEDS) {
  const road = new RoadSystem(seed, P); road.setRadius(900); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(seed, P, road)
  const hw = P.roadHalfWidth ?? 5
  let s = seed >>> 0
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  let n = 0, mm = 0, off = 0, solo = 0, worst = 0, worstAt = null
  for (const [, e] of road._network) {
    const cl = e.centerline; if (!cl) continue
    for (let a = 3, i = 0; a < cl.length - 3; a += 2.7, i++) {
      const p = cl.pointAt(a), q = cl.pointAt(Math.min(cl.length, a + 0.5)), tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1
      const lat = LATS[i % LATS.length]
      const hx = p.x - (tz / l) * lat, hz = p.z + (tx / l) * lat
      road._hintCache = null
      const hint = road.carveHint(hx, hz)
      for (let k = 0; k < 6; k++) {
        const ang = rng() * 2 * Math.PI, rad = Math.sqrt(rng())
        const x = hx + Math.cos(ang) * rad, z = hz + Math.sin(ang) * rad
        const fresh = T.analyticHeight(x, z, undefined, 50), reused = T.analyticHeight(x, z, hint, 50)
        const d = Math.abs(fresh - reused); n++; if (d > 1e-3) mm++
        if (d > worst) { worst = d; worstAt = { x: +x.toFixed(2), z: +z.toFixed(2), lat, run: e.runKey ?? '', solo: !!hint?.solo } }
        if (hint && Math.abs((x - hint.point.x) * hint.tangent.z - (z - hint.point.z) * hint.tangent.x) > hw) {
          off++
          if (hint.solo && road._hintHolds(hint, x, z)) solo++
        }
      }
    }
  }
  const share = off ? solo / off : 0
  const ok = worst <= TOL && share >= MIN_SOLO
  if (!ok) fail++
  console.log(`seed ${seed}: ${n} points, worst |reused − fresh| ${(worst * 1000).toFixed(6)} mm (${mm} over 1 mm)${worst > TOL ? ` at ${JSON.stringify(worstAt)}` : ''} · off the deck ${off}, the hub's resolve held on ${(share * 100).toFixed(0)} % (≥ ${MIN_SOLO * 100} %) — ${ok ? 'PASS' : 'FAIL'}`)
}
console.log(fail ? `FAIL (${fail} seed${fail > 1 ? 's' : ''})` : 'PASS')
process.exit(fail ? 1 : 0)
