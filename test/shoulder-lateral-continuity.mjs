// test/shoulder-lateral-continuity.mjs — lateral carve continuity gate (BUG-15).
//
// GUARDS THE "WHEEL AIRBORNE+SLAM AT THE ROAD↔TERRAIN THRESHOLD IN HAIRPINS" BUG. The physics carve
// surface (_sampleCarveWorld) folds the road crown + camber in across the ribbon, then blends to raw
// terrain across the shoulder band [halfWidth, halfWidth+shoulderWidth]. The old code applied crown/
// camber ONLY for latDist < halfWidth and dropped them at the edge, so on a banked section the ribbon's
// raised outer edge (±halfWidth·sin(camber), ≈0.5 m at the ±6° hairpin camber clamp) fell off a vertical
// cliff into the shoulder → wheel loses contact → slams down on re-contact. The fix carries the edge-
// clamped crown/camber through the shoulder so the surface is C0 across the threshold.
//
// This gate marches LATERALLY (perpendicular to the road) across the full footprint at many on-road
// points on real-noise roads and asserts the carve height has no step between adjacent lateral samples.
// The existing carve gates (ribbon-carve, road-smoothness) only check LONGITUDINAL continuity — this is
// the lateral blind spot that let BUG-15 persist.
//
// RED on the pre-fix code (~0.52 m lateral step at a banked hairpin); GREEN once crown/camber are
// carried across the shoulder.
//
// Run: node test/shoulder-lateral-continuity.mjs   (exit 0 = lateral carve is continuous)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS    = [6, 7]          // real-noise networks (seed 6 = the reported hairpin's world)
const DLAT     = 0.2             // m — lateral march step
const STEP_TOL = 0.10            // m — max allowed carve-height step between adjacent lateral samples
const ARC_DS   = 8               // m — along-run sampling spacing

const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
const LAT_MAX = hw + sw          // sweep the full footprint (ribbon + shoulder)

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))

    let worst = 0, worstAt = null, samples = 0
    for (const [runKey, entry] of road._network) {
        const pts = entry.points
        if (!pts || pts.length < 3) continue
        // March along the run polyline; at each station sweep perpendicular across the footprint.
        let acc = 0
        for (let i = 1; i < pts.length - 1; i++) {
            acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
            if (acc < ARC_DS) continue
            acc = 0
            const tx = pts[i + 1].x - pts[i - 1].x, tz = pts[i + 1].z - pts[i - 1].z
            const tl = Math.hypot(tx, tz) || 1
            const px = tz / tl, pz = -tx / tl       // right perpendicular
            const fx = pts[i].x, fz = pts[i].z
            // Measure THIS run's own lateral cross-section at a FIXED arc station (the ticket's
            // acceptance: "at a fixed on-road arcS, sweep lateral offset"). Pin the projection to the
            // station foot (nr0) so re-resolution can't snap to a different arc — at a hairpin a long
            // run folds back on itself (two arms <15 m apart, ~700 m apart in arcS), and a free
            // re-projection would jump between arms (real cross-arm geometry, not a shoulder tear the
            // wheel on THIS arm feels). The pinned hint isolates the single cross-section under test.
            const nr0 = road._resolveRoadSurface(fx, fz)
            if (!nr0 || (nr0.runKey ?? '') !== runKey) continue
            // Sweep one side (the banked OUTER edge is the failure side; cover both via ±).
            for (const sgn of [1, -1]) {
                let prev = null
                for (let lat = 0; lat <= LAT_MAX + 1e-6; lat += DLAT) {
                    const c = road._sampleCarveWorld(fx + sgn * px * lat, fz + sgn * pz * lat, 0, nr0)
                    if (!c) { prev = null; continue }
                    if (prev !== null) {
                        const step = Math.abs(c.gradeY - prev)
                        samples++
                        if (step > worst) { worst = step; worstAt = { x: +fx.toFixed(0), z: +fz.toFixed(0), lat: +lat.toFixed(1) } }
                    }
                    prev = c.gradeY
                }
            }
        }
    }
    log(worst <= STEP_TOL, `LATERAL-CONTINUOUS seed=${seed}`,
        `${samples} lateral steps checked across ${road._network.size} runs; worst |Δheight| = ${worst.toFixed(3)} m at ${worstAt ? `(${worstAt.x},${worstAt.z}) lat ${worstAt.lat} m` : 'n/a'} (tol ${STEP_TOL} m, step ${DLAT} m)`)
}

console.log('\n' + '='.repeat(64))
console.log(`SHOULDER-LATERAL-CONTINUITY GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
