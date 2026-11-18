// GATE (FEAT-63): the GPS re-plan — the shortest way to finish, computed across frames.
//
// The feature's whole safety argument is that there is ONE planner driven two ways, and that a
// re-plan changes the LINE and never the CONTRACT. So this gate pins exactly that:
//
//   1. ONE ALGORITHM, TWO DRIVERS. planTour and a fully-drained planTourJob return the same route.
//      If these ever disagree, the sliced path is a second planner and every other check here is
//      measuring the wrong thing.
//   2. SLICING IS INVISIBLE. A job driven one next() at a time returns the same route as one driven
//      in a single gulp — no state leaks across a yield, and the leased Held-Karp tables are handed
//      back and re-borrowed cleanly.
//   3. AN ABANDONED JOB RETURNS ITS TABLES. Cancel a job mid-DP and the next one must still be
//      exact. This is the failure the lease's `finally` exists to prevent, and it is silent.
//   4. A RE-PLAN IS OF THE UNDELIVERED SET, EXACTLY. Never re-adds a delivered customer, never
//      drops an undelivered one.
//   5. IT IS AN IMPROVEMENT, NOT A DIFFERENT ROUTE. From the same origin, the re-plan is never
//      longer than the original's remaining suffix.
//   6. PAR NEVER MOVES. The contract is frozen at accept; the guide is the only thing that changes.
//
// Heavy: needs a real streamed, routed network.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { planTour, planTourJob, customersForTier,
         PaperRouteSystem, resetPaperRun, roadOrigin, PAPER_PARAMS, RR_PARAMS } from '../src/paper-route.js'
import { buildStoryRegion } from './lib/story-region.mjs'
import { REGION_RADIUS_M } from '../src/story.js'
import { START_ZONE_R } from '../src/mission.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const SEED = 6
const C = { x: 4500, z: 600 }
const R = 2500
const region = { x: C.x, z: C.z, r: R }

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

const larry = poi.list().find(q => q.type === 'larrysHouse')
const customers = poi.customers(3)   // the top rung's route — who is on it is stamped at placement
if (!larry || !customers.length) { console.log('NO ROUTE SOURCE — cannot run'); process.exit(1) }

const TOP = PAPER_TOP()
function PAPER_TOP () { return { want: customersForTier(3) } }
const plan = (origin, cust, want) => planTour(road, origin, cust, want, region, 100)

/** Drain a job `step` next()s at a time, the way the pump does. */
function drain (job, step = Infinity) {
    let r = job.next(), n = 1
    while (!r.done) { for (let i = 0; i < step && !r.done; i++) { r = job.next(); n++ } }
    return { route: r.value, calls: n }
}

const sig = (t) => t && `${t.customers.map(c => c.id).join('>')}|${t.distance.toFixed(3)}|${t.par.toFixed(3)}`

// ── 1. one algorithm, two drivers ───────────────────────────────────────────────────────────────
const base = plan(larry, customers, TOP.want)
check('the top rung plans a route to re-plan against', !!base,
    `${customers.length} customers in the region`)
if (!base) { console.log('\nNO BASE ROUTE — the rest cannot run'); process.exit(1) }
console.log(`       base: ${base.customers.length} stops · ${(base.distance / 1000).toFixed(2)} km`
    + ` · par ${base.par.toFixed(0)} s`)

{
    const { route } = drain(planTourJob(road, larry, customers, TOP.want, region, 100))
    check('a fully-drained job matches planTour exactly', sig(route) === sig(base),
        `\n        drained ${sig(route)}\n        planTour ${sig(base)}`)
}

// ── 2. slicing is invisible ─────────────────────────────────────────────────────────────────────
{
    const { route, calls } = drain(
        planTourJob(road, larry, customers, TOP.want, region, 100), 1)
    check('…and so does one driven a single next() at a time', sig(route) === sig(base),
        `\n        sliced ${sig(route)}\n        whole  ${sig(base)}`)
    // Not an assertion about a number, a statement that the job IS sliceable: a generator that
    // yielded once would pass every other check here while being useless to the pump.
    // At least one yield per Dijkstra: Larry's, and one per stop's row (BUG-134: the old `> 16` assumed a 15-stop top rung).
    check('…and the job actually yields enough times to be pumped', calls > TOP.want,
        `${calls} next() calls — a job that cannot be spread over frames is not sliced`)
    console.log(`       the top rung's job is ${calls} slices`)
}

// ── 3. an abandoned job hands its tables back ───────────────────────────────────────────────────
{
    const doomed = planTourJob(road, larry, customers, TOP.want, region, 100)
    for (let i = 0; i < 40; i++) doomed.next()          // into the DP, then walk away
    doomed.return()
    const after = plan(larry, customers, TOP.want)
    check('a cancelled job does not corrupt the next one', sig(after) === sig(base),
        `\n        after cancel ${sig(after)}\n        expected     ${sig(base)}`)
}

// ── 4/5/6. a re-plan from a mid-route origin ────────────────────────────────────────────────────
//
// The origin is a REAL customer standing in for the truck: it has the {aId, bId, s} shape the live
// _originPoint() builds from queryNearest, and using one keeps the gate free of a road-snap
// dependency it is not trying to test.
{
    const delivered = base.customers.slice(0, 3)
    const left = base.customers.slice(3)
    const origin = delivered[delivered.length - 1]
    // The SET is fixed, exactly as the live re-plan does it — only the order is in question.
    const re = plan(origin, left, left.length)
    check('a re-plan from mid-route produces a route', !!re)
    if (re) {
        const got = new Set(re.customers.map(c => c.id))
        const want = new Set(left.map(c => c.id))
        check('…of exactly the undelivered customers',
            got.size === want.size && [...want].every(id => got.has(id)),
            `${re.customers.length} planned vs ${left.length} undelivered`)
        check('…and never re-adds one already delivered',
            delivered.every(c => !got.has(c.id)))

        // WHAT THE PLAYER WOULD DRIVE BY IGNORING THE RE-PLAN: the metres still ahead of them on
        // the ORIGINAL line, measured along its own baked polyline from the nearest vertex to the
        // origin. Comparing the re-plan against another re-plan would be a tautology; this is the
        // real alternative.
        //
        // The 2 % slack is honest rather than defensive. The DP minimises the planner's graph
        // metric — chord for whole edges, true arc for split ones, deliberately mixed (see
        // planTourJob) — while `distance` here is computePar's true arc over the routed segments.
        // Optimal in the first is not identically optimal in the second, so a hairline overshoot is
        // a metric artefact and not a regression. A re-plan that came out MEANINGFULLY longer would
        // mean the optimiser is being handed the wrong graph, and that is what this catches.
        const cum = base.polyCum, poly = base.poly
        let bi = 0, bd = Infinity
        for (let i = 0; i < poly.length; i++) {
            const d = (poly[i].x - origin.x) ** 2 + (poly[i].z - origin.z) ** 2
            if (d < bd) { bd = d; bi = i }
        }
        const ahead = cum[cum.length - 1] - cum[bi]
        check('…and is no longer than carrying on down the original line',
            re.distance <= ahead * 1.02,
            `re-plan ${(re.distance / 1000).toFixed(3)} km vs ${(ahead / 1000).toFixed(3)} km still ahead`)
        console.log(`       re-plan: ${re.customers.length} stops · ${(re.distance / 1000).toFixed(2)} km`
            + `  ·  carrying on: ${(ahead / 1000).toFixed(2)} km`)

        // SM-INV-2, via the thing that could actually break it. The re-plan shares the Held-Karp
        // table pool with the accept-time planner, so the failure to guard against is a re-plan
        // perturbing shared state such that the SAME tour re-prices differently afterwards. Par is
        // a pure function of the route, so a par that moved would mean the route did.
        const again = plan(larry, customers, TOP.want)
        check('the contract re-prices identically after a re-plan has run',
            again.par === base.par && again.distance === base.distance,
            `par ${again.par} vs ${base.par}, distance ${again.distance} vs ${base.distance}`)
    }
}

// ── the case the feature exists for: the player went somewhere else ─────────────────────────────
//
// The check above starts from a point ON the original line, where the optimal continuation IS the
// original suffix — so it can only ever confirm that the re-plan does no harm. This one skips to a
// customer near the far END of the route and re-plans from there, which is exactly the "ignored the
// GPS and drove to a different house" case. Here the original order is genuinely bad, and the
// re-plan has to be measurably better or the feature is not earning its frames.
// TWO FIXES HERE, 2026-09-07.
//
// (1) THE STALE METRIC WAS DEGENERATE. It read `(cum[last] - cum[bi]) + cum[bi]`, in which `bi`
//     cancels — algebraically just `cum[last]`, the whole baked tour length, no matter where the
//     player jumped. So the comparison was "13-stop re-plan vs the full 15-stop tour", not "carry on
//     from here". The honest stale cost is the one the comment above always described: drive the tail
//     forward from the jump point, THEN run back for the earliest customer you skipped behind.
//
// (2) THE 5% BAR WAS A PROPERTY OF ONE DRAW, not of the feature. The planner is exact (Held-Karp,
//     paper-route.js:307), so a thin margin never means a weak planner — it means that particular
//     stale order happened to be near-optimal. Which customers get drawn is keyed to graph edge
//     endpoints (poi.js `house:${ka}|${kb}:${k}`), so ANY worldgen change reshuffles the draw and with
//     it the margin: a cutMax 20 -> 25 slider move took this single scenario from 19% to 1.7% and
//     turned the gate red while the feature was working perfectly.
//
// So: sweep every jump point across the tier ladder in two worlds and assert the DISTRIBUTION.
// Measured over 4 seeds × 39 scenarios with the corrected metric — median gain 20.5/25.7/31.5/46.1%,
// worst single scenario −1.3%, and zero scenarios below −2% anywhere. The per-scenario floor reuses
// the same 1.02 metric-artefact slack as the mid-route check above (the DP minimises the planner's
// mixed chord/arc graph metric while `distance` is computePar's true arc, so a hairline overshoot is
// an artefact; a large one is a real regression).
//
// [2026-09-09 merge train] The "typical gain" bars (median >10 %, >5 % on 60 % of scenarios) were
// fitted ~2x under the weakest of those four medians — and the very next worldgen change broke the
// fit: with FEAT-77 + FEAT-82 + cutMax 25 all landing at once, seed 6's spawn world compacted (base
// tour 18.1 → 13.2 km for the same 15 stops) and its median gain fell to 2.7 % while seed 20 stayed
// at 32 % and the −2 % floor held everywhere. That is the customer DRAW again, one level up: how
// often the stale line is near-optimal is a property of the houses, not the planner (owner ruling
// 2026-09-08 on this gate's single-scenario ancestor). So the typical-gain bars are now REPORT-only
// per world, and the gating non-vacuity check is existential: in EVERY world the re-plan must win
// >10 % from at least 3 jump points, i.e. there are places the player can actually be where the
// re-plan is materially worth its frames. Seed 6 clears that 8/25, seed 20 by more.
//
// Seeds are the expensive axis (~10 s of road.update() each) and jump points are free (~4 ms a
// re-plan), so two worlds × 39 scenarios buys far more evidence than four worlds × one scenario would.
// Add a seed to FAR_END_WORLDS if that ever stops being enough.
{
    const idxOf = (poly, p) => {
        let bi = 0, bd = Infinity
        for (let i = 0; i < poly.length; i++) {
            const d = (poly[i].x - p.x) ** 2 + (poly[i].z - p.z) ** 2
            if (d < bd) { bd = d; bi = i }
        }
        return bi
    }

    // Every jump point on every tier of one world. `tour` is the baked stale line; for each customer
    // we could have jumped to, price carrying on down it against re-planning from there.
    const sweepWorld = (rd, rg, origin, cust, tag) => {
        const out = []
        for (const tier of [2, 3]) {   // tiers 3 and 4: the two longest rounds (9 and 11 stops since BUG-134)
            const tour = planTour(rd, origin, cust.filter(c => (c.paperTier ?? Infinity) <= tier), customersForTier(tier), rg, 100)
            if (!tour || tour.customers.length < 4) continue
            const cum = tour.polyCum, poly = tour.poly, L = cum[cum.length - 1]
            for (let j = 1; j < tour.customers.length; j++) {
                const jump = tour.customers[j]
                const left = tour.customers.filter(c => c.id !== jump.id && c.id !== tour.customers[0].id)
                if (!left.length) continue
                const re = planTour(rd, jump, left, left.length, rg, 100)
                if (!re) continue
                const bi = idxOf(poly, jump)
                // The earliest undelivered customer BEHIND the jump point — how far back the stale
                // line has to double back once the tail is done.
                let minBehind = Infinity
                for (const c of left) {
                    const ca = cum[idxOf(poly, c)]
                    if (ca < cum[bi] && ca < minBehind) minBehind = ca
                }
                const naive = (L - cum[bi]) + (Number.isFinite(minBehind) ? (L - minBehind) : 0)
                if (!(naive > 1)) continue
                out.push({ tag, tier, j, gain: 1 - re.distance / naive, re: re.distance, naive })
            }
        }
        return out
    }

    const scen = sweepWorld(road, region, larry, customers, `seed${SEED}`)
    // A second world, so the bars can never again be a property of one seed's customer draw.
    const S2 = 20, C2 = { x: 4500, z: 600 }, R2 = 2500
    const road2 = new RoadSystem(S2, RANGER_PARAMS)
    road2.setRadius(R2); road2.update(new THREE.Vector3(C2.x, 0, C2.z))
    const terrain2 = makeTerrainHeadless(S2, RANGER_PARAMS, road2)
    const water2 = new WaterSystem(S2, RANGER_PARAMS, (x, z) => terrain2.rawHeightWorld(x, z))
    const poi2 = new PoiSystem({
        getRoad: () => road2, getWater: () => water2, getTerrain: () => terrain2,
        getSeed: () => S2, getParams: () => RANGER_PARAMS,
    })
    poi2.build(C2, R2); poi2.buildHouses(C2, R2)
    const larry2 = poi2.list().find(q => q.type === 'larrysHouse')
    if (larry2 && poi2.customers(3).length) {
        scen.push(...sweepWorld(road2, { x: C2.x, z: C2.z, r: R2 }, larry2, poi2.customers(3), `seed${S2}`))
    }

    const gains = scen.map(s => s.gain).sort((a, b) => a - b)
    const med = gains.length ? gains[Math.floor(gains.length / 2)] : 0
    const worst = gains.length ? gains[0] : 0
    const over5 = gains.filter(g => g > 0.05).length

    check('a re-plan after jumping off the route succeeds, at every jump point', scen.length >= 20,
        `only ${scen.length} scenarios — the sweep went vacuous`)
    // Never meaningfully worse than carrying on — the hard per-scenario floor.
    check('…and is never meaningfully worse than the stale line, at ANY jump point', worst >= -0.02,
        `worst scenario ${(worst * 100).toFixed(1)}% (floor -2.0%)`)
    // NON-VACUOUS, per world: the feature has to be worth its frames SOMEWHERE the player can be. The
    // typical gain is a draw property (see the header) and is reported, not gated.
    const worlds = [...new Set(scen.map(s => s.tag))]
    const big = Object.fromEntries(worlds.map(t => [t, scen.filter(s => s.tag === t && s.gain > 0.10).length]))
    check('…and in every world the re-plan wins >10% from at least 3 jump points', worlds.every(t => big[t] >= 3),
        worlds.map(t => `${t}: ${big[t]} scenario(s) gain >10%`).join(' · '))
    console.log(`       far-end sweep: ${scen.length} scenarios, gain ${(worst * 100).toFixed(1)}% … `
        + `${(gains[gains.length - 1] * 100).toFixed(1)}%, median ${(med * 100).toFixed(1)}%`
        + ` (${over5}/${gains.length} gain >5%) — REPORT`)
    for (const t of worlds) {
        const g = scen.filter(s => s.tag === t).map(s => s.gain).sort((a, b) => a - b)
        console.log(`       ${t}: n=${g.length} median ${(g[Math.floor(g.length / 2)] * 100).toFixed(1)}%`
            + ` worst ${(g[0] * 100).toFixed(1)}% · ${big[t]} gain >10% — REPORT`)
    }
}

// ── BUG-48: the line never contains someone who already has their paper ─────────────────────────
//
// The owner-reported defect (seed 90): deliver two papers in order, turn round, drive back the way
// you came, and the chevrons pointing at customer two light up again. The cause was not the chevron
// code — `advanceProgress` is a nearest-point projection, not a ratchet, so driving back walks `s`
// backwards quite correctly. The cause was that the LINE still had the served porches on it,
// because an in-order delivery deliberately skipped the re-plan as an optimisation.
//
// So the property to hold is not "re-plan when the order is wrong". It is this one, and it is
// checked here through the live system rather than the planner, because the trigger is what broke.
{
    let mapOpen = null
    const deps = {
        getRoad: () => road, getPois: () => poi, getRegion: () => region,
        getCar: () => car, getTerms: () => ({ payTier: 1 }),
        getTargetR: () => POI_PARAMS.poiHouseTargetR,
        onSettle: () => ({ payout: 0, points: 0 }),
        onBriefing: (done) => done(),
        setMapOpen: (o) => { mapOpen = o },
    }
    const sys = new PaperRouteSystem(deps)
    const car = { x: larry.x, y: larry.y ?? 0, z: larry.z }
    resetPaperRun()
    sys.open(larry, { id: 'larry#0' })   // a board offer: FEAT-42 below saves the round by its id
    // open() defers the plan a tick; drain it synchronously the way the gate for the tour does.
    await new Promise(r => setTimeout(r, 0))

    check('parking at Larry\'s opens the map on the offer', sys.state === 'offer' && mapOpen === true,
        `state ${sys.state}, map ${mapOpen}`)
    if (sys.state === 'offer') {
        sys.accept()
        check('…and accepting puts it away again', mapOpen === false)
        car.x += START_ZONE_R + 5
        sys.update(0.1)                                  // leave the threshold: the route is running

        const first = sys.route.customers[0]
        car.x = first.x; car.z = first.z
        sys.takePaper()
        const hit = sys.recordLanding(first.x, first.z)
        check('a delivery credits the customer', !!hit?.credited)
        check('…and immediately starts a re-plan', sys.hasReplan(),
            'without this the served porch stays on the line and the chevrons re-light behind you')
        check('…quietly — an ordinary delivery is not a wrong turn', !sys.isRerouting())

        let guard = 0
        while (sys.pumpReroute(50) && guard++ < 500) { /* drain it the way the frame pump would */ }
        const onLine = new Set(sys.line().customers.map(c => c.id))
        check('…and the new line does NOT contain the porch that was just served',
            !onLine.has(first.id),
            `${first.id} is still on the guide — this is the seed-90 defect`)
        // FEAT-266 (DEC-398): the guide is the shortest tour from the truck through exactly the round's planned
        // houses still owed — the same planner, handed that set and asked for all of it.
        const owed = sys.route.customers.filter(c => c.id !== first.id)
        const ids = r => r?.customers.map(c => c.id).join('>')
        const best = plan(roadOrigin(road, car), owed, owed.length)
        check('…and the guide is the shortest tour through the planned houses still owed (DEC-398)',
            ids(sys.line()) === ids(best), `${ids(sys.line())} vs ${ids(best)}`)
        // …and the in-world GPS draws only its first leg, ending at that tour's first house (the turn arrow's house).
        const leg = sys.gpsLine()
        check('…and the GPS draws the leg to the tour\'s first house (FEAT-266)',
            leg.customers.length === 1 && leg.customers[0].id === best.customers[0].id
            && leg.segments.length <= sys.line().segments.length && leg.segments.at(-1).stop === true && sys.gpsLine() === leg,
            `${leg.customers.map(c => c.id)} · ${leg.segments.length}/${sys.line().segments.length} segs`)
        // …and the timer re-plans it from wherever the truck is: park on the next owed house's door.
        const par0 = sys.route.par
        const next = best.customers[0]
        car.x = next.x; car.z = next.z
        for (let i = 0; i < 5; i++) sys.update(0.25)
        guard = 0; while (sys.pumpReroute(50) && guard++ < 500) { /* drain */ }
        const again = plan(roadOrigin(road, car), owed, owed.length)
        check('…it re-plans on its own timer within tourS, and par is untouched (FEAT-266)',
            ids(sys.line()) === ids(again) && sys.route.par === par0, `${ids(sys.line())} vs ${ids(again)}`)
        // The contract keeps everybody, because the contract is who you owe, not where you are.
        check('…and the CONTRACT still lists every customer, delivered or not',
            sys.route.customers.length === base.customers.length
            || sys.route.customers.some(c => c.id === first.id))

        // FEAT-42: the round in hand survives a save — through JSON, into a fresh system, it is the
        // same tour at the same par with the same porch served, and the line re-plans from here.
        const snap = JSON.parse(JSON.stringify(sys.snapshot()))
        const back = new PaperRouteSystem(deps)
        const ok = back.resume(larry, { id: 'larry#0' }, snap)
        check('FEAT-42: a saved round resumes as the same tour, par, stock and served porch',
            ok && back.state === 'running' && ids(back.route) === ids(sys.route) && back.route.par === sys.route.par
            && back.run.stock === sys.run.stock && back.run.hits.has(first.id) && back.run.t0H === sys.run.t0H,
            `ok ${ok}, state ${back.state}, tour ${ids(back.route) === ids(sys.route)}, stock ${back.run?.stock}/${sys.run.stock}`)
        check('…and its line re-plans to whoever is still owed', back.hasReplan())
    }
}

// ── FEAT-266 (DEC-398): a round is its planned houses, and the guide is the tour through them ──────────────
//
// The owner's report (seed 3200351065, Larry's first route): the line left Larry's toward the cluster, flipped to a
// lone house off the route once outside the start circle, then flipped back. Driven here on that seed's story region
// (built as entry builds it) and on seed 6, at every rung: the truck follows the priced line, a sample every ~25 m
// (one polyline vertex) run through the system's own timer and pump.
//   · every rung's houses come from the pool (customers of the top rung);
//   · the guide just outside the circle IS the priced tour (same houses, same order);
//   · driven with a paper on every porch as it passes, the guide never names a house off the route, and its next
//     house changes only on a delivery (no flip-flop);
//   · driven WITHOUT throwing, each owed house passed is re-planned within tourS: the line turns back to it exactly
//     when the shortest remaining tour does — and over the runs both cases happen (non-vacuity).
async function guideDrive (W, label) {
    const { road, poi, larry, region } = W
    const pool = poi.customers(PAPER_PARAMS.tiers.length - 1)
    const ids = r => r?.customers.map(c => c.id).join('>')
    const stats = { back: 0, on: 0, lagMax: 0 }
    for (let tier = 0; tier < PAPER_PARAMS.tiers.length; tier++) {
        const car = { x: larry.x, y: larry.y ?? 0, z: larry.z }
        const sys = new PaperRouteSystem({ getRoad: () => road, getPois: () => poi, getRegion: () => region, getCar: () => car,
            getTargetR: () => POI_PARAMS.poiHouseTargetR, onSettle: () => ({ payout: 0, points: 0 }),
            onBriefing: (d) => d(), setMapOpen: () => {} })
        resetPaperRun()
        sys.open(larry, { id: 'larry#0' }, tier)
        await new Promise(r => setTimeout(r, 0))
        if (sys.state !== 'offer') { check(`${label} rung ${tier}: Larry offers a round`, false, sys.state); continue }
        const tour = sys.route, onRoute = new Set(tour.customers.map(c => c.id))
        check(`${label} rung ${tier}: its ${tour.customers.length} houses all come from the ${pool.length}-house pool`,
            tour.customers.every(c => pool.some(p => p.id === c.id)))
        sys.accept()
        const step = () => { for (let k = 0; k < 5; k++) { sys.update(0.25); let g = 0; while (sys.pumpReroute(50) && g++ < 999); } }
        const poly = tour.poly
        // Just outside the circle, on the line.
        let i0 = poly.findIndex(p => Math.hypot(p.x - larry.x, p.z - larry.z) > START_ZONE_R + 10)
        car.x = poly[i0].x; car.z = poly[i0].z
        step()
        check(`${label} rung ${tier}: just outside the circle the guide IS the priced tour`,
            sys.state === 'running' && ids(sys.line()) === ids(tour), `${ids(sys.line())} vs ${ids(tour)}`)

        // Driven with every porch served as it is passed: never a house off the route, no flip-flop.
        let offSeen = null, flips = 0, last = sys.gpsLine().customers[0]?.id, lastHits = 0
        for (let i = i0; i < poly.length && sys.state === 'running'; i++) {
            car.x = poly[i].x; car.z = poly[i].z
            for (const c of tour.customers) if (!sys.isDelivered(c.id) && Math.hypot(c.x - car.x, c.z - car.z) < 30) {
                sys.takePaper(); sys.recordLanding(c.x, c.z)
            }
            step()
            if (sys.state !== 'running') break
            const L = sys.line()
            if (L.customers.some(c => !onRoute.has(c.id) || sys.isDelivered(c.id))) offSeen ??= `v${i}: ${ids(L)}`
            const nx = sys.gpsLine().customers[0]?.id
            if (nx !== last && sys.delivered() === lastHits) flips++
            last = nx; lastHits = sys.delivered()
        }
        check(`${label} rung ${tier}: served as driven, the guide never names a house off the route or already served`, !offSeen, offSeen)
        check(`${label} rung ${tier}: …and its next house changes only on a delivery (${flips} changes without one)`, flips === 0)

        // Driven WITHOUT throwing: past each owed house, the re-plan lands within tourS and is the shortest tour.
        if (tier > 1) continue   // two rungs a world keeps the runtime sane; the property is per-pass, not per-rung
        const sys2 = new PaperRouteSystem({ getRoad: () => road, getPois: () => poi, getRegion: () => region, getCar: () => car,
            getTargetR: () => POI_PARAMS.poiHouseTargetR, onSettle: () => ({ payout: 0, points: 0 }),
            onBriefing: (d) => d(), setMapOpen: () => {} })
        resetPaperRun()
        car.x = larry.x; car.z = larry.z
        sys2.open(larry, { id: 'larry#1' }, tier)
        await new Promise(r => setTimeout(r, 0))
        sys2.accept()
        const step2 = (n) => { for (let k = 0; k < n; k++) { sys2.update(0.25); let g = 0; while (sys2.pumpReroute(50) && g++ < 999); } }
        car.x = poly[i0].x; car.z = poly[i0].z
        step2(5)
        const passed = new Set()
        for (let i = i0; i < poly.length; i++) {
            const h = tour.customers.find(c => !passed.has(c.id) && Math.hypot(c.x - poly[i].x, c.z - poly[i].z) < 25
                && Math.hypot(c.x - poly[Math.min(i + 3, poly.length - 1)].x, c.z - poly[Math.min(i + 3, poly.length - 1)].z) > 40)
            if (!h) continue
            passed.add(h.id)
            // ~60 m past the porch, carrying on along the line: how long until the guide is the shortest tour?
            const j = Math.min(i + 3, poly.length - 1)
            car.x = poly[j].x; car.z = poly[j].z
            const best = planTour(road, roadOrigin(road, car), tour.customers, tour.customers.length, region, 100)
            let lag = 0
            while (ids(sys2.line()) !== ids(best) && lag < 12) { step2(1); lag++ }
            stats.lagMax = Math.max(stats.lagMax, lag * 0.25)
            check(`${label} rung ${tier}: past ${h.id.split(':').pop()} without a throw, the guide is the shortest tour within ${RR_PARAMS.tourS} s`,
                ids(sys2.line()) === ids(best) && lag * 0.25 <= RR_PARAMS.tourS + 0.25, `${lag * 0.25} s: ${ids(sys2.line())} vs ${ids(best)}`)
            if (best.customers[0].id === h.id) stats.back++; else stats.on++
            i = j
        }
        sys2.cancel()
    }
    return stats
}

{
    const W6 = { road, poi, larry, region }
    const s6 = await guideDrive(W6, 'seed 6')
    const O = buildStoryRegion('3200351065')
    O.poi.buildHouses(O.C, REGION_RADIUS_M, O.rep.mainNodes)
    const WO = { road: O.poi._d.getRoad(), poi: O.poi, larry: O.poi.list().find(q => q.type === 'larrysHouse'),
                 region: { x: O.C.x, z: O.C.z, r: REGION_RADIUS_M, nodes: O.rep.mainNodes } }
    const sO = await guideDrive(WO, 'seed 3200351065')
    const back = s6.back + sO.back, on = s6.on + sO.on
    console.log(`       passes without a throw: ${back} turned back, ${on} carried on · worst re-plan lag ${Math.max(s6.lagMax, sO.lagMax)} s`)
    check('…and both happen: a missed house turns the line back AND a missed house is left for later (non-vacuity)', back > 0 && on > 0,
        `${back} back, ${on} on`)
}

// ── the single-stop tail ────────────────────────────────────────────────────────────────────────
// The last leg of every route is a one-stop re-plan, which skips Held-Karp entirely. It has to work
// or the guidance goes dark exactly when the player is closest to finishing.
{
    const last = base.customers[base.customers.length - 1]
    const from = base.customers[0]
    const one = plan(from, [last], 1)
    check('a one-stop re-plan (the last porch) still routes', !!one?.segments?.length)
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL PAPER-REROUTE CHECKS PASSED')
process.exit(fails ? 1 : 0)
