// test/ride-rank-invariance.mjs — FEAT-76 D1: the rank + ride-candidate layer is window-invariant.
//
// Reuse is only permitted STRICTLY up-rank, drawn from a bounded neighbourhood. That turns "who
// went first" into a fixed dependency DAG — but only if both halves read the same from every
// stream window that contains the edge. Order-dependent geometry is BUG-25's failure mode (whole
// edges flipping on re-stream), so this is gated before any router change consumes it.
//
// Checks, for every edge present in >= 3 windows built from different centers:
//   (a) the ride-candidate SET is identical across all of them;
//   (b) the rank order is strict and acyclic — no two edges are mutually candidates, and no edge
//       is its own candidate. (Chord + key is a strict total order, so a cycle would mean the
//       comparison is not being applied as written.)
//
// USAGE: node test/ride-rank-invariance.mjs
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = [6, 20, 11]
// Centers chosen to overlap heavily so a large shared edge set exists, while placing each edge at
// a different offset from the band's own frontier.
const CENTERS = [[0, 0], [420, -260], [-380, 340], [180, 520]]
const RADIUS = 1200

let fails = 0, edgesChecked = 0, windowsPerEdge = 0
for (const seed of SEEDS) {
  const perWindow = []
  for (const [cx, cz] of CENTERS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.setRadius(RADIUS)
    road.update(new THREE.Vector3(cx, 0, cz))
    perWindow.push(road.debugRideCensus())
  }
  // (a) identical candidate sets wherever an edge appears in >= 3 windows
  const seen = new Map()   // ck -> [{ wi, list }]
  perWindow.forEach((m, wi) => { for (const [ck, list] of m) { if (!seen.has(ck)) seen.set(ck, []); seen.get(ck).push({ wi, list }) } })
  let shared = 0, mismatch = 0
  const examples = []
  for (const [ck, obs] of seen) {
    if (obs.length < 3) continue
    shared++; edgesChecked++; windowsPerEdge += obs.length
    const ref = obs[0].list.join(',')
    for (const o of obs.slice(1)) {
      if (o.list.join(',') !== ref) {
        mismatch++
        if (examples.length < 3) examples.push(`      ${ck}\n         w${obs[0].wi}: [${ref}]\n         w${o.wi}: [${o.list.join(',')}]`)
        break
      }
    }
  }
  // (b) strict + acyclic, checked on the widest window
  const m0 = perWindow[0]
  let selfRef = 0, mutual = 0
  for (const [ck, list] of m0) {
    if (list.includes(ck)) selfRef++
    for (const q of list) { const back = m0.get(q); if (back && back.includes(ck)) mutual++ }
  }
  const bad = mismatch + selfRef + mutual
  fails += bad
  const cand = [...m0.values()]
  const withAny = cand.filter((l) => l.length).length
  const tot = cand.reduce((a, l) => a + l.length, 0)
  console.log(`seed ${seed}: ${m0.size} in-band edges · ${withAny} have >=1 ride candidate · ${tot} candidate links (mean ${(tot / (m0.size || 1)).toFixed(1)}/edge)`)
  console.log(`   ${shared} edges seen in >=3 of ${CENTERS.length} windows · candidate-set mismatches ${mismatch} · self-reference ${selfRef} · mutual pairs ${mutual}${bad ? '  <-- FAIL' : '  ok'}`)
  for (const e of examples) console.log(e)
}
console.log(`\n${edgesChecked} edges checked across ${SEEDS.length} seeds (mean ${(windowsPerEdge / (edgesChecked || 1)).toFixed(1)} windows each)`)
if (fails) { console.error(`FAIL: ${fails} violations`); process.exit(1) }
console.log('PASS: ride rank + candidate sets are window-invariant, strict and acyclic')
