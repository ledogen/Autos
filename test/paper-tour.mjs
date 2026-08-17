// GATE (FEAT-61 Phase E2): the paper route's TOUR — the thing between Larry and one par.
//
// test/paper-route.mjs pins the algebra (the accuracy law, the flat rate, the ladder) on invented
// numbers. This gate pins the other half: that a route can actually be BUILT on a real streamed,
// routed network, and that it is the route the design says it is.
//
//   1. A ROUTE EXISTS AT EVERY RUNG. 4 → 9 → 12 → 15 customers, all routed from Larry's own edge,
//      all priced. A ladder whose top rung cannot be planned is a ladder that dead-ends a run.
//   2. ONE PAR, ONE ORACLE (SM-INV-2). The tour is one segment list and one computePar call, so
//      par must be a single number over the whole route — not a sum of legs, and demonstrably not
//      linear in the stop count for the reason that matters: the route grows OUTWARD.
//   3. THE ROUTE GROWS, IT DOES NOT MOVE (SM-INV-12). The tier chooses who is on the route, never
//      what exists — so a lower tier's customers must be a PREFIX of a higher tier's. Tier 1 is
//      the couple of streets behind Larry's place, and tier 4 is those streets plus more.
//   4. THE ROADS ARE REAL. Every segment names an edge the network registered, and the routed
//      polyline stays inside the region wall — the same two guards the mission planner carries.
//   5. THE DEADLINE IS REACHABLE ON PAPER. deadlineFor(par) must exceed the par it derives from,
//      or the bell rings before the route can be driven at the oracle's own pace.
//
// Heavy: needs a real streamed, routed network (a tour routes far more edges than one errand).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { PAR_SLACK } from '../src/par.js'
import { TRACE_HZ } from '../src/mission.js'
import { planTour, PaperRouteSystem, PAPER_PARAMS, runPaper, resetPaperRun,
         deadlineFor, stockForTier, customersForTier, radiusForTier } from '../src/paper-route.js'
import { computePar } from '../src/par.js'
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

check('the region has a Larry to take the route from', !!larry)
check('…and he sits on a known graph edge', !!larry?.aId && !!larry?.bId)
// A route has to be POSSIBLE — that is the assertion. How many customers a given seed's region can
// hold is a supply question and it is measured below, not asserted: the gate's window is smaller
// than a live region, and the ratified 15 is a target the placement pass relaxes toward.
check('the region can supply at least the first rung', customers.length >= PAPER_PARAMS.tiers[0],
    `${customers.length} customers vs ${PAPER_PARAMS.tiers[0]} on the first route`)
console.log(`       region supply: ${customers.length} customers`
    + ` (ratified target ${PAPER_PARAMS.tiers.at(-1)} at the top rung)`)
if (!larry) { console.log('\nNO LARRY — the rest of the gate cannot run'); process.exit(1) }

// The region wall, as the live system passes it.
const region = { x: C.x, z: C.z, r: R }

// ── 1. a route exists at every rung ─────────────────────────────────────────────────────────────
const tours = []
for (let tier = 0; tier < PAPER_PARAMS.tiers.length; tier++) {
    const want = customersForTier(tier)
    const t0 = Date.now()
    const t = planTour(W.road, larry, customers, want, region, 100, radiusForTier(tier))
    const ms = Date.now() - t0
    tours.push(t)
    check(`tier ${tier + 1} (${want} customers, ${radiusForTier(tier)} m ring) plans a route`, !!t)
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
        // The supply ceiling: what the largest route could actually reach. A tier below it must be
        // exactly its own size; a tier above it takes the lot. Anything else means the route is
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

        // A longer route is a longer par. Weak form on purpose: the tour is nearest-neighbour, so
        // growth is monotone but not proportional — which is exactly what distinguishes ONE par
        // over a route from four leg pars added together.
        let monotone = true
        for (let i = 1; i < tours.length; i++) if (tours[i].par < tours[i - 1].par) monotone = false
        check('par grows with the route', monotone, tours.map(t => t.par.toFixed(0)).join(' → '))
        const distinct = [...new Set(tours.map(t => t.customers.length))]
        if (distinct.length > 1) {
            const perStop = tours.map(t => t.par / t.customers.length)
            check('…and NOT proportionally — the route grows outward, so later stops cost differently',
                Math.max(...perStop) / Math.min(...perStop) > 1.05,
                perStop.map(p => p.toFixed(1)).join(' / '))
        }
    }
}

// ── 3. the route grows, it does not move (SM-INV-12) ────────────────────────────────────────────
//
// A SUBSET, not a prefix. Which customers a tier visits is grown outward from Larry, so a lower
// tier's people are all on a higher tier's route — but the ORDER is then 2-opted for length, and a
// shorter route is free to visit them in a different sequence. The invariant is about who is on the
// route, not what order they come in.
for (let i = 1; i < tours.length; i++) {
    if (!tours[i] || !tours[i - 1]) continue
    const lower = tours[i - 1].customers.map(c => c.id)
    const higher = new Set(tours[i].customers.map(c => c.id))
    const missing = lower.filter(id => !higher.has(id))
    check(`tier ${i}'s customers are all on tier ${i + 1}'s route — the tier picks who, never what exists`,
        missing.length === 0, `${missing.length} dropped: ${missing.join(', ')}`)
}

// ── 3b. PAR PRICES THE STOPS (FEAT-61, owner-reported 2026-08-14) ───────────────────────────────
//
// The oracle used to price a fifteen-porch round as one uninterrupted blast: 73 km/h average, and 2
// of ~1150 profile samples below 3 m/s — the first and the last. Point-to-point missions felt right
// while this one was unbeatable, because par was correct about the ROAD and wrong about the JOB.
//
// There is NO DWELL — the whole cost is the stop itself (owner, 2026-08-14: a paper goes out of the
// window on the move, so what a delivery really costs is coming to rest and pulling away again, not
// time spent parked). So the properties to pin are that the reference actually reaches ZERO at each
// porch, and that the time this buys is derived from the truck's own brake and accel.
for (const t of tours.filter(Boolean)) {
    const n = t.customers.length
    const pr = computePar(t.segments)
    check('tier: par charges exactly one stop per customer, never two for a porch passed twice',
        pr.stops === n, `${pr.stops} stops priced for ${n} customers`)
    // A TRUE zero, not vMin. The stop cap is the one place the vMin floor must not apply — floored
    // at 2.5 m/s a delivery prices as a slow roll past the porch, which is most of the bug.
    const zeros = [...pr.speeds].filter(v => v === 0).length
    check('…and the reference comes to REST there, not to a 2.5 m/s crawl',
        zeros >= n, `${zeros} samples at a standstill for ${n} stops + the route end`)
    // …and stopping has to COST. Same route with the flags off: if `stop` stopped being set, or the
    // cap stopped biting, par would collapse back to the drive-past-everyone number.
    const dry = computePar(t.segments.map(s => ({ ...s, stop: false })))
    check('…and stopping costs real time, derived from brake and accel',
        t.par > dry.time * 1.03,
        `${t.par.toFixed(0)} s with stops vs ${dry.time.toFixed(0)} s without`)
    console.log(`       tier: ${n} stops cost ${(t.par - dry.time).toFixed(0)} s`
        + ` (+${((t.par / dry.time - 1) * 100).toFixed(0)}%), ${((t.par - dry.time) / n).toFixed(1)} s each`)
}
{
    const t = tours.at(-1)
    if (t) console.log(`       top rung with stops priced: par ${t.par.toFixed(0)} s`
        + ` · ${(t.distance / t.par * 3.6).toFixed(1)} km/h average`)
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
        // Every customer on the route has to be somewhere the route actually passes, or the paper
        // cannot be thrown from the truck — which is the entire mechanic.
        const REACH = 60   // m — generous: the tour drives the centerline, the target sits ~13 m off it
        const stranded = t.customers.filter(c =>
            !t.poly.some(p => Math.hypot(p.x - c.x, p.z - c.z) <= REACH))
        check('every customer on the route is passed by the route', stranded.length === 0,
            `${stranded.length} of ${t.customers.length} never approached`)
    }
}

// ── 5. the deadline IS par [RE-ANCHORED 2026-08-16] ─────────────────────────────────────────────
// This used to assert `deadlineFor(par) > par`: the bell had to ring strictly AFTER par, because
// par was the expected drive and the bell was a failure line somewhere beyond it. They are the
// same instant now — par IS the failure line, so the bell sits exactly on it (tolerance 1.0).
// The reachability this check was really protecting hasn't gone away; it moved into par itself,
// where PAR_SLACK is what makes par a pace a human can actually hold (see src/par.js).
for (let i = 0; i < tours.length; i++) {
    if (!tours[i]) continue
    check(`tier ${i + 1}'s bell rings exactly ON its par`,
        Math.abs(deadlineFor(tours[i].par) - tours[i].par) < 1e-9,
        `${deadlineFor(tours[i].par).toFixed(0)} s vs par ${tours[i].par.toFixed(0)} s`)
}

// ── 6. THE ROUTE, END TO END ────────────────────────────────────────────────────────────────────
//
// Owner-reported 2026-08-09: "can't deliver the papers — landing a paper inside the green circle
// shows no accuracy message and does not increase the delivered counter". The cause was on the
// renderer side (every customer in the region wore a target ring, but only the route's four could
// score, so most circles were decoys) — but nothing anywhere pinned the delivery path itself, which
// is why a broken-looking mission could not be told apart from a mission that was working.
//
// So: drive a whole route headlessly. Take it from Larry, leave the threshold, land a paper dead
// centre on every customer, and check the money arrives.
{
    const car = { x: larry.x, z: larry.z }
    const settled = []
    const paper = new PaperRouteSystem({
        getRoad: () => W.road,
        getPois: () => W.poi,
        getRegion: () => region,
        getCar: () => car,
        getSeed: () => 20,
        getTerms: () => ({ payTier: 1 }),
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
    check('accepting STAGES the route — the clock does not start on the pad',
        paper.state === 'staging', `state ${paper.state}`)
    const stock0 = paper.stock()
    check('…with the tier\'s papers aboard', stock0 === stockForTier(0), `${stock0} papers`)
    paper.update(1 / 60)
    check('…and sitting in the circle does not start it', paper.state === 'staging')

    car.x = larry.x + 400            // out through the threshold
    paper.update(1 / 60)
    check('leaving the circle starts the route', paper.state === 'running', `state ${paper.state}`)

    // Actually DRIVE for a bit rather than teleporting between porches with a frozen clock. This
    // gate used to tick update() exactly twice, which left run.elapsed at 0 — harmless for the
    // routing assertions it was written for, but it means the calibration export at the bottom
    // would record a zero-length drive and an empty trace. `drive()` also exercises the TRACE_HZ
    // sampler, which nothing else covers.
    const drive = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) paper.update(1 / 60) }
    drive(3)

    // THE REPORTED BUG. A paper on the centre point of a customer on the route must credit them,
    // exactly once, and must return the accuracy the read-out shows.
    const route = paper.routeCustomers()
    const first = route[0]
    paper.takePaper()
    const hit = paper.recordLanding(first.x, first.z)
    check('a paper dead centre on a route customer CREDITS them',
        !!hit?.credited, JSON.stringify(hit && { d: hit.dist, q: hit.q, credited: hit.credited }))
    check('…scoring 1.00 at the centre point', Math.abs((hit?.q ?? 0) - 1) < 1e-9, `q ${hit?.q}`)
    check('…and the delivered counter moves', paper.delivered() === 1, `${paper.delivered()}`)
    check('…and the paper came out of the truck', paper.stock() === stock0 - 1, `${paper.stock()}`)

    paper.takePaper()
    const again = paper.recordLanding(first.x, first.z)
    check('a SECOND paper on the same porch is spent, not double-counted',
        again?.already === true && paper.delivered() === 1,
        `already ${again?.already}, delivered ${paper.delivered()}`)

    // A paper landing on someone who is NOT on this route scores nothing — the decoy case.
    const offRound = customers.find(c => !route.some(r => r.id === c.id))
    if (offRound) {
        paper.takePaper()
        const miss = paper.recordLanding(offRound.x, offRound.z)
        check('a paper on a customer who is not on this route scores nothing',
            !miss?.credited && paper.delivered() === 1, `delivered ${paper.delivered()}`)
    }

    // Finish the route on the remaining porches. The LAST one must end it by itself.
    for (let i = 1; i < route.length; i++) {
        check(`…still running with ${route.length - i} to go`, paper.state === 'running')
        drive(4)                      // road between porches, so elapsed and the trace are real
        paper.takePaper()
        paper.recordLanding(route[i].x, route[i].z)
    }
    check('the last porch ENDS the route', paper.state === 'done', `state ${paper.state}`)
    const r = paper.result
    check('a perfect route covers everyone', r?.coverage === 1, `coverage ${r?.coverage}`)
    check('…letters S', r?.letter === 'S', `letter ${r?.letter}`)
    check('…pays through the one money path', settled.length === 1 && settled[0].payout > 0,
        JSON.stringify(settled))
    check('…and earns the next rung', r?.advanced === true && runPaper.tier === 1,
        `advanced ${r?.advanced}, tier ${runPaper.tier}`)
    console.log(`       perfect tier-1 route: $${r?.payout} · ${r?.letter}`
        + ` · ${r?.delivered}/${r?.customers} · next route ${r?.nextTier} houses`)

    // ── the calibration export [2026-08-17] ─────────────────────────────────────────────────
    // The paper route had no way to record itself, so par could not be fitted to the one mission
    // type whose par is dominated by per-porch STOPS. This asserts the blob is actually usable by
    // the corpus tools rather than merely non-null — a broken export would otherwise only surface
    // as a confusing refit weeks later.
    {
        const x = paper.exportRun('gate')
        check('a finished round exports a run blob', !!x)
        check('…in the shared corpus format', x?.format === 'rangersim-run-export/2', x?.format)
        check('…tagged as a paper route so the two par scales stay separable',
            x?.mission_type === 'paper_route')
        // Everything test/calibrate-par.mjs reads. It rebuilds par from `topology.rows`, corrects it
        // with result.par_s, and needs par_ref.slack to know WHICH standard the run was graded on.
        check('…carries the fields calibrate-par consumes',
            x?.result?.par_s > 0 && x?.result?.elapsed_s > 0 && x?.result?.letter &&
            x?.topology?.rows?.length > 1 && x.topology.columns?.length === 9 &&
            x?.par_ref?.slack === PAR_SLACK,
            JSON.stringify({ par: x?.result?.par_s, elapsed: x?.result?.elapsed_s, letter: x?.result?.letter,
                             cols: x?.topology?.columns?.length, rows: x?.topology?.rows?.length, slack: x?.par_ref?.slack }))
        check('…records the EFFECTIVE par the letter came from (par × coverage)',
            Math.abs(x.paper.par_effective_s - x.result.par_s * x.paper.coverage) < 0.02,
            `${x?.paper?.par_effective_s} vs ${x?.result?.par_s} × ${x?.paper?.coverage}`)
        check('…and the paper-specific terms a refit needs',
            x.paper.customers > 0 && x.paper.delivered === x.paper.customers && x.paper.complete === true)
        // The trace is the richest calibration signal: it says WHERE the time went, not just how
        // much. A silently-empty trace would make the export look fine and be half useless.
        check('…with a non-empty driven trace at the shared TRACE_HZ',
            x.trace?.rows?.length > 0 && x.trace.hz === TRACE_HZ,
            `rows ${x?.trace?.rows?.length}, hz ${x?.trace?.hz}`)
    }

    paper.dismiss()
    check('dismissing the card puts the route down', paper.state === 'idle')
}

// ── 7. degenerate inputs return null rather than a broken route ─────────────────────────────────
check('no Larry ⇒ no route', planTour(W.road, null, customers, 4, region) === null)
check('no customers ⇒ no route', planTour(W.road, larry, [], 4, region) === null)
check('a zero-customer tier ⇒ no route', planTour(W.road, larry, customers, 0, region) === null)
check('no road ⇒ no route', planTour(null, larry, customers, 4, region) === null)

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL PAPER-TOUR CHECKS PASSED')
process.exit(fails ? 1 : 0)
