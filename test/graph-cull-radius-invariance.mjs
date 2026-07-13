// test/graph-cull-radius-invariance.mjs — BUG-25 gate: the crossing cull is RENDER-RADIUS- and
// APPROACH-HISTORY-invariant.
//
// The cull (_cullCrossings) prunes the redundant strand of each routed crossing. Pre-fix, its
// candidate pairs came from this._crossingList (detected among IN-BAND routed edges only), so the
// SAME crossing was detected differently at the 320 m play radius vs the ~1500 m map radius (or
// between two visits with slightly shifted bands) and the tie-break dropped a DIFFERENT survivor —
// whole edges flipped in/out on re-stream (map↔3D desync; junction pads/carve rebuilt against the
// flipped leg set → giant degenerate pads, "fall through terrain"). Post-fix the candidates come
// from _cullCandidatePairs (routed crossings over the window-invariant ONE-RING of the registered
// edges) and each pair's detour is computed on the STATIC wide graph, so the drop decision is a
// pure function of (seed, params, region).
//
// Two checks, three seeds (6, 67, and djb2("testig")=1746687325 — the known-flipping live fixture):
//   (1) RADIUS  — build at r=320 and r=1500 over the same region; every edge the narrow band
//                 registers must match the wide build's edge set restricted to that band: zero
//                 "world-only" (320-kept, 1500-culled) AND zero "map-only-near" (1500-kept,
//                 320-culled) edges, across a grid of centers per seed (includes seed 67's
//                 historical residual centers and testig's (1668,713)/(1365,-1) flip sites).
//   (2) APPROACH — same final center + radius, different prior update() center histories (direct,
//                 from 900 m west in steps, from 900 m north-east in steps): the post-cull edge
//                 set + per-edge grade at the final window must be IDENTICAL (drive-out-and-back
//                 must reproduce the same network).
//
// Run: node test/graph-cull-radius-invariance.mjs   (slow — 6 full wide/narrow builds + 5 approach
// builds; routing is synchronous headless)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'

const P = { ...RANGER_PARAMS, roadNetworkMode: 'graph' }
const ANCHOR = 256   // PROTO_ANCHOR_SPACING (road.js module const — band cells are 256 m)
const TESTIG = parseWorldSeed('testig')   // 1746687325

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const build = (seed, radius, centers) => {
    const r = new RoadSystem(seed, P)
    r.setRadius(radius)
    for (const [cx, cz] of centers) r.update(new THREE.Vector3(cx, 0, cz))
    return r
}

// The exact registration band of a built instance (parsed from its window signature) — an edge is
// registered iff ≥1 endpoint lies in this world box, so restricting BOTH builds' networks to the
// NARROW build's band compares exactly the edges the two radii must agree on.
const bandOf = (r) => {
    const [mz0, mz1, mx0, mx1] = r._lastBandSig.split(':').map(Number)
    return { wx0: mx0 * ANCHOR, wx1: (mx1 + 1) * ANCHOR, wz0: mz0 * ANCHOR, wz1: (mz1 + 1) * ANCHOR }
}
const bandSet = (r, band) => {
    const s = new Set()
    const inB = (p) => p.x >= band.wx0 && p.x < band.wx1 && p.z >= band.wz0 && p.z < band.wz1
    for (const [k, e] of r._network) if (inB(r._nodePos(e.cellA)) || inB(r._nodePos(e.cellB))) s.add(k)
    return s
}

// (1) RADIUS invariance — one wide (map-like, 1500 m) build per seed vs narrow (play-like, 320 m)
// builds at a grid of centers inside it. ─────────────────────────────────────────────────────────
const RADIUS_FIXTURES = [
    { seed: 6, label: 'seed6', wideCenter: [4500, 600], narrowCenters: [[4500, 600], [4180, 280]] },
    { seed: 67, label: 'seed67', wideCenter: [-2000, -1000], narrowCenters: [[-2000, -1600], [-2000, -400]] },   // historical residual centers
    { seed: TESTIG, label: 'testig', wideCenter: [1500, 350], narrowCenters: [[1668, 713], [1365, -1]] },        // live flip sites (BUG-25 escalation)
]
for (const { seed, label, wideCenter, narrowCenters } of RADIUS_FIXTURES) {
    const wide = build(seed, 1500, [wideCenter])
    let worldOnly = 0, mapOnlyNear = 0, compared = 0, sample = ''
    for (const c of narrowCenters) {
        const narrow = build(seed, 320, [c])
        const band = bandOf(narrow)
        const Sn = bandSet(narrow, band), Sw = bandSet(wide, band)
        compared += Sn.size
        for (const k of Sn) if (!Sw.has(k)) { worldOnly++; if (!sample) sample = `${k} 320-only @(${c})` }
        for (const k of Sw) if (!Sn.has(k)) { mapOnlyNear++; if (!sample) sample = `${k} 1500-only @(${c})` }
    }
    log(worldOnly === 0 && mapOnlyNear === 0 && compared >= 4, `CULL-RADIUS-INVARIANT-${label}`,
        `320 m vs 1500 m post-cull edge sets over ${narrowCenters.length} centers: ` +
        `compared=${compared} worldOnly=${worldOnly} mapOnlyNear=${mapOnlyNear}${sample ? ` | ${sample}` : ''}`)
}

// (2) APPROACH invariance — same final center + radius, different update() histories. ────────────
const gradeSig = (e) => e.points.map(p => p.y.toFixed(2)).join(',')
const netSig = (r) => { const m = new Map(); for (const [k, e] of r._network) m.set(k, gradeSig(e)); return m }
const APPROACH_FIXTURES = [
    {
        label: 'testig-1668,713', seed: TESTIG, final: [1668, 713],
        paths: [
            ['west', [[768, 713], [1068, 713], [1368, 713], [1668, 713]]],
            ['northeast', [[2304, 1349], [2104, 1149], [1868, 913], [1668, 713]]],
        ],
    },
    {
        label: 'testig-1365,-1', seed: TESTIG, final: [1365, -1],
        paths: [['west', [[465, -1], [765, -1], [1065, -1], [1365, -1]]]],
    },
]
for (const { label, seed, final, paths } of APPROACH_FIXTURES) {
    const direct = netSig(build(seed, 320, [final]))
    let extra = 0, missing = 0, gradeMis = 0, sample = ''
    for (const [pathName, centers] of paths) {
        const arrived = netSig(build(seed, 320, centers))
        for (const [k, sig] of direct) {
            if (!arrived.has(k)) { missing++; if (!sample) sample = `${k} lost via ${pathName}` }
            else if (arrived.get(k) !== sig) { gradeMis++; if (!sample) sample = `${k} grade drift via ${pathName}` }
        }
        for (const k of arrived.keys()) if (!direct.has(k)) { extra++; if (!sample) sample = `${k} extra via ${pathName}` }
    }
    log(extra === 0 && missing === 0 && gradeMis === 0 && direct.size >= 3, `CULL-APPROACH-INVARIANT-${label}`,
        `direct build (${direct.size} edges) vs ${paths.length} approach path(s): ` +
        `missing=${missing} extra=${extra} gradeMismatch=${gradeMis}${sample ? ` | ${sample}` : ''}`)
}

console.log(`\nGRAPH-CULL-RADIUS-INVARIANCE: ${pass}/${pass + fail} checks green`)
process.exit(fail === 0 ? 0 : 1)
