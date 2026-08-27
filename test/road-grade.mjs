// GATE (run-all): node test/road-grade.mjs   [--verbose] [--window=<substr>]
//
// BUG-56 workstream C — NEVER DRAPE. Owner priority 1, 2026-08-27: the road must be drivable, and
// explicitly NOT by tightening the cap:
//
//     "mainly i dont want to destroy connectivity by strictening grade compared to the
//      very lenient fall back to terrain we currently have."
//
// So gMaxRoad stays 0.24 and wGrade stays the dial that shapes what the router PREFERS. What must
// die is the terrain-follow drape: when the profile ladder cannot solve, _v2GradePts used to set
// pts[i].y to raw terrain with 60 m blends onto the node heights and apply NO grade bound at all.
// That is where every headline number came from — census 2026-08-27, 361 edges / 280.7 km:
//
//     over 20 %: 7.79 %   over 24 %: 3.62 %   over 30 %: 0.28 %   worst single spot: 108 %
//
// There is no 38 % violation anywhere in that census. There are four places where nothing was
// designed and nobody checked the result: `g:8,1,0:9,1,0` on seed 6 climbs 62 m in 85 m of arc.
//
// Lowering the cap is not the lever and the owner has ruled it out (recorded so nobody retries):
// at 0.20 the worst spot is still 108 %, at 0.18 still 108 %, because the offenders come from the
// ABSENCE of a solve, not from the cap. The truck holds 22 % in 2nd without hunting
// (test/drivetrain-climb.mjs), so 24 % is not the driveability problem either.
//
// THE LADDER, and the two things this gate asserts:
//
//   cap gMaxRoad -> finer elevation step -> relief (gMaxRoad + 0.03) -> CEILING (gMaxRoad+gradeTol)
//     -> RE-ROUTE the edge with grade priced hard, and solve on the new corridor
//     -> CONDEMNED (a drape is evidence the edge was load-bearing; it is marked, never deleted)
//
//   1. NO SHIPPED RUN EXCEEDS THE CEILING. Measured on the registered geometry, not on a counter:
//      a drape has no grade bound at all, so "every run stays under gMaxRoad + gradeTol" IS the
//      test for "nothing shipped that nobody solved", and it cannot be fooled by bookkeeping.
//      (_v2Infeasible is NOT that counter — the plan layer probes merge and shove candidates
//      through the same solver, so it ticks for geometry that never ships. Reported, not gated.)
//   2. ZERO CONDEMNED RUNS across the battery.                            [GATING]
//
// The CEILING rung IS the strict limit, expressed as `gMaxRoad + gradeTol` (owner ruling
// 2026-08-27) so it tracks the cap instead of being a second free-floating number. gradeTol 0.14
// keeps today's 38 % exactly. It is deliberately lenient: a road solved at the ceiling is legal by
// fiat — drivability at 38 % is an accepted cost of connectivity, and no drivetrain measurement
// gates it. So the histogram and the ceiling-rung count are REPORTED, never gated; they are there
// to keep the 24-38 % population visible rather than to fail on it.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const STEP = 4        // m — sampling pitch along the run
const HALF = 10       // m — half the grade baseline (+/- HALF around the sample)
const CEIL = (P.roadV2?.gMaxRoad ?? 0.24) + (P.roadV2?.gradeTol ?? 0.14)
// The solver works at ~10 m stations and its output is low-passed onto the 4 m polyline, so a
// +/-10 m ruler can read a shade over what the solver priced. This slack covers the instrument,
// not the road: it is a hundredth of a grade, where the class this gate exists to catch is 108 %.
const SLACK = 0.01

const gradeScan = (e) => {
  const cum = e.polyCum, pts = e.points, L = cum[cum.length - 1]
  const yAt = (s) => {
    if (s <= 0) return pts[0].y
    if (s >= L) return pts[pts.length - 1].y
    let lo = 0, hi = cum.length - 1
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
    const u = (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo])
    return pts[lo].y + (pts[lo + 1].y - pts[lo].y) * u
  }
  const bins = { over20: 0, over24: 0, over30: 0, n: 0 }
  let worst = 0, worstS = 0
  for (let s = 0; s <= L; s += STEP) {
    const a = Math.max(0, s - HALF), b = Math.min(L, s + HALF)
    if (b - a < 1e-6) continue
    const g = Math.abs(yAt(b) - yAt(a)) / (b - a)
    bins.n++
    if (g > 0.20) bins.over20++
    if (g > 0.24) bins.over24++
    if (g > 0.30) bins.over30++
    if (g > worst) { worst = g; worstS = s }
  }
  return { bins, worst, worstS, L }
}

let fails = 0
const tot = { runs: 0, km: 0, n: 0, over20: 0, over24: 0, over30: 0, draped: 0, condemned: 0, rerouted: 0 }
let worstAll = 0, worstWhere = ''
const rungTot = [0, 0, 0, 0]

for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const bad = []
  let runs = 0, km = 0, wWorst = 0
  const b = { n: 0, over20: 0, over24: 0, over30: 0 }
  for (const [k, e] of road._network) {
    if (!(e.points?.length > 1)) continue
    runs++
    const g = gradeScan(e)
    km += g.L / 1000
    b.n += g.bins.n; b.over20 += g.bins.over20; b.over24 += g.bins.over24; b.over30 += g.bins.over30
    if (g.worst > wWorst) wWorst = g.worst
    if (g.worst > worstAll) {
      worstAll = g.worst
      const p = e.points[Math.min(e.points.length - 1, Math.round(g.worstS / 4))]
      worstWhere = `${W.name} ${k} at (${p.x.toFixed(0)},${p.z.toFixed(0)})`
    }
    if (e.condemned || g.worst > CEIL + SLACK)
      bad.push({ k, why: e.condemned ? 'CONDEMNED' : 'unsolved', worst: g.worst, L: g.L,
                 at: e.points[Math.min(e.points.length - 1, Math.round(g.worstS / 4))] })
    if (e.rerouted) tot.rerouted++
  }
  const r = road._v2Rung || [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) rungTot[i] += r[i]
  tot.runs += runs; tot.km += km; tot.n += b.n
  tot.over20 += b.over20; tot.over24 += b.over24; tot.over30 += b.over30
  tot.draped += bad.filter((x) => x.why === 'unsolved').length
  tot.condemned += bad.filter((x) => x.why === 'CONDEMNED').length
  const head = `${W.name.padEnd(20)} runs ${String(runs).padStart(3)} · ${km.toFixed(1).padStart(5)} km · ` +
               `>20% ${(100 * b.over20 / Math.max(1, b.n)).toFixed(2).padStart(5)}% · ` +
               `>24% ${(100 * b.over24 / Math.max(1, b.n)).toFixed(2).padStart(5)}% · ` +
               `worst ${(100 * wWorst).toFixed(0).padStart(3)}%`
  if (!bad.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head} · ${bad.length} unsolved`)
  for (const x of bad.slice(0, VERBOSE ? bad.length : 6))
    console.log(`         ${x.why.padEnd(9)} ${x.k.padEnd(20)} ${x.L.toFixed(0)} m, worst ${(100 * x.worst).toFixed(0)}% at (${x.at.x.toFixed(0)},${x.at.z.toFixed(0)})`)
}

const pc = (v) => `${(100 * v / Math.max(1, tot.n)).toFixed(2)} %`
console.log(`\nroad-grade: ${tot.runs} runs · ${tot.km.toFixed(1)} km`)
console.log(`   histogram (report only) — over 20 %: ${pc(tot.over20)} · over 24 %: ${pc(tot.over24)} · ` +
            `over 30 %: ${pc(tot.over30)} · worst ${(100 * worstAll).toFixed(0)} %`)
console.log(`   worst spot: ${worstWhere}`)
console.log(`   ladder rungs — cap ${rungTot[0]} · fine ${rungTot[1]} · relief ${rungTot[2]} · ceiling ${rungTot[3]} ` +
            `· re-routed ${tot.rerouted}`)
console.log(`   GATING — over the ${(100 * CEIL).toFixed(0)} % ceiling: ${tot.draped} runs · condemned: ${tot.condemned}`)
if (fails) { console.log(`FAIL — a run ships above the ${(100 * CEIL).toFixed(0)} % ceiling, i.e. with no designed profile at all; the terrain-follow drape is the 108 % class (BUG-56 C)`); process.exit(1) }
console.log('PASS')
