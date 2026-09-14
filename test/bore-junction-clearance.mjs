// GATE (run-all): node test/bore-junction-clearance.mjs
//
// BUG-67 — tunnel bores versus junctions. There is no machinery to MERGE two bores, and none to
// build a portal inside a junction apron, so wherever either happens the geometry breaks: one
// tube's lining wall crosses the other's mouth, or the pad's cut face slices the headwall off.
// Reported by the owner from capture autos-capture-1788933513716 (seed 0, mark (−267, −1763)),
// where a 130 m bore's portal sits exactly ON node −1,−3,1.
//
// This gate does NOT assert the defect is fixed — it is not, and the fix is upstream in routing
// (see the ticket). It PINS THE CURRENT CENSUS as a ceiling so the class cannot silently get
// worse while the junction machinery is being worked on, and so whatever fix lands has a number
// to move. Every ceiling below is a measured current value, not a target; when a fix lands, the
// ceilings come down with it.
//
// Three measurements, all pure functions of (seed, params) over a fixed corpus:
//   (1) bore-vs-bore  — minimum distance between two bores' centerlines. Below 2 x boreRadius the
//                       tubes interpenetrate and one wall opens into the other.
//   (2) portal-in-pad — a portal standing inside a real junction pad's reach (padReachNodes()),
//                       which is the ground the pad carves flat.
//   (3) portal-at-node — a portal within 12 m of its own edge's endpoint: the extreme of (2), and
//                       the shape the owner captured.
//
// Why clipping the span is NOT the fix (measured, and the reason this is a ceiling gate rather
// than a clip): every portal in the corpus opens at ~25 m of cover, because BORE is the class the
// profile is FORCED into once the deck is more than roadV2.cutMax below ground. Dropping a span
// therefore leaves the deck 25 m+ under the hill with no tube at all — an open canyon at the
// junction, which is strictly worse than a broken portal.

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

// Corpus: the owner's capture seed plus the four seeds whose junction bores are worst, and the
// one seed in a 20-seed sweep that produces a true bore-vs-bore interpenetration.
const SEEDS  = ['0', '2', '13', '16', '18', '19']
const RADIUS = 1400
const R      = P.tunnelBoreRadius ?? 8
const AT_NODE_M = 12     // "the portal is the junction" — one profile station

// Measured ceilings over this corpus, 2026-09-14 (main @ ceb1bc8). See the header: these record
// an OPEN defect, they do not bless it.
const MAX_OVERLAP   = 1
const MAX_IN_PAD    = 18
const MAX_AT_NODE   = 12

/** Minimum distance between two 3D segments. */
function segSegDist (p0, p1, q0, q1) {
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z
    const vx = q1.x - q0.x, vy = q1.y - q0.y, vz = q1.z - q0.z
    const wx = p0.x - q0.x, wy = p0.y - q0.y, wz = p0.z - q0.z
    const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz
    const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz
    const D = a * c - b * b
    let s, t
    if (D < 1e-9) { s = 0; t = (b > c ? d / b : e / c) } else { s = (b * e - c * d) / D; t = (a * e - b * d) / D }
    s = Math.max(0, Math.min(1, s)); t = Math.max(0, Math.min(1, t))
    return Math.hypot(wx + s * ux - t * vx, wy + s * uy - t * vy, wz + s * uz - t * vz)
}

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }

let nBores = 0, nOverlap = 0, nInPad = 0, nAtNode = 0
const overlaps = [], inPads = [], atNodes = []

for (const seed of SEEDS) {
    const road = new RoadSystem(seed, P)
    road.setRadius(RADIUS)
    road.update(new THREE.Vector3(0, 0, 0))
    const pads = road.padReachNodes()

    // Every bore as a world polyline on the solved deck.
    const bores = []
    for (const [runKey, e] of road._network) {
        if (!e.tunnelSpans) continue
        const L = e.polyCum[e.points.length - 1]
        for (const sp of e.tunnelSpans) {
            const pts = []
            for (let s = sp.s0; s <= sp.s1 + 1e-6; s += 4) {
                const ss = Math.min(s, sp.s1)
                const q = road.runPointAt(runKey, ss)
                if (q) pts.push({ x: q.x, z: q.z, y: road.runProfile(ss, runKey).gradeY })
            }
            if (pts.length < 2) continue
            nBores++
            bores.push({ runKey, pts, dNode: Math.min(sp.s0, L - sp.s1), s0: sp.s0, s1: sp.s1, L })
        }
    }

    for (const b of bores) {
        if (b.dNode < AT_NODE_M) { nAtNode++; atNodes.push({ seed, runKey: b.runKey, d: b.dNode }) }
        // Portal (the end nearest its node) against every junction pad's reach.
        const q = road.runPointAt(b.runKey, b.s0 < b.L - b.s1 ? b.s0 : b.s1)
        let intr = -Infinity, reach = 0
        for (const pd of pads) {
            const dd = pd.reach - Math.hypot(q.x - pd.x, q.z - pd.z)
            if (dd > intr) { intr = dd; reach = pd.reach }
        }
        if (intr > 0) { nInPad++; inPads.push({ seed, runKey: b.runKey, intr, reach, dNode: b.dNode }) }
    }

    for (let i = 0; i < bores.length; i++) {
        for (let j = i + 1; j < bores.length; j++) {
            const A = bores[i], B = bores[j]
            if (A.runKey === B.runKey) continue
            let best = Infinity
            for (let a = 1; a < A.pts.length; a++) {
                for (let c = 1; c < B.pts.length; c++) {
                    const dd = segSegDist(A.pts[a - 1], A.pts[a], B.pts[c - 1], B.pts[c])
                    if (dd < best) best = dd
                }
            }
            if (best < 2 * R) { nOverlap++; overlaps.push({ seed, A: A.runKey, B: B.runKey, d: best }) }
        }
    }
}

console.log(`\ncorpus: seeds ${SEEDS.join(', ')} at r=${RADIUS} m — ${nBores} bores, bore radius ${R} m\n`)

console.log(`(1) bore cylinders interpenetrating (centerlines < ${2 * R} m apart): ${nOverlap}`)
for (const o of overlaps.sort((a, b) => a.d - b.d))
    console.log(`      seed ${o.seed.padStart(3)}  ${o.d.toFixed(1).padStart(5)} m   ${o.A}  x  ${o.B}`)
check(nOverlap <= MAX_OVERLAP,
    `at most ${MAX_OVERLAP} bore-vs-bore interpenetration in the corpus (got ${nOverlap}) — no merge machinery exists, so each one is a wall across a mouth`)

console.log(`\n(2) portals standing inside a junction pad's reach: ${nInPad} of ${nBores}`)
for (const r of inPads.sort((a, b) => b.intr - a.intr).slice(0, 8))
    console.log(`      seed ${r.seed.padStart(3)}  ${r.intr.toFixed(1).padStart(5)} m inside a ${r.reach.toFixed(0)} m pad  (${r.dNode.toFixed(0)} m from its node)  ${r.runKey}`)
check(nInPad <= MAX_IN_PAD,
    `at most ${MAX_IN_PAD} portals inside a junction pad (got ${nInPad}) — the pad carves that ground flat, which is what cuts the headwall off`)

console.log(`\n(3) portals within ${AT_NODE_M} m of their own node: ${nAtNode}`)
for (const r of atNodes.sort((a, b) => a.d - b.d))
    console.log(`      seed ${r.seed.padStart(3)}  ${r.d.toFixed(1).padStart(5)} m   ${r.runKey}`)
check(nAtNode <= MAX_AT_NODE,
    `at most ${MAX_AT_NODE} portals essentially AT a node (got ${nAtNode}) — the owner's captured shape`)

console.log(fail
    ? '\nFAIL — bore/junction clearance got WORSE than the BUG-67 census it is pinned to'
    : '\nPASS — bore/junction clearance is no worse than the BUG-67 census (still an open defect; see the ticket)')
process.exit(fail)
