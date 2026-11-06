// GATE (run-all): node test/road-loop-trim.mjs   [--verbose]
//
// BUG-105 loop trim (owner, 2026-11-06: "detect a loop … and trim it off completely promoting the crossing point to
// the intersection"). A degree-2 site in rough ground sent its two legs out together and back across each other — a
// loop the road paid for just to visit the site. _v2LoopTrim cuts the road at the outermost crossing, which becomes a
// bend node (BEND_K). Over the four random-seed windows where the class ships (the three census-10 sites + the
// owner's 3502246374), built as the game builds them (pond no-go), this asserts:
//
//   class   no two runs sharing a degree-2 node cross each other in plan within LOOP_TRIM_M (400 m) of loop;
//   bend    the site's trim names a bend with exactly two runs, both ending at the bend (< 0.5 m), whose decks
//           agree there (< 1 cm: both pin to the node-height rule at the same point), and the site keeps no run;
//   window  the bend's two runs are bit-identical with the window shifted 500 m (the trim is decided at plan time
//           on the legs' pure routes).
//
// Reported, not asserted: the turn at each bend.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const VERBOSE = process.argv.includes('--verbose')
const LOOP_M = 400
// seed, window centre, the site node the trim must act on
const SITES = [
  ['3502246374', 1628, 137, '2,0,1'],     // the owner's 24
  ['1227226248', 0, 0, '-1,-1,0'],        // the owner's 25 (a figure eight)
  ['844938307', 0, 0, '1,0,0'],
  ['2502655950', 0, 0, '1,-1,1'],
]

const build = (seed, cx, cz) => {
  const ws = parseWorldSeed(seed), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P)
  road.setRadius(1400)
  road.update(new THREE.Vector3(cx, 0, cz))
  return road
}
const segX = (a, b, c, d) => {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx
  if (Math.abs(den) < 1e-9) return null
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null
}
const cum = (P_) => { const c = [0]; for (let i = 1; i < P_.length; i++) c.push(c[i - 1] + Math.hypot(P_[i].x - P_[i - 1].x, P_[i].z - P_[i - 1].z)); return c }
const hashPts = (pts) => { let h = 2166136261; for (const p of pts) for (const v of [p.x, p.y, p.z]) { h ^= Math.round(v * 1000); h = Math.imul(h, 16777619) >>> 0 } return h.toString(16) }
// runs at each node, oriented from it
const incidence = (road) => {
  const inc = new Map()
  for (const [k, e] of road._network) {
    if (!e.cellA || !e.cellB) continue
    for (const [c, rev] of [[e.cellA, false], [e.cellB, true]]) {
      const nk = c.join(','), pts = rev ? [...e.points].reverse() : e.points
      if (!inc.has(nk)) inc.set(nk, [])
      inc.get(nk).push({ k, pts, c: cum(pts) })
    }
  }
  return inc
}

let fails = 0
const fail = (m) => { fails++; console.log(`  FAIL ${m}`) }
for (const [seed, cx, cz, site] of SITES) {
  const road = build(seed, cx, cz), inc = incidence(road)
  console.log(`seed ${seed} (${cx}, ${cz}), site ${site}`)
  // class: degree-2 nodes whose two runs cross
  for (const [nk, legs] of inc) {
    if (legs.length !== 2) continue
    const [A, B] = legs
    for (let a = 0; a + 1 < A.pts.length; a++) {
      if (A.c[a + 1] < 8) continue
      for (let b = 0; b + 1 < B.pts.length; b++) {
        if (B.c[b + 1] < 8) continue
        const r = segX(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]); if (!r) continue
        const loop = A.c[a] + r[0] * (A.c[a + 1] - A.c[a]) + B.c[b] + r[1] * (B.c[b + 1] - B.c[b])
        if (loop <= LOOP_M && !A.k.endsWith('~p') && !B.k.endsWith('~p')) fail(`degree-2 node ${nk}: ${A.k} and ${B.k} cross, a ${loop.toFixed(0)} m loop`)
      }
    }
  }
  // bend
  const t = road._v2LoopTrims?.get(site)
  if (!t) { fail(`site ${site} not trimmed`); continue }
  const bk = t.id.join(','), runs = inc.get(bk) || [], bp = road._nodePos(t.id)
  if (runs.length !== 2) fail(`bend ${bk}: ${runs.length} runs, want 2`)
  if (inc.get(site)?.length) fail(`site ${site} still has ${inc.get(site).length} run(s)`)
  for (const r of runs) { const d = Math.hypot(r.pts[0].x - bp.x, r.pts[0].z - bp.z); if (!(d < 0.5)) fail(`${r.k} ends ${d.toFixed(2)} m from the bend`) }
  if (runs.length === 2) {
    const dy = Math.abs(runs[0].pts[0].y - runs[1].pts[0].y)
    if (!(dy < 0.01)) fail(`decks at the bend differ by ${dy.toFixed(3)} m`)
    const dir = (r) => Math.atan2(r.pts[3].z - r.pts[0].z, r.pts[3].x - r.pts[0].x)
    const turn = 180 - Math.abs(((dir(runs[0]) - dir(runs[1])) * 180 / Math.PI + 540) % 360 - 180)
    console.log(`  bend ${bk} at (${bp.x.toFixed(1)}, ${bp.z.toFixed(1)}): ${runs.map(r => r.k).join(' + ')}, turn ${turn.toFixed(0)}°`)
  }
  // window: shift 500 m (the site stays inside the 1400 m band)
  const s = build(seed, cx + 500, cz), sRuns = incidence(s).get(bk) || []
  for (const r of runs) {
    const o = sRuns.find(q => q.k === r.k)
    if (!o) fail(`${r.k} missing with the window shifted`)
    else if (hashPts(o.pts) !== hashPts(r.pts)) fail(`${r.k} differs with the window shifted`)
    else if (VERBOSE) console.log(`  ${r.k} identical shifted`)
  }
}
console.log(fails ? `FAIL: ${fails}` : 'PASS')
process.exit(fails ? 1 : 0)
