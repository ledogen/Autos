// GATE (FEAT-184, DEC-149): THE TUTORIAL SEED STILL PLAYS ITS BEATS.
//
// data/tutorial.js pins one world (822480141, the owner's pick from the census, 2026-11-14) for the first playthrough
// ever and every played tutorial (DEC-157). Its beats were picked off the census line, so a world-generation change
// that moves its places breaks the tutorial without failing anything else. This gate builds the region as story entry
// builds it and plans the tutorial's legs with the game's own planner, as main.js does:
//   1. the roster: one burger joint, mom's, Larry's, at least one gas station and one auto shop — each where the census
//      put it (± 5 m);
//   2. the evening: joint → the station nearest by road → mom's, the station's detour ≤ 2 km (the census's bar; main.js
//      TUT_PARAMS.pumpDetourM is the game's 4 km), and the flat's tow (halfway home) to an auto shop ≤ 2.5 km by crow,
//      which plans back to mom's;
//   3. the morning (DEC-153, DEC-238): the pack lands by mom's steps in reach of her road; mom's → Larry's → the joint plan.
// Each leg's length is also held to the census's within 10 %, so a re-routed leg shows before a player finds it.
// A failure means re-pick the seed (the census tools: wip/feat184/), never loosen this.
//
// Heavy: routes one full region (~25 s).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, dropZoneWorld } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { TUTORIAL, PACK_TOSS } from '../data/tutorial.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

// The census line for 822480141 (wip/feat184/seed-census-b.jsonl, 2026-11-14): places (m) and leg lengths (km).
const AT = { joint: [844, -679], mom: [-434, -51], larry: [-340, 363], pump: [1019, -1204], shop: [267, -284] }
const KM = { toPump: 0.6, pumpHome: 2.6, shopHome: 0.94 }

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
const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region, teleport () {}, setMapOpen () {}, onChange () {} })
const to = (from, pois) => from && pois.length ? ms.planOffer(from, { rng: () => 0.5, dest: { kind: 'poi', pois, strict: true, anyLeg: true, nearest: true } }) : null
const byId = (m) => m && list.find(q => q.id === m.endPoiId)
const km = (m) => m ? m.distance / 1000 : NaN
const near = (k, m, want) => check(`${k}: ${km(m).toFixed(2)} km, the census's ${want} ± 10 %`, Math.abs(km(m) - want) <= 0.1 * want)
console.log(`seed ${TUTORIAL.seed}: region routed in ${((Date.now() - t0) / 1000).toFixed(0)} s`)

// 1.
const joint = of('foodVendor')[0], mom = of('momsHouse')[0], larry = of('larrysHouse')[0]
check('one burger joint, mom\'s and Larry\'s; a gas station and an auto shop', of('foodVendor').length === 1 && !!mom && !!larry
    && of('gasStation').length >= 1 && of('autoShop').length >= 1, JSON.stringify(Object.fromEntries(['foodVendor', 'momsHouse', 'larrysHouse', 'gasStation', 'autoShop'].map(t => [t, of(t).length]))))
const at = (k, q) => check(`${k} where the census put it (${AT[k]})`, !!q && Math.hypot(q.x - AT[k][0], q.z - AT[k][1]) <= 5,
    q ? `at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})` : 'missing')
at('joint', joint); at('mom', mom); at('larry', larry)

// 2.
const home = to(joint, [mom]), pump = to(joint, of('gasStation')), pumpPoi = byId(pump), pumpHome = to(pumpPoi, [mom])
at('pump', pumpPoi)
check('the evening\'s legs plan: joint → mom\'s, joint → the station, the station → mom\'s', !!home && !!pump && !!pumpHome)
const detour = km(pump) + km(pumpHome) - km(home)
check(`the station's detour on the way home is ${detour.toFixed(2)} km ≤ 2 km`, detour <= 2)
near('joint → the station', pump, KM.toPump); near('the station → mom\'s', pumpHome, KM.pumpHome)
const mid = pumpHome?.poly?.[Math.floor(pumpHome.poly.length / 2)]
const shop = mid && of('autoShop').map(q => ({ q, d: Math.hypot(q.x - mid.x, q.z - mid.z) })).sort((a, b) => a.d - b.d)[0]
at('shop', shop?.q)
check(`the flat's tow (halfway home) to the nearest auto shop is ${shop ? (shop.d / 1000).toFixed(2) : '—'} km ≤ 2.5 km`, !!shop && shop.d <= 2500)
const shopHome = to(shop?.q, [mom])
check('the shop → mom\'s plans', !!shopHome)
near('the shop → mom\'s', shopHome, KM.shopHome)

// 3. The morning (DEC-238): the pack lands by mom's steps, on her road side and in reach of it; mom's → Larry's → the joint.
const toss = dropZoneWorld(mom, PACK_TOSS), off = (p) => Math.hypot(...(({ point: r }) => [r.x - p.x, r.z - p.z])(road.queryNearest(p.x, p.z, 500)))
const tossOff = off(toss), homeOff = off({ x: mom.modelX ?? mom.x, z: mom.modelZ ?? mom.z })
check(`the pack lands on her road side, ${tossOff.toFixed(1)} m off the road (her trailer's middle ${homeOff.toFixed(1)} m) ≤ 15 m`, tossOff < homeOff && tossOff <= 15)
const toLarry = to(mom, [larry]), morning = to(larry, [joint])
check(`the errand's mom's → Larry's plans (${toLarry ? km(toLarry).toFixed(2) + ' km' : '—'})`, !!toLarry && toLarry.endPoiId === larry?.id)
check(`the morning's Larry's → the joint plans (${morning ? km(morning).toFixed(2) + ' km' : '—'})`, !!morning && morning.endPoiId === joint?.id)

console.log(fails ? `\n${fails} TUTORIAL-SEED CHECK(S) FAILED` : '\nALL TUTORIAL-SEED CHECKS PASSED')
process.exit(fails ? 1 : 0)
