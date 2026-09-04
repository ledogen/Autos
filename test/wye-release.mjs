// GATE (run-all): node test/wye-release.mjs
//
// R8 (owner ruling, 2026-09-01) — THE WYE INVARIANT. Two roads may not carry independent decks
// within one road width of one another:
//
//   under 10 m centre-to-centre  ->  ONE surface (a ceded strand: the loser rides the winner)
//   at 10 m                      ->  the wye: the decks share an edge, camber crease capped
//   over 10 m                    ->  two roads, each with its own full deck
//
// GATING: every end-anchored ceded strand must RELEASE — hand over from one-surface to own-deck —
// at >= 2·roadHalfWidth of centre separation. Before R8 all 64 strands in the battery released at
// exactly 0.00 m (the loser left the winner's geometry while still precisely on top of it), which
// was measured as most of the junction-stitch red.
//
// REPORT: the residual R8 violation — own-deck arc (outside ceded spans and R3's 10 m pads)
// within one road width of another run, and the worst deck disagreement inside that band. This
// shrinks as R5/R6 land; it is reported, not gated, until the ladder work is done.
//
// Mid-span ceded strands are excluded from the gating half: the departure hold at mid-span forks
// was built, measured, and REVERTED (it trades a road-smoothness collision step), so their wye
// stays booked on BUG-56.

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

let rel = [], early = 0, viol = 0, violM = 0, totM = 0, pairs = 0, worstDy = 0, worstAt = null
for (const Wd of WINDOWS) {
  const road = buildWindow(Wd, P)
  for (const [ka, A] of road._network) {
    if (!A.points) continue
    for (const sp of A.cededSpans || []) {
      const B = road._network.get(sp.owner)
      if (!B?.points || sp.midSpan) continue
      // the release boundary faces the loser's own geometry: start-anchored -> s1, end-anchored -> s0
      const rs = sp.s0 < 1e-6 ? sp.s1 : sp.s0
      const p = at(A, rs)
      const d = near(p.x, p.z, B.points, B.polyCum).d
      rel.push(d)
      if (d < W - 0.5) early++
    }
    for (const [kb, B] of road._network) {
      if (kb === ka || !B.points) continue
      const ced = (A.cededSpans || []).filter((s) => s.owner === kb)
      const inCed = (s) => ced.some((c) => s >= c.s0 - 1e-6 && s <= c.s1 + 1e-6)
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
rel.sort((a, b) => a - b)
const q = (f) => rel[Math.min(rel.length - 1, Math.floor(rel.length * f))]
console.log(`wye-release: ${rel.length} end-anchored ceded strands across the battery`)
if (rel.length) console.log(`   release separation: min ${rel[0].toFixed(2)} · median ${q(.5).toFixed(2)} · max ${rel.at(-1).toFixed(2)} m (bar: >= ${(W - 0.5).toFixed(1)})`)
console.log(`   REPORT — own-deck arc inside one road width of another run (outside pads + ceded):`)
console.log(`   ${viol} run-pairs · ${(violM / 1000).toFixed(1)} km of ${(totM / 1000).toFixed(0)} km sampled · worst deck disagreement ${worstDy.toFixed(2)} m${worstAt ? ` — seed ${worstAt.seed} (${worstAt.x.toFixed(0)},${worstAt.z.toFixed(0)})` : ''}`)
if (early) { console.log(`FAIL — ${early} ceded strand(s) release under one road width (R8: below 10 m is ONE surface)`); process.exit(1) }
console.log('PASS')
