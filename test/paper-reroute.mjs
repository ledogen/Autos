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
import { PoiSystem } from '../src/poi.js'
import { planTour, planTourJob, radiusForTier, customersForTier } from '../src/paper-route.js'
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
const customers = poi.customers()
if (!larry || !customers.length) { console.log('NO ROUTE SOURCE — cannot run'); process.exit(1) }

const TOP = PAPER_TOP()
function PAPER_TOP () { return { want: customersForTier(3), ringR: radiusForTier(3) } }
const plan = (origin, cust, want, ringR = TOP.ringR) =>
    planTour(road, origin, cust, want, region, 100, ringR)

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
    const { route } = drain(planTourJob(road, larry, customers, TOP.want, region, 100, TOP.ringR))
    check('a fully-drained job matches planTour exactly', sig(route) === sig(base),
        `\n        drained ${sig(route)}\n        planTour ${sig(base)}`)
}

// ── 2. slicing is invisible ─────────────────────────────────────────────────────────────────────
{
    const { route, calls } = drain(
        planTourJob(road, larry, customers, TOP.want, region, 100, TOP.ringR), 1)
    check('…and so does one driven a single next() at a time', sig(route) === sig(base),
        `\n        sliced ${sig(route)}\n        whole  ${sig(base)}`)
    // Not an assertion about a number, a statement that the job IS sliceable: a generator that
    // yielded once would pass every other check here while being useless to the pump.
    check('…and the job actually yields enough times to be pumped', calls > 16,
        `${calls} next() calls — a job that cannot be spread over frames is not sliced`)
    console.log(`       the top rung's job is ${calls} slices`)
}

// ── 3. an abandoned job hands its tables back ───────────────────────────────────────────────────
{
    const doomed = planTourJob(road, larry, customers, TOP.want, region, 100, TOP.ringR)
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
    // No ring filter, exactly as the live re-plan does it: these customers were already inside the
    // tier's ring when the route was planned.
    const re = plan(origin, left, left.length, Infinity)
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
{
    const far = base.customers[base.customers.length - 2]
    const left = base.customers.filter(c => c.id !== far.id && c.id !== base.customers[0].id)
    const re = plan(far, left, left.length, Infinity)
    check('a re-plan after jumping to the far end of the route succeeds', !!re)
    if (re) {
        // Carrying on from the far stop in the ORIGINAL order means driving the tail, then all the
        // way back for everything skipped. Priced the same way as above, along the original poly.
        const cum = base.polyCum, poly = base.poly
        let bi = 0, bd = Infinity
        for (let i = 0; i < poly.length; i++) {
            const d = (poly[i].x - far.x) ** 2 + (poly[i].z - far.z) ** 2
            if (d < bd) { bd = d; bi = i }
        }
        // Everything still ahead, PLUS the run back to pick up what was skipped behind — which is
        // what the stale line would actually cost, and what the re-plan is competing against.
        const naive = (cum[cum.length - 1] - cum[bi]) + cum[bi]
        check('…and beats carrying on down the stale line, not merely ties it',
            re.distance < naive * 0.95,
            `re-plan ${(re.distance / 1000).toFixed(2)} km vs stale ${(naive / 1000).toFixed(2)} km`)
        console.log(`       jumped to the far end: re-plan ${(re.distance / 1000).toFixed(2)} km`
            + ` vs ${(naive / 1000).toFixed(2)} km on the stale line`)
    }
}

// ── the single-stop tail ────────────────────────────────────────────────────────────────────────
// The last leg of every route is a one-stop re-plan, which skips Held-Karp entirely. It has to work
// or the guidance goes dark exactly when the player is closest to finishing.
{
    const last = base.customers[base.customers.length - 1]
    const from = base.customers[0]
    const one = plan(from, [last], 1, Infinity)
    check('a one-stop re-plan (the last porch) still routes', !!one?.segments?.length)
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL PAPER-REROUTE CHECKS PASSED')
process.exit(fails ? 1 : 0)
