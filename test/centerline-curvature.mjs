// test/centerline-curvature.mjs — Road Overhaul, Phase A gate.
//
// Asserts the NEW primitive centerline (_protoConnectCenterline → arcPrimitiveConnect{emitPrimitives}
// → Centerline) is min-turn-radius VALID BY CONSTRUCTION, measured on the EXACT curve: the analytic
// min |1/curvatureAt(s)| over every connection. This is the replacement for road-minradius.mjs's
// sampled-polyline circumradius — there is nothing to re-interpolate, so curvature is exact, not
// estimated. Once Phase B switches consumers onto this curve, the ribbon physically cannot fold
// (every primitive has radius ≥ hardR by construction; the Catmull-Rom overshoot that caused BUG-12
// is gone).
//
// Also checks determinism/window-invariance: the same connection built from two different stream
// centers yields byte-identical primitive descriptors (it is a pure fn of the anchor pair + the
// anchor-derived canonical headings — independent of stream center). This is the D-16 keystone the
// whole rewrite stands on, asserted here at the source.
//
// Run: node test/centerline-curvature.mjs   (exit 0 = all green)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { COARSE_HEIGHT, TEST_PARAMS } from './lib/road-headless.mjs'

const SEED = 6
const SPACING = 256, HALF_W = 2   // PROTO_ANCHOR_SPACING / CANONICAL_HALF_WIDTH (road.js)

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

const foldFloor = (params) => (params.roadHalfWidth ?? 5) + (params.roadClearanceMargin ?? 0.5)

// Enumerate the canonical east connections for a streamed RoadSystem and yield its Centerlines.
function* connections(road, center) {
    const R = road._proto.radius
    const center_mx = Math.floor(center.x / SPACING)
    const mx0 = center_mx - HALF_W, mx1 = center_mx + HALF_W
    const mz0 = Math.floor((center.z - R) / SPACING), mz1 = Math.ceil((center.z + R) / SPACING)
    for (let mz = mz0; mz <= mz1; mz++) {
        for (let mx = mx0; mx <= mx1; mx++) {
            yield { mx, mz, cl: road._protoConnectCenterline(mx, mz) }
        }
    }
}

function freshRoad(center) {
    const road = new RoadSystem(SEED, TEST_PARAMS, COARSE_HEIGHT)
    road.update(new THREE.Vector3(center.x, 0, center.z))   // streams + sets _proto.radius
    return road
}

// ── Gate 1: exact min radius ≥ fold floor over every connection across several centers ────────────
{
    const FLOOR = foldFloor(TEST_PARAMS)
    const HARD = TEST_PARAMS.roadArcHardRadius ?? 8
    const centers = [{ x: 0, z: 0 }, { x: 512, z: 256 }, { x: -512, z: -256 }, { x: 256, z: -512 }]
    let worst = { r: Infinity, mx: 0, mz: 0, center: null }
    let count = 0
    for (const c of centers) {
        const road = freshRoad(c)
        for (const { mx, mz, cl } of connections(road, c)) {
            count++
            const r = cl.minRadius()
            if (r < worst.r) worst = { r, mx, mz, center: c }
        }
    }
    log(worst.r >= FLOOR, 'EXACT:min-radius',
        `worst exact centerline radius = ${worst.r === Infinity ? '∞' : worst.r.toFixed(3)}m over ${count} ` +
        `connections (fold floor ${FLOOR}m, hardR ${HARD}m) at cell (${worst.mx},${worst.mz}) ` +
        `center (${worst.center?.x},${worst.center?.z})`)
}

// ── Gate 2: every primitive's endpoint curvature is itself bounded (no stray sub-floor primitive) ─
{
    const FLOOR = foldFloor(TEST_PARAMS)
    const road = freshRoad({ x: 0, z: 0 })
    let bad = 0, total = 0, worstK = 0
    for (const { cl } of connections(road, { x: 0, z: 0 })) {
        for (const p of cl.primitives) {
            total++
            const k = Math.max(Math.abs(p.kappa0), Math.abs(p.kappa1))
            worstK = Math.max(worstK, k)
            if (k > 1e-9 && 1 / k < FLOOR) bad++
        }
    }
    log(bad === 0, 'EXACT:per-primitive-bound',
        `${bad}/${total} primitives below fold floor (worst |κ| = ${worstK.toExponential(2)} → ` +
        `r = ${worstK < 1e-9 ? '∞' : (1 / worstK).toFixed(3)}m, floor ${FLOOR}m)`)
}

// ── Gate 3: window-invariance — same connection from two centers ⇒ identical primitives (D-16) ────
{
    // A cell inside the canonical band of BOTH centers below.
    const cA = { x: 0, z: 0 }, cB = { x: 0, z: 384 }
    const roadA = freshRoad(cA), roadB = freshRoad(cB)
    // Shared cells: those streamed by both. Compare descriptors cell-by-cell.
    const mapB = new Map()
    for (const { mx, mz, cl } of connections(roadB, cB)) mapB.set(`${mx},${mz}`, cl)
    let compared = 0, mismatched = 0, worstD = 0
    for (const { mx, mz, cl } of connections(roadA, cA)) {
        const other = mapB.get(`${mx},${mz}`)
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
        `${compared} shared connections compared, ${mismatched} mismatched (worst descriptor Δ = ${worstD.toExponential(2)})`)
}

console.log(`\n================================================================`)
console.log(`CENTERLINE-CURVATURE GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
