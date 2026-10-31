// GATE (FEAT-103 alpha): the expedition camp and its requisition.
//
// Per seed, the story region exactly as story mode builds it (spawn, 2800 m warm, validateArea → the
// main piece), then:
//
//   1. THE CAMP — one `expeditionCamp`, off its own edge (never the pool), on a road that crosses the
//      planners' wall: exactly one node of its edge is on the planners' graph, the pad inside the wall.
//   2. THE ROWS AND THE RETURNS (FEAT-154) — the camp's row at its pad, and a row at every crossing of
//      the planners' wall by a road off the planners' graph (crossings found HERE, independently); each
//      row evenly gapped across the paved road, every barricade on the deck, none floating or buried,
//      every striped face inward. From just outside each row, the edge fade's return spot is on a road
//      at the return radius or inside it, near that row, facing inward.
//   3. NOTHING ELSE MOVES — the same build with the camp siting switched off gives the same roster and
//      the same customers, and every ordinary offer plans the same route with the lines open or closed.
//      No ordinary offer ends at the camp (NOT_A_DESTINATION).
//   4. SAME EVERY LOAD — a second build of the seed sites the same camp and the same rows.
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
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
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

    // 2. The rows, in poi.barricades()' order: the camp's first, then one per road out.
    const bars = poi.barricades(), per = POI_PARAMS.poiRowBarricades
    const [bw, , bd] = PROP_MODELS.roadBarrier.collision.size
    const rows = []
    for (let i = 0; i < bars.length; i += per) rows.push(bars.slice(i, i + per))
    const mid = (row) => row[(per - 1) >> 1]
    const face = (b) => ({ x: -Math.sin(b.yaw), z: -Math.cos(b.yaw) })   // a model's -Z, the striped side
    // The crossings, found independently: every edge off the planners' graph, each change of side of the
    // wall along its centreline (5 m samples). The camp's edge is the camp's row.
    const crossings = [], seenE = new Set()
    for (const [a, b] of g.edges) {
        const ka = g.key(a), kb = g.key(b), ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        if (seenE.has(ek) || ek === camp.edge || (adj.has(ka) && adj.has(kb))) continue
        seenE.add(ek)
        const ed = road.edgeParData(a, b)
        if (!ed?.centerline) continue
        const off = ed.arcOffset ?? 0, L = ed.arcLength ?? ed.centerline.length
        let prev = r(ed.centerline.pointAt(off)) > wall
        for (let t = 5; t < L + 5; t += 5) {
            const p = ed.centerline.pointAt(off + Math.min(t, L)), out = r(p) > wall
            if (out !== prev) crossings.push(p)
            prev = out
        }
    }
    const missing = crossings.filter((p) => !rows.slice(1).some((row) => Math.hypot(mid(row).x - p.x, mid(row).z - p.z) <= 25))
    check(`a row at every road out (${crossings.length} crossings, ${rows.length - 1} rows) and the camp's at its pad`,
        rows.length === crossings.length + 1 && !missing.length
            && Math.hypot(mid(rows[0]).x - camp.roadX, mid(rows[0]).z - camp.roadZ) <= POI_PARAMS.poiPadHalfLen + POI_PARAMS.poiCampBarrierGap + 2,
        `${missing.length} crossings without a row`)
    // Each row: even pitch across the road, outer ends on the paved edges, none overlapping.
    const pitchOk = rows.every((row) => {
        const g2 = row.slice(1).map((b, i) => Math.hypot(b.x - row[i].x, b.z - row[i].z))
        return row.length === per && g2.every((d) => d > bw && Math.abs(d - g2[0]) < 1e-6)
            && Math.abs((per - 1) * g2[0] + bw - 2 * (P.roadHalfWidth ?? 5)) < 1e-6
    })
    check(`every row spans the paved road, ${per} barricades, evenly gapped, none overlapping`, pitchOk)
    check('every striped face looks back into the play area',
        rows.every((row) => { const f = face(mid(row)); return (C.x - mid(row).x) * f.x + (C.z - mid(row).z) * f.z > 0 }))
    // Each stands ON the deck: its base is the deck's plane under it (the body spawns at rest there), so
    // across its width and depth the deck is never more than 8 cm off that plane (a crown, a curve).
    let worst = 0, steep = 0, offDeck = 0
    for (const b of bars) {
        if (road.sampleRoadTopY(b.x, b.z) == null) offDeck++
        const ax = Math.cos(b.yaw), az = -Math.sin(b.yaw), f = face(b)   // +X across the road, -Z along it
        steep = Math.max(steep, Math.acos(b.n[1]) * 180 / Math.PI)
        for (let e = -bw / 2; e <= bw / 2 + 1e-9; e += bw / 6) for (const d of [-bd / 2, 0, bd / 2]) {
            const dx = ax * e + f.x * d, dz = az * e + f.z * d
            const y = road.sampleRoadTopY(b.x + dx, b.z + dz)
            if (y != null) worst = Math.max(worst, Math.abs(y - (b.y - (b.n[0] * dx + b.n[2] * dz) / b.n[1])))
        }
    }
    check('every barricade stands on the deck\'s plane: within 8 cm under its whole footprint',
        !offDeck && worst <= 0.08, `${offDeck} off the deck, worst ${worst.toFixed(3)} m`)
    console.log(`       steepest deck under a barricade: ${steep.toFixed(1)}°, worst fit ${(worst * 100).toFixed(1)} cm`)
    // The edge fade's return: from 20 m outside each row, a road spot at the return radius or inside,
    // within 40 m of the row, its heading pointing inward.
    const rIn = wall - POI_PARAMS.poiEdgeReturnM
    const badBack = rows.slice(1).filter((row) => {
        const c = mid(row), f = face(c), back = poi.returnPoint(c.x - 20 * f.x, c.z - 20 * f.z)
        const fx = -Math.sin(back?.heading), fz = -Math.cos(back?.heading)
        return !back || r(back) > rIn + 1e-6 || Math.hypot(back.x - c.x, back.z - c.z) > 40
            || road.sampleRoadTopY(back.x, back.z) == null || (C.x - back.x) * fx + (C.z - back.z) * fz < 0
    })
    check(`from past every row the fade returns to a road inside ${rIn} m, near the row, facing in`, !badBack.length,
        `${badBack.length} rows`)
    const late = rows.slice(1).filter((row) => r(mid(row)) > wall + POI_PARAMS.poiEdgeFadeM).length
    console.log(`       rows past the fade line (a junction just inside the wall): ${late}`)

    // 3.
    const bare = build(true)
    const ids = (p) => p.list().filter((q) => q.type !== 'expeditionCamp').map((q) => `${q.id}:${q.type}`).join()
        + '|' + p.customers().map((q) => q.id).join()
    check('the camp moves no other POI and no customer', ids(poi) === ids(bare))

    // 4.
    const rebuilt = build(), again = rebuilt.list().find((q) => q.type === 'expeditionCamp')
    const sig = (q) => q && JSON.stringify([q.id, q.x, q.z, q.s])
    check('the same camp and the same rows on every build of the seed',
        sig(again) === sig(camp) && JSON.stringify(rebuilt.barricades()) === JSON.stringify(bars))

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
