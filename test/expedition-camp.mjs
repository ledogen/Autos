// GATE (FEAT-103 alpha): the expedition camp and its requisition.
//
// Per seed, the story region exactly as story mode builds it (spawn, 2800 m warm, validateArea → the
// main piece), then:
//
//   1. THE CAMP — one `expeditionCamp`, off its own edge (never the pool), on a road that crosses the
//      planners' wall: exactly one node of its edge is on the planners' graph, the pad inside the wall.
//   2. THE BARRIER — a row of ASSET-71 barricades across the deck and both shoulders, striped face to
//      the camp, none floating; each is one more box on the camp's body, landing exactly where main.js
//      draws it (MESH == PHYSICS).
//   3. NOTHING ELSE MOVES — the same build with the camp siting switched off gives the same roster and
//      the same customers, and every ordinary offer plans the same route with the lines open or closed.
//      No ordinary offer ends at the camp (NOT_A_DESTINATION).
//   4. SAME EVERY LOAD — a second build of the seed sites the same camp and barrier.
//   5. THE LINES — closed until openLines(); then all five live at the camp AND at their source; each
//      plans from its source to the camp through the camp edge's one inner node, inside the wall; no
//      deadline; abandon puts a line back unchanged, complete takes it off for good; no expiry.
//
// Heavy: routes a full 2800 m region per seed (~15 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { OfferBoard } from '../src/offer-board.js'
import { REQUISITION } from '../data/offers.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, buildGraphAdj, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
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
    const build = (noCamp = false) => {
        const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                    getSeed: () => seed, getParams: () => P })
        if (noCamp) poi._siteCamp = () => null
        poi.build(C, REGION_RADIUS_M, rep.mainNodes)
        poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
        return poi
    }
    const poi = build()
    const list = poi.list()
    const camp = list.find((q) => q.type === 'expeditionCamp')
    console.log(`seed ${s}  ${((Date.now() - t0) / 1000).toFixed(0)} s  camp ${camp ? `${camp.id} @ (${camp.x.toFixed(0)}, ${camp.z.toFixed(0)})` : 'NONE'}`)

    // 1.
    const wall = REGION_RADIUS_M - REGION_MARGIN
    const r = (p) => Math.hypot(p.x - C.x, p.z - C.z)
    const g = road.networkGraph()
    const { adj } = buildGraphAdj(g, (p) => r(p) <= wall, rep.mainNodes)
    check('one expedition camp, off its own edge (never the pool)',
        list.filter((q) => q.type === 'expeditionCamp').length === 1 && camp.id.startsWith('camp:')
            && !poi.pool().some((q) => q.edge === camp.edge) && camp.jobs)
    if (!camp) continue
    const inA = adj.has(g.key(camp.aId)), inB = adj.has(g.key(camp.bId))
    const inner = inA ? g.key(camp.aId) : g.key(camp.bId)
    check('its edge has exactly ONE node on the planners\' graph — the road is cut at the wall', inA !== inB)
    check('its pad is inside the wall', r(camp) + camp.halfLen <= wall, `${r(camp).toFixed(0)} m`)

    // 2. Each barricade's box, rotated back out of the body frame, is where main.js draws it: the same
    //    centre, and the registry box quarter-turned into the camp's axes.
    const bars = camp.barriers ?? [], [bw, bh, bd] = PROP_MODELS.roadBarrier.collision.size
    const boxes = camp.collision.boxes.slice(-bars.length)
    const cs = Math.cos(camp.modelYaw), sn = Math.sin(camp.modelYaw)
    check(`each of the ${bars.length} barricades is a body box exactly where it is drawn (MESH == PHYSICS)`,
        bars.length > 0 && camp.collision.boxes.length === PROP_MODELS.expeditionCamp.collision.boxes.length + bars.length
            && bars.every((b, i) => {
                const box = boxes[i]
                const wx = camp.modelX + cs * box.c[0] + sn * box.c[2], wz = camp.modelZ - sn * box.c[0] + cs * box.c[2]
                return Math.hypot(wx - b.x, wz - b.z) < 1e-6 && Math.abs(camp.baseY + box.c[1] - (b.y + bh / 2)) < 1e-6
                    && Math.abs(Math.abs(Math.sin(b.yaw - camp.modelYaw)) - 1) < 1e-9 && box.s.join() === [bd, bh, bw].join()
            }))
    // The row: abutting along the camp's Z (across the road), wide enough for road + shoulders, every
    // barricade over the deck (so the row is centred on it), every striped -Z face toward the camp.
    const ax = Math.sin(camp.yaw), az = Math.cos(camp.yaw)
    const gaps = bars.slice(1).map((b, i) => Math.hypot(b.x - bars[i].x, b.z - bars[i].z))
    check('the row spans road and both shoulders, abutting', bars.length * bw >= 2 * ((P.roadHalfWidth ?? 5) + (P.roadShoulderWidth ?? 2.5))
        && gaps.every((g, i) => Math.abs(g - bw) < 1e-6 && Math.abs((bars[i + 1].x - bars[i].x) * ax + (bars[i + 1].z - bars[i].z) * az) > bw - 1e-6),
        gaps.map((g) => g.toFixed(2)).join())
    check('every striped face looks back at the camp',
        bars.every((b) => -Math.sin(b.yaw) * (camp.x - b.x) - Math.cos(b.yaw) * (camp.z - b.z) > 0))
    // Nothing floats: across each barricade's width and depth the deck is never more than 8 cm under
    // its base (a 10 % grade over half its depth), nor buried past 35 cm.
    let worst = { float: -Infinity, sunk: -Infinity }, offDeck = 0
    for (const b of bars) {
        if (road.sampleRoadTopY(b.x, b.z) == null) offDeck++
        const fx = Math.sin(b.yaw + Math.PI / 2), fz = Math.cos(b.yaw + Math.PI / 2)   // along the road
        for (let e = -bw / 2; e <= bw / 2 + 1e-9; e += bw / 6) for (const f of [-bd / 2, 0, bd / 2]) {
            const y = road.sampleRoadTopY(b.x + ax * e + fx * f, b.z + az * e + fz * f)
            if (y == null) continue
            worst.float = Math.max(worst.float, b.y - y); worst.sunk = Math.max(worst.sunk, y - b.y)
        }
    }
    check('every barricade stands over the deck, none floating, none buried',
        !offDeck && worst.float <= 0.08 && worst.sunk <= 0.35,
        `${offDeck} off the deck, float ${worst.float.toFixed(3)} m, sunk ${worst.sunk.toFixed(3)} m`)

    // 3.
    const bare = build(true)
    const ids = (p) => p.list().filter((q) => q.type !== 'expeditionCamp').map((q) => `${q.id}:${q.type}`).join()
        + '|' + p.customers().map((q) => q.id).join()
    check('the camp moves no other POI and no customer', ids(poi) === ids(bare))

    // 4.
    const again = build().list().find((q) => q.type === 'expeditionCamp')
    const sig = (q) => q && JSON.stringify([q.id, q.x, q.z, q.s, q.barriers])
    check('the same camp and barrier on every build of the seed', sig(again) === sig(camp))

    // 5.
    const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region,
                                   teleport () {}, setMapOpen () {}, onChange () {} })
    const planOne = (board) => (o, exclude) => {
        const src = list.find((q) => q.id === o.poiId)
        return ms.planOffer(src, { rng: board.routeRng(o), dest: board.destWish(o, list, exclude) })
    }
    const closed = new OfferBoard({ seed, pois: list, nowH: 6 })
    const board = new OfferBoard({ seed, pois: list, nowH: 6 })
    check('closed until openLines(): nothing at the camp', board.offers(camp.id, 6).length === 0 && board.isGiver(camp.id))
    check('openLines() is true when it opens the lines and false on the idempotent repeat (FEAT-42 logs it)',
        board.openLines(6) === true && board.openLines(7) === false)
    const lines = board.offers(camp.id, 6)
    check(`every line has a source (${lines.length}/${REQUISITION.length})`, lines.length === REQUISITION.length)
    check('each line is posted at its source too — the same offer',
        lines.every((o) => o.poiId !== camp.id && board.offers(o.poiId, 6).includes(o)))
    let bad = []
    for (const o of lines) {
        const m = board.planDistinct(o, planOne(board))
        const last = m?.segments.at(-1)
        const ok = m && m.endPoiId === camp.id && Math.hypot(m.end.x - camp.roadX, m.end.z - camp.roadZ) < 1
            && g.key(last.cellA) === g.key(camp.aId) && g.key(last.cellB) === g.key(camp.bId)
            && m.poly.every((p) => r(p) <= wall)
        if (!ok) bad.push(`${o._spec.line}${m ? '' : ' (no route)'}`)
        else console.log(`       ${o._spec.line.padEnd(12)} from ${o.type.padEnd(13)} ${(m.distance / 1000).toFixed(1)} km  par ${m.par.toFixed(0)} s`)
    }
    check('every line plans from its source to the camp, in through the one inner node, inside the wall', !bad.length, bad.join(', '))
    void inner

    // Ordinary offers: the same routes with the lines open or closed, and none ends at the camp.
    let moved = 0, toCamp = 0, n = 0
    for (const id of board.sources()) {
        for (const o of board.offers(id, 6)) {
            if (o._spec?.line || board.spec(o).family === 'papers') continue
            const a = board.planDistinct(o, planOne(board))
            const c = closed.offers(id, 6).find((x) => x.id === o.id)
            const z = c && closed.planDistinct(c, planOne(closed))
            n++
            if (JSON.stringify(a?.poly) !== JSON.stringify(z?.poly)) moved++
            if (a?.endPoiId === camp.id) toCamp++
        }
    }
    check(`ordinary offers plan the same with the lines open (${n})`, moved === 0, `${moved} moved`)
    check('no ordinary offer ends at the camp', toCamp === 0, `${toCamp}`)

    const o = lines[0]
    const taken = board.take(o.id, 6, 300)
    check('a taken line has no deadline and leaves both tags', taken?.dueH === Infinity
        && !board.offers(camp.id, 6).includes(o) && !board.offers(o.poiId, 6).includes(o))
    check('abandon puts it back unchanged (and says so)', board.abandon(o.id, 7) === true
        && board.offers(camp.id, 7).some((x) => x.id === o.id) && o.route === undefined)
    board.take(o.id, 7, 300)
    check('complete takes it off for good (and says so)', board.complete(o.id, 8) === true && board.lines().filter((l) => l.state === 'done').length === 1
        && !board.offers(camp.id, 200).some((x) => x.id === o.id) && board.offers(camp.id, 200).length === REQUISITION.length - 1)
}

if (fails) { console.log(`\nexpedition-camp: ${fails} FAIL`); process.exit(1) }
console.log('\nexpedition-camp: all ok')
