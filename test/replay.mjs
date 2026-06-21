// test/replay.mjs — reproduce a captured bug headlessly (plan 09 INVARIANCE-HARNESS, Phase 4/5).
//
// THE DEFAULT DEBUG LOOP. You mark a bug in-sim (press 'p' = place, or \ = event), send the capture
// JSON, and:  node test/replay.mjs <capture.json>
//
// kind:"place" (Phase 4, live) — rebuilds the REAL road from world.seed+params (RoadSystem builds the
//   same seeded coarse height the game uses, so NO terrain worker is needed), then:
//     1. DIFF: recompute what the game observed at the mark (runKey/arcS/gradeY/camber/minRadius) and
//        compare to capture.place.observed → match = bug deterministically reproduced.
//     2. WINDOW-INVARIANCE at the marked region (build from two stream centers; D-16) → catches a tear.
//     3. FOLD METRIC at the mark (local centerline turn radius) → flags kink/fold geometry.
//
// kind:"event" (Phase 5) — replays event.inputTimeline through a headless physics loop from
//   event.initialState and diffs the trajectory vs event.frames → first-divergence frame = the bug.
//
// Exit 0 = reproduced/healthy report; exit 1 = validation error or a hard reproduction failure.

import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { validateCapture } from '../src/capture.js'
import { sampleRegion } from './lib/road-headless.mjs'

const path = process.argv[2]
if (!path) { console.error('usage: node test/replay.mjs <capture.json>'); process.exit(2) }

let capture
try { capture = JSON.parse(readFileSync(path, 'utf8')) }
catch (e) { console.error(`[replay] cannot read/parse ${path}: ${e.message}`); process.exit(2) }

const v = validateCapture(capture)
if (!v.ok) { console.error(`[replay] invalid capture:\n  - ${v.errors.join('\n  - ')}`); process.exit(2) }

const { seed, seedString, params } = capture.world
console.log(`[replay] ${capture.kind} capture  seed=${seed}${seedString ? ` (${seedString})` : ''}`)
if (capture.complaint) console.log(`         complaint: "${capture.complaint}"`)

// ── build the real road headless (pure fn of seed+params+coords) ────────────────────
const buildRoad = (cx, cz) => {
    const road = new RoadSystem(seed, params)         // NO override → the game's real coarse height
    road.update(new THREE.Vector3(cx, 0, cz))
    return road
}

let fail = 0
const eqArr = (p, q) => p.length === q.length && p.every((x, i) => x === q[i])

if (capture.kind === 'place') {
    const { mark, region, observed } = capture.place
    const road = buildRoad(mark.x, mark.z)

    // ── (1) reproduction diff ────────────────────────────────────────────────────────
    const got = road.debugSampleAt(mark.x, mark.z)
    const cmp = [
        ['hit',       observed.hit,       got.hit,    0],
        ['runKey',    observed.runKey,    got.runKey, null],
        ['arcS',      observed.arcS,      got.arcS,    1e-3],
        ['gradeY',    observed.gradeY,    got.gradeY,  1e-3],
        ['camber',    observed.camber,    got.camber,  1e-6],
        ['minRadius', observed.minRadius, got.minR,    1e-2],
    ]
    console.log(`\n  (1) REPRODUCTION DIFF @ mark (${mark.x.toFixed(1)}, ${mark.z.toFixed(1)})`)
    let reproOk = true
    for (const [name, exp, act, tol] of cmp) {
        if (exp === undefined) { console.log(`        ${name}: (not recorded)`); continue }
        const ok = tol === null ? exp === act : Math.abs((exp ?? 0) - (act ?? 0)) <= tol
        if (!ok) reproOk = false
        const fmt = (x) => typeof x === 'number' ? x.toFixed(4) : x
        console.log(`        ${ok ? '✓' : '✗'} ${name}: game=${fmt(exp)} replay=${fmt(act)}`)
    }
    console.log(reproOk
        ? '        → REPRODUCED: replay road == game road at the mark.'
        : '        → MISMATCH: replay differs from the game (env/timing/float, or stale capture).')
    if (!reproOk) fail = 1

    // ── (2) surface window-invariance at the marked region (the REAL tear gate) ────────
    // Build B from a SHIFTED center that still fully covers the region (offset + region half-extent
    // must stay inside the stream radius, else B simply lacks the road there — a false "tear").
    // The tear that matters is in the PHYSICAL SURFACE the truck drives on (gradeY) + whether the
    // point resolves to road (hit). runKey/arcS are an INTERNAL parameterization that reparameterizes
    // across bands for long west-truncated runs (the owner anchor isn't fully band-independent there);
    // that is atomic/internal in the live game (one instance rebuilds coherently) and is reported as
    // INFO, not a failure — it is NOT a surface tear (gradeY stays invariant).
    const REG = { ...region, step: 8 }
    const A = sampleRegion(road, REG)
    const B = sampleRegion(buildRoad(mark.x + 300, mark.z), REG)
    const geomOk = eqArr(A.regionPoints, B.regionPoints)   // network geometry value-compared (key-agnostic)
    const bMap = new Map(B.worldSamples.map(s => [`${s.x},${s.z}`, s]))
    let both = 0, hitMis = 0, gradeMis = 0, worstGrade = 0, arcReparam = 0
    for (const s of A.worldSamples) {
        const t = bMap.get(`${s.x},${s.z}`); if (!t) continue
        if (s.hit !== t.hit) { hitMis++; continue }
        if (!s.hit) continue
        both++
        if (Math.abs(s.gradeY - t.gradeY) > 1e-3) { gradeMis++; worstGrade = Math.max(worstGrade, Math.abs(s.gradeY - t.gradeY)) }
        if (Math.abs(s.arcS - t.arcS) > 1e-3) arcReparam++
    }
    const surfaceOk = geomOk && hitMis === 0 && gradeMis === 0
    console.log(`\n  (2) SURFACE WINDOW-INVARIANCE over region [${region.x0.toFixed(0)},${region.x1.toFixed(0)}]×[${region.z0.toFixed(0)},${region.z1.toFixed(0)}]`)
    console.log(`        ${surfaceOk ? '✓' : '✗'} geometry+gradeY identical across stream centers: ${both} on-road pts (gradeΔ#${gradeMis} worst ${worstGrade.toFixed(3)}m, hitΔ#${hitMis})`)
    console.log(`        · info: arcS reparameterized on ${arcReparam}/${both} pts (internal; not a surface tear)`)
    if (!surfaceOk) { console.log('        → SURFACE TEAR present at this location (drivable height is window-variant).'); fail = 1 }

    // ── (3) fold / kink metric at the mark ────────────────────────────────────────────
    const minR = got.minR ?? 9999
    const HARD = params.roadMinTurnRadius ?? 45
    console.log(`\n  (3) FOLD METRIC @ mark`)
    console.log(`        local centerline turn radius = ${minR.toFixed(1)} m  (design min ${HARD} m)`)
    console.log(minR < HARD * 0.6
        ? `        → SHARP KINK: radius well under design min — likely the fold/kink.`
        : `        → centerline radius within tolerance here.`)

} else if (capture.kind === 'event') {
    const { replayEvent } = await import('./lib/physics-replay.mjs')   // lazy: only the event path loads physics+terrain
    const res = await replayEvent(capture, { THREE })
    if (!res.ok) fail = 1
}

console.log('\n' + '='.repeat(64))
console.log(`REPLAY: ${fail ? 'reproduction FAILED / bug present' : 'report complete'} — exit ${fail}`)
process.exit(fail)
