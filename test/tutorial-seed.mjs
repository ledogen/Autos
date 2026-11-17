// GATE (FEAT-184, DEC-149; FEAT-229 box 3, DEC-304..308 + DEC-320..326): THE TUTORIAL SEED STILL PLAYS ITS BEATS.
//
// data/tutorial.js pins one world (3590618618, the owner's pick 2026-11-16, DEC-351; criteria DEC-344, study in
// wip/tut-seed-search/) for the first playthrough ever and every played tutorial (DEC-111, DEC-157). It replaced 822480141
// (the census pick of 2026-11-14): that route sat at the median height of 144 m, the joint at 169 m among 46 trees with the
// 07:00 sun behind a hill, and the day ran 12.5 km. Its beats were picked off the census line, so a world-generation
// change that moves its places breaks the tutorial without failing anything else. This gate builds the region as story
// entry builds it (poi.build, then campSystem.build + fillReach, main.js onRegionLive) and walks DEC-304's order with
// each stop picked as main.js picks it (_joint, _mom, _larry, _snackShop, _campDoor, the flat in _eveningLessons, the
// tow in _nearestPoi) and each leg planned as _homeGuide plans it (the same planner, the same OfferBoard route stream):
//   joint → mom's (the hand-over; the pack lands by her steps) → Larry's → the gas station nearest Larry's (a storefront
//   bay that sells the peanuts, and pumps) → the camping area nearest the station → home, the flat at half the crow
//   distance, the tow to the auto shop nearest the flat → mom's (the night) → the joint (the morning).
// Every stop exists, every leg plans to its stop, each leg's length is held to the census's within 10 % (so a re-routed
// leg shows before a player finds it), and each leg's wheel time at 50 km/h fits inside the stamped hours it spans
// (TUT_STAMPS, read from main.js itself; the clock is held while the tutorial drives, so the stamps carry the time).
// A failure means re-pick the seed (the census tools: wip/feat184/), never loosen this.
//
// Heavy: routes one full region (~25 s).
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, dropZoneWorld } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { CampSystem } from '../src/camp.js'
import { roadOrigin } from '../src/paper-route.js'
import { OfferBoard } from '../src/offer-board.js'
import { towHours } from '../src/fuel-stop.js'
import { ECONOMY_PARAMS } from '../src/economy.js'
import { startShelves, shelf } from '../src/shop-stock.js'
import { TUTORIAL, PACK_TOSS } from '../data/tutorial.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

// The census line for 3590618618 (the DEC-344 study, re-measured on land/tut-seed-pin 2026-11-16): places (m), road legs (km),
// crow distances (km).
const AT = { joint: [774, -31], mom: [108, 189], larry: [247, 495], station: [1088, -164], shop: [600, 716] }
const KM = { jointMom: 1.52, momLarry: 0.34, larryStation: 2.66, stationCamp: 1.08, campMom: 3.40, campFlat: 1.83, shopMom: 1.01, momJoint: 1.52 }
const CROW = { stationCamp: 0.67, tow: 0.76 }   // from the camp's road door
const KMH = 50   // the wheel-time speed (§ 7)
// main.js's own stamps and firing hour, read from its source so the gate can never hold a stale copy.
const MAIN = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const S = Function(`return ${MAIN.match(/const TUT_STAMPS = (\{[^}]*\})/)[1]}`)()
const FIRED_H = +MAIN.match(/const OPENING_START = \{ day: -?\d+, hour: (\d+(?:\.\d+)?) \}/)[1]

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const t0 = Date.now()
const seed = parseWorldSeed(TUTORIAL.seed), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
const road = new RoadSystem(seed, P); wirePondNoGo(road, seed, P)
road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
const terrain = makeTerrainHeadless(seed, P, road), water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
poi.build(C, REGION_RADIUS_M, rep.mainNodes)
const list = poi.list(), of = (t) => list.filter(q => q.type === t)
const joint = of('foodVendor')[0], mom = of('momsHouse')[0], larry = of('larrysHouse')[0]
// main.js onRegionLive: the camp zones after the roster (mom's house handed in), then filled to the planners' roads.
const camp = new CampSystem({ getRoad: () => road, getSeed: () => seed, getParams: () => P, getTerrain: () => terrain, getWater: () => water, treesNear: () => 0 })
camp.build(C, REGION_RADIUS_M, mom ?? null)
camp.fillReach(rep.mainNodes, p => Math.hypot(p.x - C.x, p.z - C.z) <= REGION_RADIUS_M - REGION_MARGIN)
const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region, teleport () {}, setMapOpen () {}, onChange () {} })
// _homeGuide's plan: a fresh OfferBoard route stream per leg, keyed on mom's id (the real method, no board built).
const to = (from, stop) => from && stop ? ms.planOffer(from, { rng: OfferBoard.prototype.routeRng.call({ _seed: seed >>> 0 }, { poiId: mom.id, slot: 'eve', k: 0 }),
    dest: { kind: 'poi', pois: [stop], strict: true, anyLeg: true, nearest: true } }) : null
const km = (m) => m ? m.distance / 1000 : NaN
const crow = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) / 1000 : NaN
const near = (k, v, want) => check(`${k}: ${v.toFixed(2)} km, the census's ${want} ± 10 %`, Math.abs(v - want) <= 0.1 * want)
console.log(`seed ${TUTORIAL.seed}: region routed in ${((Date.now() - t0) / 1000).toFixed(0)} s`)

// 1. The roster: every stop exists, each where the census put it.
check('one burger joint, mom\'s and Larry\'s; a gas station and an auto shop; a camp zone', of('foodVendor').length === 1 && !!mom && !!larry
    && of('gasStation').length >= 1 && of('autoShop').length >= 1 && camp.zones().length >= 1,
    JSON.stringify({ ...Object.fromEntries(['foodVendor', 'momsHouse', 'larrysHouse', 'gasStation', 'autoShop'].map(t => [t, of(t).length])), zones: camp.zones().length }))
const at = (k, q) => check(`${k} where the census put it (${AT[k]})`, !!q && Math.hypot(q.x - AT[k][0], q.z - AT[k][1]) <= 5,
    q ? `at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})` : 'missing')
at('joint', joint); at('mom', mom); at('larry', larry)
// _snackShop: the gas station nearest Larry's by crow.
const station = larry && of('gasStation').sort((a, b) => crow(a, larry) - crow(b, larry))[0]
at('station', station)
startShelves(seed)
check('the station has a storefront bay that sells the peanuts (DEC-323), and pumps (DEC-306)', !!station?.park && !!station?.pumpZones?.length
    && shelf(station.id, 0, 'gasStation').some(r => r?.id === 'bagOfPeanuts'),   // an always row: any hour
    `park ${!!station?.park}, pumps ${station?.pumpZones?.length ?? 0}`)
// _campDoor: the road point nearest the centre of the camp zone nearest the station (inside its disc).
let campDoor = null, bd = Infinity
for (const zn of camp.zones()) {
    const o = station && roadOrigin(road, zn, zn.r), d = o ? Math.hypot(o.x - station.x, o.z - station.z) : Infinity
    if (d < bd) { bd = d; campDoor = o && { ...o, id: 'camp' } }
}
check('the camping area nearest the station has a road door', !!campDoor)
near('the station → the camping area\'s door, by crow', crow(station, campDoor), CROW.stationCamp)

// 2. The pack lands by mom's steps, on her road side and in reach of it (DEC-305).
const toss = dropZoneWorld(mom, PACK_TOSS), off = (p) => Math.hypot(...(({ point: r }) => [r.x - p.x, r.z - p.z])(road.queryNearest(p.x, p.z, 500)))
const tossOff = off(toss), homeOff = off({ x: mom.modelX ?? mom.x, z: mom.modelZ ?? mom.z })
check(`the pack lands on her road side, ${tossOff.toFixed(1)} m off the road (her trailer's middle ${homeOff.toFixed(1)} m) ≤ 15 m`, tossOff < homeOff && tossOff <= 15)

// 3. The legs, in DEC-304's order: each plans to its stop, each within the census's band.
const legs = {
    jointMom: [joint, mom], momLarry: [mom, larry], larryStation: [larry, station], stationCamp: [station, campDoor],
    campMom: [campDoor, mom], momJoint: [mom, joint],
}
const plan = Object.fromEntries(Object.entries(legs).map(([k, [a, b]]) => [k, to(a, b)]))
for (const [k, [, b]] of Object.entries(legs)) {
    const m = plan[k]
    check(`${k} plans to its stop (${m ? km(m).toFixed(2) + ' km' : '—'})`, !!m && m.endPoiId === b?.id)
    near(k, km(m), KM[k])
}
// The flat (_eveningLessons): on the drive home from the camping area, the first point under half the start's crow
// distance to mom's; the tow (_nearestPoi) to the auto shop nearest it by crow; then the shop → mom's.
const poly = plan.campMom?.poly ?? [], from0 = crow(campDoor, mom)
let flatAt = null, campFlatM = 0
for (let i = 1; i < poly.length && !flatAt; i++) {
    campFlatM += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z)
    if (crow(poly[i], mom) < 0.5 * from0) flatAt = poly[i]
}
check('the drive home reaches half the crow distance to mom\'s (the flat)', !!flatAt)
near('the camping area → the flat, along the route', campFlatM / 1000, KM.campFlat)
const shop = flatAt && of('autoShop').filter(q => !q.hidden).sort((a, b) => crow(a, flatAt) - crow(b, flatAt))[0]
at('shop', shop)
near('the tow, the flat → the nearest auto shop by crow', crow(flatAt, shop), CROW.tow)
const shopMom = to(shop, mom)
check(`the shop → mom's plans (${shopMom ? km(shopMom).toFixed(2) + ' km' : '—'})`, !!shopMom && shopMom.endPoiId === mom?.id)
near('shopMom', km(shopMom), KM.shopMom)

// 4. The clock: held while driving, so each stretch's wheel time at 50 km/h must fit the stamped hours it spans
// (main.js _stampClock: reaching mom's starts 'pack', Larry's 'snack', the peanuts 'pump', Katie's call 'home', her
// welcome 'bed'). The night's span also carries the tow's hours. The morning leg is held to the paycheck's 07:00 floor,
// so only its length is guarded (above).
const towH = towHours(crow(flatAt, shop), ECONOMY_PARAMS)
const wheelH = (kmv) => kmv / KMH
const spans = [
    ['joint → mom\'s', km(plan.jointMom), S.pack - FIRED_H],
    ['mom\'s → Larry\'s', km(plan.momLarry), S.snack - S.larry],
    ['Larry\'s → the station', km(plan.larryStation), S.pump - S.snack],
    ['the station → the camping area (until Katie)', km(plan.stationCamp), S.home - S.camp],
    ['home: the flat, the tow, the shop → mom\'s', campFlatM / 1000 + km(shopMom), S.bed - S.home - towH],
]
for (const [k, kmv, h] of spans) check(`${k}: ${(wheelH(kmv) * 60).toFixed(1)} min of wheel time fits ${(h * 60).toFixed(0)} min stamped`, wheelH(kmv) <= h)
const dayKm = spans.reduce((a, [, kmv]) => a + kmv, 0) + km(plan.momJoint)
console.log(`  the tow ${towH.toFixed(2)} h lands at ${(S.home + towH).toFixed(2)} h; the whole tutorial ${dayKm.toFixed(2)} km, ${(wheelH(dayKm) * 60).toFixed(0)} min of wheel time`)

console.log(fails ? `\n${fails} TUTORIAL-SEED CHECK(S) FAILED` : '\nALL TUTORIAL-SEED CHECKS PASSED')
process.exit(fails ? 1 : 0)
