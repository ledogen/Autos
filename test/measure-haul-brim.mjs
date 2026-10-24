// FEAT-138 — measure a BRIMMING stock-Ranger bed of firewood: the haul S count (owner, 2026-10-21:
// "it should be brimming for S tier — I bet you could fit 22–26 pieces in the bed").
//
// Not a gate: a rainy-day measurement whose answer is written into economy.js RANK_TABLE.haul.firewood.
// Re-run it when the bed, the bundle models or the loader change.
//
// Method: the game's own loader (haul-rig.mjs — bedDropPoints, the _haulStep drop height and stagger,
// a truck parked squarely over the zone, inBedWell as the count settle pays on). For each N, drop N
// bundles, let them settle 3 s, and read every seed's count aboard and how high the heap's top piece
// sits over the rail.
//
// BRIMMING = the largest N whose heap stays within HALF A BUNDLE of the rail on every seed: full to
// the rails with one layer peeking over, not mounded. (inBedWell alone can't say it — it counts a
// piece up to 0.6 m over the rail, so its count never plateaus below ~40.) S = the median aboard at
// that N. Measured 2026-10-22: the bed is full to the rail at ~20–21; N 26 brims (tops 0.06–0.16 m),
// N 28 mounds (to 0.34 m) → S = 25.
//
// Run: node test/measure-haul-brim.mjs

import * as THREE from 'three'
import { truck, useGameHulls, load, BED } from './lib/haul-rig.mjs'
import { inBedWell } from '../src/debris.js'

const SEEDS = 5
const HALF_BUNDLE = 0.165   // m — half a bundle lying down (0.33 m, haul-load.mjs SIZE)
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

await useGameHulls()
let brim = null
for (let n = 16; n <= 32; n += 2) {
  const counts = [], tops = []
  for (let k = 0; k < SEEDS; k++) {
    const t = await truck()
    load(t, n, `brim:${n}:${k}`)
    const cp = new THREE.Vector3(), cq = new THREE.Quaternion(), p = new THREE.Vector3(), q = new THREE.Quaternion()
    t.engine.getTransform(t.chassis, cp, cq)
    cq.invert()
    const over = []
    for (const r of t.live) {
      t.engine.getTransform(r.body, p, q)
      const l = p.sub(cp).applyQuaternion(cq)
      if (inBedWell(l, BED)) over.push(l.y - BED.railY)
    }
    counts.push(over.length)
    tops.push(Math.max(...over))
    t.engine.dispose()
  }
  const brims = tops.every(y => y <= HALF_BUNDLE)
  if (brims) brim = { n, s: median(counts) }
  console.log(`  N ${String(n).padStart(2)}: aboard ${counts.join(' ')} (median ${median(counts)})  ` +
    `top over rail ${tops.map(y => y.toFixed(2)).join(' ')}  ${brims ? 'brims' : 'MOUNDS'}`)
}
console.log(brim ? `brimming at N ${brim.n} → S = ${brim.s}` : 'no N brims — check the rig')
