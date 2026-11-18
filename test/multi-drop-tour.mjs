// FEAT-291 (owner, 2026-11-18): a food vendor's multi-drop is delivered in ANY order, and its default route is the
// SHORTEST tour through every stop — the paper round's planner (paper-route.js planTourJob), reused. On story regions
// built as entry builds them, every multi-drop board offer over three days:
//   · keeps the stop set the board rolled (same stops as the old greedy nearest-next order) and drives them in an order
//     no longer than the greedy one, and OPTIMAL by brute force over every order of its 2–4 stops;
//   · par is that tour priced once (computePar over its segments), so the base pay and the deadline follow its length;
// and one 3+ stop job driven through MissionSystem in a non-default order: a park hands over at ANY owed stop, the GPS
// re-plans the shortest tour from the truck through the rest (brute force again), the last stop arrives by driving up
// and settles once; a save mid-job resumes with the same stops owed (and a pre-FEAT-291 save, its prefix).
// Seeds pinned (one random-looking, one the test seed); the paper round is held by its own gates.
//
//   node test/multi-drop-tour.mjs                 the gate
//   node test/multi-drop-tour.mjs --census=20     the census over N RANDOM seeds (drops, tour km, par, pay; vs greedy)
import * as THREE from 'three'
import { mkdirSync, writeFileSync } from 'node:fs'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { OfferBoard } from '../src/offer-board.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { planTourJob, roadOrigin, RR_PARAMS } from '../src/paper-route.js'
import { computePar } from '../src/par.js'
import { basePay, splitPayout, regionTier } from '../src/economy.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const census = Number(process.argv.find(a => a.startsWith('--census='))?.slice(9) ?? 0)
const SEEDS = census ? Array.from({ length: census }, () => String((Math.random() * 2 ** 32) >>> 0)) : ['3200351065', '6']
let fails = 0
const check = (label, ok, detail = '') => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`); if (!ok) fails++ }
const drain = (it) => { if (!it) return null; let r; do r = it.next(); while (!r.done); return r.value }
const lenOf = (segs) => segs.reduce((a, g) => a + Math.abs(g.s1 - g.s0), 0)
const perms = (a) => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]))

function world (s) {
    const seed = parseWorldSeed(s), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
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
    return { seed, road, region, poi, list: poi.list() }
}

/** The shortest drive from point `a` through every one of `stops`, by brute force: every order, each hop planned alone. */
function bruteM (W, a, stops) {
    const memo = new Map()
    const hop = (x, y) => {
        const k = `${x.id}>${y.id}`
        if (!memo.has(k)) { const t = drain(planTourJob(W.road, x, [y], 1, W.region, REGION_MARGIN)); memo.set(k, t ? lenOf(t.segments) : Infinity) }
        return memo.get(k)
    }
    return Math.min(...perms(stops).map(o => o.reduce((acc, q, i) => acc + hop(i ? o[i - 1] : a, q), 0)))
}

const rows = []
for (const s of SEEDS) {
    const t0 = Date.now(), W = world(s)
    const car = { x: 0, z: 0, speed: 0 }
    let settles = 0
    const mk = () => new MissionSystem({ getRoad: () => W.road, getCar: () => car, getSeed: () => W.seed, getRegion: () => W.region,
        getTerms: () => ({ day: 1, dayTier: 1, payTier: regionTier(1), thresholds: undefined }),
        teleport () {}, setMapOpen () {}, onChange () {}, onSettle: () => { settles++; return null } })
    const ms = mk(), old = mk()
    old._tourOf = () => null   // the order before FEAT-291: greedy nearest-next from the giver (joinLegs)
    const board = new OfferBoard({ seed: W.seed, pois: W.list, nowH: 6 })
    const planWith = (sys) => (o) => board.planDistinct(o, (x, exclude) => {
        const m = sys.planOffer(W.list.find(q => q.id === x.poiId), { rng: board.routeRng(x), dest: board.destWish(x, W.list, exclude) })
        if (m) { m.offerId = x.id; m.payMult = board.spec(x).payMult }
        return m
    })
    const plan = planWith(ms), planOld = planWith(old)
    const seen = new Set(), bad = { set: [], longer: [], brute: [], par: [] }
    let found = null, n = 0
    for (let t = 6; t < 6 + 72; t += 2) for (const id of board.sources()) for (const o of board.offers(id, t)) {
        const sp = board.spec(o)
        if (sp?.shape !== 'multi' || seen.has(o.id)) continue
        seen.add(o.id)
        const m = plan(o), g = planOld(o)
        if (!m?.stopIds) continue
        n++
        const giver = W.list.find(q => q.id === o.poiId), stops = m.legs.map(l => l.pt)
        if (!g?.stopIds || [...g.stopIds].sort().join() !== [...m.stopIds].sort().join()) bad.set.push(o.id)
        const tourM = lenOf(m.segments), greedyM = g?.segments ? lenOf(g.segments) : NaN
        if (!(tourM <= greedyM + 1)) bad.longer.push(`${o.id} ${tourM.toFixed(0)}>${greedyM.toFixed(0)}`)
        const best = stops.every(Boolean) ? bruteM(W, giver, stops) : NaN
        if (!(Math.abs(tourM - best) <= 1)) bad.brute.push(`${o.id} ${tourM.toFixed(0)} vs ${best.toFixed(0)}`)
        if (Math.abs(m.par - computePar(m.segments).time) > 1e-9) bad.par.push(o.id)
        const tier = regionTier(1), mult = m.payMult ?? 1
        rows.push({ seed: s, offer: o.id, thing: sp.thingId, drops: m.stopIds.length, tourKm: tourM / 1000, greedyKm: greedyM / 1000,
                    parMin: m.par / 60, greedyParMin: (g?.par ?? NaN) / 60, base: basePay(m.par, tier, mult), atPar: splitPayout(m.par, 1, tier, mult).total ?? null,
                    deadlineH: board.deadlineH(o, m.par) })
        if (!found && m.stopIds.length >= 3) found = { o, giver }
    }
    console.log(`seed ${s}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${n}/${seen.size} multi-drop offers plan a tour`)
    if (census) continue
    check(`${s}: multi-drop offers are posted and plan a tour`, n > 0, `${n}/${seen.size}`)
    check(`${s}: the tour keeps the board's stops (the greedy order's set)`, !bad.set.length, bad.set.slice(0, 4).join(' '))
    check(`${s}: …and is never longer than the greedy order`, !bad.longer.length, bad.longer.slice(0, 4).join(' '))
    check(`${s}: …and is the shortest order by brute force (±1 m)`, !bad.brute.length, bad.brute.slice(0, 4).join(' '))
    check(`${s}: par is the tour priced once`, !bad.par.length, bad.par.slice(0, 4).join(' '))
    if (!found) { check(`${s}: a 3+ stop job is posted`, false); continue }

    // ── one job in ANY order: the default order reversed, so the last default stop goes first ─────────────────────
    const { o, giver } = found, m = plan(o), L = m.legs.length
    car.x = giver.x; car.z = giver.z
    ms.enterFromPoi(giver, [o], plan)
    ms.accept()
    // Out of the start zone along the job's own line (on the road, so the guide's re-plan has an origin).
    const z0 = ms.startZone(), exit = m.poly.find(p => Math.hypot(p.x - z0.x, p.z - z0.z) > z0.r + 5)
    car.x = exit.x; car.z = exit.z
    ms.update(0.5)   // staging → running
    ms.update(0.5)   // the first poll of the guide
    ms.drops.pump(Infinity)
    check(`${s}: running, every stop open to a park`, ms.state === 'running'
        && [...ms.pickupPoiIds()].sort().join() === [...m.stopIds].sort().join())
    check(`${s}: the GPS leads first to the shortest order's first stop`, !!ms.drops.tour && ms.guideRoute().customers?.[0]?.id === m.stopIds[0],
        `${ms.guideRoute().customers?.[0]?.id} vs ${m.stopIds[0]}`)
    const order = [...m.legs].reverse(), fin = order.pop()
    let ok = true, why = ''
    for (const l of order) {
        car.x = l.end.x; car.z = l.end.z
        const legBefore = ms.leg
        ms.update(0.5)
        if (ms.state !== 'running' || ms.leg !== legBefore) { ok = false; why = 'a drive-through handed over'; break }
        if (!ms.acquire(l.poiId) || ms.acquire(l.poiId)) { ok = false; why = `park at ${l.poiId} did not hand over exactly once`; break }
        const owed = m.legs.filter(x => !ms._dropped.has(x.poiId)).map(x => x.pt)
        const tour = ms.drops.tour, from = roadOrigin(W.road, car)
        const best = owed.length > 1 && from ? bruteM(W, { ...from, id: 'truck' }, owed) : null
        if (owed.length > 1 && !(tour && lenOf(tour.segments) <= best + RR_PARAMS.keepM + 1)) { ok = false; why = `re-plan ${tour && lenOf(tour.segments).toFixed(0)} vs best ${best?.toFixed(0)}`; break }
        const g = ms.guideRoute()
        if (ms._dropped.has(g.customers?.[0]?.id)) { ok = false; why = 'the GPS still leads to a stop handed over'; break }
        const a = ms.routeRemaining(), tot = ms.routeTotalRemaining()
        if (!(a <= tot + 1e-6)) { ok = false; why = `leg ${a} > total ${tot}`; break }
    }
    check(`${s}: out of order, each park hands over, the GPS re-plans the shortest tour from the truck`, ok, why)
    check(`${s}: one stop left: it arrives by driving up (nothing to park for), the readout is one number`,
        ms.pickupPoiIds().length === 0 && ms.acquire(fin.poiId) === false && Math.abs(ms.routeRemaining() - ms.routeTotalRemaining()) < 1e-6)
    check(`${s}: a park at a stop not owed hands nothing over`, ms.acquire(order[0].poiId) === false && ms.acquire(giver.id) === false)

    // ── the save: the stops handed over come back, in any order; a pre-FEAT-291 save resumes on its prefix ───────
    const snap = ms.snapshot(), r = mk(), r2 = mk()
    r.resume(o, plan(o), snap)
    check(`${s}: a save mid-job resumes with the same stops owed`, [...r._dropped].sort().join() === [...ms._dropped].sort().join()
        && r.pickupPoiIds().length === ms.pickupPoiIds().length && r.leg === ms.leg)
    r2.resume(o, plan(o), { ...snap, dropped: undefined, leg: 1 })
    check(`${s}: a save from before any-order resumes with its first stop handed over`, r2._dropped.size === 1 && r2._dropped.has(m.stopIds[0]))

    settles = 0
    car.x = fin.end.x; car.z = fin.end.z
    ms.update(0.5)
    check(`${s}: arriving at the last stop settles — exactly once`, ms.state === 'done' && settles === 1)
    ms.update(0.5)
    check(`${s}: …and never again`, settles === 1)
    ms.exit()
}

if (census) {
    const q = (a, f) => { const v = a.map(f).filter(Number.isFinite).sort((x, y) => x - y); return v.length ? [v[0], v[v.length >> 1], v.at(-1)] : [NaN, NaN, NaN] }
    const fmt = ([a, b, c], d = 1) => `${a.toFixed(d)} / ${b.toFixed(d)} / ${c.toFixed(d)}`
    console.log(`\nCENSUS ${SEEDS.length} random seeds, ${rows.length} multi-drop offers (min / median / max):`)
    for (const k of [2, 3, 4, 'all']) {
        const R = rows.filter(r => k === 'all' || r.drops === k)
        if (!R.length) continue
        console.log(`  ${k === 'all' ? 'all' : k + ' drops'} (${R.length}): tour km ${fmt(q(R, r => r.tourKm), 2)} · greedy km ${fmt(q(R, r => r.greedyKm), 2)}`
            + ` · saved km ${fmt(q(R, r => r.greedyKm - r.tourKm), 2)} · par min ${fmt(q(R, r => r.parMin))} · base $ ${fmt(q(R, r => r.base), 2)}`
            + ` · at-par $ ${fmt(q(R, r => r.atPar), 2)} · deadline h ${fmt(q(R, r => r.deadlineH), 2)}`)
    }
    const shorter = rows.filter(r => r.greedyKm - r.tourKm > 0.001).length
    console.log(`  tours shorter than the greedy order: ${shorter} / ${rows.length}`)
    mkdirSync('wip/feat-291', { recursive: true })
    writeFileSync('wip/feat-291/census.json', JSON.stringify({ seeds: SEEDS, rows }, null, 1))
    console.log('  rows → wip/feat-291/census.json')
} else {
    console.log(fails ? `\n${fails} FAILED` : '\nall passed')
    process.exit(fails ? 1 : 0)
}
