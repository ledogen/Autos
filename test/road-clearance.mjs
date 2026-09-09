// GATE (run-all): node test/road-clearance.mjs   [--verbose] [--top=N] [--window=<substr>]
//
// FEAT-77 — TWO ROADS MAY NOT SHARE EACH OTHER'S EARTHWORK. Owner ruling 2026-09-07:
//
//     adjacent legs keep 12 m of daylight between their pavement edges, and neither road's
//     embankment or cut may reach the other — switchbacks may come close when that holds.
//
// The requirement is RoadSystem._v2ClearReq, the same function the planner's conflict predicate
// uses: max(2·halfWidth + clearEdgeM, footA + footB), each foot the carve's own apron toward the
// other road (roadFillSlope / roadCutSlope past the shoulder, capped at carveHalfWidth +
// roadMaxEmbankmentToe). So this gate measures the SHIPPED network against the rule the planner
// enforced, and a red row is a pair the planner could not resolve into a T (counted there as a
// promote-infeasible / decline) or a pair it never saw.
//
// Measured on the shipped series (runProfile().gradeY, what the ribbon draws). Excluded, because
// they are not two roads on their own earthworks: tunnel bores (±80 m of approach), samples within
// 30 m of a node the two runs share (the junction's own pad and hold), and samples inside a T's
// departure blend (offCurveSpans — the side road leaving the trunk's deck).
//
// GATING: zero violating pairs. RED until the residue is zero — the owner's bar, as
// junction-stitch was for BUG-56.
//
// REPORT (BUG-64 class B): the composed ground between the two shoulders, walked at 1 m, against
// the raw terrain there. A wall steeper than roadCutSlope where the raw ground is gentle is the
// CARVE composing two footprints into a step — no clearance rule explains it, and this line keeps
// those visible so they are not mistaken for clearance.
//
// Baseline the day it was written (2026-09-07, feature/junction-stitch before FEAT-77): 52 pairs,
// 2.2 km, 46 of them two legs of one node.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed } from '../src/seed.js'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const TOP = Number((argv.find((a) => a.startsWith('--top=')) || '--top=6').split('=')[1])
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const HW = P.roadHalfWidth ?? 5
const SH = P.roadShoulderWidth ?? 2.5
const NEAR = 60          // m — beyond this no rule can reach (two capped aprons are 36 m)
const THROAT = 30        // m — from a shared node: the pad and the deck hold own it
const STEP = 4
const CUT = P.roadCutSlope ?? 1.0

const nearestOn = (px, pz, pts, cum) => {
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

const scan = (road, terrain) => {
  const runs = [...road._network.entries()].filter(([, e]) => e.points?.length > 1)
  const rows = [], walls = []
  for (const [ka, A] of runs) for (const [kb, B] of runs) {
    if (ka >= kb) continue
    const shared = [A.cellA, A.cellB].some((c) => sameCell(c, B.cellA) || sameCell(c, B.cellB))
    const LA = A.polyCum[A.polyCum.length - 1], LB = B.polyCum[B.polyCum.length - 1]
    let viol = 0, worst = null, wall = null
    for (let s = 0; s <= LA; s += STEP) {
      let lo = 0; while (lo + 2 < A.polyCum.length && A.polyCum[lo + 1] <= s) lo++
      const u = (s - A.polyCum[lo]) / Math.max(1e-9, A.polyCum[lo + 1] - A.polyCum[lo])
      const ax = A.points[lo].x + (A.points[lo + 1].x - A.points[lo].x) * u
      const az = A.points[lo].z + (A.points[lo + 1].z - A.points[lo].z) * u
      const n = nearestOn(ax, az, B.points, B.polyCum)
      if (n.d > NEAR || n.d < 1e-6) continue
      if (inBore(A, s) || inBore(B, n.s) || inBlend(A, s) || inBlend(B, n.s)) continue
      if (shared && (Math.min(s, LA - s) < THROAT || Math.min(n.s, LB - n.s) < THROAT)) continue
      const ay = road.runProfile(s - (A.arcOrigin ?? 0), ka).gradeY
      const by = road.runProfile(n.s - (B.arcOrigin ?? 0), kb).gradeY
      const pa = { x: ax, y: ay, z: az }, hit = { d: n.d, y: by, fx: n.fx, fz: n.fz }
      const need = road._v2ClearReq(pa, hit)
      if (n.d < need) {
        viol += STEP
        if (!worst || need - n.d > worst.ex) worst = { ex: need - n.d, sep: n.d, need, dy: Math.abs(ay - by), x: ax, z: az }
      }
      // BUG-64 class B ruler: the composed ground between the two shoulders vs the raw terrain
      if (terrain && n.d > 2 * (HW + SH) + 2) {
        const ux = (n.fx - ax) / n.d, uz = (n.fz - az) / n.d
        let pc = null, pr = null, gc = 0, gr = 0
        for (let t = HW + SH; t <= n.d - HW - SH; t += 1) {
          const x = ax + ux * t, z = az + uz * t
          const hc = terrain.analyticHeight(x, z), hr = terrain.rawHeightWorld(x, z)
          if (pc != null) { gc = Math.max(gc, Math.abs(hc - pc)); gr = Math.max(gr, Math.abs(hr - pr)) }
          pc = hc; pr = hr
        }
        if (gc > CUT && gr < 0.6 && (!wall || gc > wall.gc)) wall = { gc, gr, sep: n.d, x: ax, z: az }
      }
    }
    if (viol > 0) rows.push({ ka, kb, shared, viol, ...worst })
    if (wall) walls.push({ ka, kb, ...wall })
  }
  return { rows, walls, runs: runs.length }
}

let fails = 0, totPairs = 0, totLen = 0, totShared = 0, totWalls = 0
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const terrain = makeTerrainHeadless(parseWorldSeed(W.seed), P, road)
  const { rows, walls, runs } = scan(road, terrain)
  totPairs += rows.length; totWalls += walls.length
  for (const r of rows) { totLen += r.viol; if (r.shared) totShared++ }
  const head = `${W.name.padEnd(20)} runs ${String(runs).padStart(3)} · violating pairs ${String(rows.length).padStart(3)} · carve walls (report) ${String(walls.length).padStart(2)}`
  if (!rows.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head}`)
  rows.sort((a, b) => b.viol - a.viol)
  for (const r of rows.slice(0, VERBOSE ? rows.length : TOP))
    console.log(`         (${r.x.toFixed(0)},${r.z.toFixed(0)})  ${r.sep.toFixed(1)} m apart, rule wants ${r.need.toFixed(1)} (${r.dy.toFixed(1)} m of height) over ${r.viol} m${r.shared ? '  [two legs of one node]' : ''}   ${r.ka} × ${r.kb}`)
  if (!VERBOSE && rows.length > TOP) console.log(`         … ${rows.length - TOP} more (--verbose)`)
  if (VERBOSE) for (const w of walls) console.log(`         wall (report): (${w.x.toFixed(0)},${w.z.toFixed(0)}) composed ${(Math.atan(w.gc) * 180 / Math.PI).toFixed(0)}° where raw is ${(Math.atan(w.gr) * 180 / Math.PI).toFixed(0)}°, roads ${w.sep.toFixed(0)} m apart   ${w.ka} × ${w.kb}`)
}

console.log(`\nroad-clearance: ${totPairs} pair(s) inside each other's earthwork · ${(totLen / 1000).toFixed(1)} km · ${totShared} share a node · carve-made walls between roads (report, BUG-64 B): ${totWalls}`)
if (fails) { console.log('FAIL — two roads sit closer than the daylight and earthwork the carve needs between them (FEAT-77)'); process.exit(1) }
console.log('PASS')
