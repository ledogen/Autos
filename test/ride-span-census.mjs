// test/ride-span-census.mjs — FEAT-76 D3 prep: WHERE would the T-junctions land?
//
// A ride span is the stretch of one road that runs along an older one. Its two ends are exactly
// the points D3 promotes to real intersections: the add-on JOINS the trunk at one and LEAVES at
// the other. This reports every span the router chose, so the T positions and their lengths can be
// judged before any graph surgery is built.
//
// CRITICAL (2026-09-06, owner caught this): a ride span is where the DISCOUNT APPLIED, which is not
// the same as where the discount CHANGED something. Most sharing at any rho is ground the router was
// already taking at rho=1 — the pre-existing wyes the merge ladder has always handled — and a span
// there collects a discount for a route it would have chosen anyway. Reporting those as T-junction
// sites sent the owner to (916,773) on seed 6, where the two roads are byte-identical at rho=1 and
// rho=0.35 and already sit 0.0 m apart for 380 m. So this census BUILDS THE BASELINE TOO and reports
// only spans whose rider actually moved. The unchanged ones are counted, never listed.
//
// The two degenerate shapes are called out because both are bugs if they ship:
//   - span covers ~the whole edge  -> the add-on has no independent existence; it would "decline to
//     exist because sharing was cheaper", which the ticket names as a bug outright.
//   - span shorter than MINSPAN     -> not worth an intersection; the edge should just route freely.
//
// Rainy-day script, not a gate. USAGE: node test/ride-span-census.mjs [seeds] [rho] [radius]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = (process.argv[2] || '6,20,11').split(',').map(Number)
const RHO = Number(process.argv[3] || 0.35)
const RADIUS = Number(process.argv[4] || 1400)
const MINSPAN = 60     // m — below this a T is not worth promoting
const WHOLE = 0.9      // fraction of the edge above which the add-on has no life of its own
const MOVED = 5        // m — max displacement from the rho=1 baseline below which nothing changed

const nearD = (px, pz, pts) => {
  let b = Infinity
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az
    const L2 = dx * dx + dz * dz
    let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
    if (d < b) b = d
  }
  return b
}
const buildAt = (seed, rho) => {
  const P = JSON.parse(JSON.stringify(RANGER_PARAMS))
  P.roadV2.rideRho = rho
  const r = new RoadSystem(seed, P)
  r.setRadius(RADIUS)
  r.update(new THREE.Vector3(0, 0, 0))
  return r
}

let tot = 0, whole = 0, tiny = 0, good = 0, unchanged = 0, deleted = 0
const lens = []
for (const seed of SEEDS) {
  const base = buildAt(seed, 1)
  const road = buildAt(seed, RHO)
  deleted += [...base._network.keys()].filter((k) => !road._network.has(k)).length
  const rows = []
  for (const [k, e] of road._network) {
    const rs = e.centerline?._rideSpan
    if (!rs) continue
    const L = e.polyCum[e.polyCum.length - 1]
    const frac = rs.f1 - rs.f0
    const s0 = rs.f0 * L, s1 = rs.f1 * L
    const p = (f) => { const s = f * L; let i = 1; while (i < e.polyCum.length - 1 && e.polyCum[i] < s) i++; return e.points[i] }
    // Did this rider actually move? Compare against its own rho=1 geometry.
    const eb = base._network.get(k)
    let move = Infinity
    if (eb) { move = 0; for (const q of e.points) { const d = nearD(q.x, q.z, eb.points); if (d > move) move = d } }
    rows.push({ k, trunk: rs.key, L, s0, s1, span: s1 - s0, frac, move,
                atStart: rs.f0 < 0.05, atEnd: rs.f1 > 0.95, P1: p(rs.f0), P2: p(rs.f1) })
  }
  rows.sort((a, b) => b.span - a.span)
  console.log(`\n=== seed ${seed} · rho ${RHO} · ${road._network.size} runs · ${rows.length} carry a ride span ===`)
  for (const r of rows) {
    tot++
    if (r.move < MOVED) { unchanged++; continue }   // the discount applied; it changed nothing
    const bad = r.frac >= WHOLE ? ' <-- WHOLE EDGE (would decline to exist)'
              : r.span < MINSPAN ? ' <-- too short for a T' : ''
    if (r.frac >= WHOLE) whole++; else if (r.span < MINSPAN) tiny++; else { good++; lens.push(r.span) }
    const ends = r.atStart && r.atEnd ? 'both ends' : r.atStart ? 'from its own node' : r.atEnd ? 'to its own node' : 'MID-SPAN both ends'
    console.log(`  ${r.k}`)
    console.log(`     rides ${r.trunk} for ${r.span.toFixed(0)} m of its ${r.L.toFixed(0)} m (${(100*r.frac).toFixed(0)}%) · ${ends} · moved ${r.move === Infinity ? 'NEW EDGE' : r.move.toFixed(0) + ' m'}${bad}`)
    if (!bad) console.log(`     T at (${r.P1.x.toFixed(0)}, ${r.P1.z.toFixed(0)}) and (${r.P2.x.toFixed(0)}, ${r.P2.z.toFixed(0)})`)
  }
}
const med = lens.length ? [...lens].sort((a,b)=>a-b)[Math.floor(lens.length/2)] : 0
console.log(`\n=== ${tot} ride spans across ${SEEDS.length} seeds (rho ${RHO} vs the rho=1 baseline) ===`)
console.log(`  UNCHANGED:  ${unchanged} — the discount applied to ground the router already took at rho=1.`)
console.log(`              These are the pre-existing wyes, NOT new T sites. Not listed above.`)
console.log(`  promotable: ${good} (median span ${med.toFixed(0)} m, ${lens.length ? Math.min(...lens).toFixed(0) : 0}-${lens.length ? Math.max(...lens).toFixed(0) : 0} m)`)
console.log(`  rejected:   ${whole} whole-edge (the decline-to-exist bug) · ${tiny} shorter than ${MINSPAN} m`)
console.log(`  ALSO: ${deleted} runs exist at rho=1 and NOT at rho=${RHO} — the crossing-rung loss, still open.`)
console.log(`  => ${good} T-junction pairs would be promoted, i.e. up to ${good * 2} new intersections`)
