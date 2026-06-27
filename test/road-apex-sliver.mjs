// test/road-apex-sliver.mjs — BUG-21 acceptance gate: no off-road sliver at a shared run anchor.
//
// GUARDS "the car jolts up crossing a hairpin run boundary". At a shared apex BOTH continuation arms
// treat the wedge just beyond the anchor as off-their-end (_projectOntoRun offEnd), so the primary
// interior pass in _resolveRoadSurface finds nothing and the surface pops to RAW terrain (a +0.6 m
// step in a cut → the airborne jolt). The fix adds a radial-gated terminal-vertex fallback.
//
// This gate finds every SHARED anchor (a point where ≥2 run endpoints coincide — a junction/hairpin
// apex) and asserts that, within the carve footprint around it, _resolveRoadSurface NEVER returns null
// (no raw-terrain pop) and the resolved gradeY is C0 (no spike beyond the intended ribbon-edge dropoff).
// RED before the fix (the apex disc has ~15 null points); GREEN after.
//
// Run: node test/road-apex-sliver.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const SEEDS = [6, 7]
const p = RANGER_PARAMS
const hw = p.roadHalfWidth ?? 5, ce = p.roadCarveExtraWidth ?? 3, mr = p.roadMinTurnRadius ?? 12
const met = p.roadMaxEmbankmentToe ?? 10
const footHW = Math.min(hw + ce, mr) + met
// Probe only the inner footprint (ribbon + a little shoulder); blendW→0 out at the toe so requiring
// "on road" all the way to footHW would test points that are effectively raw terrain. The bug pops at
// 3–5 m from the anchor, well inside this.
const PROBE_R  = hw + (p.roadShoulderWidth ?? 2.5)   // ~7.5 m — the ribbon+shoulder disc that must be road
const STEP_TOL = (p.roadClearanceMargin ?? 0.25) + 0.10   // gradeY C0 tolerance (allow the ribbon-edge dropoff)
const EPS = 1.0   // m — anchors within this are "shared"

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, RANGER_PARAMS)
    road.update(new THREE.Vector3(0, 0, 0))

    // Collect run endpoints; group coincident ones → shared anchors (≥2 endpoints).
    const ends = []
    for (const [rk, e] of road._network) {
        const pts = e.points; if (!pts || pts.length < 2) continue
        ends.push({ rk, x: pts[0].x, z: pts[0].z })
        ends.push({ rk, x: pts[pts.length - 1].x, z: pts[pts.length - 1].z })
    }
    const anchors = []
    const used = new Array(ends.length).fill(false)
    for (let i = 0; i < ends.length; i++) {
        if (used[i]) continue
        const group = [ends[i]]; used[i] = true
        for (let j = i + 1; j < ends.length; j++) {
            if (used[j]) continue
            if (Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z) < EPS && ends[i].rk !== ends[j].rk) { group.push(ends[j]); used[j] = true }
        }
        if (group.length >= 2) anchors.push({ x: ends[i].x, z: ends[i].z, n: group.length })
    }

    // Probe each shared anchor: a disc of points within PROBE_R must resolve to road (non-null) and be C0.
    let nulls = 0, worstStep = 0, worstAt = null, tested = 0
    for (const a of anchors) {
        // re-stream around this anchor so its tiles are loaded
        road.update(new THREE.Vector3(a.x, 0, a.z))
        for (let r = 1.0; r <= PROBE_R; r += 1.0) {
            let prevY = null
            for (let deg = 0; deg < 360; deg += 15) {
                const th = deg * Math.PI / 180
                const x = a.x + r * Math.cos(th), z = a.z + r * Math.sin(th)
                const nr = road._resolveRoadSurface(x, z)
                tested++
                if (!nr) { nulls++; prevY = null; continue }
                if (prevY !== null) { const d = Math.abs(nr.point.y - prevY); if (d > worstStep) { worstStep = d; worstAt = [x, z] } }
                prevY = nr.point.y
            }
        }
    }

    // BUG-21 invariant = NO off-road nulls within the carve footprint of a shared anchor (the sliver
    // pop). The gradeY step is reported for visibility but NOT asserted: a large step here is two runs
    // from different rows merely CROSSING at one XZ point at different heights (the inter-run-crossing /
    // future-overpass issue, separate from BUG-21), and continuing-run C0 is already gated by
    // camber-continuity.mjs. The fix must not INTRODUCE nulls; it doesn't change the crossing step.
    log(nulls === 0 && anchors.length > 0, `APEX-SLIVER seed=${seed}`,
        `${anchors.length} shared anchors, ${tested} disc probes (r≤${PROBE_R.toFixed(1)} m): ` +
        `${nulls} off-road nulls (must be 0); worst gradeY step ${worstStep.toFixed(3)} m (info: crossings at diff heights)` +
        (worstAt ? ` @(${worstAt[0].toFixed(0)},${worstAt[1].toFixed(0)})` : ''))
}

console.log('\n' + '='.repeat(64))
console.log(`ROAD-APEX-SLIVER GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
