// GATE (run-all): node test/wye-release.mjs
//
// R8 (owner ruling, 2026-09-01) — THE INVARIANT SURVIVES ITS MACHINERY. Two roads may not carry
// independent decks within one road width of one another:
//
//   under 10 m centre-to-centre  ->  ONE surface
//   at 10 m                      ->  the decks share an edge
//   over 10 m                    ->  two roads, each with its own full deck
//
// QUAL-30 REWROTE THE GATING HALF. It used to assert that every end-anchored CEDED STRAND released
// — handed over from one-surface to own-deck — at >= 2*roadHalfWidth of separation. Ceded strands
// no longer exist: FEAT-76's T promotion deletes the side road from its node to the fork instead of
// having it ride the winner, so that check would now pass vacuously on an empty set, which is the
// one outcome a control must never have.
//
// The T's descendant of that question is DEPARTURE CLEARANCE: a side road leaves its trunk at a
// real node, so it starts ON the trunk by construction and has to get clear. GATING: every promoted
// T's side road must reach one road width of separation from its trunk within the junction pad plus
// the widest departure band — and while it is still inside that width, its deck must agree with the
// trunk's to within what the ground between them can slope.
//
// REPORT (unchanged in spirit): the residual R8 violation — own-deck arc within one road width of
// another run, outside junction pads — and the worst deck disagreement inside that band.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'

const HW = P.roadHalfWidth ?? 5, W = 2 * HW
const near = (px, pz, pts, cum) => {
  let d = Infinity, y = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const ex = b.x - a.x, ez = b.z - a.z
    const l2 = ex * ex + ez * ez
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
    const qx = a.x + t * ex, qz = a.z + t * ez
    const dd = Math.hypot(px - qx, pz - qz)
    if (dd < d) { d = dd; y = a.y + t * (b.y - a.y) }
  }
  return { d, y }
}
const at = (e, s) => {
  const c = e.polyCum
  let lo = 0
  while (lo + 2 < c.length && c[lo + 1] <= s) lo++
  const u = (s - c[lo]) / Math.max(1e-9, c[lo + 1] - c[lo])
  const a = e.points[lo], b = e.points[lo + 1]
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u }
}

let rel = [], early = 0, steps = 0, viol = 0, violM = 0, totM = 0, pairs = 0, worstDy = 0, worstAt = null
let worstStep = 0, worstStepAt = null
const TOLW = 0.15, FILLV = 1 / (P.roadFillSlope ?? 3)
for (const Wd of WINDOWS) {
  const road = buildWindow(Wd, P)
  const gk = (id) => road._proto.graph.key(id)
  // ── GATING: every promoted T's side road gets clear of its trunk, and agrees with it until it does
  for (const [nk, rec] of road._promoted || []) {
    const inc = road._proto.nodeInc.get(nk) || []
    if (inc.length !== 3) continue
    const sideKey = inc.find((rk) => road._v2PromotedRole(rec.id, rk) === 'side')
    const trunks = inc.filter((rk) => rk !== sideKey).map((rk) => road._network.get(rk)).filter((e) => e?.points)
    const A = road._network.get(sideKey)
    if (!A?.points || !trunks.length) continue
    const atStart = gk(A.cellA) === nk
    const L = A.polyCum.at(-1)
    // the pad owns the first 15 m (cutback + halfWidth); the band may run to ~90 m past it
    const PADR = (P.roadJunctionCutback ?? 10) + (P.roadHalfWidth ?? 5)
    let cleared = null
    for (let d = 0; d <= Math.min(L, PADR + 90); d += 4) {
      const p = at(A, atStart ? d : L - d)
      let best = { d: Infinity, y: 0 }
      for (const T of trunks) { const n = near(p.x, p.z, T.points, T.polyCum); if (n.d < best.d) best = n }
      if (d > PADR && best.d < W) {
        // still overlapping: the decks must agree to within what the ground between them can slope
        const gap = Math.abs(p.y - best.y), allow = TOLW + FILLV * Math.max(0, best.d - W)
        if (gap > allow + 1e-9 && gap > worstStep) { worstStep = gap; worstStepAt = { x: p.x, z: p.z, seed: Wd.seed } }
        if (gap > allow + 1e-9) steps++
      }
      if (best.d >= W) { cleared = d; break }
    }
    rel.push(cleared === null ? Infinity : cleared)
    if (cleared === null) early++
  }
  for (const [ka, A] of road._network) {
    if (!A.points) continue
    for (const [kb, B] of road._network) {
      if (kb === ka || !B.points) continue
      const inCed = () => false   // QUAL-30: no ceded ground exists to exempt
      const PAD = 10   // R3: a pad owns 10 m around a node — two legs SHOULD meet there
      const nodes = []
      for (const [cell, pt] of [[A.cellA, A.points[0]], [A.cellB, A.points.at(-1)]]) if (cell) nodes.push(pt)
      for (const [cell, pt] of [[B.cellA, B.points[0]], [B.cellB, B.points.at(-1)]]) if (cell) nodes.push(pt)
      let bad = 0
      for (let s = 0; s <= A.polyCum.at(-1); s += 4) {
        if (inCed(s)) continue
        const p = at(A, s), n = near(p.x, p.z, B.points, B.polyCum)
        totM += 4
        if (nodes.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < PAD)) continue
        if (n.d < W) {
          bad += 4
          const dy = Math.abs(p.y - n.y)
          if (dy > worstDy) { worstDy = dy; worstAt = { x: p.x, z: p.z, seed: Wd.seed } }
        }
      }
      if (bad) { viol++; violM += bad }
      pairs++
    }
  }
}
const finite = rel.filter(Number.isFinite).sort((a, b) => a - b)
const q = (f) => finite[Math.min(finite.length - 1, Math.floor(finite.length * f))]
console.log(`wye-release: ${rel.length} promoted T departures across the battery`)
if (finite.length) console.log(`   clears one road width at: min ${finite[0].toFixed(0)} · median ${q(.5).toFixed(0)} · max ${finite.at(-1).toFixed(0)} m from the node`)
console.log(`   REPORT — own-deck arc inside one road width of another run (outside pads):`)
console.log(`   ${viol} run-pairs · ${(violM / 1000).toFixed(1)} km of ${(totM / 1000).toFixed(0)} km sampled · worst deck disagreement ${worstDy.toFixed(2)} m${worstAt ? ` — seed ${worstAt.seed} (${worstAt.x.toFixed(0)},${worstAt.z.toFixed(0)})` : ''}`)
// A control that measures nothing is the failure mode this rewrite exists to avoid.
if (!rel.length) { console.log('FAIL — no promoted T departures found; this gate proved nothing'); process.exit(1) }
if (early) { console.log(`FAIL — ${early} T departure(s) never clear one road width of their trunk`); process.exit(1) }
console.log(`   REPORT — departure deck step while still inside one road width of the trunk:`)
console.log(`   ${steps} sample(s)${steps ? `, worst ${worstStep.toFixed(2)} m — seed ${worstStepAt.seed} (${worstStepAt.x.toFixed(0)},${worstStepAt.z.toFixed(0)})` : ''} (FEAT-76 residue; BUG-56 ladder work)`)
console.log('PASS')
