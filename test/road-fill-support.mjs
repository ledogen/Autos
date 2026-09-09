// test/road-fill-support.mjs — carve FOOTPRINT gate (BUG-15).
//
// GUARDS "THE CAR FALLS THROUGH THE SHOULDER RAISED TO MEET THE ROAD". The terrain MESH and the
// PHYSICS surface are driven by ONE shared cross-section today (terrain.js:1596 and road.js:6853 both
// call _carveCrossSectionBlended), so they agree by construction — carve-mesh-smoothness.mjs measures
// that agreement directly (worst mesh↔phys 0.3–0.5 m, inside the sanctioned pad-rim/clearance deltas).
// What this gate owns is the thing that agreement cannot show: that the shared footprint COVERS the
// core. The original bug was physics capping at halfWidth + shoulderWidth (7.5 m) while the mesh
// reached carveHalfWidth + shoulderWidth (10.5 m) — the band between was raised dirt with no collider.
//
// THE CHECK IS ON blendW, NOT ON HEIGHT (rewritten 2026-09-07). The old check asked "is the surface
// raised above raw terrain out to 8 m?" and marched ONE fixed lateral direction from the single
// deepest fill in the world. That conflates "physics raises the ground" with "physics is supported",
// and the two differ on a SIDE-HILL BENCH: the road is fill on the downhill side and cut into the
// slope on the uphill side, so on the uphill half the surface is legitimately BELOW raw and there is
// no embankment to hold up. Measured on seeds 6/7/20, the shortfall was strictly one-sided every time
// (e.g. seed 7 @(909,634): +lat dies at 7.6 m, −lat holds past 11 m; raw terrain climbs ~1.03 m per
// metre of lateral there — a ~46° hillside — while the carve descends ~0.17 m/m from camber and crown,
// so they cross at lat ≈ 7.55 and the carve is a CUT past that). blendW was 1.000 throughout in every
// such case and the mesh agreed to the centimetre: no raised band, no fall-through, a false alarm.
//
// blendW is the honest quantity. _carveCrossSection (road.js:8801-8813) sets blendW = 1.0 for
// radDist < carveHalfWidth unconditionally and only ramps down over the shoulder to the toe, so a
// flat blendW == 1 core out to carveHalfWidth IS the footprint contract — sign-agnostic, and equally
// true on a cut, a fill, or a bench. The pre-fix code fails it at 7.5 m; a future footprint clip fails
// it wherever it bites.
//
// Run: node test/road-fill-support.mjs   (exit 0 = the carve footprint covers its core)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

// Four seeds, and the TOP FILLS in each rather than the single global argmax. One argmax per seed is a
// coin flip: three of the top 120 fills per seed sit on a bench, so the old gate's verdict depended on
// which side of one road it happened to march.
const SEEDS   = [6, 7, 20, 11]
const TOP_N   = 20             // deepest fills probed per seed
const hw = RANGER_PARAMS.roadHalfWidth ?? 5
const sw = RANGER_PARAMS.roadShoulderWidth ?? 2.5
const carveHW   = Math.min(hw + (RANGER_PARAMS.roadCarveExtraWidth ?? 3.0), RANGER_PARAMS.roadMinTurnRadius ?? 12)
const MESH_EXT  = carveHW + sw          // carve extent: flat core + the shoulder ramp to the toe
const DLAT      = 0.2
const CORE_TO   = carveHW               // blendW must be 1 across the whole flat core
// blendW is 1.0 exactly inside the core (a literal in _carveCrossSection), so this bar is a float
// guard, not a tolerance — anything that actually clips the footprint drops it to 0 over the ramp.
const CORE_W_MIN = 0.999
// Max analyticHeight step. The intended road-edge dropoff (roadClearanceMargin, BUG-15) is the largest
// allowed; the raw embankment toe's own steepness stays under it. Under the saturating-camber model
// the edge drop also carries the cross-slope over one DLAT — sin(camberMax)·DLAT (measured 0.204 m
// at a −14.5° cambered deep-fill curve = 0.15 clearance + 0.25·0.2 camber + crown; QUAL-21 Phase 5's
// deg-3/4 pairing merely moved the deepest-fill sample onto such a curve) — model that term too.
const STEP_TOL   = (RANGER_PARAMS.roadClearanceMargin ?? 0.25)
                 + Math.sin((RANGER_PARAMS.camberMaxAngleDeg ?? 20) * Math.PI / 180) * DLAT + 0.05

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

let corpusProbes = 0, corpusFillSides = 0

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))
    const terr = makeTerrainHeadless(seed, RANGER_PARAMS, road)

    // Every fill ≥2 m, deepest first — the deepest are where the embankment is tallest and a footprint
    // clip would drop the truck furthest.
    const cands = []
    for (const [runKey, entry] of road._network) {
        const pts = entry.points
        const spans = entry.tunnelSpans
        for (let i = 2; i < pts.length - 2; i += 3) {
            // FEAT-68: bore/bridge spans are STRUCTURE (carve-skip by design) — a bridge deck is
            // supported by the span collider, not an embankment, so it is not this gate's subject.
            if (spans) {
                const sArc = entry.polyCum[i]
                let inSpan = false
                for (const sp of spans) if (sArc >= sp.s0 - 6 && sArc <= sp.s1 + 6) { inSpan = true; break }
                if (inSpan) continue
            }
            const d = pts[i].y - terr.rawHeightWorld(pts[i].x, pts[i].z)
            if (d > 2.0) cands.push({ d, x: pts[i].x, z: pts[i].z, runKey })
        }
    }
    cands.sort((a, b) => b.d - a.d)
    const probes = cands.slice(0, TOP_N)
    if (!probes.length) { log(true, `FILL-SUPPORT seed=${seed}`, 'no fill ≥2 m on this network — skipped'); continue }

    // Worst-of over every probe × BOTH lateral signs. Marching one sign only was half the reason the
    // old gate's verdict was luck: on a bench the two sides are a cut and a fill, and they fail
    // differently.
    let worstCoreW = 1, coreAt = '', worstDriveStep = 0, worstUpStep = 0, stepAt = ''
    let fillSides = 0

    for (const p of probes) {
        const nr0 = road._resolveRoadSurface(p.x, p.z)
        if (!nr0) continue
        corpusProbes++
        const tx = nr0.tangent.x, tz = nr0.tangent.z, fx = nr0.point.x, fz = nr0.point.z

        for (const sign of [1, -1]) {
            // Pin the projection to the station foot (nr0) so the lateral march can't snap to a
            // NEIGHBOUR run. (At parallel/stacked-road overlaps a free re-resolve jumps to the closer
            // road at a different height — a real but SEPARATE defect, COVER/FEAT-10 route merge, not
            // the footprint clip under test.) analyticHeight = raw + blendW·(gradeY − raw).
            let prev = null, sawFill = false
            // INTEGER-INDEXED. `lat += 0.2` accumulates to 7.799999999999995, which made the old
            // `lastSupported >= SUPPORT_TO - DLAT` comparison false by 5e-15 — a latent knife-edge.
            const steps = Math.round((MESH_EXT + 0.5) / DLAT)
            for (let k = 0; k <= steps; k++) {
                const lat = k * DLAT
                const wx = fx + sign * tz * lat, wz = fz - sign * tx * lat
                const raw = terr.rawHeightWorld(wx, wz)
                const c = road._sampleCarveWorld(wx, wz, raw, nr0)
                const w = c ? c.blendW : 0
                const ah = (c && w > 1e-6) ? raw + w * (c.gradeY - raw) : raw
                // THE FOOTPRINT CONTRACT: a flat blendW == 1 core out to carveHalfWidth.
                // STRICTLY inside: _carveCrossSection's core is `radDist < carveHalfWidth`, and the
                // sample sitting exactly ON the boundary is already the first ramp sample (k*DLAT
                // lands at 8.000000000000002 for k=40, so it takes the ramp branch and reads 0.999).
                if (lat < CORE_TO - 1e-9 && w < worstCoreW) {
                    worstCoreW = w
                    coreAt = `seed ${seed} @(${p.x.toFixed(0)},${p.z.toFixed(0)}) lat ${sign > 0 ? '+' : '−'}${lat.toFixed(1)}`
                }
                if (c && c.gradeY - raw > 0.05) sawFill = true   // this side genuinely carries embankment
                if (prev !== null) {
                    const d = ah - prev
                    // drivable surface stays smooth; anywhere, an UPWARD jump = a run-flip cliff.
                    // A steep DOWNWARD bank beyond the road edge is a legitimate fill slope.
                    //
                    // `lat <= hw`, NOT `hw + DLAT`: on-ribbon is `latDist < halfWidth` (road.js:6927),
                    // so the sample one DLAT past hw is the first DIRT sample and the step into it is
                    // the asphalt→dirt EDGE, not drivable surface. Including it measured the edge
                    // dropoff (clearanceMargin) plus the embankment's own slope over that 0.2 m — and
                    // on a tall fill that bank is legitimately steep, which this gate's own header
                    // calls out as intended rather than a fall-through. Measured seed 11 @(300,-425),
                    // an 11.5 m fill: on-ribbon steps are 0.047 m, the edge step is 0.527 m, and the
                    // bank then falls ~1 m per 0.2 m. The old +DLAT band scored that bank as
                    // undrivable; two probes had simply never hit a fill tall enough to show it.
                    if (lat <= hw && Math.abs(d) > worstDriveStep) {
                        worstDriveStep = Math.abs(d)
                        stepAt = `seed ${seed} @(${p.x.toFixed(0)},${p.z.toFixed(0)}) lat ${lat.toFixed(1)}`
                    }
                    if (d > worstUpStep) worstUpStep = d
                }
                prev = ah
            }
            if (sawFill) { fillSides++; corpusFillSides++ }
        }
    }

    const coreOk  = worstCoreW >= CORE_W_MIN
    const driveOk = worstDriveStep <= STEP_TOL
    const upOk    = worstUpStep   <= STEP_TOL
    log(coreOk && driveOk && upOk, `FILL-SUPPORT seed=${seed}`,
        `${probes.length} fills probed × 2 sides (deepest ${probes[0].d.toFixed(1)} m), ${fillSides} sides carry embankment; ` +
        `worst core blendW ${worstCoreW.toFixed(4)} (need ≥${CORE_W_MIN}${coreOk ? '' : ` — at ${coreAt}`}) out to ${CORE_TO.toFixed(1)} m; ` +
        `drivable step ${worstDriveStep.toFixed(3)} m${driveOk ? '' : ` at ${stepAt}`}, worst UP-step ${worstUpStep.toFixed(3)} m ` +
        `(tol ${STEP_TOL.toFixed(3)} m; steep downward bank allowed)`)
}

// NON-VACUOUS over the corpus, same reasoning as pond-route-around.mjs's corpus check: the footprint
// contract proves nothing if no probe ever landed on an actual embankment. A seed going quiet is fine;
// ALL of them going quiet means the gate lost its teeth and the corpus needs re-basing.
log(corpusFillSides >= corpusProbes, 'NON-VACUOUS (corpus)',
    `${corpusFillSides} embankment-carrying sides over ${corpusProbes} probes ` +
    `(need ≥${corpusProbes} — averaging one fill side per probe; a bench contributes one, a causeway two)`)

console.log('\n' + '='.repeat(64))
console.log(`ROAD-FILL-SUPPORT GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
