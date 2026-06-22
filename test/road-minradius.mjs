// test/road-minradius.mjs — BUG-12 gate: the centerline must be min-turn-radius VALID BY
// CONSTRUCTION as the RIBBON experiences it — i.e. on the DENSE slice spline, across tile seams,
// not just on the sparse routed control polyline.
//
// THE GAP THIS CLOSES: arc-router.mjs proves the *routed* polyline is valid on synthetic routes;
// the replay fold metric uses a ±4 m window that averages sub-metre kinks away; debugDumpNearestRun
// .minTurnRadius just echoes a param. NONE of them measure the dense centripetal-Catmull-Rom curve
// the ribbon actually sweeps. This gate does: it concatenates each run's slice `samples` in arc
// order (continuous across tile boundaries) and measures the min 3-point circumradius.
//
// Any dense radius below the fold-safe floor (roadHalfWidth + clearance) folds the ribbon's inner
// edge = the BUG-12 tear. RED before the heading-continuous-routing fix, GREEN after.
//
// Fixtures: (1) the synthetic headless network (broad coverage, every run), (2) the 3 captured
// seed-6 place-dumps in Logs/ whose marks are the known failure sites.
//
// Run: node test/road-minradius.mjs   (exit 0 = all green)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { buildNetwork, TEST_PARAMS } from './lib/road-headless.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

// Min 3-point circumradius over an already-dense polyline (skip the short free-end stubs at each
// run terminus — a run END is a legitimate free end, not a join; interior anchor joins stay in).
function denseMinRadius(pts, skip = 2) {
    let min = Infinity, atX = 0, atZ = 0
    for (let i = skip + 1; i < pts.length - 1 - skip; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1]
        const A = Math.hypot(c.x - b.x, c.z - b.z)
        const B = Math.hypot(a.x - c.x, a.z - c.z)
        const C = Math.hypot(b.x - a.x, b.z - a.z)
        const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
        if (area2 < 1e-9) continue
        const r = (A * B * C) / (2 * area2)
        if (r < min) { min = r; atX = b.x; atZ = b.z }
    }
    return { min, atX, atZ }
}

// Collect every slice of one run from the tile store, sampled EXACTLY as road-mesh.js sweepRibbon
// sweeps it: spline.getSpacedPoints(N) (== getPointAt, arc-length parameterised) at ~2 m resolution.
// This is the geometry the ribbon mesh actually has, so its curvature is the true fold metric —
// uniform-PARAMETER getPoints would over-sample brief Catmull-Rom bulges the ribbon never resolves.
// (road-headless.mjs's sampleRegion likewise reads road._network/_tiles directly.)
function collectRun(road, runKey) {
    const slices = []
    for (const [, segs] of road._tiles) {
        for (const s of segs) {
            if ((s.runKey ?? '') !== runKey || !s.spline) continue
            const len = s.spline.getLength ? s.spline.getLength() : 64
            const n = Math.max(2, Math.min(256, Math.ceil(len / 2)))   // matches sweepRibbon's N-1
            const pts = s.spline.getSpacedPoints(n).map(q => ({ x: q.x, y: q.y, z: q.z }))
            slices.push({ arcS0: s.arcS0 ?? 0, arcS1: s.arcS1 ?? 0, samples: pts })
        }
    }
    return slices
}

// Worst within-slice min radius for a run. The ribbon mesh is swept PER SLICE (one tile's segment
// at a time), so the fold metric is each slice spline's own curvature, sampled arc-spaced as the
// ribbon samples it. Cross-tile-seam continuity (C0/C1) is a separate concern owned by
// ribbon-carve.mjs; concatenating across seams here would only inject false kinks from the
// independent per-slice Catmull-Rom endpoint tangents.
function worstSliceRadius(slices) {
    let worst = { min: Infinity, atX: 0, atZ: 0 }
    for (const s of slices) {
        if (!s.samples || s.samples.length < 5) continue   // too short to measure interior curvature
        const r = denseMinRadius(s.samples, 1)
        if (r.min < worst.min) worst = r
    }
    return worst
}

function worstRunRadius(road) {
    let worst = { min: Infinity, atX: 0, atZ: 0, runKey: null }
    for (const runKey of road._network.keys()) {
        const r = worstSliceRadius(collectRun(road, runKey))
        if (r.min < worst.min) worst = { ...r, runKey }
    }
    return worst
}

const foldFloor = (params) => (params.roadHalfWidth ?? 5) + (params.roadClearanceMargin ?? 0.5)

// ── Fixture 1: synthetic headless network (broad coverage over several stream centers) ───────────
{
    const FLOOR = foldFloor(TEST_PARAMS)
    const HARD = TEST_PARAMS.roadArcHardRadius ?? 8
    const centers = [{ x: 0, z: 0 }, { x: 512, z: 256 }, { x: -512, z: -256 }, { x: 256, z: -512 }]
    let worst = { min: Infinity, atX: 0, atZ: 0, runKey: null, center: null }
    for (const c of centers) {
        const road = buildNetwork(c)
        const w = worstRunRadius(road)
        if (w.min < worst.min) worst = { ...w, center: c }
    }
    log(worst.min >= FLOOR, 'SYNTHETIC:dense-min-radius',
        `worst dense centerline radius = ${worst.min === Infinity ? '∞' : worst.min.toFixed(2)}m ` +
        `(fold floor ${FLOOR}m, hardR target ${HARD}m) at run ${worst.runKey} near ` +
        `(${worst.atX.toFixed(0)},${worst.atZ.toFixed(0)}), stream center (${worst.center?.x},${worst.center?.z})`)
}

// ── Fixture 2: the 3 captured seed-6 place-dumps (known failure sites) ───────────────────────────
const CAPTURES = [
    'rangersim-capture-1782102756225.json',   // mark (-39, 184)
    'rangersim-capture-1782102776290.json',   // mark (-291, 224)
    'rangersim-capture-1782102824634.json',   // mark (-724, 280)
]
for (const file of CAPTURES) {
    let cap
    try { cap = JSON.parse(readFileSync(join(HERE, '..', 'Logs', file), 'utf8')) }
    catch (e) { log(false, `CAPTURE:${file}`, `cannot read fixture: ${e.message}`); continue }
    const { seed, params } = cap.world
    const { mark } = cap.place
    const FLOOR = foldFloor(params)
    const road = new RoadSystem(seed, params)                       // real seeded coarse height (replay.mjs:39)
    road.update(new THREE.Vector3(mark.x, 0, mark.z))
    const dump = road.debugDumpNearestRun(mark.x, mark.z)           // sanctioned nearest-run lookup
    if (!dump) { log(false, `CAPTURE:${file}`, `no run found near mark (${mark.x.toFixed(0)},${mark.z.toFixed(0)})`); continue }
    const r = worstSliceRadius(collectRun(road, dump.runKey))
    log(r.min >= FLOOR, `CAPTURE:${file.replace('rangersim-capture-', '').replace('.json', '')}`,
        `mark (${mark.x.toFixed(0)},${mark.z.toFixed(0)}) run ${dump.runKey}: dense radius = ` +
        `${r.min === Infinity ? '∞' : r.min.toFixed(2)}m (fold floor ${FLOOR}m) — in-game probe reported ` +
        `${cap.place.observed.minRadius?.toFixed(2)}m`)
}

console.log(`\n================================================================`)
console.log(`ROAD-MINRADIUS GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
