// GATE (FEAT-295, DEC-429): a house at each paper-route stop, on story worlds built as story entry builds them
// (spawn, warm radius, validateArea's main piece, PoiSystem.build + buildHouses).
//
//   · every stop has a house (poi.js _routeHouse) or the stated fallback: its bare target, unmoved, and its mailbox
//   · the porch floor's centre is ON the stop's target and the halo height (floorY) is that box's top
//   · the porch faces the road: model −Z points at the nearest centreline within 15°
//   · no house box reaches a road's shoulder (any road), a roster pad, water, a junction apron or another house
//   · it stands on its pad: the carved ground under every box corner within 5 cm of its base (nothing floats or sinks)
//   · the house pads leave the road deck bit-identical (FEAT-46: a pad has no authority inside the road)
//   · deterministic: a rebuild on the same world (the house pads already carved) gives the identical houses
// Census per seed: stops, houses by model, fallbacks. Heavy: 12 routed worlds. HOUSE_SEEDS=a,b,c overrides the set.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { padSd } from '../src/road-carve.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    if (!ok) { console.log(`[FAIL] ${label}  ${detail}`); fails++ }
    return ok
}
const SEEDS = (process.env.HOUSE_SEEDS ?? '1872706826,90,3200351065,11,222,3333,44444,555555,6666668,77,880,9901').split(',')
const edgeLat = (P.roadHalfWidth ?? 5) + (P.roadShoulderWidth ?? 2.5)

function world (s) {
    const seed = parseWorldSeed(s)
    const sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, rep.mainNodes); poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
    return { road, terrain, water, poi, rebuild: () => poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes) }
}
// a house's collision boxes as world rectangles + their corners (model frame → world: x = X0 + lx·cos + lz·sin)
const boxesOf = (r) => {
    const sn = Math.sin(r.modelYaw), cs = Math.cos(r.modelYaw)
    const w = (lx, lz) => [r.modelX + lx * cs + lz * sn, r.modelZ - lx * sn + lz * cs]
    return r.collision.boxes.map(b => {
        const [x, z] = w(b.c[0], b.c[2])
        const pts = []
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push(w(b.c[0] + (i / 4 - 0.5) * b.s[0], b.c[2] + (j / 4 - 0.5) * b.s[2]))
        return { x, z, hw: b.s[0] / 2, hd: b.s[2] / 2, sn, cs, pts, top: b.c[1] + b.s[1] / 2 }
    })
}
const overlap = (a, b) => {
    for (const r of [a, b]) for (const [ux, uz] of [[r.cs, -r.sn], [r.sn, r.cs]]) {
        const pr = (q) => Math.abs(q.hw * (q.cs * ux - q.sn * uz)) + Math.abs(q.hd * (q.sn * ux + q.cs * uz))
        if (Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) > pr(a) + pr(b)) return false
    }
    return true
}
const fmt = (h) => h.house ? `${h.id}:${h.house.key}@${h.house.modelX.toFixed(3)},${h.house.modelZ.toFixed(3)},${h.house.baseY.toFixed(3)}` : `${h.id}:-`

const tot = { stops: 0, houses: 0, keys: {} }
for (const s of SEEDS) {
    const t0 = Date.now()
    const { road, terrain, water, poi, rebuild } = world(s)
    const stops = poi.houses(), houses = poi.routeHouses()
    const roster = poi.list().filter(q => q.halfLen)
    const story = road.storyPadReach()
    const junctions = road.padReachNodes().filter(nd => !story.some(p => p.x === nd.x && p.z === nd.z))
    const mb = new Set(poi.mailboxes().map(m => m.id))
    check(`seed ${s}: every route house belongs to a stop`, houses.every(r => stops.some(h => h.house === r)))
    for (const h of stops) {
        tot.stops++
        if (!h.house) {   // the fallback: the bare target where it always was, and its mailbox
            check(`seed ${s}: ${h.id} (no house) keeps its mailbox`, mb.has(h.id))
            continue
        }
        const r = h.house, B = boxesOf(r), porch = B[PROP_MODELS[r.key].porch]
        tot.houses++; tot.keys[r.key] = (tot.keys[r.key] ?? 0) + 1
        // target ON the porch floor box
        const dx = h.x - porch.x, dz = h.z - porch.z
        const u = dx * porch.cs - dz * porch.sn, v = dx * porch.sn + dz * porch.cs
        check(`seed ${s}: ${h.id} target on the porch floor`, Math.abs(u) <= porch.hw && Math.abs(v) <= porch.hd, `(${u.toFixed(2)}, ${v.toFixed(2)}) in ±(${porch.hw}, ${porch.hd})`)
        check(`seed ${s}: ${h.id} halo at the porch floor's top`, Math.abs(r.floorY - (r.baseY + porch.top)) < 1e-9)
        // porch faces the road
        const nr = road.queryNearest(porch.x, porch.z, 40)
        const fx = -Math.sin(r.modelYaw), fz = -Math.cos(r.modelYaw)
        const ex = nr.point.x - porch.x, ez = nr.point.z - porch.z, el = Math.hypot(ex, ez)
        const ang = Math.acos(Math.min(1, (fx * ex + fz * ez) / el)) * 180 / Math.PI
        check(`seed ${s}: ${h.id} porch faces the road`, ang <= 15, `${ang.toFixed(1)}°`)
        // clear of roads, pads, aprons, water; standing on its pad
        let roadMin = Infinity, dy = 0
        for (const b of B) for (const [x, z] of b.pts) {
            const q = road.queryNearest(x, z, 30)
            if (q?.point) roadMin = Math.min(roadMin, Math.hypot(q.point.x - x, q.point.z - z))
            check(`seed ${s}: ${h.id} off every roster pad`, !roster.some(p => padSd(p, x - p.x, z - p.z) <= 0))
            check(`seed ${s}: ${h.id} off every junction apron`, !junctions.some(nd => Math.hypot(nd.x - x, nd.z - z) <= nd.reach))
            check(`seed ${s}: ${h.id} out of water`, !(water.isRoadNoGo(x, z) || water.streamChannelAt?.(x, z)?.inChannel))
            dy = Math.max(dy, Math.abs(terrain.analyticHeight(x, z) - r.baseY))
        }
        check(`seed ${s}: ${h.id} clear of every road's shoulder`, roadMin >= edgeLat, `${roadMin.toFixed(2)} m`)
        check(`seed ${s}: ${h.id} stands on its pad (no float, no sink)`, dy <= 0.05, `${(dy * 100).toFixed(1)} cm`)
        for (const o of houses) if (o !== r) for (const a of B) for (const b of boxesOf(o))
            check(`seed ${s}: ${h.id} clear of ${o.id}`, !overlap(a, b))
    }
    // the road deck is the same with and without the house pads
    const probe = houses.flatMap(r => { const h = stops.find(q => q.house === r); return [-5, -2.5, 0, 2.5, 5, 7].map(l => [h.x - h.nx * (13 - l), h.z - h.nz * (13 - l)]) })
    const deck = () => probe.map(([x, z]) => road.sampleRoadTopY(x, z))
    const withPads = deck()
    road.setPoiPads(poi.list())
    const without = deck()
    road.setPoiPads([...poi.list(), ...houses.map(r => r.pad)])
    check(`seed ${s}: the house pads leave the road deck bit-identical`, withPads.every((y, i) => Object.is(y, without[i])))
    const first = stops.map(fmt).join(';')
    rebuild()
    check(`seed ${s}: deterministic (a rebuild over its own pads)`, poi.houses().map(fmt).join(';') === first)
    const by = houses.reduce((o, r) => (o[r.key] = (o[r.key] ?? 0) + 1, o), {})
    console.log(`seed ${String(s).padStart(10)}: ${houses.length}/${stops.length} stops have a house (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')})` +
        ` · fallback ${stops.length - houses.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
console.log(`ALL: ${tot.houses}/${tot.stops} stops have a house (${(100 * tot.houses / tot.stops).toFixed(0)} %) · ` +
    Object.entries(tot.keys).map(([k, n]) => `${k} ${n}`).join(', '))
console.log(fails ? `\n${fails} FAIL` : '\nPASS')
process.exit(fails ? 1 : 0)
