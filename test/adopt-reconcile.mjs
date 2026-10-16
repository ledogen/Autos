// test/adopt-reconcile.mjs — BUG-76: a positional adopt that re-shapes road inside already-carved
// chunks must name every such chunk.
//
// The bug: free roam re-streams the road network around the car, and a mid-span T promotion can exist
// in one window and not the next (the FEAT-77 clearance re-route sees different neighbours, so the plan
// declines the T). A 'move' adopt never bumps roadGeneration, so the chunks carved under the old road
// kept their mesh + heightfield + road trimesh while the wheels read the new analyticHeight: tyres sank
// 0.6 m into the ground, the chassis rode the stale collider (owner capture, seed "w", 2026-09-26).
//
// The fix: RoadSystem.adoptNetwork() diffs the swap and returns `{x, z, reach}` discs
// (lastAdoptDirty()); main.js re-carves the chunks and rebuilds the ribbon tiles those discs touch.
// This gate replays the game's streaming headlessly and holds the invariant the bug broke:
//   a warm builder drives a path (the owner's captured route + a straight pass through the mark), and
//   every time its network changes (the band-sig guard short-circuits otherwise, as in the game) the
//   export is ADOPTED into a separate play instance. A cache of carve tables stands in for the built
//   terrain chunks in a ±RING window around the car: chunks entering the ring are carved, and after an
//   adopt a chunk is re-carved ONLY if the dirty discs touch it (BUG-76) or the existing coverage
//   stamp flips (the 2026-09-06 arrival rule) — the same two triggers main.js/terrain.js act on.
//   INVARIANT after every adopt: every cached chunk equals a fresh carve under the live network.
//   A miss is exactly the owner's bug — a chunk left carved against a road that is no longer there.
// Also: the owner's flip must actually occur on the route (else the gate is vacuous), and an adopt of
// an identical network must report nothing dirty. Over-invalidation is reported, not asserted.
//
// Run: node test/adopt-reconcile.mjs   (exit 0 = every re-shaped chunk is named)

import * as THREE from 'three'
import { TerrainSystem, CHUNK_SIZE, GRID_SAMPLES } from '../src/terrain.js'
import { RoadSystem } from '../src/road.js'
import { WaterSystem } from '../src/water.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'
import { BUG76_SEED_STRING, BUG76_MARK, BUG76_ROUTE } from './lib/bug76-route.mjs'

const SEED = parseWorldSeed(BUG76_SEED_STRING)   // 177618 — the owner's capture
const MARK = BUG76_MARK
const R = 320                                    // Normal quality's road radius ((ring 2 + 0.5)·128)
const RING = 3                                   // built chunks: ±3 around the car's chunk (7×7)
const N = GRID_SAMPLES, S = CHUNK_SIZE, P = RANGER_PARAMS
const cell = S / (N - 1)
const ROUTES = [
    ['capture route', BUG76_ROUTE],
    ['E→W through mark', [[MARK.x + 900, MARK.z], [MARK.x - 900, MARK.z]]],
    ['N→S through mark', [[MARK.x, MARK.z - 900], [MARK.x, MARK.z + 900]]],
]

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

// Water wired exactly as the game does (main.js setWaterNoGo) — without it the router prices a
// different network and the owner's flip does not happen.
const { rawHeightWorld } = makeTerrainHeadless(SEED, P, null)
const water = new WaterSystem(SEED, P, rawHeightWorld)
const pondDiscs = (a, b, c, d) => { const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o }
const fresh = () => { const r = new RoadSystem(SEED, P); r.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), pondDiscs); r.setRadius(R); return r }

const noise = makeNoise(SEED)
const rawCache = new Map()
const rawOf = (cx, cz) => {
    const k = cx + ',' + cz; let r = rawCache.get(k); if (r) return r
    r = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) r[zi * N + xi] = rawHeightWorld(cx * S + xi * cell, cz * S + zi * cell)
    rawCache.set(k, r); return r
}
// The real _buildCarveTable via a fake `this` (carve-mesh-smoothness.mjs pattern), flattened to the
// surface the mesh draws: raw + blendW·(gradeY − raw).
const carve = (road, cx, cz) => {
    const raw = rawOf(cx, cz)
    const t = TerrainSystem.prototype._buildCarveTable.call({ _roadSystem: road, _params: P,
        _noiseCoarse: noise.noiseCoarse, _noiseFine: noise.noiseFine, _noiseRegional: noise.noiseRegional }, cx, cz, raw)
    const out = new Float64Array(N * N)
    for (let i = 0; i < N * N; i++) { const h = raw[i]; out[i] = t ? h + t[i * 2] * (t[i * 2 + 1] - h) : h }
    return out
}
const covers = (road, cx, cz) => { const x0 = cx * S, z0 = cz * S
    return road.networkCoversXZ(x0, z0) || road.networkCoversXZ(x0 + S, z0) || road.networkCoversXZ(x0, z0 + S)
        || road.networkCoversXZ(x0 + S, z0 + S) || road.networkCoversXZ(x0 + S / 2, z0 + S / 2) }
const touched = (dirty, cx, cz) => {   // recarveInPlace()'s own overlap test
    if (!dirty) return false
    const x0 = cx * S, z0 = cz * S
    return dirty.some(r => { const px = Math.max(x0, Math.min(x0 + S, r.x)), pz = Math.max(z0, Math.min(z0 + S, r.z))
        return Math.hypot(r.x - px, r.z - pz) <= r.reach + cell })
}
const maxDiff = (a, b) => { let w = 0; for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i])); return w }

const markKeys = new Set()
let adopts = 0, dirtyAdopts = 0, recarves = 0, overInval = 0
const misses = []
for (const [name, route] of ROUTES) {
    const pts = []
    for (let i = 0; i < route.length; i++) {
        if (i) { const [ax, az] = route[i - 1], [bx, bz] = route[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 24)
            for (let k = 1; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]) }
        pts.push(route[i])
    }
    const builder = fresh(), live = fresh()
    const built = new Map()   // chunk key → { surf, covered }
    let lastRev = -1
    for (const [x, z] of pts) {
        builder.update(new THREE.Vector3(x, 0, z))
        if (builder._networkRev !== lastRev) {
            lastRev = builder._networkRev
            live.adoptNetwork(builder.exportNetwork())
            adopts++
            markKeys.add(live.debugSampleAt(MARK.x, MARK.z).runKey || '(none)')
            const dirty = live.lastAdoptDirty()
            if (dirty) dirtyAdopts++
            // The game's two re-carve triggers for chunks already built.
            for (const [k, c] of built) {
                const [cx, cz] = k.split(',').map(Number)
                const cov = covers(live, cx, cz)
                if (touched(dirty, cx, cz) || cov !== c.covered) {
                    const surf = carve(live, cx, cz); recarves++
                    if (maxDiff(surf, c.surf) === 0) overInval++
                    built.set(k, { surf, covered: cov })
                }
            }
            // INVARIANT: nothing built is stale against the adopted network.
            for (const [k, c] of built) {
                const [cx, cz] = k.split(',').map(Number)
                const d = maxDiff(carve(live, cx, cz), c.surf)
                if (d > 0) misses.push(`${name} @(${x.toFixed(0)},${z.toFixed(0)}) chunk ${k} stale by ${d.toFixed(3)} m`)
            }
        }
        // Stream the ring: new chunks are carved against the network as it stands (evictions dropped).
        const ccx = Math.floor(x / S), ccz = Math.floor(z / S)
        for (const k of [...built.keys()]) { const [cx, cz] = k.split(',').map(Number); if (Math.abs(cx - ccx) > RING + 1 || Math.abs(cz - ccz) > RING + 1) built.delete(k) }
        for (let cx = ccx - RING; cx <= ccx + RING; cx++) for (let cz = ccz - RING; cz <= ccz + RING; cz++) {
            const k = cx + ',' + cz
            if (!built.has(k)) built.set(k, { surf: carve(live, cx, cz), covered: covers(live, cx, cz) })
        }
    }
}

log(markKeys.has('g:1,0,2:0,1,2') && markKeys.has('g:635643,448649,-1:0,1,2'), 'the owner\'s flip occurs on the route',
    `roads seen under the mark: ${[...markKeys].join('  ')}`)
log(misses.length === 0, 'no chunk is left carved against a road that moved',
    misses.length ? `${misses.length} STALE: ${misses.slice(0, 6).join(' | ')}`
                  : `${adopts} adopts (${dirtyAdopts} dirty), ${recarves} re-carves; every built chunk matched the live network after every adopt`)
console.log(`        · info: ${overInval}/${recarves} re-carves changed nothing (over-invalidation: a wasted re-carve, not a defect)`)

const netB = (() => { const r = fresh(); r.update(new THREE.Vector3(MARK.x, 0, MARK.z)); return r.exportNetwork() })()
const same = fresh(); same.adoptNetwork(netB); same.adoptNetwork(netB)
log(same.lastAdoptDirty() === null, 'identical adopt is clean', `re-adopting the same network reports ${same.lastAdoptDirty()?.length ?? 0} dirty discs`)

console.log(`\nadopt-reconcile: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
