// test/invariance.mjs — the window-invariance gate (plan 09 INVARIANCE-HARNESS, Phase 1).
//
// REPRODUCES THE FREECAM↔DRIVE-IN TEAR AS A DETERMINISTIC TEST — no game, no dumps, no Worker.
// Builds the SAME road network around two different stream centers (A = spawn, B = +800 m east) and
// asserts the D-16 invariant: for a FIXED world region, the run identities, run geometry, per-world-
// point arcS, per-world-point gradeY, and per-tile slice arcS boundaries are byte-identical (within
// float eps) regardless of where the network was streamed.
//
// EXPECTED STATE ON CURRENT CODE: RED. The geometry assertions (b, d) PASS — the routed polyline and
// its Y are already a pure function of world coords. The PARAMETERIZATION assertions (a, c, e) FAIL —
// run identity (`${mz}:${runIndex}`), arc origin (`run[0]`), and COVER-split boundaries all depend on
// the transient canonical band `[mx0,mx1] = f(center_mx)` (road.js:1356-1370). That window-relative
// parameterization is the root cause of the tear: when streaming shifts the band mid-session, cached
// run profiles (keyed by runKey, origined at the old `run[0]`) desync from freshly-sliced arcS →
// gradeY indexes the wrong arc → the ~20 m on-road teleport (BUG-14) and the freecam surface mismatch.
//
// Phase 2 (world-anchored arc origin + run identity + COVER suppression) makes a/c/e GREEN. This file
// does NOT change — it is the gate Phase 2 is written against.
//
// Run: node test/invariance.mjs   (exit 0 = invariant holds; exit 1 = window-variant, i.e. the bug)

import { buildNetwork, sampleRegion } from './lib/road-headless.mjs'

const CENTER_A = { x: 0,   z: 0 }   // spawn
const CENTER_B = { x: 256, z: 0 }   // +256 m east — a different canonical band (center_mx 0 vs 1).
                                    // (Was 800 m for CANONICAL_HALF_WIDTH=4's ±1024 m band; with the
                                    // Tier-1 band ±512 m the two bands must still both cover REGION.)
// Region inside BOTH stream radii (640 m): x overlap [160,640], z overlap [-640,640]. Sampled on an
// 8 m grid — fine enough to land many points inside the ~11.5 m road footprint queryNearest accepts.
const REGION = { x0: 220, x1: 600, z0: -600, z1: 600, step: 8 }

const ARC_EPS = 1e-3   // m — arcS / gradeY float tolerance

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}
const eqArr = (p, q) => p.length === q.length && p.every((v, i) => v === q[i])

const A = sampleRegion(buildNetwork(CENTER_A), REGION)
const B = sampleRegion(buildNetwork(CENTER_B), REGION)

console.log(`(centers: A=(${CENTER_A.x},${CENTER_A.z}) B=(${CENTER_B.x},${CENTER_B.z}); region x[${REGION.x0},${REGION.x1}] z[${REGION.z0},${REGION.z1}] step ${REGION.step})`)

// ── (a) run identity ──────────────────────────────────────────────────────────────
log(eqArr(A.runKeys, B.runKeys), 'RUNKEY-SET-INVARIANT',
    `runKeys covering region — A=[${A.runKeys}] B=[${B.runKeys}] (band-relative "mz:runIndex" → differs per center)`)

// ── (b) run geometry (should already hold — geometry is world-pure) ─────────────────
log(eqArr(A.regionPoints, B.regionPoints), 'GEOMETRY-INVARIANT',
    `network points inside region (value-compared, key-agnostic): ${A.regionPoints.length} A / ${B.regionPoints.length} B identical = ${eqArr(A.regionPoints, B.regionPoints)}`)

// ── (c) per-world-point arcS + (d) per-world-point gradeY ───────────────────────────
const bMap = new Map(B.worldSamples.map(s => [`${s.x},${s.z}`, s]))
let both = 0, arcMis = 0, gradeMis = 0, worstArc = 0, worstGrade = 0, ex = null
for (const s of A.worldSamples) {
    if (!s.hit) continue
    const t = bMap.get(`${s.x},${s.z}`)
    if (!t || !t.hit) continue
    both++
    const dA = Math.abs(s.arcS - t.arcS), dG = Math.abs(s.gradeY - t.gradeY)
    if (dA > ARC_EPS) { arcMis++; if (dA > worstArc) { worstArc = dA; ex = { x: s.x, z: s.z, a: s.arcS, b: t.arcS } } }
    if (dG > ARC_EPS) { gradeMis++; worstGrade = Math.max(worstGrade, dG) }
}
log(arcMis === 0, 'ARCS-INVARIANT',
    `${both} pts on-road in BOTH builds; arcS mismatch = ${arcMis} (worst Δ ${worstArc.toFixed(1)} m${ex ? ` @(${ex.x},${ex.z}): ${ex.a.toFixed(1)} vs ${ex.b.toFixed(1)}` : ''})`)
log(gradeMis === 0, 'GRADEY-INVARIANT',
    `${both} pts on-road in both; gradeY mismatch = ${gradeMis} (worst Δ ${worstGrade.toFixed(3)} m) — resolved physics surface height`)

// ── (e) slice arcS boundaries ───────────────────────────────────────────────────────
log(eqArr(A.sliceBoundaries, B.sliceBoundaries), 'SLICE-BOUNDARY-INVARIANT',
    `per-tile slice arcS0,arcS1 over region: ${A.sliceBoundaries.length} A / ${B.sliceBoundaries.length} B identical = ${eqArr(A.sliceBoundaries, B.sliceBoundaries)}`)

console.log('\n' + '='.repeat(64))
console.log(`INVARIANCE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
console.log(fail
    ? '  → RED as expected on current code: geometry is window-invariant, parameterization is NOT.'
    : '  → GREEN: the network is a pure function of (seed, world-coords, params).')
process.exit(fail ? 1 : 0)
