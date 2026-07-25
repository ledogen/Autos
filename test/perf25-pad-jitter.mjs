// test/perf25-pad-jitter.mjs — PERF-25 acceptance harness (rainy-day script, NOT a gate).
//
// Measures the per-frame ground-resolve cost of a PARKED truck (4 wheels, 2000 frames) through
// the same path physics takes (analyticHeight → _sampleCarveWorld → _junctionPadCarve memo=true):
//   (1) parked ON a junction pad, EXACT repeated positions (memo hits — PERF-24's win)
//   (2) parked ON the pad with 3 mm positional jitter (suspension noise — the PERF-25 miss)
//   (3) parked mid-edge OFF-pad, same jitter (control)
//
// Ticket baseline (2026-07-25, pre-fix): exact 115 · jitter 227 · off-pad 37 µs/frame.
// STAGE 2 PHASE 5 EXIT CRITERION: (2) ≤ 1.5 × (3). Also sanity-prints height agreement between
// jittered and exact center resolves (no 0.7 m-class quantization shifts — the PERF-24 trap).
//
// Run: node test/perf25-pad-jitter.mjs
// Pad point = capture 1784909578369 (seed 6, parked-lag user report).

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const P = { ...RANGER_PARAMS, roadNetworkMode: 'graph' }
const PAD = { x: -99.9, z: 172.4 }
const FRAMES = 2000
const JITTER = 0.003   // m — measured suspension noise scale

console.log('━━ PERF-25 pad-resolve harness — seed 6, default params ━━')
let t0 = Date.now()
const r = new RoadSystem(6, P)
r.setRadius(800)
r.update(new THREE.Vector3(PAD.x, 0, PAD.z))
console.log(`   build ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const { analyticHeight } = makeTerrainHeadless(parseWorldSeed('6'), P, r)

// Sanity: the pad point must actually resolve onto road surface.
{
    const raw = (x, z) => analyticHeight(x, z)
    console.log(`   pad point height ${raw(PAD.x, PAD.z).toFixed(2)} m (raw-terrain ref for context)`)
}

// OFF-pad control: the midpoint of a long registered run, ≥150 m from both endpoints.
let OFF = null
for (const [, e] of r._network) {
    if (!e.centerline || e.centerline.length < 400) continue
    const p = e.centerline.pointAt(e.centerline.length / 2)
    const A = r._nodePos(e.cellA), B = r._nodePos(e.cellB)
    if (Math.hypot(p.x - A.x, p.z - A.z) < 150 || Math.hypot(p.x - B.x, p.z - B.z) < 150) continue
    OFF = { x: p.x, z: p.z }
    break
}
if (!OFF) { console.error('no off-pad control run found'); process.exit(1) }
console.log(`   off-pad control at (${OFF.x.toFixed(0)}, ${OFF.z.toFixed(0)})`)

// Truck footprint: 4 wheel contact points (±halfTrack, ±halfBase around the parked point).
const wheelsAt = (c) => [
    { x: c.x - 0.72, z: c.z - 1.30 }, { x: c.x + 0.72, z: c.z - 1.30 },
    { x: c.x - 0.72, z: c.z + 1.30 }, { x: c.x + 0.72, z: c.z + 1.30 },
]
// Deterministic jitter stream (mulberry32-style — reproducible run to run).
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function scenario(name, center, jitter) {
    const wheels = wheelsAt(center)
    const rand = rng(0xC0FFEE)
    // warmup (fills memos exactly like a settling park)
    for (let f = 0; f < 100; f++) for (const w of wheels) analyticHeight(w.x, w.z)
    const t = performance.now()
    let sink = 0
    for (let f = 0; f < FRAMES; f++) {
        for (const w of wheels) {
            const jx = jitter ? (rand() * 2 - 1) * jitter : 0
            const jz = jitter ? (rand() * 2 - 1) * jitter : 0
            sink += analyticHeight(w.x + jx, w.z + jz)
        }
    }
    const us = (performance.now() - t) * 1000 / FRAMES
    console.log(`   ${name}: ${us.toFixed(0)} µs/frame (4 wheels)  [checksum ${sink.toFixed(1)}]`)
    return us
}

const exact = scenario('pad EXACT   ', PAD, 0)
const jit = scenario('pad JITTER  ', PAD, JITTER)
const off = scenario('off-pad ctrl', OFF, JITTER)

const ratio = jit / off
console.log(`\n   jitter-on-pad / off-pad = ${ratio.toFixed(2)}×  ${ratio <= 1.5 ? '✓ within the 1.5× PERF-25 exit bar' : '✗ OVER the 1.5× PERF-25 exit bar'}`)

// Height-agreement sanity: jittered resolves must track the exact-position surface (±3 mm moves
// on a ≤15% grade surface legitimately change height ≤ ~1 mm — flag anything ≥ 5 cm as a
// quantization-class shift, the PERF-24 trap).
{
    let worst = 0
    for (const w of wheelsAt(PAD)) {
        const h0 = analyticHeight(w.x, w.z)
        for (const [dx, dz] of [[JITTER, 0], [-JITTER, 0], [0, JITTER], [0, -JITTER]]) {
            const d = Math.abs(analyticHeight(w.x + dx, w.z + dz) - h0)
            if (d > worst) worst = d
        }
    }
    console.log(`   jitter height delta worst ${(worst * 1000).toFixed(2)} mm ${worst < 0.05 ? '✓' : '✗ quantization-class shift!'}`)
}
