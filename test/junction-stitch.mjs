// GATE (run-all): node test/junction-stitch.mjs   [--verbose] [--top=N] [--window=<substr>]
//
// BUG-56 — the HONEST STITCHING GATE. Owner ruling 2026-08-25: junction stitching "should be red
// until every intersection stitches nicely", and the bar is a DRIVER's bar, not a planner's:
//
//     a car driving the through-road must not be launched by a lip, or stopped by a wall,
//     thrown up by another road joining it.
//
// So this measures ONE quantity everywhere two registered runs come near each other: the DECK GAP
// between the two pavements against their LATERAL SEPARATION. Two decks 1 m apart sideways and
// 0.9 m apart vertically are the same piece of ground at two heights, whatever the planner calls
// that stretch — that is the lip in the owner's 2026-08-26 screenshot.
//
// CRITICALLY: sanctioned geometry is NOT discounted. Ceded strands, taper bands and off-curve
// spans are exactly what let the owner's fork print CLEAN through capture-classify and the census
// gates while looking torn. A ceded strand rides the winner's deck exactly and passes here on its
// own merit (sep ~0, dy ~0); a fork that front-loads its climb does not, and that is the point.
//
// THREE TIERS, one of them gating:
//
//   LIP  (GATING) — lateral separation ≤ 2·roadHalfWidth: the two PAVEMENTS OVERLAP. The drivable
//                   surface must be single-valued, so the decks must agree to the collision-surface
//                   tolerance (0.15 m — road-smoothness's WALL step). Excludes the junction PAD
//                   footprint, where the ribbons are cut back and a real junction surface exists
//                   (that surface's own quality is the pad-arrival guard's business,
//                   mergePadArrivalMax) — everything else is measured, forks first.
//
//   BANK (report) — separation ≤ mergeProxM (18 m, shared earthworks): the strip between the two
//                   shoulders can carry a fill embankment, so the gap may grow at the slope the
//                   carve actually builds (roadFillSlope 3:1 → 0.333 V/H) before it reads as a
//                   cliff between two roads. Reported, not gating: the class is real but it is the
//                   merge/crossing rung's business (BUG-57), not the departure shape's.
//
//   PAD  (report) — the same BANK measure inside the pad footprint, counted so a pass that fixes
//                   forks by pushing the mess into the pad is visible rather than silent.
//
// Beyond 18 m the two roads do not share earthworks: two roads on a hillside, not a junction.
// Tunnel bores are excluded (a bore genuinely passes under). Nothing else is.
//
// RED until BUG-56's departure pass lands — see .planning/ROAD-CLOSEOUT-PLAN.md.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const TOP = Number((argv.find((a) => a.startsWith('--top=')) || '--top=6').split('=')[1])
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const NEAR  = P.roadV2?.mergeProxM ?? 18            // m — shared-earthworks centre separation
const HW    = P.roadHalfWidth ?? 5                  // m — pavement half-width
const PAVE  = 2 * HW                                // m — separation at which the pavements part
const FILLV = 1 / (P.roadFillSlope ?? 3)            // V/H — the embankment the carve actually builds
const TOL   = 0.15                                  // m — road-smoothness's collision-surface WALL
const STEP  = 2.0                                   // m — sampling pitch along the first run
// The pad footprint: ribbons are cut back roadJunctionCutback from the node and the pad + its
// corner fillets pave the gap. One fillet radius of margin past the mouth.
const PADR  = (P.roadJunctionCutback ?? 10) + (P.roadFilletRadius ?? 5)

const bankAllowed = (d) => TOL + FILLV * Math.max(0, d - PAVE)

const nearestOn = (px, pz, pts, cum) => {
  let d = Infinity, s = 0, y = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const ex = b.x - a.x, ez = b.z - a.z
    const l2 = ex * ex + ez * ez
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
    const dd = Math.hypot(px - (a.x + t * ex), pz - (a.z + t * ez))
    if (dd < d) { d = dd; s = cum[i - 1] + t * (cum[i] - cum[i - 1]); y = a.y + t * (b.y - a.y) }
  }
  return { d, s, y }
}
const inBore = (e, s) => (e.tunnelSpans || []).some((sp) => s >= sp.s0 - 5 && s <= sp.s1 + 5)

// The windows: the BUG-56 reproducers first, then the crossing-rung battery.
const WINDOWS = [
  { name: 'seed6 fork -3,1,1', seed: '6', cx: -1582, cz: 1333, r: 1400 },  // owner capture 2026-08-26
  { name: 'lone-pine spawn',   seed: 'lone-pine', spawn: true },           // road-smoothness canary
  { name: 'seed6 origin',      seed: '6',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed6 gate window', seed: '6',  cx: 4500, cz: 600, r: 1600 },
  { name: 'seed3 origin',      seed: '3',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed7 origin',      seed: '7',  cx: 0, cz: 0, r: 1400 },
  { name: 'seed20 origin',     seed: '20', cx: 0, cz: 0, r: 1400 },
  { name: 'seed11 origin',     seed: '11', cx: 0, cz: 0, r: 1400 },
]

const buildWindow = (W) => {
  const ws = parseWorldSeed(W.seed)
  const road = new RoadSystem(ws, P)
  if (W.spawn) {   // the road-smoothness canary's own window, built its way
    const ss = seedFor(ws, 'spawn')
    const bx = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
    const bz = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
    road.ensureTile(Math.floor(bx / 64), Math.floor(bz / 64))
    let n = road.queryNearest(bx, bz, 200)
    if (n) {
      road.ensureTile(Math.floor(n.point.x / 64), Math.floor(n.point.z / 64))
      n = road.queryNearest(n.point.x, n.point.z, 100) || n
      road.update(new THREE.Vector3(n.point.x, 0, n.point.z))
    } else road.update(new THREE.Vector3(bx, 0, bz))
  } else {
    road.setRadius(W.r)
    road.update(new THREE.Vector3(W.cx, 0, W.cz))
  }
  return road
}

const bboxOf = (pts) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z }
  return { x0, x1, z0, z1 }
}

const scan = (road) => {
  const runs = [...road._network.entries()]
    .map(([k, e]) => ({ k, e, a: e.cellA?.join(','), b: e.cellB?.join(',') }))
    .filter((r) => r.a && r.b && r.e.points?.length > 1)
  for (const r of runs) r.bb = bboxOf(r.e.points)
  const lips = []
  let bankPairs = 0, padPairs = 0
  for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) {
    if (i === j) continue
    const A = runs[i], B = runs[j]
    if (A.bb.x0 - B.bb.x1 > NEAR || B.bb.x0 - A.bb.x1 > NEAR ||
        A.bb.z0 - B.bb.z1 > NEAR || B.bb.z0 - A.bb.z1 > NEAR) continue
    const pA = A.e.points, cA = A.e.polyCum, LA = cA[cA.length - 1]
    // shared-node ends of A, in world XZ — the pad footprint hangs off these
    const shared = [A.a, A.b].filter((n) => n === B.a || n === B.b)
    const nodePts = []
    if (shared.includes(A.a)) nodePts.push(pA[0])
    if (shared.includes(A.b)) nodePts.push(pA[pA.length - 1])
    let lip = null, sawBank = false, sawPad = false
    let lo = 0
    for (let s = 0; s <= LA; s += STEP) {
      while (lo + 2 < cA.length && cA[lo + 1] <= s) lo++
      const u = (s - cA[lo]) / Math.max(1e-9, cA[lo + 1] - cA[lo])
      const ax = pA[lo].x + (pA[lo + 1].x - pA[lo].x) * u
      const az = pA[lo].z + (pA[lo + 1].z - pA[lo].z) * u
      const ay = pA[lo].y + (pA[lo + 1].y - pA[lo].y) * u
      const n = nearestOn(ax, az, B.e.points, B.e.polyCum)
      if (n.d >= NEAR) continue
      if (inBore(A.e, s) || inBore(B.e, n.s)) continue
      const dy = Math.abs(ay - n.y)
      let dNode = Infinity
      for (const q of nodePts) dNode = Math.min(dNode, Math.hypot(ax - q.x, az - q.z))
      const inPad = dNode <= PADR
      if (dy > bankAllowed(n.d)) { if (inPad) sawPad = true; else sawBank = true }
      if (inPad || n.d > PAVE || dy <= TOL) continue
      const ex = dy - TOL
      if (!lip || ex > lip.excess) lip = { excess: ex, dy, sep: n.d, x: ax, z: az, sA: s, dNode }
    }
    if (sawBank) bankPairs++
    if (sawPad) padPairs++
    if (!lip) continue
    lip.pair = A.k < B.k ? `${A.k} × ${B.k}` : `${B.k} × ${A.k}`
    // What the planner CALLS this site, so a red is legible against capture-classify: does EITHER
    // run carry merge geometry naming the other? That is the fork class; anything else is two
    // legs of a junction diverging on their own.
    const names = (e, o) => (e.cededSpans || []).some((sp) => sp.owner === o) || (e.offCurveSpans || []).some((sp) => sp.owner === o)
    lip.tag = (names(A.e, B.k) || names(B.e, A.k)) ? 'fork' : shared.length ? 'leg' : 'midspan'
    lips.push(lip)
  }
  // one row per unordered pair — both directions measure the same site
  const byPair = new Map()
  for (const l of lips) { const h = byPair.get(l.pair); if (!h || l.excess > h.excess) byPair.set(l.pair, l) }
  const out = [...byPair.values()].sort((a, b) => b.excess - a.excess)
  return { lips: out, bankPairs: bankPairs >> 1, padPairs: padPairs >> 1, runs: runs.length }
}

let fails = 0, totalLips = 0, totalBank = 0, totalPad = 0
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const { lips, bankPairs, padPairs, runs } = scan(buildWindow(W))
  totalLips += lips.length; totalBank += bankPairs; totalPad += padPairs
  const byTag = {}
  for (const w of lips) byTag[w.tag] = (byTag[w.tag] || 0) + 1
  const head = `${W.name.padEnd(20)} runs ${String(runs).padStart(3)} · LIP ${String(lips.length).padStart(3)} · bank ${String(bankPairs).padStart(3)} · pad ${String(padPairs).padStart(3)}`
  if (!lips.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head} · ${JSON.stringify(byTag)}`)
  for (const w of lips.slice(0, VERBOSE ? lips.length : TOP))
    console.log(`         ${w.tag.padEnd(7)} (${w.x.toFixed(0)},${w.z.toFixed(0)})  deck gap ${w.dy.toFixed(2)} m at ${w.sep.toFixed(1)} m separation, ${w.dNode.toFixed(0)} m from the node   ${w.pair}`)
  if (!VERBOSE && lips.length > TOP) console.log(`         … ${lips.length - TOP} more (--verbose)`)
}

console.log(`\njunction-stitch: ${totalLips} overlapping-pavement LIPS (gating) · ${totalBank} shared-earthwork bank pairs · ${totalPad} pad-vicinity pairs`)
if (fails) { console.log('FAIL — pavements overlap at incompatible heights (BUG-56)'); process.exit(1) }
console.log('PASS')
