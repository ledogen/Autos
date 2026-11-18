// GATE (FEAT-275, DEC-429): the residences' mailboxes, on real worlds (12 random seeds, the live 2500 m region).
//
//   · every residence that is not an RV (data/prop-models.js `rv`) has exactly one mailbox; an RV has none
//   · it stands on the ROAD SHOULDER: the post between the paved edge and the shoulder's outer edge, the box's
//     reach clear of the lane (none on the deck), off every roster pad, on no junction pad, in no bore, in no water
//   · its base is within 5 cm of the surface the truck drives there (main.js _groundSampleY's rule: the road top
//     inside the road footprint, else the carved terrain), at the post and 15 cm round it
//   · it faces the road: its door (-Z) points at the nearest centreline within ~25 degrees
//   · it is near its own pad: within 12 m of the pad's road-edge end (where the pad meets the road)
//   · every paper-route house (poi.mailboxes(), the orchestrator's reading of DEC-429's "30% can remain just boxes")
//     has one on the shoulder in front of its target (within 3.5 m along the road), held to the same tests
//   · ZERO lone boxes (FEAT-280 withdrawn): every mailbox belongs to a non-RV residence or a route house
//   · deterministic: a second build of the same seed gives the identical list
// Census per seed: mailboxes, and every residence with none and why (RV / no viable spot).
// Heavy: 12 routed worlds. MAILBOX_SEEDS=a,b,c overrides the set (the 12-random-seed census).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, MAILBOX_POOL } from '../src/poi.js'
import { padSd } from '../src/road-carve.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    if (!ok) { console.log(`[FAIL] ${label}  ${detail}`); fails++ }
    return ok
}
const SEEDS = (process.env.MAILBOX_SEEDS ?? '11,222,3333,44444,555555,6666668,77,880,9901,10002,1300003,24')
    .split(',').map(Number)
const R = 2500, C = { x: 0, z: 0 }
const P = RANGER_PARAMS
const half = P.roadHalfWidth ?? 5, edgeLat = half + (P.roadShoulderWidth ?? 2.5)
const isMailbox = (key) => PROP_MODELS[key]?.tags?.includes(MAILBOX_POOL)

function world (seed) {
    const road = new RoadSystem(seed, P)
    road.setRadius(R); road.update(new THREE.Vector3(C.x, 0, C.z))
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
    poi.build(C, R); poi.buildHouses(C, R)
    return { road, water, terrain, poi }
}
const mailboxesOf = (poi) => poi.list().flatMap(q => (q.satellites ?? []).filter(s => isMailbox(s.key)).map(s => ({ q, s })))
const idOf = (s) => s.id   // a route mailbox names the house it serves
const fmt = ({ q, s }) => `${q.id}:${s.key}@${s.x.toFixed(3)},${s.z.toFixed(3)},${s.y.toFixed(3)}/${s.yaw.toFixed(4)}/${s.variant}`

let tot = { mb: 0, res: 0, rv: 0, none: 0, route: 0, houses: 0 }
for (const seed of SEEDS) {
    const { road, water, terrain, poi } = world(seed)
    // the truck's surface: main.js _groundSampleY
    const ground = (x, z) => {
        const nr = road.queryNearest(x, z, edgeLat + 1)
        const ry = nr?.point && Math.hypot(nr.point.x - x, nr.point.z - z) <= edgeLat ? road.sampleRoadTopY(x, z) : null
        return ry ?? terrain.analyticHeight(x, z)
    }
    const route = poi.mailboxes(), houses = poi.houses()
    const all = [...mailboxesOf(poi), ...route.map(s => ({ q: houses.find(h => h.id === idOf(s)), s }))]
    // junction ground only: padReachNodes() also lists the story pads themselves (storyPadReach)
    const story = road.storyPadReach()
    const junctions = road.padReachNodes().filter(nd => !story.some(p => p.x === nd.x && p.z === nd.z))
    for (const { q, s } of all) check(`seed ${seed}: ${q?.id ?? `${s.x.toFixed(1)},${s.z.toFixed(1)}`} is a non-RV residence or a route house — no lone box`,
        !!q && (q.type === 'house' || (q.tags?.includes('residence') && !PROP_MODELS[q.modelKey]?.rv)))
    check(`seed ${seed}: one mailbox per route house`, route.length === new Set(route.map(s => idOf(s))).size, `${route.length}`)
    const noBox = houses.filter(h => !route.some(s => idOf(s) === h.id))
    const shoulder = (q, s) => {
        const r = 0.5 * Math.hypot(PROP_MODELS[s.key].collision.size[0], PROP_MODELS[s.key].collision.size[2])
        const nr = road.queryNearest(s.x, s.z, 30)
        if (!check(`seed ${seed}: ${q.id} mailbox has a road near`, !!nr?.point)) return
        const dx = nr.point.x - s.x, dz = nr.point.z - s.z, d = Math.hypot(dx, dz)
        check(`seed ${seed}: ${q.id} mailbox post on the shoulder`, d >= half && d <= edgeLat, `${d.toFixed(2)} m from the centreline`)
        check(`seed ${seed}: ${q.id} mailbox clear of the lane (not on the deck)`, d - r >= half, `reach ${(d - r).toFixed(2)} m`)
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw)
        check(`seed ${seed}: ${q.id} mailbox faces the road`, (fx * dx + fz * dz) / d >= 0.9, `dot ${((fx * dx + fz * dz) / d).toFixed(2)}`)
        let dy = 0
        for (const [ox, oz] of [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]]) dy = Math.max(dy, Math.abs(s.y - ground(s.x + ox, s.z + oz)))
        check(`seed ${seed}: ${q.id} mailbox base within 5 cm of the ground`, dy <= 0.05, `${(dy * 100).toFixed(1)} cm`)
        check(`seed ${seed}: ${q.id} mailbox not in a bore`, !road.tunnelSpanAt?.(nr.runKey ?? '', nr.arcS ?? 0))
        check(`seed ${seed}: ${q.id} mailbox not on a junction pad`, !junctions.some(nd => Math.hypot(nd.x - s.x, nd.z - s.z) <= nd.reach))
        check(`seed ${seed}: ${q.id} mailbox not in water`, !(water.isRoadNoGo(s.x, s.z) || water.streamChannelAt?.(s.x, s.z)?.inChannel))
        check(`seed ${seed}: ${q.id} mailbox on no pad`, !poi.list().some(p => p.halfLen && padSd(p, s.x - p.x, s.z - p.z) < 0))
    }
    const res = poi.list().filter(q => q.tags?.includes('residence'))
    const why = []
    for (const q of res) {
        const sats = (q.satellites ?? []).filter(s => isMailbox(s.key))
        const rv = !!PROP_MODELS[q.modelKey]?.rv
        if (rv) { check(`seed ${seed}: ${q.id} (RV) has no mailbox`, sats.length === 0, `${sats.length}`); why.push(`${q.type}/${q.modelKey}: RV`); continue }
        if (!check(`seed ${seed}: ${q.id} (${q.type}/${q.modelKey}) has one mailbox`, sats.length === 1, `${sats.length}`)) { if (!sats.length) why.push(`${q.type}/${q.modelKey}: no viable spot`); continue }
        const s = sats[0]
        shoulder(q, s)
        // where the pad meets the road: the pad's road-edge end, along the pad's own tangent
        const u = (s.x - q.x) * q.tx + (s.z - q.z) * q.tz
        check(`seed ${seed}: ${q.id} mailbox at its pad's end`, Math.abs(Math.abs(u) - q.halfLen) <= 12, `${u.toFixed(1)} m along, halfLen ${q.halfLen}`)
    }
    for (const s of route) {
        const h = houses.find(h => h.id === idOf(s))
        if (!check(`seed ${seed}: route mailbox ${s.x.toFixed(1)},${s.z.toFixed(1)} has its house`, !!h)) continue
        shoulder(h, s)
        const u = (s.x - h.x) * h.tx + (s.z - h.z) * h.tz
        check(`seed ${seed}: ${h.id} mailbox in front of its target`, Math.abs(u) <= 3.5, `${u.toFixed(1)} m along`)
    }
    const w2 = world(seed).poi
    const again = [...mailboxesOf(w2).map(fmt), ...w2.mailboxes().map(s => fmt({ q: { id: 'route' }, s }))].join(';')
        === [...mailboxesOf(poi).map(fmt), ...route.map(s => fmt({ q: { id: 'route' }, s }))].join(';')
    check(`seed ${seed}: deterministic`, again)
    const rv = res.filter(q => PROP_MODELS[q.modelKey]?.rv).length
    console.log(`seed ${String(seed).padStart(10)}: ${all.length - route.length} mailboxes / ${res.length} residences (${rv} RV) + ${route.length} / ${houses.length} route houses` +
        (noBox.length ? ` · route houses with none: ${noBox.length}` : '') +
        (why.length ? ` · none: ${why.join(', ')}` : ''))
    tot.mb += all.length - route.length; tot.res += res.length; tot.rv += rv; tot.none += res.length - rv - (all.length - route.length); tot.route += route.length; tot.houses += houses.length
}
console.log(`ALL: ${tot.mb} mailboxes / ${tot.res} residences (${tot.rv} RV, ${tot.none} non-RV with none) + ${tot.route} / ${tot.houses} route houses`)
console.log(fails ? `\n${fails} FAIL` : '\nPASS')
process.exit(fails ? 1 : 0)
