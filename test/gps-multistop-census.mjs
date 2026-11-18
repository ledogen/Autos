// test/gps-multistop-census.mjs — BUG-205 / BUG-212 (owner 2026-11-17: "the waypoint distance measure at top of screen is
// wrong" · "the GPS map line gets kind of confused especially for missions with multiple stops"). A rainy-day census, NOT
// a gate (~1 min of CPU a seed): per seed the story region as story entry builds it (demolition-site.mjs's build), then
//   BUG-205  the top readout against the planner's own road distance from the truck to the stop the GPS leads to, for a
//            multi-drop courier, a fetch, and a player waypoint: before (mission.js's old whole-job arc; the waypoint's
//            crow-flies) and after (the leg's arc; the waypoint's line). Paper rounds and demolition show no distance.
//   BUG-212  a scripted driver that FOLLOWS the GPS (20 m a step = one RR_PARAMS.tourS re-plan at ~20 m/s) through paper
//            rounds of 4/7/9/11 houses and every demolition job, four drives each (clean · a missed stop · off the route ·
//            a U-turn), counting target flips, order flips, the tour growing while followed, and the demolition map line
//            (the job's planned route) against the GPS's tour order.
// Usage: node test/gps-multistop-census.mjs [seed …] [--out=wip/bugs-gfc/census.json]
import * as THREE from 'three'
import { writeFileSync, mkdirSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { OfferBoard } from '../src/offer-board.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN, routeLeftM, polyCumOf } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { siteTargets, siteStops } from '../src/demolition.js'
import { planTour, planGuideJob, tourLeg, roadOrigin, PAPER_PARAMS, RR_PARAMS } from '../src/paper-route.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const args = process.argv.slice(2)
const OUT = args.find(a => a.startsWith('--out='))?.slice(6) ?? 'wip/bugs-gfc/census.json'
const SEEDS = args.filter(a => !a.startsWith('--'))
if (!SEEDS.length) for (let i = 0; i < 5; i++) SEEDS.push(String((Math.random() * 2 ** 32) >>> 0))
const drain = (it) => { if (!it) return null; let r; do r = it.next(); while (!r.done); return r.value }
const STEP = 20, NEAR = 18
const out = { seeds: SEEDS, hud: [], tours: [], demoMap: [] }
const KEEPS = [null, 0, 5, 25]   // BUG-212: no hysteresis (main before), then RR_PARAMS.keepM of 0 (ties only) / 5 / 25 m

// Walk `d` metres along `poly` from the vertex nearest `c` (forward = toward the end). Returns { x, z, end }.
function along (poly, c, d) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < poly.length; i++) { const e = (poly[i].x - c.x) ** 2 + (poly[i].z - c.z) ** 2; if (e < bd) { bd = e; bi = i } }
    let p = { x: poly[bi].x, z: poly[bi].z }
    for (let i = bi; i < poly.length - 1 && d > 0; i++) {
        const q = poly[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z)
        if (L >= d) return { x: p.x + (q.x - p.x) * d / L, z: p.z + (q.z - p.z) * d / L, end: false }
        d -= L; p = { x: q.x, z: q.z }
    }
    return { ...p, end: true }
}
const segPt = (g) => g.centerline.pointAt(g.s1)
const legEnd = (line) => segPt(tourLeg(line).segments.at(-1))
const lenOf = (segs) => segs.reduce((a, g) => a + Math.abs(g.s1 - g.s0), 0)

for (const s of SEEDS) {
    const seed = parseWorldSeed(s), t0 = Date.now()
    const sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain, getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
    const list = poi.list()
    const car = { x: C.x, z: C.z }
    const ms = new MissionSystem({ getRoad: () => road, getCar: () => car, getSeed: () => seed, getRegion: () => region,
                                   teleport () {}, setMapOpen () {}, onChange () {} })
    const world = { road, height: (x, z) => terrain.analyticHeight(x, z), halfWidth: P.roadHalfWidth,
                    isWater: (x, z) => !!water.pondAt(x, z) || water.streamChannelAt(x, z).inChannel }
    console.log(`seed ${s}: region ${((Date.now() - t0) / 1000).toFixed(0)} s, ${list.length} POIs`)
    // main.js _planFromTruck: the shortest line by road from the truck's road point to `door` — the planner's truth.
    const planFrom = (c, door) => { const from = roadOrigin(road, c); return from && ms.planOffer(from, { rng: Math.random,
        dest: { kind: 'poi', pois: [door], strict: true, anyLeg: true, nearest: true } }) }
    const doorAt = (p, id) => { const o = roadOrigin(road, p); return o && { ...o, id } }
    const truthM = (c, door) => planFrom(c, door)?.distance ?? NaN

    // ── BUG-205: the readouts ──────────────────────────────────────────────────────────────────────────
    const board = new OfferBoard({ seed, pois: list, nowH: 6 })
    board.openLines(6)
    const planOne = (o, exclude) => ms.planOffer(list.find((q) => q.id === o.poiId), { rng: board.routeRng(o), dest: board.destWish(o, list, exclude) })
    const jobs = []
    for (const id of board.sources()) for (const o of board.offers(id, 6)) {
        const sp2 = board.spec(o), m = sp2 && board.planDistinct(o, planOne)
        if (!m?.poly) continue
        if (sp2.targets) { m.targets = siteTargets(m, sp2.targets, `demo:${seed}:${o.id}`, world); if (m.targets?.length) jobs.push({ kind: 'demolition', m, o }) }
        else if (m.fetch) jobs.push({ kind: 'fetch', m, o })
        else if (m.legs) jobs.push({ kind: 'multi-drop', m, o })
    }
    const oldRemaining = (m, bi) => m.polyCum.at(-1) - m.polyCum[bi]   // mission.js before BUG-205: to the job's END
    for (const j of jobs.filter(j => j.kind !== 'demolition').slice(0, 4)) {
        const m = j.m
        ms.mission = m; ms.state = 'running'; ms.leg = 0; ms._polyIdx = 0
        const doors = m.legs.map((l, i) => doorAt(l.end, `leg${i}`))
        for (let u = 50; u < m.polyCum.at(-1) - 30; u += 150) {
            const k = m.polyCum.findIndex(c => c >= u), p = m.poly[k]
            while (ms.leg < m.legs.length - 1 && k > (m.legs[ms.leg].polyIdx ?? Infinity)) { ms._polyIdx = m.legs[ms.leg].polyIdx; ms.leg++ }
            car.x = p.x; car.z = p.z
            const after = ms.routeRemaining(), truth = truthM(car, doors[ms.leg])
            out.hud.push({ seed: s, kind: j.kind, legs: m.legs.length, leg: ms.leg, u: Math.round(u), truth, before: oldRemaining(m, k), after })
        }
    }
    ms.mission = null; ms.state = 'idle'
    // The player's waypoint: three random road points; the truck at 6 places along each line.
    for (let w = 0; w < 3; w++) {
        const a = Math.random() * 2 * Math.PI, r = 300 + Math.random() * 1500
        const door = doorAt({ x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r }, 'waypoint')
        const line = door && planFrom(C, door)
        if (!line?.poly?.length) continue
        const L = line.polyCum.at(-1)
        for (let f = 0.05; f < 0.95; f += 0.15) {
            const k = line.polyCum.findIndex(c => c >= f * L), p = line.poly[k]
            out.hud.push({ seed: s, kind: 'waypoint', legs: 1, leg: 0, u: Math.round(f * L), truth: truthM(p, door),
                           before: Math.hypot(door.x - p.x, door.z - p.z), after: routeLeftM(line, p.x, p.z) })
        }
    }

    // ── BUG-212: follow the GPS through a tour ─────────────────────────────────────────────────────────
    // stops: the planner's stop shape; reach(stop): its road point; replan(c, owed) → a tour from the truck.
    const drive = (label, stops, reach, scen, keep) => {
        const owed = new Map(stops.map(t => [t.id, t]))
        let c = { ...reach(stops[0]) }, line = null, prevTarget = null, prevOrder = null, prevLen = null
        const trail = [], ev = { seq: [], planMs: 0, flipGapM: 0, flipAt: null, flipsBack: 0, targetChanges: 0, orderFlips: 0, grew: 0, grewMax: 0, steps: 0, served: 0 }
        const seen = []   // the last few targets with no service between
        let script = null, missed = null
        const firstPos = c
        // start a little behind the first stop's road point, on the line from the region centre's side
        const init = drain(planGuideJob(road, C, stops, region))
        if (!init?.poly) return null
        c = along(init.poly, init.poly[0], 0)
        for (let step = 0; step < 900 && owed.size; step++) {
            ev.steps++
            const tp = performance.now()
            if (keep != null) RR_PARAMS.keepM = keep
            const tour = drain(planGuideJob(road, c, [...owed.values()], region, 100, keep == null ? null : prevOrder))
            ev.planMs = Math.max(ev.planMs, performance.now() - tp)
            if (!tour?.segments?.length) break
            const order = tour.customers.map(t => t.id), target = order[0], len = tour.distance
            if (prevTarget && target !== prevTarget) {
                ev.targetChanges++
                if (seen.includes(target)) { ev.flipsBack++; const a = reach(owed.get(target)), b = reach(owed.get(prevTarget)) ?? a; ev.flipGapM = Math.max(ev.flipGapM, Math.hypot(a.x - b.x, a.z - b.z)); ev.flipAt ??= { x: c.x, z: c.z, a: target, b: prevTarget, step } }
            }
            if (prevOrder && order.join() !== prevOrder.join()) ev.orderFlips++
            if (prevLen != null && !script && len > prevLen + 5) { ev.grew++; ev.grewMax = Math.max(ev.grewMax, len - prevLen) }
            ev.seq.push([target.slice(-6), Math.round(len), Math.round(c.x), Math.round(c.z), ev.served, order.map(o => o.slice(-4)).join(' ')])
            seen.push(target); if (seen.length > 6) seen.shift()
            prevTarget = target; prevOrder = order; prevLen = len; line = tour
            // the scripted deviations, once, a third of the way in
            if (!script && ev.served === Math.floor(stops.length / 3) && ev.steps > 3) {
                if (scen === 'missed' && !missed) { missed = target; script = { poly: tour.poly, left: 12 } }
                if (scen === 'uturn' && !missed) { missed = 'u'; script = { poly: trail.slice().reverse(), left: 10 } }
                if (scen === 'offroute' && !missed) {
                    const q = list[(Math.random() * list.length) | 0], r = q && planFrom(c, doorAt({ x: q.x, z: q.z }, 'x'))
                    missed = 'off'; if (r?.poly?.length) script = { poly: r.poly, left: 15 }
                }
            }
            const path = script ? script.poly : tour.poly
            trail.push({ x: c.x, z: c.z })
            const n = along(path, c, STEP); c = { x: n.x, z: n.z }
            if (script && (--script.left <= 0 || n.end)) { script = null; prevLen = null }
            for (const [id, t] of owed) {
                const rp = reach(t)
                if (Math.hypot(rp.x - c.x, rp.z - c.z) < NEAR && !(script && id === missed)) { owed.delete(id); ev.served++; seen.length = 0; prevLen = null }
            }
        }
        if (keep != null || scen !== 'clean') delete ev.seq
        return { label, scen, keep, n: stops.length, left: owed.size, ...ev }
    }
    const larry = list.find(q => q.type === 'larrysHouse'), pool = poi.customers(PAPER_PARAMS.tiers.length - 1)
    const rpCache = new Map()
    const roadPt = (t) => { if (!rpCache.has(t.id)) { const l = drain(planGuideJob(road, { x: t.x, z: t.z }, [t], region)); rpCache.set(t.id, l ? legEnd(l) : t) } return rpCache.get(t.id) }
    for (const N of [4, 7, 9, 11]) {
        const route = larry && planTour(road, larry, pool, N, region)
        if (!route?.customers?.length) { console.log(`  paper ${N}: no tour`); continue }
        for (const keep of KEEPS) for (const scen of ['clean', 'missed', 'offroute', 'uturn']) {
            const r = drive(`paper ${N}`, route.customers, roadPt, scen, keep)
            if (r) out.tours.push({ seed: s, ...r })
        }
    }
    for (const j of jobs.filter(j => j.kind === 'demolition')) {
        const m = j.m, stops = siteStops(m, m.targets.map((_, i) => i))
        if (stops.length < 2) continue
        // The map draws m.poly (the job's route); the GPS the tour from the truck. Order along m.poly vs the tour's order.
        const cum = polyCumOf(m.poly)
        const uOn = (t) => { let bi = 0, bd = Infinity; m.poly.forEach((p, i) => { const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2; if (d < bd) { bd = d; bi = i } }); return cum[bi] }
        const mapOrder = stops.slice().sort((a, b) => uOn(a) - uOn(b)).map(t => t.id)
        const g0 = drain(planGuideJob(road, m.poly[0], stops, region))
        out.demoMap.push({ seed: s, id: j.o.id, clusters: stops.length, mapOrder, gpsOrder: g0?.customers.map(t => t.id) ?? null,
                           agree: g0 ? g0.customers.map(t => t.id).join() === mapOrder.join() : null })
        for (const keep of KEEPS) for (const scen of ['clean', 'missed', 'offroute', 'uturn']) {
            const r = drive(`demolition ${stops.length}`, stops, (t) => ({ x: t.x, z: t.z }), scen, keep)
            if (r) out.tours.push({ seed: s, ...r })
        }
    }
    console.log(`  seed ${s} done ${((Date.now() - t0) / 1000).toFixed(0)} s: ${jobs.length} jobs`)
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────────
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN }
console.log('\nBUG-205 readout vs the planner (m): kind · n · before |err| median / max · after |err| median / max')
for (const k of ['multi-drop', 'fetch', 'waypoint']) {
    const r = out.hud.filter(h => h.kind === k && isFinite(h.truth))
    if (!r.length) { console.log(`  ${k.padEnd(11)} none`); continue }
    const eb = r.map(h => Math.abs(h.before - h.truth)), ea = r.map(h => Math.abs(h.after - h.truth))
    console.log(`  ${k.padEnd(11)} ${String(r.length).padStart(3)}  before ${med(eb).toFixed(0).padStart(5)} / ${Math.max(...eb).toFixed(0).padStart(5)}   after ${med(ea).toFixed(0).padStart(5)} / ${Math.max(...ea).toFixed(0).padStart(5)}`)
}
console.log('\nBUG-212 follow-the-GPS drives: label · scen · drives · target changes · flip-backs · order flips · tour grew (max m) · unfinished')
const groups = new Map()
for (const t of out.tours) { const k = `${t.label.split(' ')[0]} ${t.scen} keep ${t.keep ?? 'off'}`; groups.set(k, [...(groups.get(k) ?? []), t]) }
for (const [k, ts] of groups) {
    const sum = (f) => ts.reduce((a, t) => a + t[f], 0)
    console.log(`  ${k.padEnd(30)} ${String(ts.length).padStart(3)}  ${String(sum('targetChanges')).padStart(4)}  ${String(sum('flipsBack')).padStart(4)}  ${String(sum('orderFlips')).padStart(4)}  ${String(sum('grew')).padStart(4)} (${Math.max(0, ...ts.map(t => t.grewMax)).toFixed(0)})  ${ts.filter(t => t.left).length}  plan ≤ ${Math.max(...ts.map(t => t.planMs)).toFixed(0)} ms  flip gap ≤ ${Math.max(...ts.map(t => t.flipGapM)).toFixed(0)} m`)
}
const dm = out.demoMap
console.log(`\ndemolition map line vs GPS tour order at the job start: ${dm.filter(d => d.agree === false).length} of ${dm.length} disagree`)
mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true })
writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log(`wrote ${OUT}`)
