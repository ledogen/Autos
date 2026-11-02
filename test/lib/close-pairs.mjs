// test/lib/close-pairs.mjs — every pair of shipped runs within reach of each other's earthwork, sampled
// along the first run, with the stretches that are NOT two roads on their own earthworks removed.
// Shared by road-clearance (FEAT-77: the separation rule) and road-carve-walls (BUG-64 class B: the
// ground the carve composes between them), so both judge the same pairs at the same stations.
//
// Excluded, because they are not two roads on their own earthworks: tunnel bores (±80 m of approach),
// samples inside the geometric throat of a node the two runs share (the junction's own pad and hold),
// samples within the reach of a registered at-grade CROSSING on either run (BUG-104: a crossing is a
// junction of its own — the same ±(blend + 10) m the tunnel clip clears around it),
// samples inside a T's departure blend (offCurveSpans — the side road leaving the trunk's deck), and
// the two arms of a switchback (hairpins, counted).
import { DEEP_BANK_TOE_EXTRA } from '../../src/road-carve.js'

const NEAR = 60          // m — beyond this no rule can reach (two capped aprons are 36 m)
const THROAT = 30        // m — from a shared node: the pad and the deck hold own it (the MINIMUM)
const STEP = 4           // m — station spacing along the first run
// FEAT-77 (owner ruling 2026-09-10): the throat is GEOMETRIC — two legs of one node owe each
// other the rule only once their pavements have parted, i.e. from the first sample where the
// centrelines are `floor` (2·HW + clearEdgeM) apart; never less than THROAT, never more than
// 4·THROAT (a pair that has not parted by then is a hug, and the rule's floor applies). The
// same definition the planner uses (RoadSystem._v2ThroatLen).
const THROAT_CAP = 4 * THROAT
// HAIRPIN ARMS (owner ruling 2026-09-14): two legs of one node that leave it within HAIRPIN_DEG of
// each other are the two arms of a switchback, one road doubling back, not two roads sharing a
// hillside — the T ladder already refuses to merge a leg that doubles back past 135°, for the same
// reason. Their earthwork is one bank. Measured on seed 6 (−3040, 4908): 13 m apart for 84 m with
// 6 m of height, the last long row on the battery. Bearing is taken over the first 24 m out of the
// shared node on each leg.
const HAIRPIN_DEG = 30

/**
 * One road's earthwork ALONE at (x, z): its offset from raw ground (blendW folded in) and its
 * coverage `w` (> 0 = this road's earthwork reaches the point). Past a run end it is BUG-57's polar
 * cap out to the carve's real toe (DEEP_BANK_TOE_EXTRA past FEAT-77's capped foot); along the run it
 * is the cross-section on the same refined analytic frame the carve uses. Shared by road-carve-walls
 * and road-fill-support: two roads reaching one step is the OVERLAP rule (FEAT-77's, BUG-64 (a)).
 */
export const soloEarthwork = (road, P, key, x, z, raw) => {
  const HW = P.roadHalfWidth ?? 5
  const FOOT = Math.min(HW + (P.roadCarveExtraWidth ?? 3), P.roadMinTurnRadius ?? 12) + (P.roadMaxEmbankmentToe ?? 10) + DEEP_BANK_TOE_EXTRA
  const e = road._network.get(key), pr = e && road._projectOntoRun(e, x, z)
  if (!pr) return { d: 0, w: 0 }
  let lat, arcS
  if (pr.offEnd) {
    if (pr.d2 > FOOT * FOOT) return { d: 0, w: 0 }
    lat = (pr.signedLat < 0 ? -1 : 1) * Math.sqrt(pr.d2); arcS = pr.arcS
  } else {
    const f = road._refineFrame(e, pr, x, z)
    lat = f ? (x - f.fx) * f.tz - (z - f.fz) * f.tx : pr.signedLat
    arcS = f ? f.arcS : pr.arcS
  }
  const cs = road._carveCrossSection(lat, arcS, key, 1, raw, x, z)
  return cs ? { d: cs.blendW * (cs.gradeY - raw), w: cs.blendW } : { d: 0, w: 0 }
}

export const nearestOn = (px, pz, pts, cum) => {
  let d = Infinity, s = 0, y = 0, fx = 0, fz = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / l2)) : 0
    const qx = a.x + t * ex, qz = a.z + t * ez
    const dd = Math.hypot(px - qx, pz - qz)
    if (dd < d) { d = dd; s = cum[i - 1] + t * (cum[i] - cum[i - 1]); y = a.y + t * (b.y - a.y); fx = qx; fz = qz }
  }
  return { d, s, y, fx, fz }
}
const inBore = (e, s) => (e.tunnelSpans || []).some((sp) => s >= sp.s0 - 80 && s <= sp.s1 + 80)
const inBlend = (e, s) => (e.offCurveSpans || []).some((sp) => s >= sp.s0 - 2 && s <= sp.s1 + 2)
const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

const bearingFrom = (A, fromStart) => {
  const n = A.points.length, L = A.polyCum[n - 1]
  const i0 = fromStart ? 0 : n - 1
  let i = i0
  while (fromStart ? (i < n - 1 && A.polyCum[i] < 24) : (i > 0 && L - A.polyCum[i] < 24)) i += fromStart ? 1 : -1
  const dx = A.points[i].x - A.points[i0].x, dz = A.points[i].z - A.points[i0].z, l = Math.hypot(dx, dz) || 1
  return [dx / l, dz / l]
}
const hairpin = (A, aFromStart, B, bFromStart) => {
  const [ax, az] = bearingFrom(A, aFromStart), [bx, bz] = bearingFrom(B, bFromStart)
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz))) * 180 / Math.PI < HAIRPIN_DEG
}

/**
 * @returns {{ pairs: Array<{ ka, kb, shared, samples: Array<{ ax, az, ay, d, fx, fz, by }> }>, runs: number, hairpins: number }}
 *   Each sample: a station on run A at arc s (ax, az, deck ay), the nearest point of run B (fx, fz, deck by)
 *   and their distance d. Pairs with no surviving sample are omitted.
 */
export function closePairs(road, P) {
  const HW = P.roadHalfWidth ?? 5
  const floor = 2 * HW + (P.roadV2?.clearEdgeM ?? 12)
  const throatLen = (A, fromStart, B) => {
    const n = A.points.length, L = A.polyCum[n - 1]
    for (let k = 0; k < n; k++) {
      const i = fromStart ? k : n - 1 - k
      const s = fromStart ? A.polyCum[i] : L - A.polyCum[i]
      if (s > THROAT_CAP) return THROAT_CAP
      if (s < THROAT) continue
      if (nearestOn(A.points[i].x, A.points[i].z, B.points, B.polyCum).d >= floor) return Math.max(THROAT, s)
    }
    return THROAT_CAP
  }
  const XR = (P.roadJunctionBlendLength ?? 30) + 10
  const inCross = (k, s) => (road._crossingsByRun?.get(k) ?? []).some((x) => Math.abs(x.arc - s) < XR)
  const runs = [...road._network.entries()].filter(([, e]) => e.points?.length > 1)
  const pairs = []
  let hairpins = 0
  for (const [ka, A] of runs) for (const [kb, B] of runs) {
    if (ka >= kb) continue
    const shared = [A.cellA, A.cellB].some((c) => sameCell(c, B.cellA) || sameCell(c, B.cellB))
    const LA = A.polyCum[A.polyCum.length - 1], LB = B.polyCum[B.polyCum.length - 1]
    // the geometric throat at each shared end, measured along each run from that node
    const shAs = sameCell(A.cellA, B.cellA) || sameCell(A.cellA, B.cellB), shAe = sameCell(A.cellB, B.cellA) || sameCell(A.cellB, B.cellB)
    const shBs = sameCell(B.cellA, A.cellA) || sameCell(B.cellA, A.cellB), shBe = sameCell(B.cellB, A.cellA) || sameCell(B.cellB, A.cellB)
    const tAs = shAs ? throatLen(A, true, B) : 0, tAe = shAe ? throatLen(A, false, B) : 0
    const tBs = shBs ? throatLen(B, true, A) : 0, tBe = shBe ? throatLen(B, false, A) : 0
    // the two arms of a switchback: one shared node, both legs leaving it on nearly the same bearing
    if (shared) {
      const aFS = shAs, bFS = sameCell(B.cellA, aFS ? A.cellA : A.cellB)
      if (hairpin(A, aFS, B, bFS)) { hairpins++; continue }
    }
    const samples = []
    for (let s = 0; s <= LA; s += STEP) {
      let lo = 0; while (lo + 2 < A.polyCum.length && A.polyCum[lo + 1] <= s) lo++
      const u = (s - A.polyCum[lo]) / Math.max(1e-9, A.polyCum[lo + 1] - A.polyCum[lo])
      const ax = A.points[lo].x + (A.points[lo + 1].x - A.points[lo].x) * u
      const az = A.points[lo].z + (A.points[lo + 1].z - A.points[lo].z) * u
      const n = nearestOn(ax, az, B.points, B.polyCum)
      if (n.d > NEAR || n.d < 1e-6) continue
      if (inBore(A, s) || inBore(B, n.s) || inBlend(A, s) || inBlend(B, n.s)) continue
      if (shared && (s < tAs || LA - s < tAe || n.s < tBs || LB - n.s < tBe)) continue
      if (inCross(ka, s) || inCross(kb, n.s)) continue
      const ay = road.runProfile(s - (A.arcOrigin ?? 0), ka).gradeY
      const by = road.runProfile(n.s - (B.arcOrigin ?? 0), kb).gradeY
      samples.push({ s, ax, az, ay, d: n.d, fx: n.fx, fz: n.fz, by })
    }
    if (samples.length) pairs.push({ ka, kb, shared, samples })
  }
  return { pairs, runs: runs.length, hairpins }
}
