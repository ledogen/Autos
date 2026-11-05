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
//   5. THE GUIDE (slice 2, owner 2026-11-03) — every target's recorded `u` is its own point on the route;
//      guideTo runs from the route's start (or, back, from its end) to that point; nearestTarget, from
//      each target's road point, picks the nearest other one along the road and says whether it is
//      behind; past the route's end every target is behind, and short of the site the first one wins.
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
import { siteTargets, nearestTarget, guideTo, DEMOLITION_PARAMS as D, TARGET_TYPES } from '../src/demolition.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

// BUG-111: '8' replaced '1' when the region network took the game's pond no-go — seed 1's real 06:00 board posts no
// farm or work-site demolition offer (it did only on the pond-blind roads); 8's posts 2 (4 and 5 also post).
const SEEDS = ['8', '6']
const CHASE_MPS = 15   // ~54 km/h down the shoulder, the pace a site is driven at [DEFAULT]
let fails = 0, posted = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

for (const s of SEEDS) {
    const seed = parseWorldSeed(s), t0 = Date.now()
    const sp = spawnDecision(seed, P)
    const C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)   // BUG-111: the game's pond no-go, before the first stream
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
    // Per seed it is only reported: a seed's 06:00 board may roll none (seed 6's, since BUG-67's re-seat
    // moved node 1,0,0 and with it the roster, 2026-11-04). Every dressing is placed on every route
    // anyway; the fixture as a whole must still exercise a farm / work-site post (checked after the loop).
    console.log(`       demolition offers on the board: ${offers.length - (line ? 1 : 0)} (farms and work sites)`)
    posted += offers.length - (line ? 1 : 0)

    const dressings = [...THINGS, ...REQUISITION].filter((t) => t.family === 'demolition').map((t) => [t.id, t.targets])
    let ms0 = 0, nCalls = 0
    const bad = { plan: [], same: [], full: [], deck: [], off: [], site: [], junction: [], water: [], slope: [], ground: [], u: [], guide: [], nearest: [], gap: [] }
    let gapMax = 0
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
        const roadAt = (uu) => pts.reduce((a, p) => Math.abs(p.u - uu) < Math.abs(a.u - uu) ? p : a)
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
            if (Math.abs(near.u - t.u) > 1.5) bad.u.push(`${tag} u ${t.u.toFixed(0)} vs ${near.u.toFixed(0)} m`)
            for (const back of [false, true]) {
                const G = guideTo(m, t.u, back).segments, a = G[0], z = G.at(-1)
                const p0 = a.centerline.pointAt(a.s0), p1 = z.centerline.pointAt(z.s1)
                const from = back ? pts[0] : pts.at(-1), to = roadAt(t.u)
                if (Math.hypot(p0.x - from.x, p0.z - from.z) > 1 || Math.hypot(p1.x - to.x, p1.z - to.z) > 1.5) bad.guide.push(`${tag}${back ? ' back' : ''}`)
            }
        }
        // From each target's road point the nearest OTHER target along the road; past the end, every one
        // behind; short of the site, the first along the road ahead.
        T.forEach((t, k) => {
            const others = T.flatMap((_, j) => j === k ? [] : [j])
            if (!others.length) return
            const p = roadAt(t.u), n = nearestTarget({ ...m, targets: T }, p.x, p.z, others, t.u)
            const best = Math.min(...others.map(j => Math.abs(T[j].u - t.u)))
            if (Math.abs(n.dist - best) > 2 || (best > 2 && n.back !== T[n.i].u > t.u)) bad.nearest.push(`${tag} #${k}`)
        })
        const all = T.map((_, j) => j), e0 = pts[0], e1 = pts[5]   // the end, and 5 m before it
        const past = nearestTarget({ ...m, targets: T }, e0.x + (e0.x - e1.x) * 6, e0.z + (e0.z - e1.z) * 6, all, 30)
        const short = nearestTarget({ ...m, targets: T }, 0, 0, all, m.distance)
        if (T.length && (!past.back || T[past.i].u !== Math.min(...T.map(t => t.u)))) bad.nearest.push(`${tag} past the end`)
        if (T.length && (short.back || T[short.i].u !== Math.max(...T.map(t => t.u)))) bad.nearest.push(`${tag} short of the site`)
        // 6. THE SITE WINDOW (owner 2026-11-05) — the longest stretch between two targets along the road is drivable
        //    inside hitWindowS at CHASE_MPS, so driving straight down the site never runs the window out.
        const us = T.map(t => t.u).sort((a, b) => a - b), gap = Math.max(0, ...us.slice(1).map((u, j) => u - us[j]))
        gapMax = Math.max(gapMax, gap)
        if (gap / CHASE_MPS > D.hitWindowS) bad.gap.push(`${tag} ${gap.toFixed(0)} m`)
        console.log(`       ${tag.padEnd(40)} ${(m.distance / 1000).toFixed(1)} km  ${T.length}/${want}+ targets: ${[...new Set(T.map((t) => t.kind))].join(' ')}  · widest gap ${gap.toFixed(0)} m`)
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
    check('every target\'s u is its own point on the route (± 1.5 m)', !bad.u.length, bad.u.slice(0, 5).join(', '))
    check('guideTo runs from the route\'s start, or back from its end, to the target', !bad.guide.length, bad.guide.slice(0, 5).join(', '))
    check('nearestTarget: the nearest along the road, behind or ahead; past the end all behind; short of the site the first', !bad.nearest.length, bad.nearest.slice(0, 5).join(', '))
    check(`no gap between targets longer than the window at ${CHASE_MPS} m/s (${D.hitWindowS} s → ${D.hitWindowS * CHASE_MPS} m; widest ${gapMax.toFixed(0)} m)`, !bad.gap.length, bad.gap.slice(0, 5).join(', '))
    console.log(`       siteTargets: ${(ms0 / Math.max(1, nCalls)).toFixed(1)} ms per site (${nCalls} sites)`)
}

check(`a farm or work site posts a demolition offer on some seed's board (${posted})`, posted > 0)
if (fails) { console.log(`\ndemolition-site: ${fails} FAIL`); process.exit(1) }
console.log('\ndemolition-site: all ok')
