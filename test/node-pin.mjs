// GATE (run-all): node test/node-pin.mjs   [--verbose] [--window=<substr>]
//
// BUG-56 B2 — LEGS STAY WELDED TO THEIR NODE.
//
// A graph node is where two or more routed edges share an anchor. Every run incident to that node
// must START (or END) at it. Nothing in the pipeline re-checks that after the fact, and one thing
// in the pipeline can break it: _v2ShoveFor deflects a run laterally to clear an unsanctioned
// crossing, and its displacement field is windowed in ARC around the contact region — so when the
// contact reaches a run END, the endpoint takes the full deficit and simply walks off the junction.
//
// Measured 2026-08-27 at seed 6 (-870, 2468), node -2,3,1: run g:-3,3,2:-2,3,1 ends 17.3 m sideways
// and 1.60 m up from the point its two siblings share. That is the owner's "road that just ends" —
// it stops in a field, and every existing check passed it, because 17.3 m is inside the shove's
// 30 m deflection cap and no rule said an endpoint may not move.
//
// It costs the node its intersection as well as its road. Junction clusters are formed by endpoint
// PROXIMITY, within EPS = max(2, roadHalfWidth * 0.75) ~= 3.75 m (road.js _detectNodeJunctions), so
// an endpoint further out than that is not in the cluster: the node silently drops from 3 legs to 2,
// _buildJunctionRing returns null, and no junction surface is built at all.
//
// THE RULE — the cluster radius itself, because that is the radius with teeth:
//
//     every endpoint sharing a graph node lies within EPS of every other one
//
// Reported alongside (not gating): the vertical spread, and the worst spread seen even when it is
// under EPS, so a pass that walks endpoints 3 m without tripping the gate is still visible.
//
// Baseline pre-B2 (head 63b0e21): 260 nodes across the battery, 1 violation — mark C, the owner's.
// This gate goes GREEN with the B2 end-taper and must stay green.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const EPS = Math.max(2, (P.roadHalfWidth ?? 5) * 0.75)

const scan = (road) => {
  // nodeId -> the endpoints every incident run contributes. cellA is points[0], cellB the last —
  // a run is routed from its A anchor to its B anchor and registered in that order.
  const nodes = new Map()
  for (const [k, e] of road._network) {
    if (!e.cellA || !e.cellB || !(e.points?.length > 1)) continue
    const put = (id, p) => {
      const key = id.join(',')
      if (!nodes.has(key)) nodes.set(key, [])
      nodes.get(key).push({ k, x: p.x, z: p.z, y: p.y })
    }
    put(e.cellA, e.points[0])
    put(e.cellB, e.points[e.points.length - 1])
  }
  const rows = []
  for (const [id, legs] of nodes) {
    if (legs.length < 2) continue
    let spread = 0, dy = 0, worstPair = null
    for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
      const d = Math.hypot(legs[i].x - legs[j].x, legs[i].z - legs[j].z)
      if (d > spread) { spread = d; dy = Math.abs(legs[i].y - legs[j].y); worstPair = [legs[i], legs[j]] }
    }
    rows.push({ id, legs: legs.length, spread, dy, at: worstPair ? worstPair[0] : legs[0],
                pair: worstPair ? `${worstPair[0].k} × ${worstPair[1].k}` : '' })
  }
  return rows.sort((a, b) => b.spread - a.spread)
}

let fails = 0, totalNodes = 0, totalBad = 0, worstAll = 0
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const rows = scan(buildWindow(W, P))
  const bad = rows.filter((r) => r.spread > EPS)
  totalNodes += rows.length; totalBad += bad.length
  if (rows.length) worstAll = Math.max(worstAll, rows[0].spread)
  const head = `${W.name.padEnd(20)} nodes ${String(rows.length).padStart(3)} · worst spread ${(rows[0]?.spread ?? 0).toFixed(2)} m`
  if (!bad.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head} · ${bad.length} unpinned`)
  for (const r of bad.slice(0, VERBOSE ? bad.length : 6))
    console.log(`         node ${r.id.padEnd(9)} ${r.legs} legs  (${r.at.x.toFixed(0)},${r.at.z.toFixed(0)})  ` +
                `spread ${r.spread.toFixed(1)} m, ${r.dy.toFixed(2)} m vertical   ${r.pair}`)
}

console.log(`\nnode-pin: ${totalNodes} shared nodes · ${totalBad} unpinned (spread > ${EPS.toFixed(2)} m) · worst ${worstAll.toFixed(2)} m`)
if (fails) { console.log('FAIL — a run ends away from the node it shares; that node loses the leg AND its pad (BUG-56 B2)'); process.exit(1) }
console.log('PASS')
