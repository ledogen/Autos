// FEAT-61 — the paper route: its economy, and the machine around it.
//
// TWO HALVES, and the split is deliberate. Above `PaperRouteSystem` everything is pure and
// headless — the accuracy law, the flat rate, the ladder — because that is the part that has to be
// RIGHT and the part a gate can actually pin (test/paper-route.mjs). Below it is the state machine,
// which owns the tour, one par, the stock and the settlement, and which needs a live RoadSystem.
//
// Why this mission prices itself instead of going through payoutFor():
//
// payoutFor() is the SM-INV-4 margin line — continuous in the par ratio, bare completion pays
// ~nothing. That is the correct shape for a point-to-point errand and the wrong shape for this.
// DESIGN.md already blesses the divergence ("not every mission type is scored on margin… rank is
// computed per-axis") and missions.md §3b/3c already price fragile and freight at a flat rate. So
// the paper route is scored on COVERAGE × ACCURACY, with time entering only as a bonus, and
// SM-INV-4 is left untouched rather than bent.
//
// The consequence that matters: this is the income floor (missions.md, ratified 2026-08-05). Papers
// you delivered are money you keep. There is no completion multiplier anywhere in here, because a
// floor that pays nothing for a half-finished route is not a floor.

import { ECONOMY_PARAMS } from './economy.js'
import { buildGraphAdj, START_ZONE_R } from './mission.js'
import { computePar } from './par.js'
// The accuracy law is throw.js's, not restated here. It is one line of algebra and that is exactly
// why it must have one home: a second copy is a second thing to keep in step with the gate.
import { accuracyScore } from './throw.js'

export const PAPER_PARAMS = {
    // The route ends at par × this. Soft by construction: under flat rate the bell only stops you
    // earning more, so it costs the papers still in the truck and nothing already banked.
    tolerance:   1.2,

    // The ladder Larry walks you up, one rung per PERFECT route (owner, 2026-08-05). Run-layer, so
    // it is re-earned every run like everything else.
    tiers:       [4, 9, 12, 15],
    // Spares as a fraction of the customer count, per tier: generous on the first route, thin on the
    // last (owner). A beginner's four-house route tolerates four fluffed throws; the fifteen-house
    // route tolerates four and a half, which is the difficulty curve stated as inventory.
    sparesFrac:  [1.00, 0.75, 0.50, 0.30],

    // FLAT is anchored to par so the floor survives the 20-day cost ramp instead of decaying into
    // irrelevance by day 15. paperW is how much poorer than the margin line a perfect route at par
    // is: 0.6 = "reliably poor", which is what an income floor is supposed to feel like.
    paperW:      0.60,

    // The expediency bonus — the ONLY place time enters the payout. Gated on a completed route:
    // you cannot finish early without finishing.
    expediteOn:  0.90,   // ratio at which the bonus starts paying (10% inside par)
    expediteFull:0.70,   // …and where it maxes out
    bonusMax:    0.40,

    // Per-axis rank thresholds on coverage × accuracy — NOT the par ratio. One delivery out of nine
    // scores 0.11 and letters D, which is the owner's stated case, and it still pays for that one.
    rank:        { C: 0.50, B: 0.75, A: 0.90, S: 0.98 },
}

/**
 * RUN-LAYER state (SM-INV-12) — a sibling of economy.js's runEconomy for exactly the same reason:
 * the tier moves when a route is settled, which is not a day/sleep boundary, so it cannot live on
 * day.js's runState without falsifying that object's contract.
 *
 * `tier` is a 0-based index into PAPER_PARAMS.tiers. Resets to the first rung on every new run —
 * Larry does not remember last run, because last run did not happen.
 */
export const runPaper = {
    tier: 0,
    routesRun: 0,       // settled routes this run; the result card's "your Nth route"
}

export function resetPaperRun () {
    runPaper.tier = 0
    runPaper.routesRun = 0
}

/** How many customers this tier's route visits. */
export function customersForTier (tier = runPaper.tier) {
    const t = PAPER_PARAMS.tiers
    return t[Math.min(Math.max(0, tier | 0), t.length - 1)]
}

/**
 * How many papers you are handed: the customers, plus spares. Rounded UP — a fractional spare is
 * a spare, and rounding down would silently make the hardest route unwinnable by one throw.
 */
export function stockForTier (tier = runPaper.tier) {
    const i = Math.min(Math.max(0, tier | 0), PAPER_PARAMS.tiers.length - 1)
    const n = customersForTier(i)
    return n + Math.ceil(n * PAPER_PARAMS.sparesFrac[i])
}

/** The deadline for a route, in the same units as par. */
export function deadlineFor (par, P = PAPER_PARAMS) { return par * P.tolerance }

/** Per-axis rank. Scores the ROUTE (coverage × accuracy), never the clock. */
export function letterFor (score, P = PAPER_PARAMS) {
    const r = P.rank
    if (!(score > 0)) return 'D'
    if (score >= r.S) return 'S'
    if (score >= r.A) return 'A'
    if (score >= r.B) return 'B'
    if (score >= r.C) return 'C'
    return 'D'
}

/**
 * Price a finished route.
 *
 * @param {number[]} accuracies  one q value per DELIVERED paper (throw.js accuracyScore, all > 0).
 *                               Misses are simply absent — a spent paper that hit nothing is not a
 *                               delivery with a score of zero, it is not a delivery.
 * @param {number}   customers   how many people were on the route
 * @param {number}   elapsed     seconds taken
 * @param {number}   par         seconds the tour is worth (computePar over the whole tour — ONE par)
 * @param {number}   dayTier     economy.js dayTier(day), frozen at accept with the rest of the terms
 * @returns {{coverage,meanAccuracy,effDeliveries,score,letter,flat,expedite,payout,complete}}
 */
export function scoreRoute (accuracies, customers, elapsed, par, dayTier = 1, P = PAPER_PARAMS) {
    const n = Math.max(0, customers | 0)
    const delivered = accuracies?.length ?? 0
    // effDeliveries is the payout's unit: "how many papers' worth did you actually place". A
    // dead-centre throw contributes a whole one, the worst legal throw 0.30 of one.
    let eff = 0
    for (const q of (accuracies ?? [])) eff += (q > 0 && isFinite(q)) ? q : 0

    const coverage     = n > 0 ? Math.min(1, delivered / n) : 0
    const meanAccuracy = delivered > 0 ? eff / delivered : 0
    const score        = coverage * meanAccuracy
    const letter       = letterFor(score, P)
    const complete     = n > 0 && delivered >= n

    // FLAT is per delivery, and it is derived rather than authored so the route tracks the same
    // economy everything else does. Degenerate par (a broken tour) pays zero rather than NaN-ing
    // the wallet — the same guard payoutFor() carries.
    const flat = (isFinite(par) && par > 0 && n > 0)
        ? ECONOMY_PARAMS.k * par * dayTier * P.paperW / n
        : 0

    // The bonus needs a real elapsed time AND a completed route. An unfinished route has no ratio
    // worth reading: you did not finish, so you cannot have finished early.
    let expedite = 0
    if (complete && isFinite(elapsed) && elapsed >= 0 && isFinite(par) && par > 0) {
        const ratio = elapsed / par
        const span  = P.expediteOn - P.expediteFull
        const f     = span > 0 ? (P.expediteOn - ratio) / span : 0
        expedite    = P.bonusMax * Math.min(1, Math.max(0, f))
    }

    const payout = Math.max(0, flat * eff * (1 + expedite))
    return { coverage, meanAccuracy, effDeliveries: eff, score, letter, flat, expedite, payout, complete }
}

/**
 * Did this route earn the next rung? Only a PERFECT one does: every customer got a paper inside
 * their circle before the bell. Accuracy does not enter it — Larry is judging whether you can
 * finish the route, not how pretty it was.
 */
export function advancesTier (result, customers) {
    return !!result?.complete && customers > 0 && result.coverage >= 1
}

// ── the tour ────────────────────────────────────────────────────────────────────────────────────
//
// A route is ONE route with many stops, not many routes. SM-INV-2 is the reason the whole tour is
// concatenated and priced by a single computePar() call: par is the oracle's statement about a
// stretch of road, and summing fifteen little pars would be summing fifteen standing starts.

const idKey = (id) => `${id[0]},${id[1]},${id[2]}`

// Stop count up to which the route's ORDER is solved exactly (Held-Karp, 2^n × n states). The
// ladder tops out at 15, so in practice every route is exact; the cap exists so a future tier
// cannot silently ask for a 2^n table.
const HELD_KARP_MAX = 15

/**
 * Dijkstra from one node over the straight-line graph metric — the same cheap metric the mission
 * planner uses to choose a path before anything is routed. Returns dist + parent chain to every
 * reachable node, so one run answers "which customer is nearest" AND "by which roads".
 */
function _dijkstraFrom (adj, startK) {
    const dist = new Map([[startK, 0]]), prev = new Map()
    const queue = [{ k: startK, d: 0 }]
    while (queue.length) {
        queue.sort((a, b) => a.d - b.d)
        const { k, d } = queue.shift()
        if (d > (dist.get(k) ?? Infinity)) continue
        for (const e of adj.get(k) || []) {
            const nd = d + e.w
            if (nd < (dist.get(e.to) ?? Infinity)) {
                dist.set(e.to, nd); prev.set(e.to, k); queue.push({ k: e.to, d: nd })
            }
        }
    }
    return { dist, prev }
}

/** Node keys from `startK` to `goalK` inclusive, or null when the chain does not reach back. */
function _pathBack (prev, startK, goalK) {
    const out = []
    for (let k = goalK, n = 0; k != null && n < 512; k = prev.get(k), n++) {
        out.unshift(k)
        if (k === startK) return out
    }
    return null
}

/**
 * Plan one route: pick this tier's customers, order them, route the whole thing, price it ONCE.
 *
 * Returns `{ customers, segments, poly, par, distance }` or null when the network cannot supply a
 * route (no Larry, no reachable customer, an edge the planner does not hold).
 *
 * COST: this is the expensive call — every edge the tour traverses is routed, and a fifteen-stop
 * route crosses many more edges than a point-to-point errand does. It runs once, behind Larry's
 * briefing cards, and never in the frame loop.
 *
 * @param {object} road      the planning RoadSystem (networkGraph + edgeParData)
 * @param {object} larry     the POI the route starts at — needs {aId, bId, s, x, z}
 * @param {Array}  allCust   every newspaper customer in the region (poiSystem.customers())
 * @param {number} want      how many of them this tier visits
 * @param {{x:number,z:number,r:number}|null} region  the story region wall, or null
 * @param {number} margin    keep the tour this far inside the wall
 */
export function planTour (road, larry, allCust, want, region = null, margin = 100) {
    if (!road || !larry || !allCust?.length || !(want > 0)) return null
    const g = road.networkGraph?.()
    if (!g?.edges?.length) return null

    const rMax = region ? region.r - margin : Infinity
    const inRegion = (p) => !region || Math.hypot(p.x - region.x, p.z - region.z) <= rMax
    const { posOf, idOf, adj } = buildGraphAdj(g, inRegion)

    // A STOP IS A POINT ON A ROAD — not a junction, and not a whole street either.
    //
    // Both of the wrong answers were tried. Snapping each customer to the nearest END of its edge
    // left five of six customers never approached (a house sits mid-edge and can be most of a 640 m
    // street from either junction). Making the stop the whole EDGE fixed that and bought a worse
    // problem: the route then had to drive every customer's street end to end, so it ran past the
    // porch to finish the tarmac and turned around to come back — the owner drove exactly that.
    //
    // The honest model is the one the oracle already speaks: a customer is an (edge, arc) point, so
    // SPLIT the graph at those points. Each carrying edge becomes a chain a → c₁ → … → cₖ → b with
    // arc-length weights, Larry included, and then plain shortest paths do the right thing — the
    // route reaches the porch and carries on in whichever direction is actually shorter. Nothing
    // downstream needs to know: par already integrates partial edges by arc RANGE.
    const edgeKeyOf = (a, b) => {
        const ka = idKey(a), kb = idKey(b)
        return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    }
    const edCache = new Map()
    const edgeData = (a, b) => {
        const key = edgeKeyOf(a, b)
        if (!edCache.has(key)) edCache.set(key, road.edgeParData(a, b) || null)
        return edCache.get(key)
    }

    // Gather the points to splice in, grouped by the edge that carries them.
    const onEdge = new Map()      // edge key → { aId, bId, ka, kb, pts: [{ id, s, cust }] }
    const addPoint = (q, cust) => {
        if (!q.aId || !q.bId) return false
        const ka = g.key(q.aId), kb = g.key(q.bId)
        if (!adj.has(ka) || !adj.has(kb)) return false       // edge crosses the region wall
        const ek = edgeKeyOf(q.aId, q.bId)
        if (!onEdge.has(ek)) onEdge.set(ek, { aId: q.aId, bId: q.bId, ka, kb, pts: [] })
        onEdge.get(ek).pts.push({ id: q.id, s: q.s, cust })
        return true
    }
    if (!addPoint(larry, null)) return null
    for (const c of allCust) addPoint(c, c)

    // THE SPLIT. Node degrees are read BEFORE the surgery — a spliced point is not a junction, and
    // an arrow raised at one would be the overlay inventing an intersection out of a house.
    const degOf = new Map()
    for (const [k, list] of adj) degOf.set(k, list.length)

    const ptKeyOf = new Map()     // point id → its node key in the split graph
    const ptInfo = new Map()      // node key → { ek, s } so segments can be cut at the right arc
    const edgeArc = new Map()     // edge key → { ed, off, L, kAtOff, kAtEnd }
    for (const [ek, e] of onEdge) {
        const ed = edgeData(e.aId, e.bId)
        if (!ed?.centerline) { onEdge.delete(ek); continue }
        const off = ed.arcOffset ?? 0
        const L = ed.arcLength ?? ed.centerline.length
        // Which node stands at arc `off`? Everything below is expressed in that orientation.
        const p0 = ed.centerline.pointAt(off)
        const pa = posOf.get(e.ka)
        const aAtOff = Math.hypot(p0.x - pa.x, p0.z - pa.z) < Math.hypot(p0.x - posOf.get(e.kb).x, p0.z - posOf.get(e.kb).z)
        const kAtOff = aAtOff ? e.ka : e.kb, kAtEnd = aAtOff ? e.kb : e.ka
        edgeArc.set(ek, { ed, off, L, kAtOff, kAtEnd })

        // Chain the points in arc order between the two real endpoints.
        const pts = e.pts
            .map(p => ({ ...p, s: Math.max(off, Math.min(off + L, p.s)) }))
            .sort((u, v) => u.s - v.s)
        const chain = [{ k: kAtOff, s: off }]
        pts.forEach((p, i) => {
            const k = `pt:${ek}:${i}`
            ptKeyOf.set(p.id, k)
            ptInfo.set(k, { ek, s: p.s })
            posOf.set(k, ed.centerline.pointAt(p.s))
            adj.set(k, [])
            chain.push({ k, s: p.s })
        })
        chain.push({ k: kAtEnd, s: off + L })

        // Unlink the two real endpoints from each other — the road between them now runs THROUGH
        // the spliced points, and leaving the direct link would offer a shortcut past the porch.
        for (const [x, y] of [[e.ka, e.kb], [e.kb, e.ka]]) {
            adj.set(x, (adj.get(x) || []).filter(l => l.to !== y))
        }
        // …and relink it as the chain. Weights are TRUE ARC here, where buildGraphAdj used the
        // straight-line chord: a mixed metric, and deliberately so — arc is the only thing that can
        // place a point partway along an edge, and routing an edge just to measure it would cost
        // more than the bias is worth. Arc ≥ chord, so a carrying edge is never under-priced.
        for (let i = 0; i < chain.length - 1; i++) {
            const u = chain[i], v = chain[i + 1]
            const w = Math.abs(v.s - u.s)
            adj.get(u.k).push({ to: v.k, w })
            adj.get(v.k).push({ to: u.k, w })
        }
    }

    const larryK = ptKeyOf.get(larry.id)
    if (!larryK) return null

    const searches = new Map()
    const searchFrom = (k) => {
        if (!searches.has(k)) searches.set(k, _dijkstraFrom(adj, k))
        return searches.get(k)
    }

    // WHICH customers this tier visits: grow the route outward from Larry, each next customer the
    // nearest by road to the last one taken.
    //
    // CHAINING, not "the k nearest to Larry" — that alternative was measured and is worse on both
    // counts. Nearest-to-Larry picks a STAR: four houses in four directions, which forces a return
    // through the middle between every pair (seed 6 tier 1: 5.94 km against the chain's 3.78 km for
    // the same four-customer route). Chaining follows the road outward and picks a run of houses,
    // which is shorter to drive AND is what a paper route actually looks like. The ladder still
    // nests — a tier takes a prefix of the same chain, so its people are all on the next tier's
    // route (SM-INV-12).
    const stops = allCust.filter(c => ptKeyOf.has(c.id))
    if (!stops.length) return null
    const remaining = stops.slice()
    const order = []
    let curK = larryK
    while (order.length < want && remaining.length) {
        const { dist } = searchFrom(curK)
        let bi = -1, bd = Infinity
        for (let i = 0; i < remaining.length; i++) {
            const d = dist.get(ptKeyOf.get(remaining[i].id)) ?? Infinity
            if (d < bd) { bd = d; bi = i }
        }
        if (bi < 0 || !isFinite(bd)) break               // the rest of the region is unreachable
        const c = remaining.splice(bi, 1)[0]
        order.push(c)
        curK = ptKeyOf.get(c.id)
    }
    if (!order.length) return null

    // …and in WHICH ORDER: the SHORTEST one, exactly.
    //
    // 2-opt was not enough, and the reason is worth keeping. On an open path with a pinned start,
    // reversing a sub-run cannot rotate the sequence — turning A,B,C,D into D,A,B,C is not a
    // reversal of anything — so the very case that hurts most (one stop on the far side that ought
    // to be visited first) is outside the neighbourhood 2-opt can search. Held-Karp is exact and,
    // at fifteen stops, cheap: 2^15 × 15 states is a few million operations once per route, behind
    // the briefing cards. Above the ladder's top rung it falls back to the greedy order rather than
    // trying to allocate a 2^n table.
    {
        const keys = order.map(c => ptKeyOf.get(c.id))
        const n = keys.length
        const legLen = (a, b) => searchFrom(a).dist.get(b) ?? Infinity
        if (n > 1 && n <= HELD_KARP_MAX) {
            const D = []                                   // D[i][j] between stops
            for (let i = 0; i < n; i++) {
                D.push([])
                for (let j = 0; j < n; j++) D[i].push(i === j ? 0 : legLen(keys[i], keys[j]))
            }
            const from = order.map(c => legLen(larryK, ptKeyOf.get(c.id)))
            const SZ = 1 << n
            const dp = new Float64Array(SZ * n).fill(Infinity)
            const par = new Int16Array(SZ * n).fill(-1)
            for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = from[j]
            for (let mask = 1; mask < SZ; mask++) {
                for (let j = 0; j < n; j++) {
                    if (!(mask & (1 << j))) continue
                    const cur = dp[mask * n + j]
                    if (!isFinite(cur)) continue
                    for (let k = 0; k < n; k++) {
                        if (mask & (1 << k)) continue
                        const nm = mask | (1 << k)
                        const cand = cur + D[j][k]
                        if (cand < dp[nm * n + k]) { dp[nm * n + k] = cand; par[nm * n + k] = j }
                    }
                }
            }
            const full = SZ - 1
            let endJ = -1, bestT = Infinity
            for (let j = 0; j < n; j++) if (dp[full * n + j] < bestT) { bestT = dp[full * n + j]; endJ = j }
            if (endJ >= 0 && isFinite(bestT)) {
                const seq = []
                for (let mask = full, j = endJ; j >= 0;) {
                    seq.unshift(order[j])
                    const pj = par[mask * n + j]
                    mask ^= (1 << j)
                    j = pj
                }
                order.splice(0, order.length, ...seq)
            }
        }
    }

    // The node walk: Larry's point, then each stop in turn, along shortest paths through the split
    // graph. Consecutive duplicates collapse — two customers on one stretch share the road between.
    const walk = [larryK]
    let fromK = larryK
    for (const c of order) {
        const toK = ptKeyOf.get(c.id)
        if (toK === fromK) continue
        const leg = _pathBack(searchFrom(fromK).prev, fromK, toK)
        if (!leg) return null
        for (let i = 1; i < leg.length; i++) walk.push(leg[i])
        fromK = toK
    }

    const segments = [], poly = []
    const pushPoly = (cl, s0, s1) => {
        const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 25))
        for (let j = 0; j <= n; j++) {
            const p = cl.pointAt(s0 + (s1 - s0) * (j / n))
            poly.push({ x: p.x, z: p.z })
        }
    }

    // Turn each hop into an arc RANGE. A hop is either a whole edge between two real nodes, or a
    // stretch of a split edge with a spliced point at one or both ends.
    for (let i = 0; i < walk.length - 1; i++) {
        const uk = walk[i], vk = walk[i + 1]
        const uInfo = ptInfo.get(uk), vInfo = ptInfo.get(vk)
        let ek = uInfo?.ek ?? vInfo?.ek ?? null
        if (uInfo && vInfo && uInfo.ek !== vInfo.ek) return null      // not a real hop
        let ed, off, L, kAtOff
        if (ek) {
            ({ ed, off, L, kAtOff } = edgeArc.get(ek))
        } else {
            const a = idOf.get(uk), b = idOf.get(vk)
            if (!a || !b) return null
            ed = edgeData(a, b)
            if (!ed?.centerline) return null
            off = ed.arcOffset ?? 0
            L = ed.arcLength ?? ed.centerline.length
            const p0 = ed.centerline.pointAt(off), pu = posOf.get(uk)
            kAtOff = Math.hypot(p0.x - pu.x, p0.z - pu.z)
                   < Math.hypot(ed.centerline.pointAt(off + L).x - pu.x, ed.centerline.pointAt(off + L).z - pu.z)
                ? uk : vk
        }
        const arcOf = (k, info) => info ? info.s : (k === kAtOff ? off : off + L)
        const s0 = arcOf(uk, uInfo), s1 = arcOf(vk, vInfo)
        if (Math.abs(s1 - s0) < 1e-6) continue
        segments.push({
            centerline: ed.centerline, gradeAt: ed.gradeAt, s0, s1, runKey: ed.key,
            cellA: onEdge.get(ek)?.aId ?? idOf.get(uk), cellB: onEdge.get(ek)?.bId ?? idOf.get(vk),
            // A spliced point is a house, not an intersection — degree 2 keeps the overlay from
            // raising a turn arrow on somebody's front lawn.
            endDeg: vInfo ? 2 : (degOf.get(vk) ?? 3),
        })
        pushPoly(ed.centerline, s0, s1)
    }
    if (!segments.length) return null

    // ONE par over the whole route (SM-INV-2).
    const { time, distance } = computePar(segments)
    if (!(time > 0)) return null

    const polyCum = [0]
    for (let i = 1; i < poly.length; i++) {
        polyCum.push(polyCum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z))
    }
    return { customers: order, segments, poly, polyCum, par: time, distance, edges: segments.length }
}

// ── the mission ─────────────────────────────────────────────────────────────────────────────────

/**
 * The paper route, as a mission. A SIBLING of MissionSystem, not a mode inside it: that system is
 * shaped end-to-end around one start and one end (and four gates pin its settle path), whereas this
 * one has no destination at all — it has an inventory, a bell, and fifteen porches.
 *
 * States:
 *   idle      nothing doing
 *   planning  the tour is being routed AND Larry is talking. Both have to finish before the offer
 *             can be shown, which is the point: the briefing is the cover for the routing.
 *   offer     the route, priced, with accept/decline
 *   staging   papers loaded, parked at Larry's, clock NOT running — same threshold a POI job uses
 *             (mission.js START_ZONE_R). You are on a pad facing whichever way you arrived, and the
 *             route should not be timing you while you turn around.
 *   running   papers in the truck, clock against the bell
 *   done      the result card, already settled
 *
 * Renderer-agnostic (the mission-panel pattern): it owns state, main.js owns the DOM.
 */
export class PaperRouteSystem {
    /**
     * @param {object} deps
     *   getRoad()    — the planning RoadSystem (a getter: main.js swaps instances on reseed)
     *   getPois()    — the PoiSystem (roster + customers)
     *   getRegion()  — the story region wall, or null
     *   getCar()     — the truck's position, for the start-zone threshold
     *   getTerms()   — economySystem.terms(); frozen at accept, exactly like a paid job
     *   getTargetR() — the delivery circle radius (POI_PARAMS.poiHouseTargetR)
     *   onSettle(payout, letter) — EconomySystem.settleFlat; the one money path
     *   onBriefing(done)  — play Larry's cards and call `done` when they are read
     *   onChange()   — repaint
     *   onEnd()      — the route is over: clear the papers off the lawns
     */
    constructor ({ getRoad, getPois, getRegion, getCar, getTerms, getTargetR,
                   onSettle, onBriefing, onChange, onEnd }) {
        this._getRoad = getRoad
        this._getPois = getPois
        this._getRegion = getRegion ?? (() => null)
        this._getCar = getCar ?? (() => null)
        this._getTerms = getTerms ?? (() => ({ dayTier: 1 }))
        this._getTargetR = getTargetR ?? (() => 5)
        this._onSettle = onSettle ?? (() => null)
        this._onBriefing = onBriefing ?? ((done) => done())
        this._onChange = onChange ?? (() => {})
        this._onEnd = onEnd ?? (() => {})

        this.state = 'idle'
        this.error = null
        this.route = null        // the planned tour (see planTour)
        this.run = null          // the live route — see accept()
        this.result = null
        this.giver = null        // the POI the route was taken from
        this._startZone = null   // the green threshold at Larry's while staging
        this._briefed = false
        this._planned = false
    }

    isActive () { return this.state !== 'idle' }
    /** True while the player is driving the route — the state everything else has to yield to. */
    isRunning () { return this.state === 'running' }
    /** Papers are aboard: staged at Larry's, or out on the route. */
    isCarrying () { return this.state === 'staging' || this.state === 'running' }

    /** The green threshold at Larry's while staging, or null. main.js draws it. */
    startZone () { return this.state === 'staging' ? this._startZone : null }

    /** How far past the start threshold the truck is; <= 0 means still inside it. */
    startZoneExitDist () {
        const z = this._startZone, car = this._getCar()
        if (!z || !car) return 0
        return Math.hypot(car.x - z.x, car.z - z.z) - z.r
    }

    /**
     * The route, in the shape the 2D map already draws a mission in ({start, end, poly}).
     *
     * The map drew every customer in the region but never the ROUTE, so there was no way — in game
     * or in a screenshot — to see which houses were on it or what line it took. That made a routing
     * complaint impossible to answer without rebuilding the region headlessly and guessing the
     * region centre. A route you cannot see is a route you cannot report a bug about.
     */
    markers () {
        // Whenever a route EXISTS — the offer included, exactly like MissionSystem.markers(). Seeing
        // the line before you accept is most of the point of an offer: it is the difference between
        // "nine customers, 7.9 km" as a number and as a shape you can decide about.
        if (this.state === 'idle' || !this.route?.poly?.length) return null
        return { start: this.route.poly[0], end: this.route.poly[this.route.poly.length - 1],
                 poly: this.route.poly }
    }

    /** The customers on THIS route — not the region's. Read-only. */
    routeCustomers () { return this.route?.customers ?? [] }
    /** Has this customer already had their paper? */
    isDelivered (id) { return !!this.run?.hits.has(id) }

    /** Papers still in the truck. Zero does not end the route; the last one LANDING does. */
    stock () { return this.run ? this.run.stock : 0 }
    hasStock () { return this.stock() > 0 }
    delivered () { return this.run ? this.run.hits.size : 0 }
    /** Seconds left before the bell. Negative is impossible — the bell ends the route. */
    timeLeft () { return this.run ? Math.max(0, this.run.deadline - this.run.elapsed) : 0 }

    /**
     * Take the route from Larry. Routing starts NOW and the briefing plays over the top of it: the
     * cards are two screens of reading the player has to do anyway, so the tour gets that long for
     * free (owner ruling). The offer is held until BOTH are finished, so a slow plan reads as a
     * long-winded uncle rather than as a hang.
     */
    open (giver) {
        if (this.state !== 'idle' || !giver) return
        this.giver = giver
        this.error = null
        this.result = null
        this.route = null
        this.run = null
        this._briefed = false
        this._planned = false
        this.state = 'planning'
        this._onChange()

        this._onBriefing(() => { this._briefed = true; this._maybeOffer() })
        // Off this tick so the briefing card is on screen before the routing blocks the thread.
        setTimeout(() => this._plan(), 0)
    }

    _plan () {
        if (this.state !== 'planning') return
        try {
            const pois = this._getPois()
            const larry = this.giver
            const want = customersForTier()
            this.route = planTour(this._getRoad(), larry, pois?.customers() ?? [], want,
                                  this._getRegion())
            if (!this.route) this.error = 'no route could be routed from here'
        } catch (e) {
            console.warn('[paper] tour planning failed', e)
            this.error = String(e && e.message || e)
            this.route = null
        }
        this._planned = true
        this._maybeOffer()
    }

    _maybeOffer () {
        if (this.state !== 'planning' || !this._planned || !this._briefed) return
        if (!this.route) { this.state = 'idle'; this._onChange(); return }
        this.state = 'offer'
        this._onChange()
    }

    /**
     * Take the papers. Terms freeze here, exactly like a paid job's do — but the CLOCK does not
     * start here: you are parked on Larry's pad. It starts when you drive out of the threshold.
     */
    accept () {
        if (this.state !== 'offer' || !this.route) return
        const terms = this._getTerms() || { dayTier: 1 }
        this.run = {
            stock:    stockForTier(),
            inFlight: 0,
            elapsed:  0,
            deadline: deadlineFor(this.route.par),
            dayTier:  terms.dayTier ?? 1,
            hits:     new Map(),      // customer id → q, one entry per delivered customer
        }
        this._startZone = { x: this.giver.x, z: this.giver.z, y: this.giver.y ?? 0, r: START_ZONE_R }
        this.state = 'staging'
        this._onChange()
    }

    /** Hand the papers back. */
    decline () {
        if (this.state !== 'offer') return
        this._reset()
    }

    /** Dismiss the result card. */
    dismiss () {
        if (this.state !== 'done') return
        this._reset()
    }

    /** Leaving the region / the run: drop everything WITHOUT settling. */
    abort () {
        if (this.state === 'idle') return
        this._reset()
    }

    _reset () {
        // The papers stay on the lawns until the route is PUT DOWN, not until it ends. Clearing
        // them at the bell would erase the trail of the route you just drove at the exact moment
        // the card asks you to look at how it went.
        const hadPapers = this.state === 'running' || this.state === 'done'
        this.state = 'idle'
        this.route = null
        this.run = null
        this.giver = null
        this.error = null
        this._startZone = null
        this._briefed = this._planned = false
        if (hadPapers) this._onEnd()
        this._onChange()
    }

    /** Clocked off the fixed step. Two comparisons and a counter — nothing else happens per frame. */
    update (dt) {
        if (this.state === 'staging') {
            // One distance check. Crossing the threshold is what starts the route — the same rule,
            // and the same green ring, a POI job uses.
            if (this.startZoneExitDist() > 0) { this.state = 'running'; this.run.elapsed = 0; this._onChange() }
            return
        }
        if (this.state !== 'running') return
        this.run.elapsed += dt
        if (this.run.elapsed >= this.run.deadline) this.finish()
    }

    /**
     * A paper leaves your hand. Returns false when there are none left — the caller must not throw.
     * Stock is spent HERE and not at the landing: a paper in the air is a paper you no longer have,
     * and a route that ended on the throw before the last one landed would be counting wrong.
     */
    takePaper () {
        if (this.state !== 'running' || this.run.stock <= 0) return false
        this.run.stock--
        this.run.inFlight++
        return true
    }

    /** Put a paper back: the solver produced no flight, so no throw happened. */
    refundPaper () {
        if (this.state !== 'running' || this.run.inFlight <= 0) return
        this.run.stock++
        this.run.inFlight--
    }

    /**
     * Score one landing against the route.
     *
     * Returns `{ customer, dist, q, credited, already }` for a paper that reached someone's circle,
     * `{ dist, q: 0 }` for a miss, or null when no route is running.
     *
     * NEAREST CUSTOMER ON THE ROUTE, credited ONCE. A second paper onto a porch that already has one
     * is not a second delivery — it is a paper spent, which is what the spares are for.
     */
    recordLanding (x, z) {
        if (this.state !== 'running') return null
        this.run.inFlight = Math.max(0, this.run.inFlight - 1)
        const R = this._getTargetR()
        let best = null, bd = Infinity
        for (const c of this.route.customers) {
            const d = Math.hypot(c.x - x, c.z - z)
            if (d < bd) { bd = d; best = c }
        }
        const q = best ? accuracyScore(bd, R) : 0
        let credited = false, already = false
        if (best && q > 0) {
            if (this.run.hits.has(best.id)) already = true
            else { this.run.hits.set(best.id, q); credited = true }
        }
        // The route ends on the LAST PAPER, not on the last throw: the bell and the inventory are
        // the only two ways out, and an empty truck with one still in the air is neither yet.
        if (this.run.hits.size >= this.route.customers.length
            || (this.run.stock <= 0 && this.run.inFlight <= 0)) {
            const out = { customer: best, dist: bd, q, credited, already }
            this.finish()
            return out
        }
        return { customer: best, dist: bd, q, credited, already }
    }

    /**
     * The bell, the empty truck, or the last porch. Prices the route, settles it through the one
     * money path, and moves the ladder.
     */
    finish () {
        if (this.state !== 'running') return
        const n = this.route.customers.length
        const accuracies = [...this.run.hits.values()]
        const r = scoreRoute(accuracies, n, this.run.elapsed, this.route.par, this.run.dayTier)
        const settled = this._onSettle(Math.round(r.payout), r.letter) || {}
        const advanced = advancesTier(r, n)
        if (advanced && runPaper.tier < PAPER_PARAMS.tiers.length - 1) runPaper.tier++
        runPaper.routesRun++
        this.result = {
            ...r,
            customers: n,
            delivered: accuracies.length,
            elapsed:   this.run.elapsed,
            par:       this.route.par,
            payout:    settled.payout ?? Math.round(r.payout),
            points:    settled.points ?? 0,
            advanced,
            nextTier:  advanced ? customersForTier() : null,
        }
        this.state = 'done'
        this.run = null
        this._onChange()
    }
}
