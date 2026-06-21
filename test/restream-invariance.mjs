// test/restream-invariance.mjs — re-stream (cache-reuse) invariance gate (plan 09, Phase 3 prep).
//
// invariance.mjs proves two FRESH instances (one update each) agree. This gate proves the SAME
// instance driven through a SEQUENCE of stream centers ends in a state byte-identical to a fresh
// build at the final center — i.e. the re-stream path (cache eviction/reuse, lazy re-slice, lazy
// profile rebuild) never serves STALE geometry / arc / gradeY. This is the live freecam↔drive-in
// tear (BUG-14) as a deterministic test, and it is the gate Phase 3 band-aid removals are checked
// against: any removal that reintroduces re-stream staleness turns this RED.
//
// Two driving patterns, both must equal a fresh build at the final center FINAL=(0,0):
//   DRIVE-IN  : approach FINAL from the far west in PROTO_REGEN_MOVE-sized steps (forces re-streams)
//   REVISIT   : sit at FINAL, jump far east, come back — caches built at FINAL, evicted, rebuilt
//
// Run: node test/restream-invariance.mjs   (exit 0 = re-stream is stale-free; exit 1 = staleness)

import * as THREE from 'three'
import { buildNetwork, buildNetworkPath, sampleRegion } from './lib/road-headless.mjs'

const FINAL = { x: 0, z: 0 }
// Region inside the stream radius at FINAL, same footprint discipline as invariance.mjs.
const REGION = { x0: -380, x1: 380, z0: -600, z1: 600, step: 8 }

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}
const eqArr = (p, q) => p.length === q.length && p.every((v, i) => v === q[i])

const ref = sampleRegion(buildNetwork(FINAL), REGION)

// Compare a driven instance's final-state region to the fresh reference.
const cmp = (driven, name, how) => {
    const d = sampleRegion(driven, REGION)
    const keysOk = eqArr(d.runKeys, ref.runKeys)
    const geomOk = eqArr(d.regionPoints, ref.regionPoints)
    const sliceOk = eqArr(d.sliceBoundaries, ref.sliceBoundaries)
    // arcS + gradeY over the on-road grid points present in both.
    const rMap = new Map(ref.worldSamples.map(s => [`${s.x},${s.z}`, s]))
    let both = 0, arcMis = 0, gradeMis = 0, camberMis = 0, worstArc = 0, worstGrade = 0, worstCamber = 0
    for (const s of d.worldSamples) {
        if (!s.hit) continue
        const t = rMap.get(`${s.x},${s.z}`)
        if (!t || !t.hit) continue
        both++
        const dA = Math.abs(s.arcS - t.arcS), dG = Math.abs(s.gradeY - t.gradeY), dC = Math.abs(s.camber - t.camber)
        if (dA > 1e-3) { arcMis++; worstArc = Math.max(worstArc, dA) }
        if (dG > 1e-3) { gradeMis++; worstGrade = Math.max(worstGrade, dG) }
        if (dC > 1e-6) { camberMis++; worstCamber = Math.max(worstCamber, dC) }
    }
    const ok = keysOk && geomOk && sliceOk && arcMis === 0 && gradeMis === 0 && camberMis === 0
    log(ok, name, `${how}\n        keys=${keysOk} geom=${geomOk} slices=${sliceOk} | ${both} on-road: arcΔ#${arcMis}(worst ${worstArc.toFixed(1)}m) gradeΔ#${gradeMis}(worst ${worstGrade.toFixed(3)}m) camberΔ#${camberMis}(worst ${(worstCamber*180/Math.PI).toFixed(3)}°)`)
}

// probe:true populates runProfile/camberProfile caches at each intermediate center (the real
// game queries every frame) so the final comparison exercises cache invalidation across re-streams,
// not just a clean final-state rebuild.
cmp(buildNetworkPath([{ x: -800, z: 0 }, { x: -600, z: 0 }, { x: -400, z: 0 }, { x: -200, z: 0 }, FINAL], { probe: true }),
    'DRIVE-IN-MATCHES-FRESH', 'drove east into (0,0) from x=-800, querying each frame')

cmp(buildNetworkPath([FINAL, { x: 1200, z: 0 }, FINAL], { probe: true }),
    'REVISIT-MATCHES-FRESH', 'sat at (0,0), jumped to x=1200, returned, querying each frame')

// ── (perf) within-cell re-stream skips the rebuild and PRESERVES caches ──────────────
// Moving >PROTO_REGEN_MOVE but within the same 256 m macro-cell yields an identical network
// signature → _streamNetwork must skip the whole rebuild (no _networkRev bump) and keep the
// per-run profile caches intact (the win that replaced the eager clear-on-restream). If this
// regresses, the cached array is rebuilt (new reference) and _networkRev advances.
{
    const road = buildNetwork(FINAL)
    for (let x = -600; x <= 600; x += 24) for (let z = -600; z <= 600; z += 24) road.debugSampleAt(x, z)
    const rev0 = road._networkRev
    const someKey = [...road._runProfileCache.keys()][0]
    const arrRef0 = road._runProfileCache.get(someKey).gradeY
    road.update(new THREE.Vector3(120, 0, 0))   // same center_mx (0), same z-rows → identical window
    const rev1 = road._networkRev
    const arrRef1 = road._runProfileCache.get(someKey)?.gradeY
    const ok = rev1 === rev0 && arrRef1 === arrRef0 && road._runProfileCache.size > 0
    log(ok, 'WITHIN-CELL-SKIP-PRESERVES-CACHE',
        `moved (0,0)→(120,0) inside one macro-cell: networkRev ${rev0}→${rev1} (no bump) cacheEntry preserved=${arrRef1 === arrRef0} (${road._runProfileCache.size} runs cached)`)
}

console.log('\n' + '='.repeat(64))
console.log(`RESTREAM-INVARIANCE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
console.log(fail
    ? '  → re-stream serves STALE state (cache handling depends on streaming history).'
    : '  → re-stream is stale-free: final state == fresh build regardless of path.')
process.exit(fail ? 1 : 0)
