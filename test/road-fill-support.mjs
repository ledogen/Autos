// test/road-fill-support.mjs — fill-embankment physics support gate (BUG-15, fill side).
//
// GUARDS "THE CAR FALLS THROUGH THE SHOULDER RAISED TO MEET THE ROAD". On a fill (road grade ABOVE
// terrain), the terrain MESH carve (terrain.js _buildCarveTable) raises a dirt embankment out to
// carveHalfWidth + shoulderWidth (carveHalfWidth = halfWidth + carveExtraWidth, capped at minRadius).
// The physics carve (_sampleCarveWorld / _resolveRoadSurface) used to cap its footprint at the NARROWER
// halfWidth + shoulderWidth, so the band between the two extents was raised mesh with no collision
// support → the car dropped through it. The fix widens the physics footprint + blend core to match the
// mesh. This gate asserts, at the strongest fill spot on real-noise roads, that:
//   (1) the physics surface stays supported (above raw terrain) out to ~the mesh carve extent, and
//   (2) the supported surface is continuous (no fall-through step) across the footprint.
//
// RED on the pre-fix code (physics collapses to raw at halfWidth+shoulder = 7.5 m while the mesh holds
// to 10.5 m); GREEN once the footprints match.
//
// Run: node test/road-fill-support.mjs   (exit 0 = fill embankment is physics-supported)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS   = [6, 7]
const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
const carveHW   = Math.min(hw + (RANGER_PARAMS.roadCarveExtraWidth ?? 3.0), RANGER_PARAMS.roadMinTurnRadius ?? 12)
const MESH_EXT  = carveHW + sw          // the mesh's raised-embankment lateral extent
const DLAT      = 0.2
const SUPPORT_TO = carveHW              // physics must stay supported out to at least the blendW=1 core
// Max analyticHeight step. The intended road-edge dropoff (roadClearanceMargin, BUG-15) is the largest
// allowed; the raw embankment toe's own steepness stays under it.
const STEP_TOL   = (RANGER_PARAMS.roadClearanceMargin ?? 0.25) + 0.05

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))
    const terr = makeTerrainHeadless(seed, RANGER_PARAMS, road)

    // Strongest fill spot: road centerline grade highest above raw terrain.
    let best = null
    for (const [runKey, entry] of road._network) {
        const pts = entry.points
        for (let i = 2; i < pts.length - 2; i += 3) {
            const d = pts[i].y - terr.rawHeightWorld(pts[i].x, pts[i].z)
            if (d > (best?.d ?? 2.0)) best = { d, x: pts[i].x, z: pts[i].z, runKey }
        }
    }
    if (!best) { log(true, `FILL-SUPPORT seed=${seed}`, 'no fill ≥2 m on this network — skipped'); continue }

    const nr0 = road._resolveRoadSurface(best.x, best.z)
    const tx = nr0.tangent.x, tz = nr0.tangent.z, fx = nr0.point.x, fz = nr0.point.z

    // Measure THIS run's own fill cross-section: pin the projection to the station foot (nr0) so the
    // lateral march can't snap to a NEIGHBOUR run. (At parallel/stacked-road overlaps a free re-resolve
    // jumps to the closer road at a different height — a real but SEPARATE defect, COVER/FEAT-10 route
    // merge, not the fill fall-through under test.) analyticHeight = raw + blendW·(gradeY − raw).
    let lastSupported = 0, worstStep = 0, prev = null
    for (let lat = 0; lat <= MESH_EXT + 0.5; lat += DLAT) {
        const wx = fx + tz * lat, wz = fz - tx * lat
        const raw = terr.rawHeightWorld(wx, wz)
        const c = road._sampleCarveWorld(wx, wz, raw, nr0)
        const ah = (c && c.blendW > 1e-6) ? raw + c.blendW * (c.gradeY - raw) : raw
        if (ah - raw > 0.05) lastSupported = lat               // physics still raising the embankment
        if (prev !== null) worstStep = Math.max(worstStep, Math.abs(ah - prev))
        prev = ah
    }

    const extentOk = lastSupported >= SUPPORT_TO - DLAT
    const stepOk   = worstStep <= STEP_TOL
    log(extentOk && stepOk, `FILL-SUPPORT seed=${seed}`,
        `fill ${best.d.toFixed(1)} m @(${best.x.toFixed(0)},${best.z.toFixed(0)}); physics supported to lat ${lastSupported.toFixed(1)} m ` +
        `(need ≥${SUPPORT_TO.toFixed(1)} m, mesh extent ${MESH_EXT.toFixed(1)} m); worst |Δheight| ${worstStep.toFixed(3)} m (tol ${STEP_TOL} m)`)
}

console.log('\n' + '='.repeat(64))
console.log(`ROAD-FILL-SUPPORT GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
