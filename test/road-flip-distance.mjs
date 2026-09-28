// test/road-flip-distance.mjs — BUG-76 companion: the road the player DRIVES must not depend on the
// route they took to reach it.
//
// Free roam re-streams the road network around the car, and some of it is legitimately
// window-dependent: a mid-span T promotion exists or not depending on which neighbours the FEAT-77
// clearance re-route can see (BUG-63's side note — a T cannot form into a road that is not streamed).
// adopt-reconcile.mjs makes the built terrain FOLLOW such a flip. This gate bounds WHERE flips may
// happen: a warm RoadSystem drives long paths exactly as the network worker does, samples the road
// surface (gradeY / hit) on a 16 m grid out to 300 m after every step, and records how far from the
// window centre any sample changed. Closest flip > FLIP_FLOOR ⇒ the ground under and just ahead of the
// car is a pure function of the seed, whatever the approach.
//
// Measured 2026-09-26 at R 320 on seed "w": closest flip 114–140 m on the owner's route (the
// number depends on where the 24 m steps land relative to the flip; 0.077 m of grade), none within
// 100 m; R 576 had no flips out to 300 m. A red here means window-dependence has reached driving range —
// that is real nondeterminism, which no amount of re-carving can hide.
//
// Run: node test/road-flip-distance.mjs   (exit 0 = no flip inside FLIP_FLOOR)

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { BUG76_SEED_STRING, BUG76_ROUTE } from './lib/bug76-route.mjs'

const R = 320            // Normal quality — the smallest play radius, so flips sit closest here
const FLIP_FLOOR = 100   // m
const STEP = 24, GRID = 16, SAMPLE_R = 300
const CASES = [
    // seed "w": the owner's BUG-76 site — straight passes through the flipping T at (245, 604)
    { seed: parseWorldSeed(BUG76_SEED_STRING), paths: [
        ['w owner route', BUG76_ROUTE],
        ['w E→W', [[1145, 604], [-655, 604]]],
        ['w N→S', [[245, -296], [245, 1504]]],
    ] },
    // seed 6: the boot world, a second sample
    { seed: 6, paths: [
        ['6 E→W', [[900, 300], [-900, 300]]],
        ['6 SW→NE', [[-640, -340], [640, 940]]],
    ] },
]

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

for (const { seed, paths } of CASES) {
    // Water wired as the game does it — pond route-around changes the network.
    const { rawHeightWorld } = makeTerrainHeadless(seed, P, null)
    const water = new WaterSystem(seed, P, rawHeightWorld)
    const pondDiscs = (a, b, c, d) => { const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o }
    for (const [name, route] of paths) {
        const road = new RoadSystem(seed, P)
        road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), pondDiscs)
        road.setRadius(R)
        const prev = new Map()
        let flips = 0, closest = Infinity, at = ''
        const pts = [route[0]]   // densify to ≤STEP between waypoints
        for (let i = 1; i < route.length; i++) {
            const [ax, az] = route[i - 1], [bx, bz] = route[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP)
            for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n])
        }
        for (const [cx, cz] of pts) {
            road.update(new THREE.Vector3(cx, 0, cz))
            for (let gx = Math.floor((cx - SAMPLE_R) / GRID); gx <= Math.ceil((cx + SAMPLE_R) / GRID); gx++)
            for (let gz = Math.floor((cz - SAMPLE_R) / GRID); gz <= Math.ceil((cz + SAMPLE_R) / GRID); gz++) {
                const x = gx * GRID, z = gz * GRID, d = Math.hypot(x - cx, z - cz)
                if (d > SAMPLE_R) continue
                const s = road.debugSampleAt(x, z), v = s.hit ? s.gradeY : null, k = gx + ',' + gz
                if (prev.has(k)) {
                    const p = prev.get(k)
                    const moved = (p === null) !== (v === null) || (p !== null && Math.abs(p - v) > 0.05)
                    if (moved) { flips++; if (d < closest) { closest = d; at = `(${x},${z}) from centre (${cx.toFixed(0)},${cz.toFixed(0)}), now ${s.runKey || 'no road'}` } }
                }
                prev.set(k, v)
            }
        }
        log(closest > FLIP_FLOOR, `${name}: no flip within ${FLIP_FLOOR} m`,
            flips ? `${flips} flips; closest ${closest.toFixed(0)} m at ${at}` : 'no flips out to 300 m')
    }
}

console.log(`\nroad-flip-distance: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
