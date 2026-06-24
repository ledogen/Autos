// test/camber-continuity.mjs — BUG-19 regression gate (rebuilds the diagnostic deleted in the overhaul).
//
// Tests the cross-run camber-seeding contract (BUG-10's fix, regressed as BUG-19): where one road run
// continues into the next (they share an endpoint node AND their tangents are aligned — the same road
// carrying on, not an angled crossing), the banking must be CONTINUOUS across the node. The BUG-10/19
// failure is a run boundary that resets banking toward 0 because _runStartCamber couldn't seed from the
// predecessor (COVER-dropped neighbour, branch node, missing adjacency) → a step the truck feels.
//
// camberProfile(arcS, runKey) is the run-frame (= travel-frame) banking and is slew-limited WITHIN a
// run by construction, so the only place it can step is at a run boundary — which is what this checks.
// Angled crossings (tangents not aligned) are excluded: continuity there is the FEAT-07 junction model,
// not the seeding contract. The slice-frame camberSign is deliberately NOT applied (it is a mesh frame
// detail the carve compensates; it does not move the world surface).
//
// Realistic camber params: road-headless TEST_PARAMS omits camberStrength/roadCamberRate (would default
// to a degenerate 200 → saturated ±6°), so we build with the shipped values.
//
// Run: node test/camber-continuity.mjs   (exit 0 = continuous across continuing runs; exit 1 = a reset)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { COARSE_HEIGHT, TEST_PARAMS } from './lib/road-headless.mjs'

const RAD = Math.PI / 180
const PARAMS = { ...TEST_PARAMS, camberStrength: 4, roadCamberRate: 1.5 }
const SEED = 6
const NODE_EPS = 2.0          // m — shared-node coincidence (matches _predecessorRunKey XZ_EPS)
const ALIGN_DOT = 0.7         // tangterminus dot ≥ this ⇒ "continuing road" (not an angled crossing)
const STEP_TOL_DEG = 1.0      // ° — a continuing boundary should carry camber across ~exactly (seeded)

const road = new RoadSystem(SEED, PARAMS, COARSE_HEIGHT)
road.update(new THREE.Vector3(0, 0, 0))

// Per run: endpoint positions, OUTWARD-consistent travel tangents, and the camber at each endpoint.
const ends = []   // { x, z, tx, tz, camber, runKey, which }
for (const [runKey, entry] of road._network) {
  const pts = entry.points
  if (!pts || pts.length < 2) continue
  // run-arc (cumulative XZ from 0 — arcOrigin is 0 in the per-connection scheme)
  let arc = 0
  const arcAt = [0]
  for (let i = 1; i < pts.length; i++) { arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); arcAt.push(arc) }
  const startCamber = road.camberProfile(arcAt[0], runKey)
  const endCamber   = road.camberProfile(arcAt[pts.length - 1], runKey)
  // travel tangent at each end (along increasing arc)
  let sx = pts[1].x - pts[0].x, sz = pts[1].z - pts[0].z; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl
  const n = pts.length
  let ex = pts[n - 1].x - pts[n - 2].x, ez = pts[n - 1].z - pts[n - 2].z; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el
  ends.push({ x: pts[0].x, z: pts[0].z, tx: sx, tz: sz, camber: startCamber, runKey, which: 'start' })
  ends.push({ x: pts[n - 1].x, z: pts[n - 1].z, tx: ex, tz: ez, camber: endCamber, runKey, which: 'end' })
}

// Bucket endpoints by node cell, then within a node compare every continuing (aligned-tangent) pair.
const cell = (x, z) => `${Math.round(x / NODE_EPS)},${Math.round(z / NODE_EPS)}`
const nodes = new Map()
for (const e of ends) { const k = cell(e.x, e.z); if (!nodes.has(k)) nodes.set(k, []); nodes.get(k).push(e) }

let worst = { dDeg: 0 }, continuingPairs = 0
for (const [, group] of nodes) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j]
      if (a.runKey === b.runKey) continue
      // "continuing": one run arrives and the other leaves along the same direction of travel. An END
      // (tangent points INTO the node) continues into a START (tangent points OUT of the node) when
      // their tangents are aligned: dot(endTan, startTan) ≥ ALIGN_DOT.
      const dot = a.tx * b.tx + a.tz * b.tz
      if (Math.abs(dot) < ALIGN_DOT) continue   // angled crossing → junction (FEAT-07), not this contract
      continuingPairs++
      const dDeg = Math.abs(a.camber - b.camber) / RAD
      if (dDeg > worst.dDeg) worst = { dDeg, a, b }
    }
  }
}

const pass = worst.dDeg <= STEP_TOL_DEG
console.log(`[camber-continuity] ${ends.length / 2} runs, ${nodes.size} shared nodes, ${continuingPairs} continuing-run boundaries checked`)
console.log(`  worst camber step across a continuing boundary = ${worst.dDeg.toFixed(2)}° (limit ${STEP_TOL_DEG.toFixed(1)}°)`)
if (worst.dDeg > 0) {
  console.log(`  worst: ${worst.a.runKey}(${worst.a.which} ${(worst.a.camber / RAD).toFixed(2)}°) ↔ ${worst.b.runKey}(${worst.b.which} ${(worst.b.camber / RAD).toFixed(2)}°) at (${worst.a.x.toFixed(0)}, ${worst.a.z.toFixed(0)})`)
}
if (pass) {
  console.log('[PASS] ✓ CAMBER-CONTINUITY — banking carries continuously across every continuing run boundary')
  console.log('\nCAMBER-CONTINUITY GATE: 1 pass, 0 FAIL — exit 0')
  process.exit(0)
}
console.error('[FAIL] ✗ CAMBER-CONTINUITY — banking steps at a continuing run boundary (cross-run seeding gap)')
console.error('\nCAMBER-CONTINUITY GATE: 0 pass, 1 FAIL — exit 1')
process.exit(1)
