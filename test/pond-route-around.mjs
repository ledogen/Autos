// test/pond-route-around.mjs — FEAT-17 acceptance gate: roads route AROUND ponds.
//
// Ponds are HARD route no-go (contrast streams, which are bridged — FEAT-18). The exclusion is two
// coordinated parts injected via RoadSystem.setWaterNoGo (main.js wires it; road.js never imports
// water.js):
//   Part B — anchor SITES inside a pond+skirt disc are dropped from the alive set (_aliveSitesIn),
//            so no graph node/junction sits in the water.
//   Part A — every route SPEC carries the overlapping pond+skirt discs as pure DATA
//            (opts.pondDiscs), and arcPrimitiveConnect hard-rejects primitives entering one. This is
//            the actual guarantee: two dry anchors on opposite sides of a pond would otherwise be
//            joined straight through it — and worse than neutral, the router's wAlt valley-seeking
//            term makes pond floors (valley minima) the CHEAPEST cells, so it is actively drawn in.
//
// Checks (seed 6, default params, 1600 m band streamed at the pond cluster near spawn):
//   1. NON-VACUOUS  — WITHOUT the injection, streamed centerlines DO cross pond discs (the router
//                     genuinely wants the water; if this ever hits 0 the gate lost its teeth).
//   2. ROUTE-AROUND — WITH the injection, ZERO dense centerline points inside any pond+skirt disc.
//   3. DRY-NODES    — WITH the injection, zero graph nodes (edge endpoints) inside any disc.
//
// Determinism/window-invariance of the exclusion rides on WaterSystem purity (water-invariance.mjs)
// + the router's existing invariance gates (the discs are a pure fn of the edge's anchors).
//
// Run: node test/pond-route-around.mjs

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEED = 6
const CENTER = { x: 139, z: 341 }   // pond-dense area near spawn (water-invariance.mjs seed-6 world)
const R = 1600

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
// All discs the streamed band could touch (band + router margin ≪ this query pad).
const ponds = water.pondsNear(CENTER.x - R - 500, CENTER.z - R - 500, CENTER.x + R + 500, CENTER.z + R + 500)

const inAnyDisc = (x, z) => {
    for (const p of ponds) {
        const rr = p.radius + p.skirt
        if ((x - p.floorX) ** 2 + (z - p.floorZ) ** 2 <= rr * rr) return true
    }
    return false
}

const build = (injectWater) => {
    const r = new RoadSystem(SEED, RANGER_PARAMS)
    if (injectWater) {
        r.setWaterNoGo(
            (x, z) => water.isRoadNoGo(x, z),
            (minX, minZ, maxX, maxZ) => {
                const discs = []
                for (const p of water.pondsNear(minX, minZ, maxX, maxZ)) discs.push(p.floorX, p.floorZ, p.radius + p.skirt)
                return discs
            }
        )
    }
    r.setRadius(R)
    r.update(new THREE.Vector3(CENTER.x, 0, CENTER.z))
    return r
}

const wetStats = (r) => {
    let wetPts = 0, pts = 0, wetNodes = 0, nodes = 0
    const nodeSeen = new Set()
    for (const [, e] of r._network) {
        for (const p of e.points) { pts++; if (inAnyDisc(p.x, p.z)) wetPts++ }
        for (const c of [e.cellA, e.cellB]) {
            const np = r._nodePos(c), k = `${np.x.toFixed(1)},${np.z.toFixed(1)}`
            if (nodeSeen.has(k)) continue
            nodeSeen.add(k); nodes++
            if (inAnyDisc(np.x, np.z)) wetNodes++
        }
    }
    return { wetPts, pts, wetNodes, nodes }
}

// 1. NON-VACUOUS — the un-injected router runs through ponds (valley-seeking pulls it in).
const base = wetStats(build(false))
log(base.wetPts > 0, 'NON-VACUOUS',
    `without water: ${base.wetPts}/${base.pts} centerline points inside pond discs (router wants the water)`)

// 2 + 3. ROUTE-AROUND + DRY-NODES — the injected network never touches a pond+skirt disc.
const wet = wetStats(build(true))
log(wet.wetPts === 0, 'ROUTE-AROUND',
    `with water: ${wet.wetPts}/${wet.pts} centerline points inside pond+skirt discs (must be 0)`)
log(wet.wetNodes === 0, 'DRY-NODES',
    `with water: ${wet.wetNodes}/${wet.nodes} graph nodes inside pond+skirt discs (must be 0)`)

console.log(`\nPOND-ROUTE-AROUND GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
