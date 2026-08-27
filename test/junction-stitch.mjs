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
// ONE INEQUALITY, applied TWICE:
//
//     surface gap <= 0.15 m + lateral separation / roadFillSlope
//
// Two decks may not diverge faster than the ground between them can slope. The 0.15 m floor is
// road-smoothness's WALL step — the collision-surface bar — so pavements that are coincident must
// agree outright; past that the gap may open at exactly the embankment slope the carve builds
// (roadFillSlope 3:1 -> 0.333 V/H), which is the steepest transition the two roads can actually be
// joined by. Above that line the ground between them is a cliff, whatever it is called.
//
//   RULE 1 — CENTRELINE to centreline. The original bar. Owner's first reproducer under it: 0.88 m
//            of deck gap at 1.0 m of separation, allowed 0.48 — a FAIL, the lip in the screenshot.
//            A fork gore 9 m out with 1.5 m of gap is allowed 3.1 and passes: two roads leaving a
//            junction on their own grades, edges grazing, no wall in a lane.
//
//   RULE 2 — RIBBON EDGE to whatever the other run's surface does at that same piece of ground
//            (BUG-56 B1, 2026-08-27). A pavement is 2*roadHalfWidth wide and it is BANKED: its edge
//            sits halfWidth*sin(camber) off its own crown. So two centrelines can agree to the
//            centimetre while the decks they carry are 30 deg apart — which is exactly what the
//            owner photographed at the seed-6 fork, and exactly what rule 1 printed as CLEAN:
//
//              fork (-1585,1336)  edge gap 1.92 m at 0.0 m separation, camber 15.4 vs -0.2 deg
//
//            Probe BOTH of run A's pavement edges. Where B's ribbon covers that ground the two
//            surfaces are compared AT that XZ (separation 0 — they must agree outright); where it
//            does not, A's edge is compared to B's nearest edge and the allowance is what is left
//            of the separation once both half-widths are spent. Camber is read the way the carve
//            reads it (camberProfile eased to flat through a junction carve), never raw.
//
// Neither rule measures inside a cut-back: within roadJunctionCutback + roadFilletRadius of a run
// end the ribbon is trimmed and a junction pad owns the surface, so those samples go to the PAD
// bucket. The two buckets are counted separately by rule, so a pass that fixes forks by pushing
// the mess into the pad stays visible rather than silent.
//
// Measured out to mergeProxM (18 m, shared earthworks); beyond that the two roads do not share any
// ground and there is nothing to stitch. Two populations, both reported, one gating:
//
//   SPAN (GATING) — everywhere else. Forks, taper bands, merge seams, junction legs past the pad.
//   PAD  (report) — inside the junction pad footprint, where the ribbons are cut back and a REAL
//                   junction surface exists. That surface's quality is the pad-arrival guard's
//                   business (mergePadArrivalMax).
//
// Baseline the day rule 2 landed (2026-08-27, head 63b0e21): 100 span, 8 pad-deck / 498 pad-edge,
// over NINE windows (102 / 8 / 501 after B2's endpoint pin — see node-pin.mjs) — mark B was added with the rule, so it is the ninth. Rule 1 alone found 17
// span / 8 pad over the original eight, and those eight windows' rule-1 numbers are unchanged.
// BUG-56's B3-B6 departure pass is what takes the 100 down. Both of the owner's named forks are in
// it and BOTH were invisible to rule 1: mark A (-1585,1336) camber 15.4 vs -0.2 deg, mark B
// (-2505,4204) camber 0.0 vs -14.6 deg.
//
// Beyond 18 m the two roads do not share earthworks: two roads on a hillside, not a junction.
// Tunnel bores are excluded (a bore genuinely passes under). Nothing else is.
//
// RED until BUG-56's departure pass lands — see .planning/ROAD-CLOSEOUT-PLAN.md.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const TOP = Number((argv.find((a) => a.startsWith('--top=')) || '--top=6').split('=')[1])
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const NEAR  = P.roadV2?.mergeProxM ?? 18            // m — shared-earthworks centre separation
const FILLV = 1 / (P.roadFillSlope ?? 3)            // V/H — the embankment the carve actually builds
const TOL   = 0.15                                  // m — road-smoothness's collision-surface WALL
const STEP  = 2.0                                   // m — sampling pitch along the first run
// The pad footprint: ribbons are cut back roadJunctionCutback from the node and the pad + its
// corner fillets pave the gap. One fillet radius of margin past the mouth.
const PADR  = (P.roadJunctionCutback ?? 10) + (P.roadFilletRadius ?? 5)
const HW    = P.roadHalfWidth ?? 5                  // m — the ribbon reaches +/-HW from centreline

const allowed = (d) => TOL + FILLV * d

// The deck ANGLE the car actually meets: run-frame banking, eased to flat through a junction carve
// exactly as _carveDirtY does (crown/camber ease over roadJunctionCarveRadius). Reading the raw
// camberProfile near a node would invent a bank the built surface does not have.
const camberAt = (road, key, arc) => {
  const c = road.camberProfile(arc, key)
  const jc = road._junctionCarve(key, arc)
  return jc && jc.frac > 0 ? c * (1 - jc.frac) : c
}

const nearestOn = (px, pz, pts, cum) => {
  let d = Infinity, s = 0, y = 0, fx = 0, fz = 0, tx = 1, tz = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const ex = b.x - a.x, ez = b.z - a.z
    const l2 = ex * ex + ez * ez
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
    const qx = a.x + t * ex, qz = a.z + t * ez
    const dd = Math.hypot(px - qx, pz - qz)
    if (dd < d) {
      d = dd; s = cum[i - 1] + t * (cum[i] - cum[i - 1]); y = a.y + t * (b.y - a.y)
      fx = qx; fz = qz
      const l = Math.sqrt(l2) || 1
      tx = ex / l; tz = ez / l
    }
  }
  return { d, s, y, fx, fz, tx, tz }
}
// Signed lateral of (px,pz) in the run frame at a projection foot — the same convention as
// road.js (_carveDirtY / debugSampleAt): signedLat = dx*t.z - dz*t.x, so the +lateral axis is
// (t.z, -t.x). camberProfile is a RUN-FRAME angle under exactly that convention, which is why
// lat*sin(camber) is invariant to which way round a run is traversed.
const latOf = (px, pz, m) => (px - m.fx) * m.tz - (pz - m.fz) * m.tx
const inBore = (e, s) => (e.tunnelSpans || []).some((sp) => s >= sp.s0 - 5 && s <= sp.s1 + 5)

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
  let padPairs = 0, padEdgePairs = 0
  for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) {
    if (i === j) continue
    const A = runs[i], B = runs[j]
    if (A.bb.x0 - B.bb.x1 > NEAR || B.bb.x0 - A.bb.x1 > NEAR ||
        A.bb.z0 - B.bb.z1 > NEAR || B.bb.z0 - A.bb.z1 > NEAR) continue
    const pA = A.e.points, cA = A.e.polyCum, LA = cA[cA.length - 1]
    const LB = B.e.polyCum[B.e.polyCum.length - 1]
    // shared-node ends of A, in world XZ — the pad footprint hangs off these
    const shared = [A.a, A.b].filter((n) => n === B.a || n === B.b)
    const nodePts = []
    if (shared.includes(A.a)) nodePts.push(pA[0])
    if (shared.includes(A.b)) nodePts.push(pA[pA.length - 1])
    let lip = null, sawPad = false, sawPadEdge = false
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
      let dNode = Infinity
      for (const q of nodePts) dNode = Math.min(dNode, Math.hypot(ax - q.x, az - q.z))

      // RULE 1 — CENTRELINES. Two crowns at one height each; the original bar.
      let worst = null
      const dyC = Math.abs(ay - n.y)
      const exC = dyC - allowed(n.d)
      if (exC > 0) worst = { rule: 'deck', excess: exC, dy: dyC, sep: n.d, camA: 0, camB: 0 }

      // RULE 2 — RIBBON EDGES (B1). A centreline pair can agree perfectly and still present a wall,
      // because a banked deck puts its edge HW*sin(camber) off its own crown: mark A swings 34 deg of
      // camber in 45 m, which is +/-2.8 m of edge height that a crown-to-crown ruler cannot see. So
      // probe BOTH of A's pavement edges, and ask what B's surface does at that same piece of ground:
      //   - B's ribbon covers it (|lat| <= HW)  -> compare surfaces AT that XZ, allowance floor 0.15 m
      //   - it does not                          -> compare against B's nearest edge, allowance on the
      //                                             remaining edge-to-edge separation |lat| - HW
      // A ribbon only EXISTS between its cut-backs: within PADR of a run end the ribbon is trimmed
      // and the junction pad owns that ground, so an edge probe there is a pad measurement, not a
      // span one — same policy the centreline rule applies via dNode.
      let edgePad = false
      const dxs = pA[lo + 1].x - pA[lo].x, dzs = pA[lo + 1].z - pA[lo].z
      const ls  = Math.hypot(dxs, dzs) || 1
      const txA = dxs / ls, tzA = dzs / ls
      const camA = camberAt(road, A.k, s)
      const aEnds = s < PADR || s > LA - PADR
      for (let sgn = 1; sgn >= -1; sgn -= 2) {
        const qx = ax + sgn * HW * tzA, qz = az - sgn * HW * txA
        const m = nearestOn(qx, qz, B.e.points, B.e.polyCum)
        if (inBore(B.e, m.s)) continue
        // TRUE distance, not the lateral component: past a run's end nearestOn clamps to the
        // endpoint, and the lateral component there is a fiction that reads as "B paves this".
        const sepE = Math.max(0, m.d - HW)
        if (sepE >= NEAR) continue
        const camB = camberAt(road, B.k, m.s)
        const latB = Math.max(-HW, Math.min(HW, latOf(qx, qz, m)))
        const yAe = ay + sgn * HW * Math.sin(camA)
        const yBe = m.y + latB * Math.sin(camB)
        const dyE = Math.abs(yAe - yBe)
        const exE = dyE - allowed(sepE)
        if (exE <= 0) continue
        if (aEnds || m.s < PADR || m.s > LB - PADR) { edgePad = true; continue }
        if (!worst || exE > worst.excess)
          worst = { rule: 'edge', excess: exE, dy: dyE, sep: sepE, camA, camB }
      }

      if (edgePad) sawPadEdge = true
      if (!worst) continue
      if (dNode <= PADR) { if (worst.rule === 'edge') sawPadEdge = true; else sawPad = true; continue }
      if (!lip || worst.excess > lip.excess) lip = { ...worst, x: ax, z: az, sA: s, dNode }
    }
    if (sawPad) padPairs++
    if (sawPadEdge) padEdgePairs++
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
  return { lips: out, padPairs: padPairs >> 1, padEdgePairs: padEdgePairs >> 1, runs: runs.length }
}

let fails = 0, totalLips = 0, totalPad = 0, totalPadEdge = 0
// BUG-56 B4/B6 split the ONE normal invariant into roll and pitch, so track them apart: this is the
// roll residual on the population B4 owns. It went 15.6 deg -> 0.9 deg at mark A and 14.6 deg -> 0.0
// at mark B when B4 landed, while the site COUNT barely moved — because a pair stays red until both
// halves are right, and the pitch half is B6.
const forkCamber = []
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const { lips, padPairs, padEdgePairs, runs } = scan(buildWindow(W, P))
  totalLips += lips.length; totalPad += padPairs; totalPadEdge += padEdgePairs
  for (const w of lips) if (w.tag === 'fork' && w.rule === 'edge')
    forkCamber.push(Math.abs(w.camA - w.camB) * 180 / Math.PI)
  const byTag = {}
  for (const w of lips) { const t = `${w.tag}/${w.rule}`; byTag[t] = (byTag[t] || 0) + 1 }
  const head = `${W.name.padEnd(20)} runs ${String(runs).padStart(3)} · span ${String(lips.length).padStart(3)} · pad ${String(padPairs).padStart(3)} deck / ${String(padEdgePairs).padStart(3)} edge`
  if (!lips.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head} · ${JSON.stringify(byTag)}`)
  for (const w of lips.slice(0, VERBOSE ? lips.length : TOP)) {
    const bank = w.rule === 'edge'
      ? `  camber ${(w.camA * 180 / Math.PI).toFixed(1)}/${(w.camB * 180 / Math.PI).toFixed(1)} deg`
      : ''
    console.log(`         ${`${w.tag}/${w.rule}`.padEnd(12)} (${w.x.toFixed(0)},${w.z.toFixed(0)})  ${w.rule === 'edge' ? 'edge' : 'deck'} gap ${w.dy.toFixed(2)} m at ${w.sep.toFixed(1)} m separation (allowed ${allowed(w.sep).toFixed(2)}), ${w.dNode.toFixed(0)} m from the node${bank}   ${w.pair}`)
  }
  if (!VERBOSE && lips.length > TOP) console.log(`         … ${lips.length - TOP} more (--verbose)`)
}

const fc = forkCamber.slice().sort((a, b) => b - a)
const med = fc.length ? fc[fc.length >> 1] : 0
console.log(`\njunction-stitch: ${totalLips} unstitched pair-stretches (gating) · pad-vicinity pairs (report): ${totalPad} deck, ${totalPadEdge} edge`)
console.log(`   fork ROLL residual (B4, report): ${fc.length} fork rows · worst ${(fc[0] ?? 0).toFixed(1)} deg · median ${med.toFixed(1)} deg of camber mismatch`)
if (fails) { console.log('FAIL — road decks diverge faster than the ground between them can slope (BUG-56)'); process.exit(1) }
console.log('PASS')
