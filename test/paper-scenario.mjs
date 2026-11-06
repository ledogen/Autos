// GATE (FEAT-62): the paper-route scenario's world plans EVERY rung from Larry's.
//
// The scenario (data/scenarios.js, kind 'paper') is a seed and nothing else: Larry, the customers and the tour
// all come out of the world. The owner opened every rung of the ladder from the start (2026-11-06), so a world
// change that leaves seed 90 short of a rung — no Larry, too few customers, a tour that cannot route — would
// ship a scenario whose 12 or 15 button does nothing. This builds the region exactly as story entry does (the
// spawn's centre, pond no-go, the warm radius, validateArea's main piece) and plans each rung the way Larry's
// card does (planTour over every customer, N of them).
//
// Heavy: one 2800 m region (~20–60 s).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { planTour, customersForTier, PAPER_PARAMS } from '../src/paper-route.js'
import { SCENARIOS } from '../data/scenarios.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const papers = SCENARIOS.filter((s) => s.kind === 'paper')
check('there is a paper scenario to check', papers.length > 0)
for (const def of papers) {
    const seed = parseWorldSeed(def.seed), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    console.log(`${def.id} (seed ${def.seed})  spawn (${C.x.toFixed(0)}, ${C.z.toFixed(0)})`)
    check('the world is playable', rep.playable)
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
    const larry = poi.list().find((q) => q.type === 'larrysHouse')
    check('Larry is on the world', !!larry)
    if (!larry) continue
    const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
    const every = poi.customers(PAPER_PARAMS.tiers.length - 1)
    for (let i = 0; i < PAPER_PARAMS.tiers.length; i++) {
        const n = customersForTier(i)
        const route = planTour(road, larry, every, n, region, 100)
        const got = route?.customers?.length ?? 0
        check(`rung ${n}: a tour of ${n} customers routes from Larry's`, !!route && got === n && Number.isFinite(route.par) && route.par > 0,
              route ? `${got} customers, par ${route.par}` : 'no route')
        if (route) console.log(`        rung ${String(n).padStart(2)}: par ${(route.par / 60).toFixed(2)} min`)
    }
}

if (fails) { console.log(`\npaper-scenario: ${fails} FAIL`); process.exit(1) }
console.log('\npaper-scenario: all ok')
