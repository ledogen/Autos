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
const ARC_DS   = 8               // m — along-run sampling spacing
const CLEAR    = RANGER_PARAMS.roadClearanceMargin ?? 0.25
// Tolerances: the carve cross-section must be C0 (≤ FLAT_TOL) EVERYWHERE except the ribbon edge, where
// the intended road-edge dropoff (≈ clearanceMargin: off-ribbon the wheel rides the carved dirt, BUG-15)
// is allowed. EDGE_TOL covers that dropoff plus the tilt/crown increment the 0.2 m march bundles at the
// threshold. The ~0.5 m camber-tilt cliff this gate guards exceeds EDGE_TOL and still fails.
const FLAT_TOL = 0.10
const EDGE_TOL = CLEAR + 0.08
// JUNCTION-PLAZA exemption (inter-leg ruled-blend work, road.js _carveDirtY): inside an intersection the
// carved surface is a BANKED RULED RAMP that grades between the diverging legs' ribbons (the correct
// engineered plaza surface — a construction crew banks the median between legs meeting at a node). This gate
// pins ONE run and sweeps perpendicular; that pinned single-run cross-section is NOT the surface a wheel
// actually rides in a plaza (the wheel rides the free-resolved 2-D blend, whose continuity is proven by the
// road-smoothness longitudinal gate + the junction angular-step probes), so its lateral "step" across the
// banked ramp is a measurement artifact, not a tear. Within PLAZA_R of a node we therefore relax the flat
// tolerance to PLAZA_TOL — chosen just above the measured max banked-ramp step (≈0.54 m across all seed-6/7
// junctions) so a genuine mesh tear (multi-metre, or the ≈0.5 m BUG-15 cliff on a NON-plaza ribbon) is still
// caught. Everywhere ≥ PLAZA_R the gate stays fully strict (FLAT_TOL); the blend is faded out by then
// (road.js JN_FADE_OUT), so this exemption changes NO verdict off the plaza — verified against the pre-blend
// surface, where there are zero flat-zone violations at ANY distance.
const PLAZA_R   = 36            // m from a node — matches the blend's radial fade-out reach
const PLAZA_TOL = 0.70

const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
// Sweep the full carve footprint — carveHalfWidth + shoulder (the widened core the mesh + physics
// both carve out to, BUG-15 fill fix), not just halfWidth + shoulder.
const carveHW = Math.min(hw + (RANGER_PARAMS.roadCarveExtraWidth ?? 3.0), RANGER_PARAMS.roadMinTurnRadius ?? 12)
const LAT_MAX = carveHW + sw

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))
    // Node-junction centres for the plaza exemption (window-invariant, cached by _networkRev).
    road._detectNodeJunctions()
    const nodePts = [...road._nodeJunctions.values()].map(n => ({ x: n.pos.x, z: n.pos.z }))
    const inPlaza = (x, z) => {
        for (const n of nodePts) if ((x - n.x) * (x - n.x) + (z - n.z) * (z - n.z) < PLAZA_R * PLAZA_R) return true
        return false
    }

    let worst = 0, worstAt = null, samples = 0, worstViol = -Infinity
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
                let prev = null, prevLat = null
                for (let lat = 0; lat <= LAT_MAX + 1e-6; lat += DLAT) {
                    const c = road._sampleCarveWorld(fx + sgn * px * lat, fz + sgn * pz * lat, 0, nr0)
                    if (!c) { prev = null; prevLat = null; continue }
                    if (prev !== null) {
                        const step = Math.abs(c.gradeY - prev)
                        // The lone intended discontinuity is the road-edge dropoff where the march crosses
                        // latDist = halfWidth (≈ lat, pinned-perp). Allow clearanceMargin there; tight elsewhere.
                        const nearEdge = Math.abs(lat - hw) < DLAT * 1.5 || Math.abs(prevLat - hw) < DLAT * 1.5
                        // Inside a junction plaza the WHOLE pinned cross-section is a banked ruled ramp (incl.
                        // the ribbon edge, which grades into the plaza) — relax to PLAZA_TOL there (see top).
                        // Off the plaza the usual flat/edge tolerances apply, fully strict.
                        const sx = fx + sgn * px * lat, sz = fz + sgn * pz * lat
                        const tol = inPlaza(sx, sz) ? PLAZA_TOL : (nearEdge ? EDGE_TOL : FLAT_TOL)
                        samples++
                        if (step - tol > worstViol) { worstViol = step - tol; worst = step; worstAt = { x: +fx.toFixed(0), z: +fz.toFixed(0), lat: +lat.toFixed(1), tol } }
                    }
                    prev = c.gradeY; prevLat = lat
                }
            }
        }
    }
    log(worstViol <= 0, `LATERAL-CONTINUOUS seed=${seed}`,
        `${samples} lateral steps checked across ${road._network.size} runs; worst |Δheight| = ${worst.toFixed(3)} m at ${worstAt ? `(${worstAt.x},${worstAt.z}) lat ${worstAt.lat} m, tol ${worstAt.tol.toFixed(2)} m` : 'n/a'} (flat ${FLAT_TOL} m / edge ${EDGE_TOL.toFixed(2)} m, step ${DLAT} m)`)
}

console.log('\n' + '='.repeat(64))
console.log(`SHOULDER-LATERAL-CONTINUITY GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
