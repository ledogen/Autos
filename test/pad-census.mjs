// GATE (run-all): node test/pad-census.mjs   [--verbose] [--window=<substr>]
//
// BUG-56 B0 — EVERY REAL JUNCTION GETS A JUNCTION SURFACE.
//
// A node where three or more runs meet is an intersection, and an intersection needs a pad. The
// pad boundary comes from _buildJunctionRing, a ladder: exact weld -> legacy circle pad -> (B0)
// convex-hull floor. (A half-fillet weld rung sat in the middle until 2026-08-27; it fired 0 times
// in 176 junctions and was deleted — shrinking a corner fillet cannot un-overlap two mouth chords.)
// Before the floor existed the ladder
// could end in `null`, and `ring = null` makes EVERY consumer skip the node — the pad carve,
// padReachNodes, and the mesh's pad branch — while the legs stay cut back. What shipped was a
// naked gap where the intersection should be: the owner's report of "no junction pad generates,
// for example seed 6 (-3862, 884)".
//
// Censused 2026-08-27, pre-floor: 243 clusters, 67 degree-2 (a connector arc instead, by design —
// QUAL-16), and 27 of the remaining 176 real junctions with NO RING AT ALL. 15 %.
//
// All 27 failed identically. The exact weld self-intersects at BOTH fillet scales because two legs
// leave the node on the same bearing — 20 of the 27 within half a degree — so their mouth chords
// overlap and the boundary crosses itself. The legacy circle pad folds legs closer than ~20 deg
// into one direction, which leaves two distinct mouths, and a two-mouth circle pad emits only two
// distinct corner points. Both rungs out, nothing underneath.
//
// THE RULE:
//
//     a cluster with >= 3 legs always gets a ring of >= 3 points
//
// Reported alongside (not gating): which rung each junction landed on. The hull floor is a crude
// convex plaza — no fillets, no throat sweep, no back-arc bulb — so a junction that lands on it is
// a SYMPTOM of the shallow departure B4/B5/B6 are about, not a resolved one. Watch that number
// fall as the departure pass lands; watch it rise and something started leaning on the floor.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

// Re-walk the ladder the way _buildJunctionRing does, so the census can name the rung without any
// diagnostic plumbing living in src/.
const rungOf = (road, node) => {
  let ring = road._junctionRingWeld(node)
  if (ring && road._ringSelfIntersects(ring)) ring = null
  if (ring && ring.length >= 3) return 'weld'
  ring = road._junctionRingLegacy(node)
  if (ring && ring.length >= 3) return 'circle'
  ring = road._junctionRingHull(node)
  if (ring && ring.length >= 3) return 'hull'
  return 'NONE'
}

let fails = 0
const tot = { clusters: 0, deg2: 0, weld: 0, circle: 0, hull: 0, NONE: 0 }

for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const nodes = road._detectNodeJunctions()
  const by = { weld: 0, circle: 0, hull: 0, NONE: 0 }
  let clusters = 0, deg2 = 0
  const bad = []
  for (const [nk, node] of nodes) {
    clusters++
    if (node.deg2 || node.legs.length < 3) { deg2++; continue }
    const r = rungOf(road, node)
    by[r]++
    // node.ring is what actually shipped — the census must agree with it, not just with the ladder.
    if (r === 'NONE' || !node.ring || node.ring.length < 3)
      bad.push({ nk, legs: node.legs.length, x: node.pos.x, z: node.pos.z })
  }
  tot.clusters += clusters; tot.deg2 += deg2
  for (const k of Object.keys(by)) tot[k] += by[k]
  const head = `${W.name.padEnd(20)} clusters ${String(clusters).padStart(3)} · deg2 ${String(deg2).padStart(3)} · ` +
               `weld ${String(by.weld).padStart(3)} · circle ${String(by.circle).padStart(2)} · ` +
               `hull ${String(by.hull).padStart(2)}`
  if (!bad.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head} · ${bad.length} with NO RING`)
  for (const b of bad.slice(0, VERBOSE ? bad.length : 8))
    console.log(`         node ${b.nk.padEnd(9)} ${b.legs} legs  (${b.x.toFixed(0)},${b.z.toFixed(0)})`)
}

const real = tot.clusters - tot.deg2
console.log(`\npad-census: ${tot.clusters} clusters · ${tot.deg2} degree-2 (connector arc, by design) · ` +
            `${real} real junctions`)
console.log(`            rungs — weld ${tot.weld} · circle ${tot.circle} · ` +
            `hull ${tot.hull} (${real ? (100 * tot.hull / real).toFixed(0) : 0}% on the floor) · NONE ${tot.NONE}`)
if (fails) { console.log('FAIL — a ≥3-leg junction has no pad; the legs are cut back and nothing paves the gap (BUG-56 B0)'); process.exit(1) }
console.log('PASS')
