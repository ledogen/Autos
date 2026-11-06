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

//
// RANDOM-SEED LEG (BUG-105, 2026-11-06): the battery above is nine hand-picked windows, and random seeds are where
// the residue lived (owner: "i do care about grazing without an intersection"). Twelve 1400 m windows at the origin,
// the first 12 of BUG-105's census list (mulberry32 from 0xB105B104, drawn once — never hand-picked), built the way
// the game builds them (pond no-go wired). It gates the GRAZE tier at zero: centres under 2·halfWidth + clearEdgeM
// (under 12 m of daylight), outside the same exclusions. Banks-only contact is reported, not gated (tier split
// adopted 2026-11-06 on the owner's rulings, BUG-64 (a)). No pins: the four owner-call sites (two tangles with no
// buildable departure, two stacked-bench pairs) are not on these seeds.

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { closePairs } from './lib/close-pairs.mjs'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { parseWorldSeed } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const RANDOM_SEEDS = ['3997014678', '2623851183', '3628580736', '744309545', '3894319881', '2086105584',
  '3532835134', '3132835459', '1247456971', '2393607623', '430171442', '3259630675']
const randomWindow = (seed) => {
  const ws = parseWorldSeed(seed)
  const { rawHeightWorld } = makeTerrainHeadless(ws, P, null)
  const water = new WaterSystem(ws, P, rawHeightWorld)
  const road = new RoadSystem(ws, P)
  road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (x0, z0, x1, z1) => {
    const d = []; for (const p of water.pondsNear(x0, z0, x1, z1)) d.push(p.floorX, p.floorZ, p.radius + p.skirt); return d })
  road.setRadius(1400); road.update(new THREE.Vector3(0, 0, 0))
  return road
}

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

// The random-seed leg: GRAZE gates, banks reports (header).
const FLOOR = 2 * (P.roadHalfWidth ?? 5) + (P.roadV2?.clearEdgeM ?? 12)
let grazeFails = 0, banksPairs = 0
for (const seed of RANDOM_SEEDS) {
  if (ONLY && !`rand ${seed}`.includes(ONLY)) continue
  const road = randomWindow(seed)
  const { pairs, runs } = closePairs(road, P)
  const rows = []
  for (const { ka, kb, shared, samples } of pairs) {
    let graze = 0, banks = 0, worst = null
    for (const q of samples) {
      if (q.d < FLOOR) {
        graze += STEP
        if (!worst || q.d < worst.sep) worst = { sep: q.d, dy: Math.abs(q.ay - q.by), x: q.ax, z: q.az }
      } else if (q.d < road._v2ClearReq({ x: q.ax, y: q.ay, z: q.az }, { d: q.d, y: q.by, fx: q.fx, fz: q.fz })) banks += STEP
    }
    if (banks && !graze) banksPairs++
    if (graze && !(shared && FLOOR - worst.sep < NEAR_MISS_M && graze < NEAR_MISS_LEN)) rows.push({ ka, kb, shared, graze, ...worst })
  }
  const head = `rand ${seed}`.padEnd(20) + ` runs ${String(runs).padStart(3)} · grazing pairs ${String(rows.length).padStart(3)}`
  if (!rows.length) { console.log(`  ok   ${head}`); continue }
  grazeFails++
  console.log(`  FAIL ${head}`)
  for (const r of rows) console.log(`         (${r.x.toFixed(0)},${r.z.toFixed(0)})  ${r.sep.toFixed(1)} m apart (under ${FLOOR} m) over ${r.graze} m, ${r.dy.toFixed(1)} m of height${r.shared ? '  [two legs of one node]' : ''}   ${r.ka} × ${r.kb}`)
}
console.log(`\nroad-clearance random leg: ${RANDOM_SEEDS.length} windows · ${grazeFails} with a GRAZE (gated) · banks-only pairs (report): ${banksPairs}`)
if (grazeFails) fails++

console.log(`\nroad-clearance: ${totPairs} pair(s) inside each other's earthwork · ${(totLen / 1000).toFixed(1)} km · ${totShared} share a node · hairpin arms exempt: ${hairpins} · shared-node near-misses (report): ${nearMiss}`)
if (fails) { console.log('FAIL — two roads sit closer than the daylight and earthwork the carve needs between them (FEAT-77)'); process.exit(1) }
console.log('PASS')
