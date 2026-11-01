// GATE (run-all): node test/road-carve-walls.mjs   [--verbose] [--window=<substr>]
//
// BUG-64 class B — THE CARVE MAY NOT COMPOSE TWO ROADS' EARTHWORK INTO A WALL NEITHER BANK HAS.
// Owner photo 2026-09-07 (seed 1517161527 near (-79,-501)) and the battery census: between two roads
// 40–60 m apart on gentle ground the composed terrain stood at 60–80° — seed 20 (1748,418), 50 m
// apart on 14° ground, was 80°. Each road's bank alone was gentle; the composition made the step.
//
// For every close pair (test/lib/close-pairs.mjs — the same stations road-clearance judges: bores,
// shared-node throats, T departure blends and hairpin arms excluded) the ground is walked at 1 m
// between the two shoulders. Each 1 m step is compared with what each road's earthwork ALONE does
// over the same step — the pair AND every other run whose footprint reaches it (a junction's legs,
// a third road), each on its own cross-section (BUG-57 polar cap past a run end, on the same
// analytic frame the carve uses). A step is a COMPOSITION WALL when it is steeper than
// roadCutSlope, the raw ground under it is gentle (< 31°), and it is steeper than every road's own
// bank there by > TOL.
//
// Not counted here, reported:
//   · SINGLE-BANK walls — one road's own bank is that steep (a cut deeper than ~5 m peaks at 1.5:1
//     mid-bank by the smoothstep; a fill deeper than ~17 m is steepened by the toe cap). That is the
//     earthwork's design, and it is the same with no second road.
//   · OVERLAP walls — two or more roads' earthworks reach the step (a fill meeting a cut sums; a
//     bank reaching another road's shoulder ramps in over that road's own bank). Two roads sharing earthwork is FEAT-77's rule
//     (road-clearance), whose foot is capped at carveHalfWidth + roadMaxEmbankmentToe while the
//     carve's deep-bank toe reaches DEEP_BANK_TOE_EXTRA further.
//
// GATING: zero composition walls. Baseline the day it was written (2026-11-01, main 5a1e0b4e, the
// one-rival 50/50 nearness cross-fade): see the BUG-64 ticket's census.

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { closePairs, soloEarthwork } from './lib/close-pairs.mjs'
import { parseWorldSeed } from '../src/seed.js'

const argv = process.argv.slice(2)
const VERBOSE = argv.includes('--verbose')
const ONLY = (argv.find((a) => a.startsWith('--window=')) || '').split('=')[1]

const HW = P.roadHalfWidth ?? 5
const SH = P.roadShoulderWidth ?? 2.5
const CUT = P.roadCutSlope ?? 1.0
const GENTLE = 0.6       // raw rise per metre (31°) — steeper raw ground explains a steep carve
const TOL = 0.25         // m per m — composition may not add more than this to the steeper bank
const deg = (g) => (Math.atan(g) * 180 / Math.PI).toFixed(0)
let comp = 0, single = 0, overlap = 0, fails = 0
for (const W of WINDOWS) {
  if (ONLY && !W.name.includes(ONLY)) continue
  const road = buildWindow(W, P)
  const terrain = makeTerrainHeadless(parseWorldSeed(W.seed), P, road)
  const { pairs } = closePairs(road, P)
  const rows = []
  let nSingle = 0, nOverlap = 0
  for (const { ka, kb, samples } of pairs) {
    let worst = null, kind = null
    for (const q of samples) {
      if (q.d <= 2 * (HW + SH) + 2) continue
      const ux = (q.fx - q.ax) / q.d, uz = (q.fz - q.az) / q.d
      let prev = null
      for (let t = HW + SH; t <= q.d - HW - SH; t += 1) {
        const x = q.ax + ux * t, z = q.az + uz * t
        const raw = terrain.rawHeightWorld(x, z)
        const nr = road._resolveRoadSurface(x, z)
        const keys = new Set([ka, kb, ...(nr ? [nr.runKey, ...nr.rivals.map((r) => r.runKey)] : [])])
        const cur = { h: terrain.analyticHeight(x, z), raw, keys }
        if (prev) {
          const g = Math.abs(cur.h - prev.h), gr = Math.abs(cur.raw - prev.raw)
          if (g > CUT && gr < GENTLE) {
            let gBank = 0, wet0 = 0, wet1 = 0
            for (const k of new Set([...prev.keys, ...keys])) {
              const s0 = soloEarthwork(road, P, k, prev.x, prev.z, prev.raw), s1 = soloEarthwork(road, P, k, x, z, raw)
              gBank = Math.max(gBank, Math.abs(raw + s1.d - prev.raw - s0.d))
              if (s0.w > 0) wet0++
              if (s1.w > 0) wet1++
            }
            const k = (wet0 > 1 || wet1 > 1) ? 'overlap' : g - gBank > TOL ? 'comp' : 'single'
            const rank = { comp: 3, overlap: 2, single: 1 }
            if (!kind || rank[k] > rank[kind] || (k === kind && g > worst.g)) { kind = k; worst = { g, gr, ex: g - gBank, sep: q.d, x, z } }
          }
        }
        cur.x = x; cur.z = z
        prev = cur
      }
    }
    if (!kind) continue
    if (kind === 'comp') rows.push({ ka, kb, ...worst })
    else if (kind === 'overlap') nOverlap++
    else nSingle++
  }
  comp += rows.length; single += nSingle; overlap += nOverlap
  const head = `${W.name.padEnd(20)} pairs ${String(pairs.length).padStart(3)} · composition walls ${String(rows.length).padStart(2)} · single-bank ${String(nSingle).padStart(2)} · overlap ${String(nOverlap).padStart(2)} (report)`
  if (!rows.length) { console.log(`  ok   ${head}`); continue }
  fails++
  console.log(`  FAIL ${head}`)
  rows.sort((a, b) => b.g - a.g)
  for (const r of rows.slice(0, VERBOSE ? rows.length : 6))
    console.log(`         (${r.x.toFixed(0)},${r.z.toFixed(0)})  ${deg(r.g)}° where raw is ${deg(r.gr)}°, ${r.ex.toFixed(2)} m/m steeper than any road's own bank, roads ${r.sep.toFixed(0)} m apart   ${r.ka} × ${r.kb}`)
}

console.log(`\nroad-carve-walls: ${comp} composition wall(s) · single-bank (design, report) ${single} · overlapping earthwork (FEAT-77, report) ${overlap}`)
if (fails) { console.log('FAIL — the carve composed two roads\' earthwork into a wall neither bank has (BUG-64 class B)'); process.exit(1) }
console.log('PASS')
