// test/gps-job-reroute.mjs — BUG-260 (owner 2026-11-23: "I took a freight mission and went way off the GPS path and it never
// recalculated to give me directions from my current location"). A job's GPS line was fixed at accept; only the tutorial's and
// the waypoint's followed the truck. One StrayGuide (paper-route.js) now serves every guided line, and main.js's _tutLeg hands
// it a running job's guide route. Seed 1's story region, Mom's -> Larry's job: the truck on, then far off the route, on another
// road. On the line nothing re-plans; off it for offS the line becomes a route from the truck's road point to the SAME end.
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { StrayGuide, routeEndDoor, roadOrigin, RR_PARAMS } from '../src/paper-route.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) fails++ }

const seed = parseWorldSeed('1'), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
const road = new RoadSystem(seed, P)
wirePondNoGo(road, seed, P)
road.setRadius(REGION_WARM_RADIUS_M)
road.update(new THREE.Vector3(C.x, 0, C.z))
const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
const terrain = makeTerrainHeadless(seed, P, road)
const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
poi.build(C, REGION_RADIUS_M, rep.mainNodes)
poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
const list = poi.list()
const mom = list.find(q => q.type === 'momsHouse'), larry = list.find(q => q.type === 'larrysHouse')
const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region, teleport () {}, setMapOpen () {}, onChange () {} })
const m = ms.planOffer(mom, { rng: () => 0.5, dest: { kind: 'poi', pick: 0, pois: [larry], strict: true, anyLeg: true } })
check('seed 1: the job plans', !!m?.poly?.length)
if (!m) process.exit(1)

const dMin = (p) => Math.min(...m.poly.map(q => Math.hypot(q.x - p.x, q.z - p.z)))
const far = list.filter(q => dMin(q) > 200).sort((a, b) => dMin(b) - dMin(a))[0]
check('a POI far off the route exists to park the truck at', !!far, far ? `${dMin(far).toFixed(0)} m off` : '')
if (!far) process.exit(1)

// main.js's plan callback: the route's own end as the door, planned from the truck's road point.
const plan = (leg, car) => {
    const from = roadOrigin(road, car), door = routeEndDoor(road, leg.base)
    return from && door && ms.planOffer(from, { rng: Math.random, dest: { kind: 'poi', pois: [door], strict: true, anyLeg: true, nearest: true } })
}
const door = routeEndDoor(road, m)
check("routeEndDoor: the job's end, on its road", !!door && Math.hypot(door.x - m.end.x, door.z - m.end.z) < 30)

const sg = new StrayGuide(), leg = { base: m, door: null }
const onLine = m.poly[Math.floor(m.poly.length / 2)]
sg.tick(leg, onLine, 0, l => plan(l, onLine)); sg.tick(leg, onLine, 5000, l => plan(l, onLine))
check('on the line: no re-plan', sg.line(m) === m)

sg.tick(leg, far, 10000, l => plan(l, far))
check('off the line for less than offS: no re-plan', sg.line(m) === m)
sg.tick(leg, far, 10000 + RR_PARAMS.offS * 1000 + 1, l => plan(l, far))
const r = sg.line(m)
check('off the line for offS: the line is a new route', r !== m && r?.segments?.length > 0)
const start = r?.poly?.[0], end = r?.poly?.at(-1)
check('the new route starts at the truck (its road point)', !!start && Math.hypot(start.x - far.x, start.z - far.z) < RR_PARAMS.snapM + 50, start ? `${Math.hypot(start.x - far.x, start.z - far.z).toFixed(0)} m` : '')
check('and ends at the same destination', !!end && Math.hypot(end.x - m.end.x, end.z - m.end.z) < 30)
check('a new job line (another base) is not shadowed by the old re-plan', sg.line({}) !== r)

// main.js must hand a running job's guide route to the guard (the half a pure gate cannot run).
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
check('main.js _tutLeg guides a running job', /function _tutLeg[\s\S]*?ms\.guideRoute\(\)[\s\S]*?\n}/.test(main))
process.exit(fails ? 1 : 0)
