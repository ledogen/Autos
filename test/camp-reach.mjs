// GATE (FEAT-164): a camp zone is never more than CAMP_REACH_M of road away.
//
// Per seed, the story region exactly as story mode builds it (spawn, 2800 m warm, validateArea → the
// main piece, the planners' wall), and its camp zones (CampSystem.build — the list the map draws).
// A road point is CAMPABLE when it lies inside a zone disc: the map's yellow casing. Then:
//
//   NODE  — the worst shortest drive from any network node to the nearest campable road point
//           (multi-source Dijkstra: each edge seeds its ends with the arc to its first/last in-zone point).
//   POINT — the same over every point of every road, not just the nodes: a zone-less edge's worst point
//           is (dA + dB + L) / 2, the stretch before an edge's first in-zone point (dA + s0) / 2, a gap
//           between two in-zone stretches of one edge half its length.
//
// Fails when POINT exceeds CAMP_REACH_M on any seed, or when any node cannot reach a zone at all.
// `node test/camp-reach.mjs --seeds=4194356868,1,6` measures other seeds (the sweep); `--report` never fails.
//
// Heavy: routes a full 2800 m region per seed (~15 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { CampSystem } from '../src/camp.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { spawnDecision } from './lib/spawn-decision.mjs'

const CAMP_REACH_M = 3000   // m [DEFAULT] — the owner's number (FEAT-164)

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const SEEDS = (arg('seeds') ?? '4194356868,1,6').split(',').filter(Boolean)
const REPORT = process.argv.includes('--report')

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
    const zones = new CampSystem({ getSeed: () => seed, getParams: () => ({}) }).build(C, REGION_RADIUS_M)
    const inZone = (p) => zones.some((q) => Math.hypot(p.x - q.x, p.z - q.z) <= q.r)

    // The planners' graph: the main piece, inside the wall (expedition-camp.mjs's filter).
    const wall = REGION_RADIUS_M - REGION_MARGIN
    const g = road.networkGraph()
    const inside = (id) => rep.mainNodes.has(g.key(id)) && Math.hypot(g.pos(id).x - C.x, g.pos(id).z - C.z) <= wall
    const adj = new Map(), dist = new Map(), segs = []
    const link = (k) => { if (!adj.has(k)) { adj.set(k, []); dist.set(k, Infinity) } }
    for (const [a, b, runKey] of g.edges) {
        if (!inside(a) || !inside(b)) continue
        const e = road._network.get(runKey), pts = e.points, cum = e.polyCum
        const L = cum[cum.length - 1]
        // Orient the polyline a → b (its first point sits on one end node).
        const pa = g.pos(a), fwd = Math.hypot(pts[0].x - pa.x, pts[0].z - pa.z) <= Math.hypot(pts.at(-1).x - pa.x, pts.at(-1).z - pa.z)
        const ka = g.key(fwd ? a : b), kb = g.key(fwd ? b : a)
        link(ka); link(kb)
        adj.get(ka).push({ to: kb, w: L }); adj.get(kb).push({ to: ka, w: L })
        // In-zone arcs along the edge: first, last, and the widest gap between two in-zone stretches.
        let s0 = null, s1 = null, gap = 0, lastIn = null
        for (let i = 0; i < pts.length; i++) {
            if (!inZone(pts[i])) continue
            if (s0 === null) s0 = cum[i]
            if (lastIn !== null) gap = Math.max(gap, cum[i] - lastIn)
            lastIn = s1 = cum[i]
        }
        if (s0 !== null) { dist.set(ka, Math.min(dist.get(ka), s0)); dist.set(kb, Math.min(dist.get(kb), L - s1)) }
        segs.push({ ka, kb, L, s0, s1, gap, pts, cum })
    }

    // Multi-source Dijkstra (a linear-scan queue: a region graph is a few hundred nodes).
    const queue = [...dist].filter(([, d]) => d < Infinity).map(([k, d]) => ({ k, d }))
    while (queue.length) {
        queue.sort((p, q) => p.d - q.d)
        const { k, d } = queue.shift()
        if (d > dist.get(k)) continue
        for (const e of adj.get(k)) if (d + e.w < dist.get(e.to)) { dist.set(e.to, d + e.w); queue.push({ k: e.to, d: d + e.w }) }
    }

    let worstNode = 0, worstNodeK = null, stranded = 0
    for (const [k, d] of dist) {
        if (d === Infinity) { stranded++; continue }
        if (d > worstNode) { worstNode = d; worstNodeK = k }
    }
    // The worst POINT and where it is (arc s along a seg, for the map shot).
    let worst = 0, at = null
    const consider = (d, seg, s) => { if (d > worst) { worst = d; at = { seg, s } } }
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
    const where = (() => {
        if (!at || at.s === null) return '—'
        const i = Math.max(0, at.seg.cum.findIndex((c) => c >= at.s))
        return `(${at.seg.pts[i].x.toFixed(0)}, ${at.seg.pts[i].z.toFixed(0)})`
    })()
    const roadKm = segs.reduce((t, q) => t + q.L, 0) / 1000
    const zoneKm = segs.reduce((t, q) => {
        let m = 0
        for (let i = 1; i < q.pts.length; i++) if (inZone(q.pts[i]) && inZone(q.pts[i - 1])) m += q.cum[i] - q.cum[i - 1]
        return t + m
    }, 0) / 1000
    console.log(`seed ${s}  ${((Date.now() - t0) / 1000).toFixed(0)} s  ${zones.length} zones · ${adj.size} nodes · `
        + `${roadKm.toFixed(1)} km road, ${zoneKm.toFixed(1)} km in a zone  →  worst node ${worstNode.toFixed(0)} m, `
        + `worst point ${worst.toFixed(0)} m at ${where}`)
    if (REPORT) continue
    check(`every node reaches a camp zone (${stranded} cannot)`, stranded === 0)
    check(`worst drive to a camp zone ${worst.toFixed(0)} m ≤ CAMP_REACH_M ${CAMP_REACH_M} m`, worst <= CAMP_REACH_M)
}

if (fails) { console.log(`\n${fails} camp-reach check(s) FAILED`); process.exit(1) }
console.log(REPORT ? '\nreport only' : '\nall camp-reach checks passed')
