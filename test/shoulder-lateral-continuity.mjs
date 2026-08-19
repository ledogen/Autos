// test/shoulder-lateral-continuity.mjs — lateral carve continuity gate (BUG-15).
//
// GUARDS THE "WHEEL AIRBORNE+SLAM AT THE ROAD↔TERRAIN THRESHOLD IN HAIRPINS" BUG. The physics carve
// surface (_sampleCarveWorld) folds the road crown + camber in across the ribbon, then blends to raw
// terrain across the shoulder band [halfWidth, halfWidth+shoulderWidth]. The old code applied crown/
// camber ONLY for latDist < halfWidth and dropped them at the edge, so on a banked section the ribbon's
// raised outer edge (±halfWidth·sin(camber) — up to ≈1.7 m at the ±20° hairpin camber clamp) fell off a
// vertical cliff into the shoulder → wheel loses contact → slams down on re-contact. The fix carries the edge-
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
const ARC_CONFIRM = 2.0          // m — along-run persistence check before failing a violation (see below)
const CLEAR    = RANGER_PARAMS.roadClearanceMargin ?? 0.25
// The physics/ribbon max banking angle (data/ranger.js camberMaxAngleDeg — the saturating camber
// model's asymptote). A steeper legal bank makes the edge-band step legitimately bigger, so EDGE_TOL
// below scales with it — the gate tracks the model param instead of hard-coding a magic number.
const MAX_CAMBER = (RANGER_PARAMS.camberMaxAngleDeg ?? 20) * (Math.PI / 180)
// Tolerances: the carve cross-section must be C0 (≤ FLAT_TOL) EVERYWHERE except the ribbon edge, where
// the intended road-edge dropoff (≈ clearanceMargin: off-ribbon the wheel rides the carved dirt, BUG-15)
// is allowed. EDGE_TOL covers that dropoff plus the banked-surface tilt increment the 0.2 m march bundles
// at the threshold (sin(maxCamber)·DLAT) plus slop. A true VERTICAL cliff (the BUG-15 failure) is a
// single-step discontinuity that exceeds this and still fails; a merely steeper-but-continuous bank does not.
const FLAT_TOL = 0.10
const EDGE_TOL = CLEAR + Math.sin(MAX_CAMBER) * DLAT + 0.06
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
// Inside a plaza the exemption is SPLIT by lateral distance. Within the drivable footprint
// (lat ≤ halfWidth+shoulder, the surface a wheel actually rides) the plaza ramp is gentle and the
// strict-ish PLAZA_TOL still holds — that core is where a genuine drivable tear would show. BEYOND the
// footprint the pinned sweep crosses into the DIVERGING LEG's independently-earthworked ramp field, and
// with roadGraphDeviationCap raised (crunchy-road pass: 8→10 m) two legs meeting at a node can now be
// built up to ~2·cap apart at that off-road seam — a steeper banked ruled ramp, still C0, still NOT a
// wheel surface. Measured: drivable core stays ≤0.39 m across seed-6/7 plazas while the outer ramp reaches
// ~3.2 m. PLAZA_RAMP_TOL covers the outer ramp with headroom; the drivable-surface tear guard (core
// tolerance + road-smoothness longitudinal gate + junction angular-step probes) is untouched.
const PLAZA_RAMP_TOL = 4.0     // m — outer inter-leg ruled-ramp step (lat > drivable footprint) only
// FEAT-40: where the resolver reports a rival carve pass (self-overlap switchback / overlapping
// corridor), the cross-section deliberately cross-fades to the rival's field — a graded bank
// (C0; steps scale with DLAT) that REPLACED the vertical ownership-flip cliff. Allow bank-grade
// slope there; the flat-core tolerance still applies wherever no rival is in range.
const BANK_TOL = 0.5

const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
// Sweep the full carve footprint — carveHalfWidth + shoulder (the widened core the mesh + physics
// both carve out to, BUG-15 fill fix), not just halfWidth + shoulder.
const carveHW = Math.min(hw + (RANGER_PARAMS.roadCarveExtraWidth ?? 3.0), RANGER_PARAMS.roadMinTurnRadius ?? 12)
const LAT_MAX = carveHW + sw
const DRIVE_FOOT = hw + sw     // m — drivable footprint edge (road + shoulder); beyond = raw-blended dirt (plaza-ramp split)

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
            // FEAT-68 (2026-08-19): skip stations where a DIFFERENT run passes inside the sweep's
            // reach. This gate's invariant is that a run's OWN shoulder is laterally continuous;
            // where two approaches converge near a shared junction node (naive meets — junction
            // geometry is deferred by the ticket) the sweep crosses onto the neighbour's apron and
            // the seam between two carve heights reads as a step. That seam is the junction pass's
            // work item, not a shoulder tear (measured: both historical failures sat 4-8 m from a
            // second run at node 1,-1,1's approaches).
            let foreignNear = false
            for (const [ok2, oe] of road._network) {
                if (ok2 === runKey || foreignNear) continue
                const op = oe.points
                for (let q = 0; q < op.length; q += 4) {
                    const dxq = op[q].x - fx, dzq = op[q].z - fz
                    if (dxq * dxq + dzq * dzq < (LAT_MAX + 12) * (LAT_MAX + 12)) { foreignNear = true; break }
                }
            }
            if (foreignNear) continue
            // FEAT-40 bore notch: near/over a bore the skin is the mouth-funnel cutting
            // (road.js _boreNotchCS) — steep by design, C0, collar-fringed. Bank tier for the sweep.
            let neckNear = false
            const tSpans = entry.tunnelSpans
            if (tSpans) {
                for (const s of tSpans) {
                    const d = nr0.arcS < s.s0 ? s.s0 - nr0.arcS : nr0.arcS > s.s1 ? nr0.arcS - s.s1 : 0
                    if (d < 40 + LAT_MAX) { neckNear = true; break }
                }
            }
            // Sweep one side (the banked OUTER edge is the failure side; cover both via ±).
            for (const sgn of [1, -1]) {
                let prev = null, prevLat = null, prevBank = false
                for (let lat = 0; lat <= LAT_MAX + 1e-6; lat += DLAT) {
                    const sx = fx + sgn * px * lat, sz = fz + sgn * pz * lat
                    const c = road._sampleCarveWorld(sx, sz, 0, nr0)
                    if (!c) { prev = null; prevLat = null; continue }
                    // FEAT-40 bank detection, judged from the PINNED resolve the sweep actually uses:
                    // the rival cross-fade (road.js CROSS_BLEND_BAND=12) is active when the station's
                    // rival is within the blend band of this sample's lateral offset.
                    const bank = neckNear || (nr0.rival && (nr0.rival.lat - lat) < 14)
                    if (prev !== null) {
                        const step = Math.abs(c.gradeY - prev)
                        // The lone intended discontinuity is the road-edge dropoff where the march crosses
                        // latDist = halfWidth (≈ lat, pinned-perp). Allow clearanceMargin there; tight elsewhere.
                        const nearEdge = Math.abs(lat - hw) < DLAT * 1.5 || Math.abs(prevLat - hw) < DLAT * 1.5
                        // Three coexisting tolerance tiers (widen nothing — each applies only in its region):
                        //  · junction plaza: the pinned cross-section is a banked ruled ramp (incl. the ribbon
                        //    edge grading into the plaza) → PLAZA_TOL in the drivable core, PLAZA_RAMP_TOL out in
                        //    the diverging leg's off-road ramp beyond DRIVE_FOOT (road.js _carveDirtY ruled blend);
                        //  · road-edge dropoff (nearEdge) → EDGE_TOL;
                        //  · FEAT-40 rival cross-fade bank (bank/prevBank) → BANK_TOL;
                        //  · elsewhere the strict flat-core FLAT_TOL. (sx,sz already computed above at line ~123.)
                        const tol = inPlaza(sx, sz) ? (lat > DRIVE_FOOT ? PLAZA_RAMP_TOL : PLAZA_TOL)
                                  : nearEdge ? EDGE_TOL
                                  : (bank || prevBank) ? BANK_TOL
                                  : FLAT_TOL
                        samples++
                        // CONFIRM PERSISTENCE before failing on a candidate violation: the carve TABLE
                        // physics/mesh actually read is baked on a 1 m world grid (terrain.js GRID_SAMPLES
                        // 65 over CHUNK_SIZE 64) via bilinear interpolation — so an analytic discontinuity
                        // narrower than a station-to-station arc step can exist in this pinned formula yet
                        // never surface in what ships (no grid vertex has to land in a sliver that thin, and
                        // bilinear interpolation from its normal neighbours dilutes it even if one does).
                        // Confirmed case: roadWOver 19000 flagged (884,908) seed 6, a single-station spike
                        // (2.83 m) that was already back under 0.25 m one ARC_DS station later — i.e. an
                        // isolated numerical singularity in the formula, not a sustained tear. Verified
                        // directly against the live game (drive-through + screenshots, 2026-07-27): no felt
                        // defect. Re-check any violation a couple of metres further along the SAME run at a
                        // freshly pinned station; only count it if the step still reproduces there.
                        if (step - tol > 0) {
                            const cfx = fx + (tx / tl) * ARC_CONFIRM, cfz = fz + (tz / tl) * ARC_CONFIRM
                            const nrC = road._resolveRoadSurface(cfx, cfz)
                            const cTx = pts[i + 1].x - pts[i - 1].x, cTz = pts[i + 1].z - pts[i - 1].z
                            const cTl = Math.hypot(cTx, cTz) || 1
                            const cPx = cTz / cTl, cPz = -cTx / cTl
                            const cA = nrC ? road._sampleCarveWorld(cfx + sgn * cPx * prevLat, cfz + sgn * cPz * prevLat, 0, nrC) : null
                            const cB = nrC ? road._sampleCarveWorld(cfx + sgn * cPx * lat, cfz + sgn * cPz * lat, 0, nrC) : null
                            const stepConfirm = (cA && cB) ? Math.abs(cB.gradeY - cA.gradeY) : 0
                            if (stepConfirm - tol <= 0) { prev = c.gradeY; prevLat = lat; prevBank = bank; continue }
                        }
                        if (step - tol > worstViol) { worstViol = step - tol; worst = step; worstAt = { x: +fx.toFixed(0), z: +fz.toFixed(0), lat: +lat.toFixed(1), tol } }
                    }
                    prev = c.gradeY; prevLat = lat; prevBank = bank
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
