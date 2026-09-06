// test/ride-span-census.mjs — FEAT-76 D3 prep: WHERE would the T-junctions land?
//
// A ride span is the stretch of one road that runs along an older one. Its two ends are exactly
// the points D3 promotes to real intersections: the add-on JOINS the trunk at one and LEAVES at
// the other. This reports every span the router chose, so the T positions and their lengths can be
// judged before any graph surgery is built.
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

let tot = 0, whole = 0, tiny = 0, good = 0
const lens = []
for (const seed of SEEDS) {
  const P = JSON.parse(JSON.stringify(RANGER_PARAMS))
  P.roadV2.rideRho = RHO
  const road = new RoadSystem(seed, P)
  road.setRadius(RADIUS)
  road.update(new THREE.Vector3(0, 0, 0))
  const rows = []
  for (const [k, e] of road._network) {
    const rs = e.centerline?._rideSpan
    if (!rs) continue
    const L = e.polyCum[e.polyCum.length - 1]
    const frac = rs.f1 - rs.f0
    const s0 = rs.f0 * L, s1 = rs.f1 * L
    const p = (f) => { const s = f * L; let i = 1; while (i < e.polyCum.length - 1 && e.polyCum[i] < s) i++; return e.points[i] }
    rows.push({ k, trunk: rs.key, L, s0, s1, span: s1 - s0, frac,
                atStart: rs.f0 < 0.05, atEnd: rs.f1 > 0.95, P1: p(rs.f0), P2: p(rs.f1) })
  }
  rows.sort((a, b) => b.span - a.span)
  console.log(`\n=== seed ${seed} · rho ${RHO} · ${road._network.size} runs · ${rows.length} carry a ride span ===`)
  for (const r of rows) {
    tot++
    const bad = r.frac >= WHOLE ? ' <-- WHOLE EDGE (would decline to exist)'
              : r.span < MINSPAN ? ' <-- too short for a T' : ''
    if (r.frac >= WHOLE) whole++; else if (r.span < MINSPAN) tiny++; else { good++; lens.push(r.span) }
    const ends = r.atStart && r.atEnd ? 'both ends' : r.atStart ? 'from its own node' : r.atEnd ? 'to its own node' : 'MID-SPAN both ends'
    console.log(`  ${r.k}`)
    console.log(`     rides ${r.trunk} for ${r.span.toFixed(0)} m of its ${r.L.toFixed(0)} m (${(100*r.frac).toFixed(0)}%) · ${ends}${bad}`)
    if (!bad) console.log(`     T at (${r.P1.x.toFixed(0)}, ${r.P1.z.toFixed(0)}) and (${r.P2.x.toFixed(0)}, ${r.P2.z.toFixed(0)})`)
  }
}
const med = lens.length ? [...lens].sort((a,b)=>a-b)[Math.floor(lens.length/2)] : 0
console.log(`\n=== ${tot} ride spans across ${SEEDS.length} seeds ===`)
console.log(`  promotable: ${good} (median span ${med.toFixed(0)} m, ${lens.length ? Math.min(...lens).toFixed(0) : 0}-${lens.length ? Math.max(...lens).toFixed(0) : 0} m)`)
console.log(`  rejected:   ${whole} whole-edge (the decline-to-exist bug) · ${tiny} shorter than ${MINSPAN} m`)
console.log(`  => ${good} T-junction pairs would be promoted, i.e. up to ${good * 2} new intersections`)
