// test/centerline-curvature.mjs — Road Overhaul, Phase A gate (graph edges).
//
// Asserts the routed primitive centerline (each URQUHART edge via _edgeCenterline → arcPrimitiveConnect
// {emitPrimitives} → Centerline, stored as network entry `.centerline`) is min-turn-radius VALID BY
// CONSTRUCTION, measured on the EXACT curve: the analytic min |1/curvatureAt(s)| over every edge. There
// is nothing to re-interpolate, so curvature is exact, not estimated. The ribbon samples this curve, so
// it physically cannot fold (every primitive has radius ≥ hardR by construction; the Catmull-Rom
// overshoot that caused BUG-12 is gone).
//
// Also checks determinism/window-invariance: the same edge built from two different stream centers
// yields byte-identical primitive descriptors (each edge is a pure fn of its two blue-noise site ids +
// the router opts — independent of stream center). This is the D-16 keystone the whole rewrite stands on,
// asserted here at the source. (QUAL-12: rows removed — the graph is the sole topology.)
//
// Run: node test/centerline-curvature.mjs   (exit 0 = all green)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { COARSE_HEIGHT, TEST_PARAMS } from './lib/road-headless.mjs'

const SEED = 6

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

const foldFloor = (params) => (params.roadHalfWidth ?? 5) + (params.roadClearanceMargin ?? 0.5)

// Every registered graph edge → its exact routed Centerline (network entry `.centerline`). Keyed by the
// world-fixed runKey "g:<idA>:<idB>", so the same edge is identifiable across stream centers (D-16).
function* edges(road) {
    for (const [key, e] of road._network) {
        if (e.centerline && e.centerline.primitives?.length) yield { key, cl: e.centerline }
    }
}

function freshRoad(center) {
    const road = new RoadSystem(SEED, TEST_PARAMS, COARSE_HEIGHT)
    road.setRadius(1200)   // wide enough that a sparse blue-noise band still yields a healthy edge sample
    road.update(new THREE.Vector3(center.x, 0, center.z))   // streams + assembles the graph
    return road
}

// ── Gate 1: exact min radius ≥ fold floor over every edge across several centers ───────────────────
{
    const FLOOR = foldFloor(TEST_PARAMS)
    const HARD = TEST_PARAMS.roadArcHardRadius ?? 8
    const centers = [{ x: 0, z: 0 }, { x: 512, z: 256 }, { x: -512, z: -256 }, { x: 256, z: -512 }]
    let worst = { r: Infinity, key: '', center: null }
    let count = 0
    for (const c of centers) {
        const road = freshRoad(c)
        for (const { key, cl } of edges(road)) {
            count++
            const r = cl.minRadius()
            if (r < worst.r) worst = { r, key, center: c }
        }
    }
    log(count > 0 && worst.r >= FLOOR, 'EXACT:min-radius',
        `worst exact centerline radius = ${worst.r === Infinity ? '∞' : worst.r.toFixed(3)}m over ${count} ` +
        `edges (fold floor ${FLOOR}m, hardR ${HARD}m) at edge ${worst.key} ` +
        `center (${worst.center?.x},${worst.center?.z})`)
}

// ── Gate 2: every primitive's endpoint curvature is itself bounded (no stray sub-floor primitive) ─
{
    const FLOOR = foldFloor(TEST_PARAMS)
    const road = freshRoad({ x: 0, z: 0 })
    let bad = 0, total = 0, worstK = 0
    for (const { cl } of edges(road)) {
        for (const p of cl.primitives) {
            total++
            const k = Math.max(Math.abs(p.kappa0), Math.abs(p.kappa1))
            worstK = Math.max(worstK, k)
            if (k > 1e-9 && 1 / k < FLOOR) bad++
        }
    }
    log(total > 0 && bad === 0, 'EXACT:per-primitive-bound',
        `${bad}/${total} primitives below fold floor (worst |κ| = ${worstK.toExponential(2)} → ` +
        `r = ${worstK < 1e-9 ? '∞' : (1 / worstK).toFixed(3)}m, floor ${FLOOR}m)`)
}

// ── Gate 3: window-invariance — same edge from two centers ⇒ identical primitives (D-16) ──────────
{
    const cA = { x: 0, z: 0 }, cB = { x: 0, z: 384 }
    const roadA = freshRoad(cA), roadB = freshRoad(cB)
    const mapB = new Map()
    for (const { key, cl } of edges(roadB)) mapB.set(key, cl)
    let compared = 0, mismatched = 0, worstD = 0
    for (const { key, cl } of edges(roadA)) {
        const other = mapB.get(key)
        if (!other) continue
        compared++
        if (cl.primitives.length !== other.primitives.length) { mismatched++; continue }
        for (let i = 0; i < cl.primitives.length; i++) {
            const p = cl.primitives[i], q = other.primitives[i]
            const d = Math.max(
                Math.abs(p.x0 - q.x0), Math.abs(p.z0 - q.z0), Math.abs(p.theta0 - q.theta0),
                Math.abs(p.length - q.length), Math.abs(p.kappa0 - q.kappa0), Math.abs(p.kappa1 - q.kappa1))
            if (d > worstD) worstD = d
            if (d > 1e-9) { mismatched++; break }
        }
    }
    log(compared > 0 && mismatched === 0, 'INVARIANT:two-center',
        `${compared} shared edges compared, ${mismatched} mismatched (worst descriptor Δ = ${worstD.toExponential(2)})`)
}

console.log(`\n================================================================`)
console.log(`CENTERLINE-CURVATURE GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
