// test/road-band-coverage.mjs — band-coverage window-invariance gate (Mechanism B).
//
// GUARDS THE "ROAD DISAPPEARS ON FLY-OVER" BUG. A run is keyed by its WEST anchor "mz:mx" but its
// geometry curves EAST into the visible disc; if the streamed band is too narrow for the active road
// radius, a run anchored just outside the band drops out of the network → the terrain chunk there is
// carved with no road → a whole section vanishes and never self-heals when you drive over it (because
// the chunk is already built). The fix scales the band half-width with R (road.js _bandHalfWidth /
// ROAD_BAND_MARGIN). This gate asserts the D-16 surface invariant that the old fixed ±512 m band broke:
//
//   for a region inside BOTH stream discs, hit (is-there-road) AND gradeY (drivable height) are
//   identical regardless of which center the network was streamed around.
//
// invariance.mjs is the sibling gate but (a) shifts only one cell and (b) SKIPS points where hit
// differs — so it is blind to a run dropping out entirely. This gate samples a 300 m and a 512 m
// center shift at the full R=640 (Ultra) radius and counts hit mismatches directly.
//
// RED on the pre-fix fixed band (FORCE the prototype to return 2 → 130 / 624 hit mismatches); GREEN
// once the band scales with R.
//
// Run: node test/road-band-coverage.mjs   (exit 0 = covered/invariant; exit 1 = a section drops out)

import { buildNetwork, sampleRegion } from './lib/road-headless.mjs'

const EPS = 1e-3   // m — gradeY tolerance
// Region inside both stream discs (R=640) for every center pair below. Sampled fine enough to land
// many points inside the ~11.5 m road footprint queryNearest accepts.
const REGION = { x0: -300, x1: 300, z0: -500, z1: 500, step: 8 }
// East shifts that move the band edge across the region (the freecam-fly-over analogue). 300 m is the
// in-field capture's shift; 512 m (2 cells) is the stress case that dropped 624 points on the old band.
const SHIFTS = [{ a: { x: -150, z: 0 }, b: { x: 150, z: 0 } },
                { a: { x: 0,    z: 0 }, b: { x: 512, z: 0 } }]

let pass = 0, fail = 0
const log = (ok, name, msg) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`)
    ok ? pass++ : fail++
}

for (const { a, b } of SHIFTS) {
    const A = sampleRegion(buildNetwork(a), REGION)
    const B = sampleRegion(buildNetwork(b), REGION)
    const bMap = new Map(B.worldSamples.map(s => [`${s.x},${s.z}`, s]))
    let both = 0, hitMis = 0, gradeMis = 0, worstGrade = 0
    for (const s of A.worldSamples) {
        const t = bMap.get(`${s.x},${s.z}`); if (!t) continue
        if (s.hit !== t.hit) { hitMis++; continue }   // a run present in one build, dropped in the other
        if (!s.hit) continue
        both++
        const dG = Math.abs(s.gradeY - t.gradeY)
        if (dG > EPS) { gradeMis++; worstGrade = Math.max(worstGrade, dG) }
    }
    const shift = b.x - a.x
    log(hitMis === 0, `HIT-INVARIANT (Δcenter ${shift} m)`,
        `${both} on-road pts in both builds; hit (road present?) mismatch = ${hitMis} — a section dropping out`)
    log(gradeMis === 0, `GRADEY-INVARIANT (Δcenter ${shift} m)`,
        `gradeY mismatch = ${gradeMis} (worst Δ ${worstGrade.toFixed(3)} m) — drivable surface height`)
}

console.log('\n' + '='.repeat(64))
console.log(`ROAD-BAND-COVERAGE GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
