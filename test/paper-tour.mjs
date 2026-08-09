// GATE (FEAT-61 Phase E2): the paper round's TOUR — the thing between Larry and one par.
//
// test/paper-route.mjs pins the algebra (the accuracy law, the flat rate, the ladder) on invented
// numbers. This gate pins the other half: that a round can actually be BUILT on a real streamed,
// routed network, and that it is the round the design says it is.
//
//   1. A ROUND EXISTS AT EVERY RUNG. 4 → 9 → 12 → 15 customers, all routed from Larry's own edge,
//      all priced. A ladder whose top rung cannot be planned is a ladder that dead-ends a run.
//   2. ONE PAR, ONE ORACLE (SM-INV-2). The tour is one segment list and one computePar call, so
//      par must be a single number over the whole round — not a sum of legs, and demonstrably not
//      linear in the stop count for the reason that matters: the round grows OUTWARD.
//   3. THE ROUND GROWS, IT DOES NOT MOVE (SM-INV-12). The tier chooses who is on the round, never
//      what exists — so a lower tier's customers must be a PREFIX of a higher tier's. Tier 1 is
//      the couple of streets behind Larry's place, and tier 4 is those streets plus more.
//   4. THE ROADS ARE REAL. Every segment names an edge the network registered, and the routed
//      polyline stays inside the region wall — the same two guards the mission planner carries.
//   5. THE DEADLINE IS REACHABLE ON PAPER. deadlineFor(par) must exceed the par it derives from,
//      or the bell rings before the round can be driven at the oracle's own pace.
//
// Heavy: needs a real streamed, routed network (a tour routes far more edges than one errand).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { planTour, PaperRouteSystem, PAPER_PARAMS, runPaper, resetPaperRun,
         deadlineFor, stockForTier, customersForTier } from '../src/paper-route.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const SEED = 6
const C = { x: 4500, z: 600 }
// THE LIVE REGION RADIUS, not the 1600 m the other POI gate can get away with. Measured: at 1600
// this window holds three routable customers and cannot supply even the first rung, so a smaller
// window would gate the tour on a region the game never builds. Customer supply is the thing this
// gate is most sensitive to, so its window has to be the real one.
const R = 2500

function makeWorld () {
    const road = new RoadSystem(SEED, RANGER_PARAMS)
    road.setRadius(R)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const terrain = makeTerrainHeadless(SEED, RANGER_PARAMS, road)
    const water = new WaterSystem(SEED, RANGER_PARAMS, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({
        getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
        getSeed: () => SEED, getParams: () => RANGER_PARAMS,
    })
    poi.build(C, R)
    poi.buildHouses(C, R)
    return { road, poi }
}

const W = makeWorld()
const larry = W.poi.list().find(q => q.type === 'larrysHouse')
const customers = W.poi.customers()

check('the region has a Larry to take the round from', !!larry)
check('…and he sits on a known graph edge', !!larry?.aId && !!larry?.bId)
// A round has to be POSSIBLE — that is the assertion. How many customers a given seed's region can
// hold is a supply question and it is measured below, not asserted: the gate's window is smaller
// than a live region, and the ratified 15 is a target the placement pass relaxes toward.
check('the region can supply at least the first rung', customers.length >= PAPER_PARAMS.tiers[0],
    `${customers.length} customers vs ${PAPER_PARAMS.tiers[0]} on the first round`)
console.log(`       region supply: ${customers.length} customers`
    + ` (ratified target ${PAPER_PARAMS.tiers.at(-1)} at the top rung)`)
if (!larry) { console.log('\nNO LARRY — the rest of the gate cannot run'); process.exit(1) }

// The region wall, as the live system passes it.
const region = { x: C.x, z: C.z, r: R }

// ── 1. a round exists at every rung ─────────────────────────────────────────────────────────────
const tours = []
for (let tier = 0; tier < PAPER_PARAMS.tiers.length; tier++) {
    const want = customersForTier(tier)
    const t0 = Date.now()
    const t = planTour(W.road, larry, customers, want, region)
    const ms = Date.now() - t0
    tours.push(t)
    check(`tier ${tier + 1} (${want} customers) plans a round`, !!t)
    if (!t) continue
    check(`…priced with a real par`, t.par > 0 && isFinite(t.par), `par ${t.par}`)
    check(`…over a real distance`, t.distance > 0 && isFinite(t.distance), `${t.distance} m`)
    // Not an assertion, a MEASUREMENT: the handoff's open question was whether a 15-stop tour is
    // affordable at all, and the ruling (hold the offer behind the briefing cards) rides on the
    // answer. Printed so a regression in routing cost is visible in the log.
    console.log(`       tier ${tier + 1}: ${t.edges} segments · ${(t.distance / 1000).toFixed(2)} km`
        + ` · par ${t.par.toFixed(0)} s · ${stockForTier(tier)} papers · planned in ${ms} ms`)
}

// ── 2. the tier takes what it asked for, or everything the region has ───────────────────────────
{
    const ok = tours.every(t => t)
    check('every rung planned (the ladder never dead-ends a run)', ok)
    if (ok) {
        // The supply ceiling: what the largest round could actually reach. A tier below it must be
        // exactly its own size; a tier above it takes the lot. Anything else means the round is
        // dropping customers it could have served.
        const supply = Math.max(...tours.map(t => t.customers.length))
        for (let i = 0; i < tours.length; i++) {
            const want = customersForTier(i)
            check(`tier ${i + 1} carries min(asked, supply) customers`,
                tours[i].customers.length === Math.min(want, supply),
                `asked ${want}, supply ${supply}, got ${tours[i].customers.length}`)
        }
        if (supply < PAPER_PARAMS.tiers.at(-1)) {
            console.log(`       NOTE: this window supplies ${supply} routable customers, short of the`
                + ` ratified ${PAPER_PARAMS.tiers.at(-1)} — the top rungs saturate here.`)
        }

        // A longer round is a longer par. Weak form on purpose: the tour is nearest-neighbour, so
        // growth is monotone but not proportional — which is exactly what distinguishes ONE par
        // over a round from four leg pars added together.
        let monotone = true
        for (let i = 1; i < tours.length; i++) if (tours[i].par < tours[i - 1].par) monotone = false
        check('par grows with the round', monotone, tours.map(t => t.par.toFixed(0)).join(' → '))
        const distinct = [...new Set(tours.map(t => t.customers.length))]
        if (distinct.length > 1) {
            const perStop = tours.map(t => t.par / t.customers.length)
            check('…and NOT proportionally — the round grows outward, so later stops cost differently',
                Math.max(...perStop) / Math.min(...perStop) > 1.05,
                perStop.map(p => p.toFixed(1)).join(' / '))
        }
    }
}

// ── 3. the round grows, it does not move (SM-INV-12) ────────────────────────────────────────────
for (let i = 1; i < tours.length; i++) {
    if (!tours[i] || !tours[i - 1]) continue
    const lower = tours[i - 1].customers.map(c => c.id)
    const higher = tours[i].customers.map(c => c.id)
    const prefix = lower.every((id, k) => higher[k] === id)
    check(`tier ${i} is a PREFIX of tier ${i + 1} — the tier picks who, never what exists`, prefix,
        `${lower.join(',')} vs ${higher.slice(0, lower.length).join(',')}`)
}

// ── 4. the roads are real, and inside the wall ──────────────────────────────────────────────────
{
    const t = tours.at(-1)
    if (t) {
        const registered = new Set()
        const g = W.road.networkGraph()
        for (const [a, b] of g.edges) { registered.add(g.key(a)); registered.add(g.key(b)) }
        const phantom = t.segments.filter(s => !W.road.edgeParData(s.cellA, s.cellB))
        check('every segment names an edge the network registered', phantom.length === 0,
            `${phantom.length} of ${t.segments.length} phantom`)
        const outside = t.poly.filter(p => Math.hypot(p.x - C.x, p.z - C.z) > R)
        check('the driven polyline stays inside the region wall', outside.length === 0,
            `${outside.length} of ${t.poly.length} samples outside`)
        // Every customer on the round has to be somewhere the round actually passes, or the paper
        // cannot be thrown from the truck — which is the entire mechanic.
        const REACH = 60   // m — generous: the tour drives the centerline, the target sits ~13 m off it
        const stranded = t.customers.filter(c =>
            !t.poly.some(p => Math.hypot(p.x - c.x, p.z - c.z) <= REACH))
        check('every customer on the round is passed by the round', stranded.length === 0,
            `${stranded.length} of ${t.customers.length} never approached`)
    }
}

// ── 5. the deadline is reachable at the oracle's own pace ───────────────────────────────────────
for (let i = 0; i < tours.length; i++) {
    if (!tours[i]) continue
    check(`tier ${i + 1}'s bell rings after its par, not before`,
        deadlineFor(tours[i].par) > tours[i].par,
        `${deadlineFor(tours[i].par).toFixed(0)} s vs par ${tours[i].par.toFixed(0)} s`)
}

// ── 6. THE ROUND, END TO END ────────────────────────────────────────────────────────────────────
//
// Owner-reported 2026-08-09: "can't deliver the papers — landing a paper inside the green circle
// shows no accuracy message and does not increase the delivered counter". The cause was on the
// renderer side (every customer in the region wore a target ring, but only the round's four could
// score, so most circles were decoys) — but nothing anywhere pinned the delivery path itself, which
// is why a broken-looking mission could not be told apart from a mission that was working.
//
// So: drive a whole round headlessly. Take it from Larry, leave the threshold, land a paper dead
// centre on every customer, and check the money arrives.
{
    const car = { x: larry.x, z: larry.z }
    const settled = []
    const paper = new PaperRouteSystem({
        getRoad: () => W.road,
        getPois: () => W.poi,
        getRegion: () => region,
        getCar: () => car,
        getTerms: () => ({ dayTier: 1 }),
        getTargetR: () => POI_PARAMS.poiHouseTargetR,
        onSettle: (payout, letter) => { settled.push({ payout, letter }); return { payout, points: 0 } },
        onBriefing: (done) => done(),          // Larry has already said his piece this run
        onChange: () => {}, onEnd: () => {},
    })

    resetPaperRun()
    paper.open(larry)
    await new Promise(r => setTimeout(r, 0))   // open() routes the tour off the tick
    check('parking at Larry\'s produces an offer', paper.state === 'offer', `state ${paper.state}`)

    paper.accept()
    check('accepting STAGES the round — the clock does not start on the pad',
        paper.state === 'staging', `state ${paper.state}`)
    const stock0 = paper.stock()
    check('…with the tier\'s papers aboard', stock0 === stockForTier(0), `${stock0} papers`)
    paper.update(1 / 60)
    check('…and sitting in the circle does not start it', paper.state === 'staging')

    car.x = larry.x + 400            // out through the threshold
    paper.update(1 / 60)
    check('leaving the circle starts the round', paper.state === 'running', `state ${paper.state}`)

    // THE REPORTED BUG. A paper on the centre point of a customer on the round must credit them,
    // exactly once, and must return the accuracy the read-out shows.
    const round = paper.routeCustomers()
    const first = round[0]
    paper.takePaper()
    const hit = paper.recordLanding(first.x, first.z)
    check('a paper dead centre on a round customer CREDITS them',
        !!hit?.credited, JSON.stringify(hit && { d: hit.dist, q: hit.q, credited: hit.credited }))
    check('…scoring 1.00 at the centre point', Math.abs((hit?.q ?? 0) - 1) < 1e-9, `q ${hit?.q}`)
    check('…and the delivered counter moves', paper.delivered() === 1, `${paper.delivered()}`)
    check('…and the paper came out of the truck', paper.stock() === stock0 - 1, `${paper.stock()}`)

    paper.takePaper()
    const again = paper.recordLanding(first.x, first.z)
    check('a SECOND paper on the same porch is spent, not double-counted',
        again?.already === true && paper.delivered() === 1,
        `already ${again?.already}, delivered ${paper.delivered()}`)

    // A paper landing on someone who is NOT on this round scores nothing — the decoy case.
    const offRound = customers.find(c => !round.some(r => r.id === c.id))
    if (offRound) {
        paper.takePaper()
        const miss = paper.recordLanding(offRound.x, offRound.z)
        check('a paper on a customer who is not on this round scores nothing',
            !miss?.credited && paper.delivered() === 1, `delivered ${paper.delivered()}`)
    }

    // Finish the round on the remaining porches. The LAST one must end it by itself.
    for (let i = 1; i < round.length; i++) {
        check(`…still running with ${round.length - i} to go`, paper.state === 'running')
        paper.takePaper()
        paper.recordLanding(round[i].x, round[i].z)
    }
    check('the last porch ENDS the round', paper.state === 'done', `state ${paper.state}`)
    const r = paper.result
    check('a perfect round covers everyone', r?.coverage === 1, `coverage ${r?.coverage}`)
    check('…letters S', r?.letter === 'S', `letter ${r?.letter}`)
    check('…pays through the one money path', settled.length === 1 && settled[0].payout > 0,
        JSON.stringify(settled))
    check('…and earns the next rung', r?.advanced === true && runPaper.tier === 1,
        `advanced ${r?.advanced}, tier ${runPaper.tier}`)
    console.log(`       perfect tier-1 round: $${r?.payout} · ${r?.letter}`
        + ` · ${r?.delivered}/${r?.customers} · next round ${r?.nextTier} houses`)

    paper.dismiss()
    check('dismissing the card puts the round down', paper.state === 'idle')
}

// ── 7. degenerate inputs return null rather than a broken round ─────────────────────────────────
check('no Larry ⇒ no round', planTour(W.road, null, customers, 4, region) === null)
check('no customers ⇒ no round', planTour(W.road, larry, [], 4, region) === null)
check('a zero-customer tier ⇒ no round', planTour(W.road, larry, customers, 0, region) === null)
check('no road ⇒ no round', planTour(null, larry, customers, 4, region) === null)

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL PAPER-TOUR CHECKS PASSED')
process.exit(fails ? 1 : 0)
