// GATE (BUG-200, DEC-409): a junction's recovery — the blend from the level junction deck back to the road's own grade —
// is held to the design maximum (gMaxRoad 24 %, or the run's own solved grade where that is steeper); the old 38 %
// ceiling pass runs only where no curve meeting the crest/sag rule fits. Grade = a run's steepest 10 m: centred 10 m
// baseline on 5 m samples of the shipped profile (runProfile), the tutorial-seed search's measure.
//   1. seed 688224244's hairpin (#9, the chained fork P at (54, −2547)): every run ending at P ≤ 25 % (38.8 % before).
//   2. CEILINGS on fixed random seeds (pond no-go wired, runs whose steepest 10 m lies within 3000 m of the origin):
//      runs at the 38 % ceiling (≥ 37.5 %) and runs over 30 %. They may only go DOWN; lower them when the gate says so.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const STEP = 5, R = 3000
const SITE = { seed: '688224244', x: 54, z: -2547, max: 25 }
const SEEDS = ['688224244', '282123302', '1070128399']   // the hairpin's seed + the two BUG-200 census seeds with the most runs at the ceiling (18 and 15 before)
const CEIL = { atCeiling: 12, over30: 27 }   // 2026-11-17, DEC-409 as built (43 / 110 before: the old 38 % pass)

function build(seed) {
    const ws = parseWorldSeed(seed), road = new RoadSystem(ws, P)
    wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
    return road
}
// steepest 10 m of a run and where it is
function steepest(road, key) {
    const e = road._network.get(key); if (!e?.polyCum || e.polyCum.length < 2) return null
    const L = e.polyCum.at(-1), o = e.arcOrigin ?? 0, pts = [], y = []
    let j = 0
    for (let s = 0; s <= L; s += STEP) {
        while (j < e.points.length - 2 && e.polyCum[j + 1] < s) j++
        const t = Math.min(1, Math.max(0, (s - e.polyCum[j]) / ((e.polyCum[j + 1] - e.polyCum[j]) || 1)))
        pts.push({ x: e.points[j].x + (e.points[j + 1].x - e.points[j].x) * t, z: e.points[j].z + (e.points[j + 1].z - e.points[j].z) * t })
        y.push(road.runProfile(s - o, key).gradeY)
    }
    let max = 0, at = pts[0]
    for (let i = 1; i < y.length - 1; i++) { const g = Math.abs(y[i + 1] - y[i - 1]) / (2 * STEP); if (g > max) { max = g; at = pts[i] } }
    return { max: 100 * max, at, a: e.points[0], b: e.points.at(-1) }
}

let fail = 0
const ok = (c, msg) => { console.log(`[${c ? 'PASS' : 'FAIL'}] ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++ }
let atCeiling = 0, over30 = 0, runs = 0
for (const seed of SEEDS) {
    const road = build(seed)
    let n37 = 0, n30 = 0, n = 0
    for (const key of road._network.keys()) {
        const r = steepest(road, key); if (!r) continue
        if (seed === SITE.seed && [r.a, r.b].some((p) => Math.hypot(p.x - SITE.x, p.z - SITE.z) < 10))
            ok(r.max <= SITE.max, `hairpin #9 ${key}: steepest 10 m ${r.max.toFixed(1)} % (line ${SITE.max} %) @ (${r.at.x.toFixed(0)}, ${r.at.z.toFixed(0)})`)
        if (Math.hypot(r.at.x, r.at.z) > R) continue
        n++; if (r.max >= 37.5) n37++; if (r.max > 30) n30++
    }
    console.log(`  seed ${seed}: ${n} runs, ${n37} at the ceiling, ${n30} over 30 %`)
    atCeiling += n37; over30 += n30; runs += n
}
for (const [k, v] of [['atCeiling', atCeiling], ['over30', over30]])
    ok(v <= CEIL[k], `${k}: ${v} of ${runs} runs (ceiling ${CEIL[k]}${v < CEIL[k] ? ' — lower CEIL to ' + v : ''})`)
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
