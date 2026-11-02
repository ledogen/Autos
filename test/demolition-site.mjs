// GATE (FEAT-65): where a demolition job's targets stand (src/demolition.js siteTargets).
//
// Per seed, the story region exactly as story mode builds it (spawn, 2800 m warm, validateArea → the
// main piece, POIs + houses), the board with the requisition open, then for every demolition offer
// (the farms' scrap drums, the work sites' old sign line) and the camp's own line:
//
//   1. IT PLANS — a roadside job (no destination POI); the camp's line leaves FROM the camp.
// Every dressing (each demolition THINGS row and the camp's line) is placed on EVERY planned route — a
// dressing doesn't care who gave the job, and a seed may roll no work-site job at all.
//
//   2. SAME EVERY TIME — siteTargets on the same plan gives the same targets, to the bit (SM-INV-12).
//   3. A FULL SITE — at least the dressing's minimum count, less two (a site may come out short).
//   4. ON THE SHOULDER — every target off every deck (the nearest centreline is not within the half-width), its centre half a shoulder past the deck edge of
//      its own route within 0.5 m, within the route's last siteM, at least nodeClearM from any
//      junction node, out of water, its footprint no steeper than maxSlope, standing on the lowest
//      ground under it.
//
// Heavy: routes a full 2800 m region per seed (~15 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { OfferBoard } from '../src/offer-board.js'
import { THINGS, REQUISITION } from '../data/offers.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, buildGraphAdj, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { siteTargets, DEMOLITION_PARAMS as D, TARGET_TYPES } from '../src/demolition.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'

const SEEDS = ['1', '6']
let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

for (const s of SEEDS) {
    const seed = parseWorldSeed(s), t0 = Date.now()
    const sp = spawnDecision(seed, P)
    const C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
    const list = poi.list()
    const camp = list.find((q) => q.type === 'expeditionCamp')
    console.log(`seed ${s}  ${((Date.now() - t0) / 1000).toFixed(0)} s`)

    const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region,
                                   teleport () {}, setMapOpen () {}, onChange () {} })
    const board = new OfferBoard({ seed, pois: list, nowH: 6 })
    board.openLines(6)
    const planOne = (o, exclude) => ms.planOffer(list.find((q) => q.id === o.poiId),
        { rng: board.routeRng(o), dest: board.destWish(o, list, exclude) })
    // The same world the game hands siteTargets (main.js _planOne).
    const world = { road, height: (x, z) => terrain.analyticHeight(x, z), halfWidth: P.roadHalfWidth,
                    isWater: (x, z) => !!water.pondAt(x, z) || water.streamChannelAt(x, z).inChannel }
    const g = road.networkGraph()
    const { adj } = buildGraphAdj(g, () => true, rep.mainNodes)
    const junctions = [...adj.entries()].filter(([, e]) => e.length >= 3).map(([k]) => g.pos(g.idOf.get(k))).filter(Boolean)

    const offers = []
    for (const id of board.sources()) for (const o of board.offers(id, 6)) if (board.spec(o)?.family === 'demolition') offers.push(o)
    const line = board.offers(camp.id, 6).find((o) => o._spec.family === 'demolition')
    check('the camp posts its demolition line, given at the camp itself', !!line && line.poiId === camp.id)
    if (line) offers.push(line)
    check(`demolition offers on the board (${offers.length - (line ? 1 : 0)}) — farms and work sites post them`, offers.length > (line ? 1 : 0))

    const dressings = [...THINGS, ...REQUISITION].filter((t) => t.family === 'demolition').map((t) => [t.id, t.targets])
    let ms0 = 0, nCalls = 0
    const bad = { plan: [], same: [], full: [], deck: [], off: [], site: [], junction: [], water: [], slope: [], ground: [] }
    for (const o of offers) {
        const spc = board.spec(o)
        const m = board.planDistinct(o, planOne)
        const tag = `${spc.thingId}@${o.poiId.slice(-12)}`
        if (!m || m.endPoiId) { bad.plan.push(`${tag}${m ? ' (ends at a POI)' : ' (no plan)'}`); continue }
        if (o === line && Math.hypot(m.poly[0].x - camp.roadX, m.poly[0].z - camp.roadZ) > 30) bad.plan.push(`${tag} (does not leave from the camp)`)
        for (const [dId, dressing] of dressings) {
        const tag = `${dId} on ${spc.thingId}@${o.poiId.slice(-12)}`
        const key = `demo:${seed}:${o.id}`
        const t1 = performance.now()
        const T = siteTargets(m, dressing, key, world)
        ms0 += performance.now() - t1; nCalls++
        if (JSON.stringify(siteTargets(m, dressing, key, world)) !== JSON.stringify(T)) bad.same.push(tag)
        const want = dressing.reduce((a, grp) => a + grp.n[0], 0)
        if (T.length < want - 2) bad.full.push(`${tag} ${T.length}/${want}`)
        // The route's own centreline, 1 m apart, each point with its metres-before-the-end.
        const pts = []
        let u = 0
        for (let i = m.segments.length - 1; i >= 0; i--) {
            const sg = m.segments[i], len = Math.abs(sg.s1 - sg.s0), dir = sg.s1 >= sg.s0 ? 1 : -1
            for (let d = 0; d <= len; d += 1) { const p = sg.centerline.pointAt(sg.s1 - dir * d); pts.push({ x: p.x, z: p.z, u: u + d }) }
            u += len
        }
        for (const t of T) {
            const fr = Math.hypot(...[0, 2].map((i) => PROP_MODELS[TARGET_TYPES[t.kind].model].collision.size[i])) / 2
            const near = pts.reduce((a, p) => { const d = Math.hypot(p.x - t.x, p.z - t.z); return d < a.d ? { d, u: p.u } : a }, { d: Infinity, u: 0 })
            const nr = road.queryNearest(t.x, t.z, 20)
            if (nr && Math.hypot(nr.point.x - t.x, nr.point.z - t.z) < P.roadHalfWidth + fr * 0.4) bad.deck.push(tag)   // its footprint clear of every deck (fr is a diagonal: 0.4 of it is ~the half-depth)
            if (Math.abs(near.d - (P.roadHalfWidth + D.shoulderOff)) > 0.5) bad.off.push(`${tag} ${near.d.toFixed(2)} m`)
            if (near.u > D.siteM + 1) bad.site.push(`${tag} ${near.u.toFixed(0)} m`)
            if (junctions.some((n) => Math.hypot(n.x - t.x, n.z - t.z) < D.nodeClearM - P.roadHalfWidth - D.shoulderOff)) bad.junction.push(tag)
            if (world.isWater(t.x, t.z)) bad.water.push(tag)
            const hs = [[0, 0], [fr, 0], [-fr, 0], [0, fr], [0, -fr]].map(([a, b]) => world.height(t.x + a, t.z + b))
            if ((Math.max(...hs) - Math.min(...hs)) / (2 * fr) > D.maxSlope + 0.25) bad.slope.push(tag)   // axis-aligned probes, not the route's: slack
            if (t.y > world.height(t.x, t.z) + 1e-9) bad.ground.push(`${tag} floats ${(t.y - world.height(t.x, t.z)).toFixed(3)} m`)
        }
        console.log(`       ${tag.padEnd(40)} ${(m.distance / 1000).toFixed(1)} km  ${T.length}/${want}+ targets: ${[...new Set(T.map((t) => t.kind))].join(' ')}`)
        }
    }
    check('every demolition job plans a roadside job (the camp\'s from the camp)', !bad.plan.length, bad.plan.join(', '))
    check('the same targets on every placement', !bad.same.length, bad.same.join(', '))
    check('every site at least its dressing\'s minimum, less two', !bad.full.length, bad.full.join(', '))
    check('no target on a deck', !bad.deck.length, `${bad.deck.length}`)
    check(`every target half a shoulder past its route's deck edge (${P.roadHalfWidth + D.shoulderOff} m ± 0.5)`, !bad.off.length, bad.off.slice(0, 5).join(', '))
    check(`every target within the route's last ${D.siteM} m`, !bad.site.length, bad.site.slice(0, 5).join(', '))
    check('no target at a junction', !bad.junction.length, `${bad.junction.length}`)
    check('no target in water', !bad.water.length, `${bad.water.length}`)
    check('no target on a footprint steeper than the limit', !bad.slope.length, `${bad.slope.length}`)
    check('every target stands on the lowest ground under it, never above the ground at its centre', !bad.ground.length, bad.ground.slice(0, 3).join(', '))
    console.log(`       siteTargets: ${(ms0 / Math.max(1, nCalls)).toFixed(1)} ms per site (${nCalls} sites)`)
}

if (fails) { console.log(`\ndemolition-site: ${fails} FAIL`); process.exit(1) }
console.log('\ndemolition-site: all ok')
