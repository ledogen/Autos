// GATE (BUG-85 / BUG-80): A WALL THAT CUTS THE ROAD NETWORK NEVER STRANDS A DESTINATION.
//
// Owner ruling 2026-10-15 (DESIGN.md "Run shape and saving"): a split never refuses a seed. The
// spawn's piece is the region's network; every other piece is STRANDED — drivable, but no POI,
// customer, mission endpoint or roadside drop may land on it. This gate asserts the PROPERTY the
// player sees, not one seed's numbers, over the planners' own graph (buildGraphAdj — the one seam
// the mission planner, roadside drops and the paper tour share), each region at its seed's spawn:
//
//   1. the seed is PLAYABLE — a split no longer refuses it
//   2. the planners' graph is ONE connected piece, and the spawn's road is on it
//   3. every POI and every newspaper customer sits on an edge of that graph
//   4. the main piece is the LARGEST (DESIGN.md's rule; phase 1 picks the spawn's — they must agree)
//   5. a seed with no stranded piece is UNTOUCHED: the filter drops only pads OFF the planners' graph
//      (edges ending at a stub node no planner can route to — present on clean seeds too), and an
//      identical pool gives identical POIs. FEAT-50: until the four gas pumps this was asserted as
//      "the same POIs as with no filter at all", which only held because the pair siting never
//      happened to pick one of those off-graph pads; farthest-point siting reaches for exactly them.
//
// Seeds: the four known splits (1222770136 the BUG-85 report, 30 and 31 from the 2026-10-12 sweep,
// 3309753130 BUG-80's clip split) + two clean ones. If a router change heals a split seed, the
// filter is no longer exercised there — that is printed as a NOTE, never failed.
//
// Heavy: routes a full 2800 m region per seed (~20 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { buildGraphAdj, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'

const SPLITS = ['1222770136', '30', '31', '3309753130']
const CLEAN = ['6', '7']
const ONLY = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

function placePois (seed, road, C, nodes) {
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, nodes)
    poi.buildHouses(C, REGION_RADIUS_M, nodes)
    return poi
}

for (const s of [...SPLITS, ...CLEAN]) {
    if (ONLY && s !== ONLY) continue
    const seed = parseWorldSeed(s), t0 = Date.now()
    const sp = spawnDecision(seed, P)
    const C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    // Exactly what main.js validateRegion hands story mode.
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
    console.log(`seed ${s}  spawn (${C.x.toFixed(0)}, ${C.z.toFixed(0)})  ${((Date.now() - t0) / 1000).toFixed(0)} s  · ` +
                `${rep.components} piece${rep.components === 1 ? '' : 's'}` +
                (rep.stranded.length ? `, stranded ${rep.stranded.map((q) => `${q.km.toFixed(1)} km @ ${q.nearest.toFixed(0)} m`).join(', ')}` : ''))

    // 1.
    check('playable — a split does not refuse the seed', rep.playable, `components ${rep.components}, condemned ${rep.condemned.length}`)

    // 2. The planners' graph, built exactly as mission.js builds it.
    const g = road.networkGraph()
    const rMax = REGION_RADIUS_M - REGION_MARGIN
    const inRegion = (p) => Math.hypot(p.x - C.x, p.z - C.z) <= rMax
    const { adj } = buildGraphAdj(g, inRegion, region.nodes)
    const comps = (a) => {
        const seen = new Set(); let n = 0
        for (const k of a.keys()) {
            if (seen.has(k)) continue
            n++; const st = [k]; seen.add(k)
            while (st.length) for (const e of a.get(st.pop())) if (!seen.has(e.to)) { seen.add(e.to); st.push(e.to) }
        }
        return n
    }
    check('the planners\' graph is one piece', comps(adj) === 1, `${comps(adj)} pieces`)
    let near = null, nearD = Infinity
    for (const [, e] of road._network) {
        if (!e.cellA || !e.cellB || !(e.points?.length > 1)) continue
        for (const p of e.points) { const d = Math.hypot(p.x - C.x, p.z - C.z); if (d < nearD) { nearD = d; near = e } }
    }
    check('the spawn\'s road is on it', !!near && adj.has(near.cellA.join(',')) && adj.has(near.cellB.join(',')),
          near ? `${near.cellA.join(',')} — ${near.cellB.join(',')}` : 'no road')
    const unfiltered = comps(buildGraphAdj(g, inRegion).adj)
    if (SPLITS.includes(s) && unfiltered === 1)
        console.log(`  [note] seed ${s} no longer splits under the planners' wall — the filter is not exercised here`)

    // 3. Against the SPAWN'S piece of the planners' graph — not merely "on the graph", so this holds
    //    on its own even if the filter in (2) were gone (negative-controlled 2026-10-15).
    const home = new Set()
    if (near && adj.has(near.cellA.join(','))) {
        const st = [near.cellA.join(',')]; home.add(st[0])
        while (st.length) for (const e of adj.get(st.pop())) if (!home.has(e.to)) { home.add(e.to); st.push(e.to) }
    }
    const poi = placePois(seed, road, C, region.nodes)
    const onGraph = (q) => home.has(g.key(q.aId)) && home.has(g.key(q.bId))
    const offP = poi.list().filter((q) => !onGraph(q)), offC = poi.customers().filter((q) => !onGraph(q))
    check(`every POI is on the spawn's piece (${poi.list().length})`, offP.length === 0, offP.map((q) => q.type).join(', '))
    check(`every customer is on the spawn's piece (${poi.customers().length})`, offC.length === 0, `${offC.length} off`)

    // 4.
    const largest = Math.max(0, ...rep.stranded.map((q) => q.km))
    let mainKm = 0
    for (const [, e] of road._network)
        if (e.cellA && e.cellB && rep.mainNodes.has(e.cellA.join(',')) && rep.mainNodes.has(e.cellB.join(',')) && e.points.every((p) => inRegion(p)))
            mainKm += e.polyCum[e.polyCum.length - 1] / 1000
    check('the main piece is the largest', mainKm >= largest, `main ${mainKm.toFixed(1)} km vs stranded ${largest.toFixed(1)} km`)

    // 5.
    if (!rep.stranded.length) {
        const bare = placePois(seed, road, C, null)
        const ids = (p) => p.list().map((q) => `${q.id}:${q.type}`).join() + '|' + p.customers().map((q) => q.id).join()
        const kept = new Set(poi.pool().map((q) => q.id))
        const dropped = bare.pool().filter((q) => !kept.has(q.id))
        check('no stranded piece ⇒ the filter drops only pads off the planners\' graph',
            dropped.every((q) => !onGraph(q)), dropped.filter(onGraph).map((q) => q.id).join(', '))
        if (!dropped.length) check('no stranded piece and an identical pool ⇒ the same POIs and customers', ids(poi) === ids(bare))
    }
}

if (fails) { console.log(`\nregion-pieces: ${fails} FAIL`); process.exit(1) }
console.log('\nregion-pieces: all ok')
