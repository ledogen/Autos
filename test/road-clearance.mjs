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
// Measured on the shipped series (runProfile().gradeY, what the ribbon draws), at the stations
// test/lib/close-pairs.mjs keeps (bores, shared-node throats, T departure blends and hairpin arms
// excluded) — the same pairs road-carve-walls (BUG-64 class B) walks the ground between.
//
// GATING: zero violating pairs. RED until the residue is zero — the owner's bar, as
// junction-stitch was for BUG-56.
//
// NEAR-MISS (owner ruling (a), 2026-11-01): two legs of ONE node that fall short of the rule by
// under NEAR_MISS_M over under NEAR_MISS_LEN are reported, not gated. The planner never acts on a
// leg pinned to its node's departure there (FEAT-77 residue triage), and the owner reads neither
// these nor BUG-64's walls as a problem in play. Kept small and honest: two separate roads get no
// tolerance, and neither does a shared-node pair that misses by more. The two that raised it
// (2026-11-01): lone-pine spawn (-68,320) 0.2 m over 4 m; seed3 origin (1976,-889) 0.7 m over 16 m.
//
// Baseline the day it was written (2026-09-07, feature/junction-stitch before FEAT-77): 52 pairs,
// 2.2 km, 46 of them two legs of one node.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { closePairs } from './lib/close-pairs.mjs'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const TOP = Number((argv.find((a) => a.startsWith('--top=')) || '--top=6').split('=')[1])
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]
const STEP = 4   // m — close-pairs' station spacing
const NEAR_MISS_M = 1, NEAR_MISS_LEN = 20   // m — the shared-node near-miss above

let fails = 0, totPairs = 0, totLen = 0, totShared = 0, hairpins = 0, nearMiss = 0
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const { pairs, runs, hairpins: hp } = closePairs(road, P)
  hairpins += hp
  const rows = []
  for (const { ka, kb, shared, samples } of pairs) {
    let viol = 0, worst = null
    for (const q of samples) {
      const need = road._v2ClearReq({ x: q.ax, y: q.ay, z: q.az }, { d: q.d, y: q.by, fx: q.fx, fz: q.fz })
      if (q.d < need) {
        viol += STEP
        if (!worst || need - q.d > worst.ex) worst = { ex: need - q.d, sep: q.d, need, dy: Math.abs(q.ay - q.by), x: q.ax, z: q.az }
      }
    }
    if (viol > 0) rows.push({ ka, kb, shared, viol, near: shared && worst.ex < NEAR_MISS_M && viol < NEAR_MISS_LEN, ...worst })
  }
  for (const r of rows.filter((r) => r.near)) {
    nearMiss++
    console.log(`  near ${W.name.padEnd(20)} (${r.x.toFixed(0)},${r.z.toFixed(0)})  ${r.sep.toFixed(1)} m apart, rule wants ${r.need.toFixed(1)} over ${r.viol} m  [two legs of one node — report]`)
  }
  rows.splice(0, rows.length, ...rows.filter((r) => !r.near))
  totPairs += rows.length
  for (const r of rows) { totLen += r.viol; if (r.shared) totShared++ }
  const head = `${W.name.padEnd(20)} runs ${String(runs).padStart(3)} · violating pairs ${String(rows.length).padStart(3)}`
  if (!rows.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head}`)
  rows.sort((a, b) => b.viol - a.viol)
  for (const r of rows.slice(0, VERBOSE ? rows.length : TOP))
    console.log(`         (${r.x.toFixed(0)},${r.z.toFixed(0)})  ${r.sep.toFixed(1)} m apart, rule wants ${r.need.toFixed(1)} (${r.dy.toFixed(1)} m of height) over ${r.viol} m${r.shared ? '  [two legs of one node]' : ''}   ${r.ka} × ${r.kb}`)
  if (!VERBOSE && rows.length > TOP) console.log(`         … ${rows.length - TOP} more (--verbose)`)
}

console.log(`\nroad-clearance: ${totPairs} pair(s) inside each other's earthwork · ${(totLen / 1000).toFixed(1)} km · ${totShared} share a node · hairpin arms exempt: ${hairpins} · shared-node near-misses (report): ${nearMiss}`)
if (fails) { console.log('FAIL — two roads sit closer than the daylight and earthwork the carve needs between them (FEAT-77)'); process.exit(1) }
console.log('PASS')
