// test/vertical-curvature.mjs — BUG-90: no sharp vertical kink where a wheel drives. A CEILING gate.
//
// The owner's yardstick (2026-10-26): the RATE OF CHANGE OF SLOPE the wheels see over one wheelbase.
// κ = (grade ahead − grade behind) / WB, each grade over WB m of the physics surface (analyticHeight).
// A crest of κ unloads the wheels at v = √(g/κ); a sag of κ adds 1 g at the same v. The captures that
// set the scale (κ over ±WB):
//   dip 1 (deg-2 connector apex crest, 477662008 188,1003)  ≈ 0.10 /m — vaulted at 10 m/s
//   dip 2 (mid-run station corner, 2840746967 −169,−625)    0.074 /m — "unacceptable", bottomed out
//   dip 3 (junction-blend sag, 2840746967 1762,−616)       ≤ 0.021 /m — "fun and fair", must stay
//
// It is a TRIPWIRE, not a fix, and a CEILING (like bore-junction-clearance): the first full scan
// (2026-10-26, after the BUG-90 fixes) found 218 spots over 0.03 /m in ~245 km — down from 279 on main
// — and ~200 of them sit within 40 m of a node, mostly a one-wheel-track sag of 0.03–0.10 /m at
// junction speed. Whether those are fair is the owner's call (ticket BUG-97), so they are PINNED, not
// failed: the counts may not grow, and nothing may get sharper than the line each zone holds today.
//   OPEN ROAD — run samples ≥ JN_ZONE m from both run ends: you arrive at speed, so dip 2's class must
//               never recur here: κ ≤ OPEN_KMAX (under dip 2's 0.074).
//   JUNCTION  — < JN_ZONE m from a run end, plus every deg-2 connector line: κ ≤ JN_KMAX (main had
//               0.19 /m at the seed-7 and seed-11 orphaned-T hairpins, 0.12 at seed-3's bank crest).
// Each window drives every run on three wheel tracks (−2.5, 0, +2.5 m) and every deg-2 connector on
// three lines through its fillet. Bores are skipped: inside one analyticHeight is the hill's skin, not
// the deck (the tube floor is its own collider — road-tunnel.mjs owns it).
//
// Run: node test/vertical-curvature.mjs [--report]   (exit 0 = every ceiling holds)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed } from '../src/seed.js'

const KFLAG = 0.03       // 1/m — counted as a kink (R 33 m; between dip 3 and dip 2)
const OPEN_KMAX = 0.07   // 1/m — hard line on open road
const JN_KMAX = 0.11     // 1/m — hard line in junction zones
const CEIL = { open: 17, junction: 200 }   // kink counts over KFLAG at 2026-10-26 — may only go DOWN
const JN_ZONE = 40       // m from a run end
const WB = 2.85          // m — Ranger wheelbase: the span the chassis bridges
const DS = 0.5
const W = Math.round(WB / DS)
const LANES = [-2.5, 0, 2.5]
const REPORT = process.argv.includes('--report')

// The owner's capture worlds are built the way the game builds them (water no-go wired), so the
// network matches the drive.
const captureWorld = (seed, cx, cz) => () => {
  const ws = parseWorldSeed(seed)
  const { rawHeightWorld } = makeTerrainHeadless(ws, P, null)
  const water = new WaterSystem(ws, P, rawHeightWorld)
  const road = new RoadSystem(ws, P)
  road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (a, b, c, d) => {
    const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o })
  road.update(new THREE.Vector3(cx, 0, cz))
  return road
}
const windows = [
  ...WINDOWS.filter(w => ['seed6 origin', 'seed3 origin', 'seed7 origin', 'seed20 origin', 'seed11 origin'].includes(w.name))
    .map(w => ({ name: w.name, seed: w.seed, build: () => buildWindow(w, P) })),
  { name: 'BUG-90 dip 1 world', seed: '477662008', build: captureWorld('477662008', 197, 999) },
  { name: 'BUG-90 dip 2 world', seed: '2840746967', build: captureWorld('2840746967', -169, -625) },
  { name: 'BUG-90 dip 3 world', seed: '2840746967', build: captureWorld('2840746967', 1762, -616) },
]

// Drive a polyline of {x,z}, resampled at DS and offset `off` m to its left. `zoneOf(s, L)` names the
// zone at arc s; `skip(x, z, y)` drops a sample from every window it is in (a bore).
function scanLine(line, off, h, skip, zoneOf, hits) {
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z))
  const L = cum.at(-1), pts = []
  for (let s = 0, j = 0; s <= L; s += DS) {
    while (j < cum.length - 2 && cum[j + 1] < s) j++
    const t = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1)
    pts.push({ s, x: line[j].x + t * (line[j + 1].x - line[j].x), z: line[j].z + t * (line[j + 1].z - line[j].z) })
  }
  const y = [], bad = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 3)], b = pts[Math.min(pts.length - 1, i + 3)]
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const x = pts[i].x + (b.z - a.z) / l * off, z = pts[i].z - (b.x - a.x) / l * off
    y.push(h(x, z)); bad.push(skip(pts[i].s, x, z, y[i]))
  }
  let n = 0
  for (let i = W; i < y.length - W; i++) {
    let skipped = false
    for (let j = i - W; j <= i + W && !skipped; j++) skipped = bad[j]
    if (skipped) continue
    n++
    const k = ((y[i + W] - y[i]) - (y[i] - y[i - W])) / (WB * WB)
    if (Math.abs(k) <= KFLAG) continue
    const q = { x: pts[i].x, z: pts[i].z, k, off, zone: zoneOf(pts[i].s, L) }
    const near = hits.find(o => Math.hypot(o.x - q.x, o.z - q.z) < 15)
    if (!near) hits.push(q)
    else if (Math.abs(k) > Math.abs(near.k)) Object.assign(near, q)
  }
  return n
}

let fail = 0, samples = 0
const all = []
for (const Wn of windows) {
  const road = Wn.build()
  const terr = makeTerrainHeadless(parseWorldSeed(Wn.seed), P, road)
  road._detectNodeJunctions()
  const h = (x, z) => terr.analyticHeight(x, z)
  const hits = []
  for (const [key, e] of road._network) {
    const L = e.polyCum?.at(-1); if (!(L > 2 * WB)) continue
    const line = []
    for (let s = 0; s <= L; s += 2) line.push(road.runPointAt(key, s))
    const spans = e.tunnelSpans
    const inBore = spans ? (s) => spans.some(sp => s >= sp.s0 && s <= sp.s1) : () => false
    for (const off of LANES) samples += scanLine(line, off, h, inBore, (s, L) => Math.min(s, L - s) < JN_ZONE ? 'junction' : 'open', hits)
  }
  // A connector carries no span list of its own; a lead-in that runs into a portal shows as the hill's
  // skin standing over the deck it draws.
  const connBore = (s, x, z, y) => { const d = road.sampleRoadTopY(x, z); return d != null && y - d > 0.5 }
  for (const node of road._nodeJunctions.values()) {
    const arc = node.deg2
    if (!arc?.points || arc.points.length < 3) continue
    for (const off of LANES) samples += scanLine(arc.points, off, h, connBore, () => 'junction', hits)
  }
  for (const q of hits) q.win = Wn.name
  all.push(...hits)
  console.log(`  ${Wn.name}: open ${hits.filter(q => q.zone === 'open').length}, junction ${hits.filter(q => q.zone === 'junction').length} kink(s) over ${KFLAG} /m`)
}
const fmt = (q) => `${q.k > 0 ? 'sag  ' : 'crest'} ${Math.abs(q.k).toFixed(3)} /m (${q.k > 0 ? '+1 g' : 'lift-off'} at ${Math.sqrt(9.81 / Math.abs(q.k)).toFixed(1)} m/s) @ ${q.win} (${q.x.toFixed(1)}, ${q.z.toFixed(1)}) track ${q.off}`
for (const [zone, kmax] of [['open', OPEN_KMAX], ['junction', JN_KMAX]]) {
  const zs = all.filter(q => q.zone === zone).sort((a, b) => Math.abs(b.k) - Math.abs(a.k))
  const worst = zs[0] ? Math.abs(zs[0].k) : 0
  const okK = worst <= kmax, okN = zs.length <= CEIL[zone]
  if (!okK) fail++
  if (!okN) fail++
  console.log(`[${okK ? 'PASS' : 'FAIL'}] ${okK ? '✓' : '✗'} ${zone}: sharpest ${worst.toFixed(3)} /m (line ${kmax})${zs[0] ? ' — ' + fmt(zs[0]) : ''}`)
  console.log(`[${okN ? 'PASS' : 'FAIL'}] ${okN ? '✓' : '✗'} ${zone}: ${zs.length} kink(s) over ${KFLAG} /m (ceiling ${CEIL[zone]}${zs.length < CEIL[zone] ? ' — lower CEIL to ' + zs.length : ''})`)
  for (const q of zs.slice(0, REPORT ? 400 : 3)) console.log('      ' + fmt(q))
}
if (!samples) { console.log('[FAIL] ✗ sampled nothing'); fail++ }
console.log(`\n${fail ? 'FAIL' : 'PASS'}: ${samples} samples over ${windows.length} windows`)
process.exit(fail ? 1 : 0)
