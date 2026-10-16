// test/route-merge.mjs — FEAT-10 merge graph gate.
//
// Asserts the road network registers no degenerate stub (a run shorter than LMIN whose endpoints
// nearly coincide — the collapsed ~27 m connections whose ribbon tore). Pure-headless: one real
// RoadSystem per seed with the shipped RANGER_PARAMS. Collinear-duplicate pairs are REPORTED, not
// asserted. (The merge-off control is gone: its roadNodeMergeRadius param was deleted in QUAL-12,
// so it built the same network twice.) Window-invariance is covered by invariance.mjs.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'

const SEEDS = ['lone-pine', '6', '7']
const LMIN = 40            // m — a "real" overlap span; shorter coincidences are just shared nodes
const SAMPLE = 8           // m — centerline sample pitch for the collinear-overlap test

// Sample a run's points to a flat [x,z,...] with ~SAMPLE pitch (points are already ~4 m apart).
function densify(pts) {
  const out = []
  for (let i = 0; i < pts.length; i++) out.push(pts[i].x, pts[i].z)
  return out
}

// Count how much of run A runs within `band` of run B at near-parallel heading (collinear duplicate).
function collinearOverlap(a, b, band) {
  const band2 = band * band
  let covered = 0, total = 0
  for (let i = 2; i < a.length - 2; i += 2) {
    total += 1
    const ax = a[i], az = a[i + 1]
    const ahx = a[i + 2] - a[i - 2], ahz = a[i + 3] - a[i - 1]
    const al = Math.hypot(ahx, ahz) || 1
    for (let j = 2; j < b.length - 2; j += 2) {
      const dx = b[j] - ax, dz = b[j + 1] - az
      if (dx * dx + dz * dz > band2) continue
      const bhx = b[j + 2] - b[j - 2], bhz = b[j + 3] - b[j - 1]
      const bl = Math.hypot(bhx, bhz) || 1
      const dot = (ahx * bhx + ahz * bhz) / (al * bl)
      if (Math.abs(dot) > 0.95) { covered++; break }   // ~18° = "parallel"
    }
  }
  return covered * SAMPLE   // metres of A that lie on top of B
}

function analyze(seedStr) {
  const road = new RoadSystem(parseWorldSeed(seedStr), RANGER_PARAMS)
  road.update(new THREE.Vector3(0, 0, 0))
  const runs = []
  for (const [k, e] of road._network) {
    if (!e.points || e.points.length < 2) continue
    let len = 0
    for (let i = 1; i < e.points.length; i++) len += Math.hypot(e.points[i].x - e.points[i - 1].x, e.points[i].z - e.points[i - 1].z)
    runs.push({ k, pts: densify(e.points), len })
  }
  // Collinear-duplicate pairs: a meaningful overlap span between two distinct runs.
  let dupPairs = 0
  const band = RANGER_PARAMS.roadMergeBand ?? 24
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const ov = collinearOverlap(runs[i].pts, runs[j].pts, band)
      if (ov >= LMIN) dupPairs++
    }
  }
  // Degenerate stubs: any registered run shorter than LMIN whose endpoints nearly coincide.
  let degenerate = 0
  for (const r of runs) {
    const a = r.pts, n = a.length
    if (r.len < LMIN && Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) < band) degenerate++
  }
  return { runs: runs.length, dupPairs, degenerate }
}

let fail = 0
for (const seed of SEEDS) {
  const r = analyze(seed)
  const pass = r.degenerate === 0
  if (!pass) fail++
  console.log(`${pass ? 'PASS' : 'FAIL'}  seed=${seed.padEnd(10)} runs=${r.runs} degenStubs=${r.degenerate} dupPairs=${r.dupPairs} (report)`)
}

if (fail) { console.error(`\nFAIL: ${fail}/${SEEDS.length} seeds left a degenerate stub.`); process.exit(1) }
console.log('\nPASS: no degenerate stubs.')
