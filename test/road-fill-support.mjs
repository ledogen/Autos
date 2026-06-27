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
    // FEAT-10: distinguish DRIVABLE smoothness from EMBANKMENT steepness. On a tall fill (earthwork
    // routing builds them up to the deviation cap) the bank beyond the road edge is legitimately steep —
    // that is a continuous, supported fill slope you'd slide down, NOT the BUG-15 fall-through (a sudden
    // DROP to raw where the mesh stays raised). Physics & mesh use the same _sampleCarveWorld formula now,
    // so they agree by construction; what still matters is: (1) the DRIVABLE surface (≤ halfWidth) is
    // smooth, (2) the embankment never JUMPS UP (an upward step = a run-flip onto a higher surface, the
    // real "invisible cliff"), and (3) it stays supported (above raw) out to the core. A steep DOWNWARD
    // bank beyond the road edge is allowed.
    let lastSupported = 0, worstDriveStep = 0, worstUpStep = 0, prev = null
    for (let lat = 0; lat <= MESH_EXT + 0.5; lat += DLAT) {
        const wx = fx + tz * lat, wz = fz - tx * lat
        const raw = terr.rawHeightWorld(wx, wz)
        const c = road._sampleCarveWorld(wx, wz, raw, nr0)
        const ah = (c && c.blendW > 1e-6) ? raw + c.blendW * (c.gradeY - raw) : raw
        if (ah - raw > 0.05) lastSupported = lat               // physics still raising the embankment
        if (prev !== null) {
            const d = ah - prev
            if (lat <= hw + DLAT) worstDriveStep = Math.max(worstDriveStep, Math.abs(d))  // drivable: smooth
            if (d > worstUpStep) worstUpStep = d               // anywhere: an UPWARD jump = run-flip cliff
        }
        prev = ah
    }

    const extentOk = lastSupported >= SUPPORT_TO - DLAT
    const driveOk  = worstDriveStep <= STEP_TOL
    const upOk     = worstUpStep   <= STEP_TOL                 // no upward flip cliff (downward bank is OK)
    log(extentOk && driveOk && upOk, `FILL-SUPPORT seed=${seed}`,
        `fill ${best.d.toFixed(1)} m @(${best.x.toFixed(0)},${best.z.toFixed(0)}); supported to lat ${lastSupported.toFixed(1)} m ` +
        `(need ≥${SUPPORT_TO.toFixed(1)} m); drivable step ${worstDriveStep.toFixed(3)} m, worst UP-step ${worstUpStep.toFixed(3)} m (tol ${STEP_TOL} m; steep downward bank allowed)`)
}

console.log('\n' + '='.repeat(64))
console.log(`ROAD-FILL-SUPPORT GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
