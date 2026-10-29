// CENSUS (FEAT-103 alpha): where can the expedition camp sit "on the circle's edge, at the end of a road"?
//
// Not a gate — a measurement. Per seed, the story region exactly as story mode builds it (spawn,
// 2800 m warm, validateArea → the main piece, the planners' graph at REGION_MARGIN), then:
//
//   cross   roads that leave the planners' wall (r = 2400 m) from a node on the spawn's piece. Cutting
//           one there makes a dead end at the wall — the "cut existing" scheme. Per crossing:
//             conn  road metres from the inner node to the cut
//             run   road metres back from the cut to the last real junction (planner degree ≥ 3)
//             bear  the cut's compass bearing (0 = north = −Z, the map's up)
//             rd    road metres from the spawn to the inner node
//             stream  the connector (cut back to the last junction) passes over a stream channel
//             pads  14 x 8 m lay-bys (the camp model's pad, ASSET-71) that pass the POI reject battery
//                   on the crossing's last 400 m inside the wall
//   stubs   dead ends that already exist (network degree 1) on the spawn's piece, ≥ 1800 m out.
//   reach   the farthest any road of the piece gets from the centre, inside the wall.
//   camp    THE PICK: where the game puts the expedition camp (poi.js _siteCamp, via a real build) —
//           its bearing, radius, and roadM, the road metres from the spawn to the camp. null = none.
//
//   node test/camp-edge-census.mjs --seeds=1-100 [--out=file.jsonl]
import * as THREE from 'three'
import { appendFileSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { buildGraphAdj, graphDijkstra, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]
const [lo, hi] = (arg('seeds') || '1-10').split('-').map(Number)
const OUT = arg('out')
const R_CUT = REGION_RADIUS_M - REGION_MARGIN
const PAD_BAND = 400, PAD_STEP = 15

for (let s = lo; s <= (hi ?? lo); s++) {
    const seed = parseWorldSeed(String(s)), t0 = Date.now()
    const P = RANGER_PARAMS
    const sp = spawnDecision(seed, P)
    const C = { x: sp.x, z: sp.z }
    const r = (p) => Math.hypot(p.x - C.x, p.z - C.z)
    const bear = (p) => Math.round((Math.atan2(p.x - C.x, -(p.z - C.z)) * 180 / Math.PI + 360) % 360)
    const road = new RoadSystem(seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const g = road.networkGraph()
    const posK = (k) => g.pos(g.idOf.get(k))
    const { adj } = buildGraphAdj(g, (p) => r(p) <= R_CUT, rep.mainNodes)

    // A PoiSystem only for its reject battery (_evaluate) — never built, so no pads are handed over.
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                getSeed: () => seed, getParams: () => P })
    const K = { ...POI_PARAMS, ...P }
    const lat = (P.roadHalfWidth ?? 5) + (P.roadShoulderWidth ?? 2.5) + K.poiPadGap + K.poiPadHalfWid

    // The spawn's piece of the planners' graph (as test/region-pieces.mjs finds it).
    let near = null, nearD = Infinity
    for (const [, e] of road._network) {
        if (!e.cellA || !e.cellB || !(e.points?.length > 1)) continue
        for (const p of e.points) { const d = r(p); if (d < nearD) { nearD = d; near = e } }
    }
    const startK = near && adj.has(near.cellA.join(',')) ? near.cellA.join(',') : null
    const { dist } = startK ? graphDijkstra(adj, startK) : { dist: new Map() }
    const home = (k) => dist.has(k)

    // Road metres from a node back to the last planner junction (degree ≥ 3), through degree-1/2 nodes,
    // and the runs walked on the way.
    const runOf = new Map()
    for (const [, e] of road._network) if (e.cellA && e.cellB) {
        runOf.set(`${e.cellA.join(',')}|${e.cellB.join(',')}`, e); runOf.set(`${e.cellB.join(',')}|${e.cellA.join(',')}`, e)
    }
    const runBack = (k) => {
        let len = 0, prev = null, cur = k
        const runs = []
        for (let hops = 0; hops < 50; hops++) {
            const nb = adj.get(cur).filter((x) => x.to !== prev)
            if (adj.get(cur).length >= 3 || nb.length !== 1) break
            len += nb[0].w; runs.push(runOf.get(`${cur}|${nb[0].to}`)); prev = cur; cur = nb[0].to
        }
        return { len, runs }
    }
    const overStream = (pts) => pts.some((p) => water.streamChannelAt(p.x, p.z)?.inChannel)
    const padsNearCut = (e) => {
        const ed = road.edgeParData(e.cellA, e.cellB)
        if (!ed?.centerline) return 0
        const off = ed.arcOffset ?? 0, L = ed.arcLength ?? ed.centerline.length
        let n = 0, last = -Infinity
        for (let a = off + K.poiEndClearM; a <= off + L - K.poiEndClearM; a += PAD_STEP) {
            const d = r(ed.centerline.pointAt(a))
            if (d > R_CUT - 20 || d < R_CUT - PAD_BAND || a - last < 30) continue
            if ([1, -1].some((side) => poi._evaluate(road, ed, a, side, lat, K))) { n++; last = a }
        }
        return n
    }

    const cross = [], stubs = []
    let reach = 0, reachBear = 0
    for (const [, e] of road._network) {
        if (!e.cellA || !e.cellB || !(e.points?.length > 1)) continue
        const ka = e.cellA.join(','), kb = e.cellB.join(',')
        const inA = home(ka), inB = home(kb)
        if (!inA && !inB) continue
        // Walk the polyline from each home end; the first point past the planners' wall is the cut.
        const pts = e.points, cum = e.polyCum, L = cum[cum.length - 1]
        const pa = g.pos(e.cellA)
        const aFirst = Math.hypot(pts[0].x - pa.x, pts[0].z - pa.z) < Math.hypot(pts[pts.length - 1].x - pa.x, pts[pts.length - 1].z - pa.z)
        for (const [k, inK, fromStart] of [[ka, inA, aFirst], [kb, inB, !aFirst]]) {
            if (!inK) continue
            const n = pts.length
            for (let j = 0; j < n; j++) {
                const i = fromStart ? j : n - 1 - j
                const d = r(pts[i])
                if (d > reach && d <= R_CUT) { reach = d; reachBear = bear(pts[i]) }
                if (d > R_CUT) {
                    const other = k === ka ? kb : ka
                    const conn = Math.round(fromStart ? cum[i] : L - cum[i])
                    const back = runBack(k)
                    const inner = fromStart ? pts.slice(0, i) : pts.slice(i + 1)
                    const stream = overStream(inner) || back.runs.some((q) => q && overStream(q.points))
                    // bow: both ends home ⇒ the road leaves and comes back; cutting it costs a loop, not a dead end.
                    cross.push({ conn, run: Math.round(conn + back.len), stream, bear: bear(pts[i]),
                                 rd: Math.round(dist.get(k)), bow: home(other), rIn: Math.round(r(posK(k))),
                                 pads: padsNearCut(e), node: k })
                    break
                }
            }
        }
    }
    for (const [k, nb] of g.adj) {
        if (!home(k) || nb.size !== 1) continue
        const p = posK(k)
        if (r(p) >= 1800) stubs.push({ r: Math.round(r(p)), bear: bear(p), rd: Math.round(dist.get(k)) })
    }
    // THE PICK (FEAT-103): the camp the game places — poi.js _siteCamp through a real build.
    poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    const q = poi.list().find((x) => x.type === 'expeditionCamp')
    const inner = q && (home(q.edge.split('|')[0]) ? q.edge.split('|')[0] : q.edge.split('|')[1])
    const camp = q ? { bear: bear(q), r: Math.round(r(q)), roadM: Math.round(q.roadM), node: inner } : null
    const row = { seed: s, sec: Math.round((Date.now() - t0) / 1000), pieces: rep.components, camp,
                  reach: Math.round(reach), reachBear, cross: cross.sort((a, b) => a.bear - b.bear), stubs }
    console.log(JSON.stringify(row))
    if (OUT) appendFileSync(OUT, JSON.stringify(row) + '\n')
}
