// test/scratch-par-domain.mjs — rainy-day: distribution of |par centerline length - driven arc| over
// many runs. mission-network allows 0.5 m, fitted from "measured max 0.39 m over a multi-hundred-metre
// run (0.040%)". If the gap is chord-vs-arc SAMPLING it scales with length/curviness and stays a tiny
// fraction; a genuine re-seat shows as tens of metres. This tells a too-tight tolerance from real drift.
// USAGE: node test/scratch-par-domain.mjs [cutMax] [seed ...]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

if (process.argv[2]) P.roadV2.cutMax = Number(process.argv[2])
const SEEDS = process.argv.slice(3).length ? process.argv.slice(3) : ['6', '11', '3', '20']
const rows = []
for (const seed of SEEDS) {
    const road = new RoadSystem(seed, P)
    road.setRadius(1200)
    road.update(new THREE.Vector3(0, 0, 0))
    for (const [, e] of road._network) {
        if (!e.polyCum || !e.cellA || !e.cellB) continue
        const ed = road.edgeParData(e.cellA, e.cellB)
        if (!ed || !ed.centerline) continue
        const Lp = e.polyCum[e.polyCum.length - 1]
        rows.push({ seed, d: Math.abs(ed.centerline.length - Lp), L: Lp, key: ed.key })
    }
}
rows.sort((a, b) => b.d - a.d)
const pct = (p) => rows[Math.min(rows.length - 1, Math.floor(p * rows.length))].d
console.log(`cutMax=${P.roadV2.cutMax}  ${rows.length} runs over ${SEEDS.length} seeds`)
console.log(`  |Lpar - Lpoly|:  max ${rows[0].d.toFixed(3)} m   p99 ${pct(0.01).toFixed(3)}   p95 ${pct(0.05).toFixed(3)}   median ${pct(0.5).toFixed(3)}`)
console.log(`  over 0.5 m: ${rows.filter(r => r.d > 0.5).length}   over 2 m: ${rows.filter(r => r.d > 2).length}   over 10 m: ${rows.filter(r => r.d > 10).length}`)
console.log('  worst 6 (gap, run length, gap as % of length):')
for (const r of rows.slice(0, 6)) console.log(`    ${r.d.toFixed(3).padStart(7)} m   L ${r.L.toFixed(0).padStart(5)} m   ${(100*r.d/r.L).toFixed(4)} %   seed ${r.seed}  ${r.key}`)
