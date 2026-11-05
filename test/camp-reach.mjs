// GATE (FEAT-164): a camp zone is never more than campReachM of road away.
//
// Per seed, the story region exactly as story mode builds it (spawn, 2800 m warm, validateArea → the
// main piece, the planners' wall), its camp zones (CampSystem.build — the cell grid) and the reach fill
// (CampSystem.fillReach — what main.js runs at go-live). A road point is CAMPABLE when it lies inside a
// zone disc: the map's yellow casing. Measured HERE, independently of camp.js's campReach:
//
//   NODE  — the worst shortest drive from any network node to the nearest campable road point
//           (multi-source Dijkstra: each edge seeds its ends with the arc to its first/last in-zone point).
//   POINT — the same over every point of every road, not just the nodes: a zone-less edge's worst point
//           is (dA + dB + L) / 2, the stretch before an edge's first in-zone point (dA + s0) / 2, a gap
//           between two in-zone stretches of one edge half its length.
//
// Checks: after the fill, POINT ≤ campReachM and every node reaches a zone; the fill only ADDS (every
// cell-grid zone kept as it was, each added one flagged `fill`); a second fillReach adds nothing.
//
//   node test/camp-reach.mjs --seeds=1,6,7                 other seeds (`seed@x:z` pins the region centre)
//   node test/camp-reach.mjs --report --caps=1500,2000     before, and after a fill at each cap (never fails)
//
// Heavy: routes a full 2800 m region per seed (~15 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { CampSystem, CAMP_PARAMS } from '../src/camp.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
// The owner's seed is PINNED to its in-game centre: test/lib/spawn-decision.mjs puts its spawn 325 m off
// the game's (-22, -161 vs 34.65, 158.45 — the browser's free roam and story agree; seeds 1 and 6 match).
const SEEDS = (arg('seeds') ?? '4194356868@34.65:158.45,1,6').split(',').filter(Boolean)
const REPORT = process.argv.includes('--report')
const CAPS = (arg('caps') ?? String(CAMP_PARAMS.campReachM)).split(',').filter(Boolean).map(Number)

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

for (const arg of SEEDS) {
    const [s, at] = arg.split('@'), seed = parseWorldSeed(s), t0 = Date.now()
    const sp = at ? null : spawnDecision(seed, P)
    const C = at ? { x: +at.split(':')[0], z: +at.split(':')[1] } : { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const wall = REGION_RADIUS_M - REGION_MARGIN
    const inWall = (p) => Math.hypot(p.x - C.x, p.z - C.z) <= wall
    const camp = (cap) => {
        const c = new CampSystem({ getSeed: () => seed, getParams: () => (cap ? { campReachM: cap } : {}), getRoad: () => road })
        c.build(C, REGION_RADIUS_M)
        return c
    }

    // The planners' graph: the main piece, inside the wall (expedition-camp.mjs's filter).
    const g = road.networkGraph()
    const inside = (id) => rep.mainNodes.has(g.key(id)) && inWall(g.pos(id))
    const edges = []
    for (const [a, b, runKey] of g.edges) {
        if (!inside(a) || !inside(b)) continue
        const e = road._network.get(runKey), pts = e.points, cum = e.polyCum
        // Orient the polyline a → b (its first point sits on one end node).
        const pa = g.pos(a), fwd = Math.hypot(pts[0].x - pa.x, pts[0].z - pa.z) <= Math.hypot(pts.at(-1).x - pa.x, pts.at(-1).z - pa.z)
        edges.push({ ka: g.key(fwd ? a : b), kb: g.key(fwd ? b : a), L: cum[cum.length - 1], pts, cum })
    }
    const roadKm = edges.reduce((t, q) => t + q.L, 0) / 1000

    const measure = (zones) => {
        const inZone = (p) => zones.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= q.r)
        const adj = new Map(), dist = new Map(), segs = []
        const link = (k) => { if (!adj.has(k)) { adj.set(k, []); dist.set(k, Infinity) } }
        let zoneM = 0
        for (const { ka, kb, L, pts, cum } of edges) {
            link(ka); link(kb)
            adj.get(ka).push({ to: kb, w: L }); adj.get(kb).push({ to: ka, w: L })
            // In-zone arcs along the edge: first, last, and the widest gap between two in-zone stretches.
            let s0 = null, s1 = null, gap = 0, lastIn = null
            for (let i = 0; i < pts.length; i++) {
                if (!inZone(pts[i])) continue
                if (s0 === null) s0 = cum[i]
                if (lastIn !== null) gap = Math.max(gap, cum[i] - lastIn)
                if (lastIn === cum[i - 1]) zoneM += cum[i] - cum[i - 1]
                lastIn = s1 = cum[i]
            }
            if (s0 !== null) { dist.set(ka, Math.min(dist.get(ka), s0)); dist.set(kb, Math.min(dist.get(kb), L - s1)) }
            segs.push({ ka, kb, L, s0, s1, gap, pts, cum })
        }
        // Multi-source Dijkstra (a linear-scan queue: a region graph is a few dozen nodes).
        const queue = [...dist].filter(([, d]) => d < Infinity).map(([k, d]) => ({ k, d }))
        while (queue.length) {
            queue.sort((p, q) => p.d - q.d)
            const { k, d } = queue.shift()
            if (d > dist.get(k)) continue
            for (const e of adj.get(k)) if (d + e.w < dist.get(e.to)) { dist.set(e.to, d + e.w); queue.push({ k: e.to, d: d + e.w }) }
        }
        let node = 0, stranded = 0
        for (const d of dist.values()) { if (d === Infinity) stranded++; else node = Math.max(node, d) }
        let point = 0, at = null
        const consider = (d, seg, arc) => { if (d > point) { point = d; at = { seg, arc } } }
        for (const seg of segs) {
            const dA = dist.get(seg.ka), dB = dist.get(seg.kb)
            if (seg.s0 === null) {
                if (dA < Infinity && dB < Infinity) consider((dA + dB + seg.L) / 2, seg, (dB - dA + seg.L) / 2)
            } else {
                consider((dA + seg.s0) / 2, seg, (seg.s0 - dA) / 2)
                consider((dB + seg.L - seg.s1) / 2, seg, seg.L - (seg.L - seg.s1 - dB) / 2)
                consider(seg.gap / 2, seg, null)
            }
        }
        let where = '—'
        if (at && at.arc !== null) {
            const i = Math.max(0, at.seg.cum.findIndex((c) => c >= at.arc))
            where = `(${at.seg.pts[i].x.toFixed(0)}, ${at.seg.pts[i].z.toFixed(0)})`
        }
        return { node, point, where, stranded, zoneKm: zoneM / 1000 }
    }
    const line = (m) => `worst ${m.point.toFixed(0)} m at ${m.where}${m.stranded ? `, ${m.stranded} nodes reach none` : ''} · `
        + `${m.zoneKm.toFixed(1)} km of road in a zone`

    const grid = camp().zones()
    const before = measure(grid)
    console.log(`seed ${s}  ${((Date.now() - t0) / 1000).toFixed(0)} s  ${roadKm.toFixed(1)} km road, ${edges.length} roads  `
        + `before: ${grid.length} zones, ${line(before)}`)
    for (const cap of CAPS) {
        const c = camp(REPORT ? cap : 0), t1 = Date.now()
        const zones = c.fillReach(rep.mainNodes, inWall)
        const ms = Date.now() - t1
        const after = measure(zones), fills = zones.filter((q) => q.fill)
        console.log(`    cap ${cap} m: +${fills.length} zones (${ms} ms), ${line(after)}`)
        if (REPORT) continue
        check(`after the fill every node reaches a camp zone`, after.stranded === 0, `${after.stranded} cannot`)
        check(`after the fill the worst drive to a camp zone is ≤ campReachM`, after.point <= cap, `${after.point.toFixed(0)} m > ${cap} m`)
        check(`the fill only adds: every cell-grid zone kept as it was, each added one flagged`,
            grid.every((q, i) => zones[i].x === q.x && zones[i].z === q.z && zones[i].r === q.r && !zones[i].fill)
                && zones.length === grid.length + fills.length && zones.slice(grid.length).every((q) => q.fill))
        check(`a second fillReach adds nothing`, c.fillReach(rep.mainNodes, inWall).length === zones.length)
    }
}

if (fails) { console.log(`\n${fails} camp-reach check(s) FAILED`); process.exit(1) }
console.log(REPORT ? '\nreport only' : '\nall camp-reach checks passed')
