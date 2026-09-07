// test/pond-route-around.mjs — FEAT-17 acceptance gate: roads route AROUND ponds.
//
// Ponds are HARD route no-go (contrast streams, which are bridged — FEAT-18). The exclusion is two
// coordinated parts injected via RoadSystem.setWaterNoGo (main.js wires it; road.js never imports
// water.js):
//   Part B — anchor SITES inside a pond+skirt disc are dropped from the alive set (_aliveSitesIn),
//            so no graph node/junction sits in the water.
//   Part A — every route SPEC carries the overlapping pond+skirt discs as pure DATA
//            (opts.pondDiscs), and the corridor search refuses to enter one. This is the actual
//            guarantee: two dry anchors on opposite sides of a pond would otherwise be joined
//            straight through it — and worse than neutral, a pond floor is a valley minimum, which
//            is exactly the low ground a cost-minimising route is drawn to.
//
// Checks (default params, 1600 m band streamed at a pond cluster, over a small SITE CORPUS):
//   1. NON-VACUOUS  — WITHOUT the injection, streamed centerlines DO cross pond discs (the router
//                     genuinely wants the water; if this ever hits 0 the gate lost its teeth).
//   2. ROUTE-AROUND — WITH the injection, ZERO dense centerline points inside any pond+skirt disc.
//   3. DRY-NODES    — WITH the injection, zero graph nodes (edge endpoints) inside any disc.
//
// WHY A CORPUS AND NOT ONE WINDOW (2026-09-06). Non-vacuity was pinned to seed 6 @(139,341) and
// went RED there under router v2 — 0 of 12850 points wet, closest approach 4.6 m. That is not the
// guarantee failing (route-around and dry-nodes both still pass there); it is the router no longer
// being TEMPTED in that particular window. v2 prices elevation with money, so descending into a
// basin and climbing back out costs real cut and fill, where v1 priced the plan abstractly and a
// valley minimum was free to fall into. The pull is weaker, not gone — measured without the
// injection: seed 1 @(0,0) 65/13622 wet (33.8 m inside a disc), seed 42 50/13601 (55.4 m),
// seed 20 51/12434, seed 3 35/12030, while seed 6's two windows sit at 0. So the temptation is a
// property of the SITE, and one site cannot carry the teeth. Every site still proves the
// guarantee; the corpus as a whole has to prove at least one router that wanted the water.
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

// Seed 6 @(139,341) is the historical site and stays FIRST — it is the water-invariance world and
// the one the pond work was done against. Seed 1 @(0,0) is the teeth: measured as the window where
// the un-injected v2 router drives furthest into the water.
const SITES = [
    { seed: 6, x: 139, z: 341 },   // pond-dense area near spawn (water-invariance.mjs seed-6 world)
    { seed: 1, x: 0,   z: 0   },
]
const R = 1600

let pass = 0, fail = 0
const log = (ok, name, msg) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${ok ? '✓' : '✗'} ${name}\n        ${msg}`); ok ? pass++ : fail++ }

let SEED, CENTER, ponds

const inAnyDisc = (x, z) => {
    for (const p of ponds) {
        const rr = p.radius + p.skirt
        if ((x - p.floorX) ** 2 + (z - p.floorZ) ** 2 <= rr * rr) return true
    }
    return false
}

const build = (injectWater, water) => {
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

const tempted = []
for (const site of SITES) {
    SEED = site.seed; CENTER = { x: site.x, z: site.z }
    const tag = `seed${SEED} @(${CENTER.x},${CENTER.z})`
    const { rawHeightWorld } = makeTerrainHeadless(SEED, RANGER_PARAMS, null)
    const water = new WaterSystem(SEED, RANGER_PARAMS, rawHeightWorld)
    // All discs the streamed band could touch (band + router margin ≪ this query pad).
    ponds = water.pondsNear(CENTER.x - R - 500, CENTER.z - R - 500, CENTER.x + R + 500, CENTER.z + R + 500)

    // 1. NON-VACUOUS, per site — reported here, ASSERTED once over the corpus below.
    const base = wetStats(build(false, water))
    tempted.push({ tag, wetPts: base.wetPts, pts: base.pts })
    console.log(`[    ]   ${tag} without water: ${base.wetPts}/${base.pts} centerline points inside pond discs`)

    // 2 + 3. ROUTE-AROUND + DRY-NODES — the injected network never touches a pond+skirt disc.
    const wet = wetStats(build(true, water))
    log(wet.wetPts === 0, `ROUTE-AROUND ${tag}`,
        `with water: ${wet.wetPts}/${wet.pts} centerline points inside pond+skirt discs (must be 0)`)
    log(wet.wetNodes === 0, `DRY-NODES ${tag}`,
        `with water: ${wet.wetNodes}/${wet.nodes} graph nodes inside pond+skirt discs (must be 0)`)
}

// 1. NON-VACUOUS over the corpus — at least one un-injected router has to have wanted the water,
// or route-around above is proving nothing. A site going quiet is a site the router stopped being
// tempted by; ALL of them going quiet means the gate lost its teeth and the corpus needs re-basing.
const wanted = tempted.filter(t => t.wetPts > 0)
log(wanted.length > 0, 'NON-VACUOUS (corpus)',
    `${wanted.length}/${tempted.length} sites route through ponds without the injection: `
    + tempted.map(t => `${t.tag} ${t.wetPts}`).join(' · '))

console.log(`\nPOND-ROUTE-AROUND GATE: ${pass} pass, ${fail} FAIL (${pass + fail} total) — exit ${fail ? 1 : 0}`)
process.exit(fail ? 1 : 0)
