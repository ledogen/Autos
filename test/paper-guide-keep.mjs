// test/paper-guide-keep.mjs — BUG-212 (owner 2026-11-17: "the GPS map line gets kind of confused especially for missions
// with multiple stops"). Measured by test/gps-multistop-census.mjs: two owed houses whose road points nearly coincide tie the
// shortest remaining tour to the metre, so the guide's re-plan every RR_PARAMS.tourS swapped them every second or two, and
// the GPS leg (and its turn arrow) jumped between the two. planTourJob now keeps the order being followed unless a new
// tour beats it by more than RR_PARAMS.keepM. Seed 1's story region, Larry's 4-house round driven from the spawn: a driver that follows the GPS
// 20 m a re-plan (one tourS at ~20 m/s) never sees the leg's target come back to a house it left without a delivery — and,
// the control, without the kept order it does.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { planTour, planGuideJob, tourLeg, PAPER_PARAMS, RR_PARAMS, PaperRouteSystem } from '../src/paper-route.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) fails++ }
const drain = (it) => { if (!it) return null; let r; do r = it.next(); while (!r.done); return r.value }

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
const larry = poi.list().find(q => q.type === 'larrysHouse')
const route = larry && planTour(road, larry, poi.customers(PAPER_PARAMS.tiers.length - 1), 4, region)
check('seed 1: Larry plans a 4-house round', route?.customers?.length === 4)
if (!route) process.exit(1)

/** The point `u` m along `poly` from its start — a planner line starts at the truck's road point (never "from the nearest
 *  vertex": a tour that comes back past the truck would hand the driver its return pass). */
function at (poly, u) {
    for (let i = 0; i < poly.length - 1; i++) {
        const p = poly[i], q = poly[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z)
        if (L >= u) return { x: p.x + (q.x - p.x) * u / (L || 1), z: p.z + (q.z - p.z) * u / (L || 1) }
        u -= L
    }
    return { x: poly.at(-1).x, z: poly.at(-1).z }
}
const roadPt = new Map(route.customers.map(c => { const l = drain(planGuideJob(road, c, [c], region)); return [c.id, l ? tourLeg(l).segments.at(-1).centerline.pointAt(tourLeg(l).segments.at(-1).s1) : c] }))
/** Follow the GPS through the round from the spawn's road point (the census's start, where the tie shows); returns { flipsBack, served, steps }. */
function drive (keep) {
    const owed = new Map(route.customers.map(c => [c.id, c]))
    let c = drain(planGuideJob(road, C, route.customers, region)).poly[0], prev = null, order = null, seen = [], flipsBack = 0, served = 0, steps = 0
    for (; steps < 600 && owed.size; steps++) {
        const tour = drain(planGuideJob(road, c, [...owed.values()], region, 100, keep ? order : null))
        if (!tour?.poly) break
        order = tour.customers.map(t => t.id)
        if (prev && order[0] !== prev && seen.includes(order[0])) flipsBack++
        seen.push(order[0]); prev = order[0]
        c = at(tour.poly, 20)
        for (const [id, p] of roadPt) if (owed.has(id) && Math.hypot(p.x - c.x, p.z - c.z) < 18) { owed.delete(id); served++; seen = [] }
    }
    return { flipsBack, served, steps }
}
const off = drive(false), on = drive(true)
check('control: without the kept order the leg flips back between tied houses', off.flipsBack > 0, `${off.flipsBack} flip-backs, ${off.served}/4 served in ${off.steps} steps`)
check(`with keepM ${RR_PARAMS.keepM} m: no flip-back, the round finishes`, on.flipsBack === 0 && on.served === 4, `${on.flipsBack} flip-backs, ${on.served}/4 served in ${on.steps} steps`)
check('…and no longer than the control past keepM a house', on.steps * 20 <= off.steps * 20 + 4 * RR_PARAMS.keepM + 20, `${on.steps * 20} vs ${off.steps * 20} m driven`)

// FEAT-311: the HUD's "next house (last house)" — PaperRouteSystem.distancesLeft on the planned round, the truck walked
// along its line from Larry's 5 m at a time, each porch delivered as the truck reaches it. Between deliveries both numbers
// only fall; at each porch the first switches to the next house (the road between the two) and the second does not jump.
{
    const run = { hits: new Set() }, sys = { state: 'running', line: () => route, run }
    const left = (q) => PaperRouteSystem.prototype.distancesLeft.call(sys, q.x, q.z)
    const stops = route.stopsAt, cum = route.polyCum
    let prev = left(route.poly[0]), rises = 0, switches = 0, badSwitch = 0, totalJump = 0
    for (let u = 5; u <= cum.at(-1) + 5; u += 5) {
        const q = at(route.poly, u), owed = stops.find(st => !run.hits.has(st.c.id))
        if (owed && u >= cum[owed.p]) {
            run.hits.add(owed.c.id)
            const nx = stops.find(st => !run.hits.has(st.c.id)), now = left(q)
            if (nx) {
                switches++
                if (Math.abs(now[0] - (cum[nx.p] - cum[owed.p])) > 30) badSwitch++
                totalJump = Math.max(totalJump, Math.abs(now[1] - prev[1]))
            } else if (now !== null) badSwitch++
            prev = now
            continue
        }
        const now = left(q)
        if (now[0] > prev[0] + 1 || now[1] > prev[1] + 1) rises++
        prev = now
    }
    check('FEAT-311: the next house\'s and the last house\'s road distance fall as the truck drives the round',
        rises === 0, `${rises} rises over ${(cum.at(-1) / 1000).toFixed(2)} km`)
    check('…and at each delivered house the first switches to the next one, the second carries on', switches === stops.length - 1 && badSwitch === 0 && totalJump <= 30,
        `${switches} switches, ${badSwitch} wrong, last-house number moved ${totalJump.toFixed(0)} m at a switch`)
}

console.log(fails ? `\nFAIL: ${fails}` : '\nALL OK')
process.exit(fails ? 1 : 0)
