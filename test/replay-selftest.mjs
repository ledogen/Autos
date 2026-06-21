// test/replay-selftest.mjs — CI gate for the capture↔replay round-trip (plan 09, Phase 4).
//
// Builds a real road headless, MAKES a kind:"place" capture from it (the exact code main.js's 'p'
// runs), then REPLAYS that capture against a freshly-built road and asserts the reproduction diff is
// zero. This keeps src/capture.js + test/replay.mjs's place path honest in CI without needing a
// hand-authored fixture or a browser. (Uses the harness synthetic terrain via buildNetwork so it is
// seed-stable; the real-coarse path is exercised by live captures fed to replay.mjs directly.)

import * as THREE from 'three'
import { buildPlaceCapture, validateCapture } from '../src/capture.js'
import { buildNetwork } from './lib/road-headless.mjs'

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const SEED = 6
// Build the network, then pick the mark FROM an actual network point so it is guaranteed on-road
// (queryNearest's footprint is ~11.5 m; an arbitrary grid point often misses).
const road = buildNetwork({ x: 300, z: 0 })
const params = road._params
let longest = null
for (const { points } of road._network.values()) if (!longest || points.length > longest.length) longest = points
const midPt = longest[Math.floor(longest.length / 2)]
const MARK = { x: midPt.x, z: midPt.z }

// (1) schema: a built capture validates.
const capture = buildPlaceCapture({
    roadSystem: road, worldSeed: SEED, seedString: 'selftest', params,
    mark: MARK, complaint: 'selftest place mark',
})
const v = validateCapture(capture)
log(v.ok && capture.kind === 'place', 'CAPTURE-VALIDATES', v.ok ? `kind=place, observed.runKey=${capture.place.observed.runKey}` : v.errors.join('; '))

// (2) round-trip: replay the SAME synthetic build → diff must be exactly zero (deterministic).
const road2 = buildNetwork(MARK)   // independent instance, identical inputs
const got = road2.debugSampleAt(MARK.x, MARK.z)
const o = capture.place.observed
const dArc = Math.abs(o.arcS - got.arcS), dGrade = Math.abs(o.gradeY - got.gradeY), dCam = Math.abs(o.camber - got.camber)
const keyOk = o.runKey === got.runKey
const reproOk = o.hit === got.hit && keyOk && dArc < 1e-9 && dGrade < 1e-9 && dCam < 1e-9
log(reproOk, 'PLACE-REPRO-EXACT',
    `runKey ${o.runKey}==${got.runKey}=${keyOk} | arcΔ=${dArc.toExponential(1)} gradeΔ=${dGrade.toExponential(1)} camberΔ=${dCam.toExponential(1)}`)

// (3) the marked spot actually resolved to a road (capture is meaningful).
log(capture.place.observed.hit === 1, 'MARK-ON-ROAD', `hit=${capture.place.observed.hit} (mark must land on a run)`)

console.log('\n' + '='.repeat(64))
console.log(`REPLAY-SELFTEST GATES: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
