// test/scratch-pond-wet.mjs — rainy-day: WHERE does a centerline enter a pond, and how deep?
// Distinguishes a fit GRAZE (a few m in, at a curve, short arc) from the last-resort WET rung
// (a long run straight through the water) — corridor-router.js `cl ?? first ?? wet`.
// USAGE: node test/scratch-pond-wet.mjs [seed] [cx] [cz]
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEED = Number(process.argv[2] ?? 6)
const CX = Number(process.argv[3] ?? 139), CZ = Number(process.argv[4] ?? 341)
const R = 1600
const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
const ponds = water.pondsNear(CX - R - 500, CZ - R - 500, CX + R + 500, CZ + R + 500)

const road = new RoadSystem(SEED, RANGER_PARAMS)
road.setWaterNoGo(
    (x, z) => water.isRoadNoGo(x, z),
    (minX, minZ, maxX, maxZ) => {
        const d = []
        for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) d.push(p.floorX, p.floorZ, p.radius + p.skirt)
        return d
    })
road.setRadius(R)
road.update(new THREE.Vector3(CX, 0, CZ))

// Depth INSIDE the worst disc at a point (0 = dry, positive = metres past the rim).
const depth = (x, z) => {
    let best = 0
    for (const p of ponds) {
        const rr = p.radius + p.skirt
        const d = Math.hypot(x - p.floorX, z - p.floorZ)
        if (d <= rr) best = Math.max(best, rr - d)
    }
    return best
}

console.log(`seed ${SEED} @(${CX},${CZ})  cutMax=${RANGER_PARAMS.roadV2.cutMax}  cPortal=${RANGER_PARAMS.roadV2.cPortal}  ${ponds.length} ponds`)
for (const [runKey, e] of road._network) {
    let n = 0, maxD = 0, s0 = null, s1 = null
    for (let i = 0; i < e.points.length; i++) {
        const d = depth(e.points[i].x, e.points[i].z)
        if (d <= 0) continue
        n++; maxD = Math.max(maxD, d)
        if (s0 === null) s0 = e.polyCum[i]
        s1 = e.polyCum[i]
    }
    if (!n) continue
    const L = e.polyCum[e.polyCum.length - 1]
    console.log(`  ${runKey}`)
    console.log(`     ${n} wet points · wet arc ${(s1 - s0).toFixed(1)} m of ${L.toFixed(0)} m run · max ${maxD.toFixed(1)} m past the rim`)
    console.log(`     wet from s=${s0.toFixed(0)} to s=${s1.toFixed(0)} · dist to nearer END ${Math.min(s0, L - s1).toFixed(0)} m · offCurveSpans ${JSON.stringify((e.offCurveSpans||[]).map(o=>[o.s0.toFixed(0),o.s1.toFixed(0)]))}`)
}
