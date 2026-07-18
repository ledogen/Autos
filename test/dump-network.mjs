// test/dump-network.mjs — serialize a streamed road network for feel-diff comparison (PERF worldgen).
//
// Builds a headless RoadSystem (same harness pattern as road-character.mjs), streams the given
// window, and writes JSON: every run's centerline (decimated to ~emitDs) keyed by runKey, plus
// summary counts. Pair of dumps → node test/feel-diff.mjs a.json b.json.
//
//   node test/dump-network.mjs out=/tmp/a.json                 # seed 6, landmark window
//   node test/dump-network.mjs seed=42 r=1400 out=/tmp/b.json roadArcHeurWeight=2
//
// Reserved keys: seed, cx, cz, r, out. Everything else k=v is a RANGER_PARAMS override.
// Not a gate — a workbench tool for the routing-perf work (pairs with test/feel-diff.mjs).

import * as THREE from 'three'
import { writeFileSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'

const argv = process.argv.slice(2)
const reserved = { seed: 6, cx: -975, cz: 765, r: 1400, out: '' }
const overrides = {}
for (const a of argv) {
    const m = a.match(/^([A-Za-z][A-Za-z0-9]*)=(.+)$/)
    if (!m) continue
    if (m[1] === 'out') { reserved.out = m[2]; continue }
    const v = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2])
    if (m[1] in reserved) reserved[m[1]] = v
    else overrides[m[1]] = v
}
if (!reserved.out) { console.error('usage: node test/dump-network.mjs out=<file.json> [seed= cx= cz= r= k=v...]'); process.exit(2) }

const P = { ...RANGER_PARAMS, ...overrides }
const t0 = performance.now()
const road = new RoadSystem(reserved.seed, P)
road.setRadius(reserved.r)
road.update(new THREE.Vector3(reserved.cx, 0, reserved.cz))
const buildMs = performance.now() - t0

const runs = {}
let totalLen = 0
for (const [runKey, entry] of road._network) {
    const pts = entry.points
    if (!pts || pts.length < 2) continue
    const flat = []
    let len = 0
    for (let i = 0; i < pts.length; i++) {
        flat.push(Number(pts[i].x.toFixed(2)), Number(pts[i].y.toFixed(2)), Number(pts[i].z.toFixed(2)))
        if (i) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    }
    totalLen += len
    runs[runKey] = { len: Number(len.toFixed(1)), pts: flat }
}

writeFileSync(reserved.out, JSON.stringify({
    meta: { seed: reserved.seed, cx: reserved.cx, cz: reserved.cz, r: reserved.r, overrides, buildMs: Number(buildMs.toFixed(0)) },
    summary: { runs: Object.keys(runs).length, totalLen: Number(totalLen.toFixed(0)) },
    runs,
}))
console.log(`dumped ${Object.keys(runs).length} runs, ${(totalLen / 1000).toFixed(1)} km, build ${buildMs.toFixed(0)} ms → ${reserved.out}`)
