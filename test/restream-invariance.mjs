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
    let both = 0, arcMis = 0, gradeMis = 0, worstArc = 0, worstGrade = 0
    for (const s of d.worldSamples) {
        if (!s.hit) continue
        const t = rMap.get(`${s.x},${s.z}`)
        if (!t || !t.hit) continue
        both++
        const dA = Math.abs(s.arcS - t.arcS), dG = Math.abs(s.gradeY - t.gradeY)
        if (dA > 1e-3) { arcMis++; worstArc = Math.max(worstArc, dA) }
        if (dG > 1e-3) { gradeMis++; worstGrade = Math.max(worstGrade, dG) }
    }
    const ok = keysOk && geomOk && sliceOk && arcMis === 0 && gradeMis === 0
    log(ok, name, `${how}\n        keys=${keysOk} geom=${geomOk} slices=${sliceOk} | ${both} on-road: arcΔ#${arcMis}(worst ${worstArc.toFixed(1)}m) gradeΔ#${gradeMis}(worst ${worstGrade.toFixed(3)}m)`)
}

// probe:true populates runProfile/camberProfile caches at each intermediate center (the real
// game queries every frame) so the final comparison exercises cache invalidation across re-streams,
// not just a clean final-state rebuild.
cmp(buildNetworkPath([{ x: -800, z: 0 }, { x: -600, z: 0 }, { x: -400, z: 0 }, { x: -200, z: 0 }, FINAL], { probe: true }),
    'DRIVE-IN-MATCHES-FRESH', 'drove east into (0,0) from x=-800, querying each frame')

cmp(buildNetworkPath([FINAL, { x: 1200, z: 0 }, FINAL], { probe: true }),
    'REVISIT-MATCHES-FRESH', 'sat at (0,0), jumped to x=1200, returned, querying each frame')

console.log('\n' + '='.repeat(64))
console.log(`RESTREAM-INVARIANCE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
console.log(fail
    ? '  → re-stream serves STALE state (cache handling depends on streaming history).'
    : '  → re-stream is stale-free: final state == fresh build regardless of path.')
process.exit(fail ? 1 : 0)
