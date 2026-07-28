// test/region-radius-curve.mjs — PERF-27 item 3: what does the story region's warm radius cost?
//
// The measured problem (see the ticket): story entry on an UNBAKED seed spends 32.6 s at 4× routing
// the 2800 m region warm behind the loading screen. Every option for fixing that trades play area
// or freeze simplicity against entry latency, and none of them can be picked without knowing the
// shape of the curve — so this measures it directly, node-side and headless.
//
// For each radius it reports the in-band edge count (the exact set warmBand routes — same derivation
// as test/bake-route-bundle.mjs) and, on a random sample, the mean synchronous route cost. Sampling
// matters: "cost ∝ edge count" is only true if outer edges are no more expensive than inner ones,
// and that is an assumption worth testing rather than asserting — outer edges sit in terrain the
// router has not already solved around.
//
// Cost here is single-threaded node ms. The browser spreads it over a 2–4 worker pool
// (road-worker.js defaultPoolSize), so treat these as RELATIVE weights between radii, not as
// predicted entry times.
//
// USAGE: node test/region-radius-curve.mjs --seed=811 --sample=14
// Not a gate.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=').slice(1).join('=') : d }
const SEED_STR = flag('seed', '811')
const SAMPLE = Number(flag('sample', 14))
const RADII = flag('radii', '1000,1400,1800,2200,2800').split(',').map(Number)

const SEED = parseWorldSeed(SEED_STR)
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (minX, minZ, maxX, maxZ) => {
        const discs = []
        for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return discs
    }
)

const ss = seedFor(SEED, 'spawn')
const baseX = ((ss & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseZ = (((ss >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200

// The in-band edge set warmBand(radius) would route — copied from test/bake-route-bundle.mjs so the
// two stay comparable. Counting is pure graph work: no routing happens here.
function inBandEdges (radius) {
    // setRadius FIRST: _bandHalfWidth() is read off the live radius, so without this the band stays
    // at the default render width and only grows in z — which understates every outer ring.
    road.setRadius(radius)
    const cmx = Math.floor(baseX / 256), HW = road._bandHalfWidth()
    const PM = 2
    const g = road._buildUrquhart(cmx - HW - PM, cmx + HW + PM,
        Math.floor((baseZ - radius) / 256) - PM, Math.ceil((baseZ + radius) / 256) + PM, false)
    const wx0 = (cmx - HW - PM) * 256, wx1 = (cmx + HW + PM + 1) * 256
    const wz0 = (Math.floor((baseZ - radius) / 256) - PM) * 256
    const wz1 = (Math.ceil((baseZ + radius) / 256) + PM + 1) * 256
    const inBand = (c) => { const p = road._nodePos(c); return p.x >= wx0 && p.x < wx1 && p.z >= wz0 && p.z < wz1 }
    return g.edges.filter(([c1, c2]) => inBand(c1) || inBand(c2))
}

// Deterministic sample (no Math.random — same edges every run, so two runs are comparable).
const pick = (arr, n) => {
    if (arr.length <= n) return arr
    const step = arr.length / n
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)])
}

console.log(`\n▶ region warm radius curve — seed ${SEED_STR}` +
            `   (story today: REGION_RADIUS_M ${REGION_RADIUS_M} → warm ${REGION_WARM_RADIUS_M})\n`)
console.log('  radius   edges   Δedges   sample   mean ms/edge   est. total s (1 thread)')

const rows = []
let prevCount = 0, prevKeys = new Set()
for (const R of RADII) {
    const edges = inBandEdges(R)
    const keys = new Set(edges.map(([a, b]) => `${a}|${b}`))
    // Sample only edges this radius ADDS, so the mean reflects the marginal ring, not the core.
    const fresh = edges.filter(([a, b]) => !prevKeys.has(`${a}|${b}`))
    const sample = pick(fresh, SAMPLE)
    let ms = 0
    for (const [c1, c2] of sample) { const t = process.hrtime.bigint(); road._edgeCenterline(c1, c2); ms += Number(process.hrtime.bigint() - t) / 1e6 }
    const per = sample.length ? ms / sample.length : 0
    rows.push({ radius: R, edges: edges.length, added: edges.length - prevCount, sampled: sample.length, msPerEdge: +per.toFixed(1) })
    console.log(`  ${String(R).padStart(5)} m ${String(edges.length).padStart(7)} ${String(edges.length - prevCount).padStart(8)}` +
                ` ${String(sample.length).padStart(8)} ${per.toFixed(1).padStart(13)}`)
    prevCount = edges.length; prevKeys = keys
}

// Weight each ring by its own measured per-edge cost, so a ring of expensive mountain edges is not
// hidden by a cheap core.
let cum = 0
console.log('\n  cumulative single-thread routing cost, by warm radius:')
for (const r of rows) { cum += r.added * r.msPerEdge; r.cumSec = +(cum / 1000).toFixed(1); console.log(`  ${String(r.radius).padStart(5)} m   ${r.cumSec.toFixed(1)} s   (${r.edges} edges)`) }

const full = rows[rows.length - 1]
console.log(`\n  Relative to today's ${full.radius} m warm:`)
for (const r of rows) console.log(`  ${String(r.radius).padStart(5)} m → ${((r.cumSec / full.cumSec) * 100).toFixed(0)}% of the routing work, ${((r.radius / full.radius) * 100).toFixed(0)}% of the radius, ${(((r.radius / full.radius) ** 2) * 100).toFixed(0)}% of the area`)
console.log()
