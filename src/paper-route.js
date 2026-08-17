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
// this route prices itself, and SM-INV-4 is left untouched rather than bent.
//
// The consequence that matters: this is the income floor (missions.md, ratified 2026-08-05). Papers
// you delivered are money you keep. There is no completion multiplier anywhere in here, because a
// floor that pays nothing for a half-finished route is not a floor.
//
// ── ACCURACY PAYS, THE CLOCK GRADES [ratified + implemented 2026-08-14] ─────────────────────────
//
// Accuracy scales the per-delivery rate and NOTHING else. The rank is the par ratio through the
// same gradeRun() every other mission type uses — par is the C/D boundary (SM-INV-3 as re-anchored
// 2026-08-16; this REVERSES the 2026-08-14 "par is a B, and B contains par" confirmation, owner's
// call, applied game-wide), the day ramp tightens the good letters — gated on full coverage,
// because you can always be quick by skipping people.
//
// The shape this buys: "slow and careful" and "fast and ragged" pay about the same, so both are
// real ways to drive a round rather than one dominating. That equivalence is what fixes bonusMax at
// 0.70 and forces the bonus to be ADDITIVE on the full flat — see scoreRoute.
//
// It replaced coverage × meanAccuracy, which made "how well did you throw" and "how well did you
// do" the same question and left the clock nothing to say.

import { ECONOMY_PARAMS } from './economy.js'
import { buildGraphAdj, START_ZONE_R, buildRunExport, TRACE_DIV } from './mission.js'
import { computePar, gradeRun, RANK_THRESHOLDS_DEFAULT } from './par.js'
// The accuracy law is throw.js's, not restated here. It is one line of algebra and that is exactly
// why it must have one home: a second copy is a second thing to keep in step with the gate.
import { accuracyScore } from './throw.js'

export const PAPER_PARAMS = {
    // The route ends at par × this. Soft by construction: under flat rate the bell only stops you
    // earning more, so it costs the papers still in the truck and nothing already banked.
    //
    // [1.2 → 1.0, owner 2026-08-16 — the par re-anchor.] THE BELL IS PAR. Par now means "the
    // slowest you can drive without failing", so the one honest place for a hard timer is exactly
    // there: run the clock out and you have, by definition, failed the standard. This is also what
    // licenses the countdown on screen — SM-INV-3 forbids par-as-countdown on the DEFAULT mission
    // but explicitly permits an authored, diegetic timer on a mission type that carries one.
    tolerance:   1.0,

    // The ladder Larry walks you up, one rung per PERFECT route (owner, 2026-08-05). Run-layer, so
    // it is re-earned every run like everything else.
    tiers:       [4, 9, 12, 15],
    // …and how far out each rung reaches, in metres from the region centre (owner, 2026-08-11).
    // The route grows in BOTH axes: more customers AND a wider neighbourhood, so rung four is a
    // different shape of drive and not just a longer list. Placement reads this table — poi.js's
    // buildHouses fills the pool ring by ring so every rung is actually SERVABLE — which is why it
    // lives here, with the ladder, and not as a second copy in POI_PARAMS.
    tierR:       [1000, 1500, 2000, 2000],
    // Spares as a fraction of the customer count, per tier: generous on the first route, thin on the
    // last (owner). A beginner's four-house route tolerates four fluffed throws; the fifteen-house
    // route tolerates four and a half, which is the difficulty curve stated as inventory.
    sparesFrac:  [1.00, 0.75, 0.50, 0.30],

    // FLAT is anchored to par so the floor survives the 20-day cost ramp instead of decaying into
    // irrelevance by day 15. paperW is how poor a perfect route at par is: 0.6 = "reliably poor",
    // which is what an income floor is supposed to feel like.
    //
    // [RE-ANCHORED 2026-08-16, then RAISED 2026-08-17.] It used to mean "0.6 × the margin line AT
    // PAR", and the margin line at par used to be one full day-tier unit — so the two readings were
    // the same number. They are not any more: par pays m = 0.5. It is now a fraction of a
    // **day-tier unit** (the break-even payment).
    //
    // 0.60 → 0.82 [owner, 2026-08-17]: **the paper route is no longer meant to be poor.** The owner
    // reframed it as *distance + tip* — it should out-earn a point-to-point job over the same road
    // by ~20%, with accuracy as the tip. Measured before the change, the card the owner sent (4/4,
    // 69% accuracy, ratio 0.653) paid **0.61× what a POI job over the same par would have**. The
    // new value is solved from a stated anchor: a PERFECT round driven at the break-even pace
    // (ratio 0.80) pays 1.20 × the margin line at that same pace —
    //     paperW × (1 + bonusMax·f(0.80)) = 1.20 × m(0.80)
    //     paperW × (1 + 0.70 × 0.667)     = 1.20 × 1.00     ⇒ paperW = 0.818
    //
    // ⚠ THE PREMIUM IS NOT FLAT ACROSS THE RANGE, and cannot be made flat by this number alone.
    // The margin line keeps climbing as the driver gets faster, while the paper route's time bonus
    // SATURATES at `expediteFull` (ratio 0.70) — so the premium is ~1.2× around break-even and
    // decays for a quick driver, reaching roughly parity by ratio 0.65. Making it a true flat +20%
    // everywhere means having the expediency bonus track the margin line instead of capping, which
    // is a redesign of the paper payout curve and an owner decision, not a tuning tweak.
    paperW:      0.82,

    // The expediency bonus — the ONLY place time enters the payout. Gated on a completed route:
    // you cannot finish early without finishing.
    //
    // IT STARTS AT THE BELL, not at par (owner, 2026-08-15). There is no `expediteOn` any more,
    // because the ratio it would hold is `tolerance` and two numbers that must be equal are one
    // number waiting to drift: the payout reaching zero exactly where the route ends is now
    // structural rather than a coincidence.
    //
    // [2026-08-16] The bell IS par now, so "starts at the bell" and "starts at par" have become the
    // same sentence, and the drift risk the paragraph above worries about is gone by construction —
    // there is only one number left. The owner accepted the consequence explicitly: **a route
    // driven exactly at par settles $0 of time money** and keeps only its per-throw spot earnings.
    // A bare pass is a bare pass.
    expediteFull:0.70,   // …and where it maxes out
    // NOT A FREE KNOB — the owner's equivalence fixes it. A rim-scraper (mean q 0.30) blasting the
    // round must earn about what a methodical driver (mean q 1.0) earns at par. With the bell at
    // par the bonus is fully unpaid there — f(1.0) = (1.00 − 1.00) / (1.00 − 0.70) = 0 — so:
    //     1.0 + 0·B  =  0.3 + 1.0·B     ⇒     B = 0.70
    // which is exactly the value that held before the bonus was moved to the bell in the first
    // place. The 7/6 of 2026-08-15 was an artefact of the bell sitting at 1.2·par; putting the bell
    // back on par returns the equivalence to its original solution. (The module header up top never
    // stopped saying 0.70 — it was stale for a day and is now correct again.)
    // Applied to the FULL flat (n × FLAT), never to the accuracy-scaled sum — see scoreRoute.
    bonusMax:    0.70,
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

/** How far from the region centre this tier's route reaches. */
export function radiusForTier (tier = runPaper.tier) {
    const r = PAPER_PARAMS.tierR
    return r[Math.min(Math.max(0, tier | 0), r.length - 1)]
}

/**
 * The rungs as placement sees them: cumulative (radius, count) quotas, ascending by radius, one
 * entry per DISTINCT radius carrying that ring's largest count. [4@1km, 9@1.5km, 12@2km, 15@2km]
 * collapses to [4@1km, 9@1.5km, 15@2km] — the two rungs that share a ring share one quota.
 */
export function houseRungs (P = PAPER_PARAMS) {
    const by = new Map()
    for (let i = 0; i < P.tiers.length; i++) {
        const r = P.tierR[Math.min(i, P.tierR.length - 1)]
        by.set(r, Math.max(by.get(r) ?? 0, P.tiers[i]))
    }
    return [...by].sort((a, b) => a[0] - b[0]).map(([r, n]) => ({ r, n }))
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

/**
 * What ONE paper is worth at full accuracy — the per-delivery flat rate.
 *
 * Extracted from scoreRoute rather than duplicated, because the HUD now quotes it to the player the
 * instant a paper lands (owner, 2026-08-14) and a second copy of this expression is a second thing
 * to keep in step with the settlement. Derived, never authored, so the route tracks the same
 * economy as everything else; degenerate par pays zero rather than NaN-ing the wallet.
 */
export function flatPerPaper (par, customers, payTier = 1, P = PAPER_PARAMS) {
    const n = Math.max(0, customers | 0)
    return (isFinite(par) && par > 0 && n > 0)
        ? ECONOMY_PARAMS.k * par * payTier * P.paperW / n
        : 0
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
 * @param {number}   payTier     economy.js terms().payTier — dayTier × regionTier, frozen at accept
 *                               with the rest of the terms (renamed from `dayTier` 2026-08-17 when
 *                               the region multiplier landed; it is no longer the day alone)
 * @returns {{coverage,meanAccuracy,effDeliveries,score,letter,flat,expedite,payout,complete}}
 */
export function scoreRoute (accuracies, customers, elapsed, par, payTier = 1, P = PAPER_PARAMS,
                            thresholds = RANK_THRESHOLDS_DEFAULT) {
    const n = Math.max(0, customers | 0)
    const delivered = accuracies?.length ?? 0
    // effDeliveries is the payout's unit: "how many papers' worth did you actually place". A
    // dead-centre throw contributes a whole one, the worst legal throw 0.30 of one.
    let eff = 0
    for (const q of (accuracies ?? [])) eff += (q > 0 && isFinite(q)) ? q : 0

    const coverage     = n > 0 ? Math.min(1, delivered / n) : 0
    const meanAccuracy = delivered > 0 ? eff / delivered : 0
    const score        = coverage * meanAccuracy
    const complete     = n > 0 && delivered >= n

    // THE CLOCK GRADES [ratified 2026-08-14]. The letter is the par ratio through the SAME
    // gradeRun() every other mission type uses — par is the C/D boundary (re-anchored 2026-08-16),
    // and the day ramp tightens the good letters — so a paper route's B means what a POI job's B
    // means. That shared meaning is the point, and it is why the re-anchor had to reverse the
    // 2026-08-14 "par is a B" ruling HERE too rather than leaving this mission type behind on the
    // old convention. It used to be coverage × meanAccuracy,
    // which made "how well did you throw" and "how well did you do" the same question and left
    // nothing for the clock to say.
    //
    // PAR SCALES WITH THE JOB YOU ACTUALLY DID (owner, 2026-08-15): deliver half the papers and you
    // are measured against half the par — "closer to half of par" — instead of being handed a flat D.
    //
    // The flat D it replaces was too blunt. It graded a round that dropped one paper of fifteen the
    // same as one that dropped fourteen, and it made the letter stop being about driving the moment
    // anything went wrong. Scaling keeps the clock honest instead: skipping people no longer buys
    // time, because it shrinks the clock you are held to by exactly as much. Nine of nine at par and
    // three of nine in a third of par both come out at ratio 1.0.
    //
    // Complete routes are untouched (coverage 1 ⇒ parEff = par), so B still contains par.
    const parEff = par * coverage
    const letter = gradeRun(elapsed, parEff, thresholds).letter

    // FLAT is per delivery, and it is derived rather than authored so the route tracks the same
    // economy everything else does. Degenerate par (a broken tour) pays zero rather than NaN-ing
    // the wallet — the same guard payoutFor() carries.
    const flat = flatPerPaper(par, n, payTier, P)

    // The bonus needs a real elapsed time AND a completed route. An unfinished route has no ratio
    // worth reading: you did not finish, so you cannot have finished early.
    let expedite = 0
    if (complete && isFinite(elapsed) && elapsed >= 0 && isFinite(par) && par > 0) {
        const ratio = elapsed / par
        const span  = P.tolerance - P.expediteFull
        const f     = span > 0 ? (P.tolerance - ratio) / span : 0
        expedite    = P.bonusMax * Math.min(1, Math.max(0, f))
    }

    // TWO INCOME STREAMS, PAID AT DIFFERENT TIMES [owner, 2026-08-15].
    //
    //   accuracy -> `spot`, banked THE MOMENT each paper lands (EconomySystem.addSpot)
    //   time     -> `payout`, settled at the bell
    //
    // So the end-of-mission payout is a pure function of the clock, and accuracy is fully decoupled
    // from it — not because accuracy stopped paying, but because it was already paid. The totals
    // are unchanged; what moved is WHEN. That is what makes the throw read-out honest: the dollars
    // it quotes are in the wallet before the paper stops rolling.
    //
    // The split also keeps the owner's equivalence intact, since it is a statement about the total:
    // a rim-scraper (mean q 0.30) blasting the round and a methodical driver (mean q 1.0) at par
    // both come out at flat x n. The bonus is ADDITIVE on the full flat for that reason — the same
    // equivalence expressed multiplicatively needs 233%, which is not a tunable number.
    const spot   = Math.max(0, flat * eff)
    const payout = Math.max(0, flat * n * expedite)
    return { coverage, meanAccuracy, effDeliveries: eff, score, letter, flat, expedite,
             spot, payout, total: spot + payout, complete }
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

// FEAT-63: masks between yields in the Held-Karp loop. Measured at fifteen stops the whole loop is
// ~14 ms over 32768 masks — 0.43 µs each — so 1024 masks is a ~0.45 ms slice. Small enough that the
// pump's budget is honoured rather than blown by one indivisible chunk, large enough that the yield
// itself is noise. Must be a power of two: the loop tests it with a bitmask.
const HK_CHUNK = 1024

/**
 * The Held-Karp scratch tables, leased rather than allocated (FEAT-63).
 *
 * At fifteen stops these are Float64Array(32768 × 15) ≈ 3.9 MB and Int16Array ≈ 1 MB. Allocating
 * five megabytes in the middle of a drive is a hitch in its own right and hands the collector a
 * large short-lived object immediately afterwards, which is the second hitch.
 *
 * There is normally exactly one lease and every job reuses it. The busy flag exists for the one
 * case that would otherwise corrupt a route silently: a synchronous `planTour` (a new route being
 * accepted) running while a sliced re-plan sits suspended mid-DP. That cannot happen today — a
 * re-plan is cancelled when the route ends — but "cannot happen today" is how this class of bug
 * ships, so the second caller gets its own tables instead of scribbling on the first one's.
 */
// FEAT-63 re-plan tuning. All run-layer, none of it touches worldgen or par. An object rather
// than consts so the debug panel can put a dial on them (FEAT-61 Phase F) — offM and staleM in
// particular were reasoned about, never felt.
export const RR_PARAMS = {
    pollS:    0.25,   // s between trigger polls — the checks are cheap but not free
    offM:     45,     // m off the line before it counts as off the line. Comfortably past
                      // the polyline's own ~25 m vertex spacing (see _latToLine) and past
                      // any lay-by, so a wide corner cannot trip it.
    offS:     2.0,    // …and for this long. A wrong turn, not a wobble.
    minShowS: 0.4,    // minimum RECALCULATING time. The job takes ~120 ms, so without this
                      // the indicator would flash rather than inform.
    staleM:   50,     // m of drift that invalidates a finished job. Should never fire.
    snapM:    200,    // queryNearest search radius for the truck's own road point
}

const _now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const _hkPool = []
function _leaseHkTables (SZ, n) {
    const need = SZ * n
    let best = null
    for (const t of _hkPool) {
        if (!t.busy && t.dp.length >= need) { best = t; break }
    }
    if (!best) {
        best = { dp: new Float64Array(need), par: new Int16Array(need), busy: false }
        _hkPool.push(best)
    }
    best.busy = true
    return best
}

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
 * @param {number} ringR     this tier's reach from the region centre (radiusForTier). The rungs
 *                           widen the neighbourhood as well as lengthening the list, and the ring
 *                           is applied HERE rather than at the call site so it is one rule that
 *                           the tour, the gate and any future re-plan all share.
 */
export function planTour (road, larry, allCust, want, region = null, margin = 100, ringR = Infinity) {
    const it = planTourJob(road, larry, allCust, want, region, margin, ringR)
    let r = it.next()
    while (!r.done) r = it.next()
    return r.value
}

/**
 * The planner itself, as a RESUMABLE job (FEAT-63).
 *
 * There is exactly one ordering algorithm in this file and this is it; `planTour` above is a thin
 * drain over the same generator. That is the whole reason the sliced re-plan is a small feature
 * rather than a risky one — a second planner would be free to drift from this one, and the gate
 * that compares them would be pinning two implementations instead of one.
 *
 * The yields are placed where the TIME is, and nowhere else. Measured on seed 6 the graph surgery
 * and the polyline build are sub-millisecond, so slicing them would buy nothing but state to get
 * wrong; the Dijkstras are ~0.1-0.2 ms each; and the Held-Karp mask loop is the whole 14 ms at
 * fifteen stops. So: one yield per Dijkstra, and one every HK_CHUNK masks. A single `next()` is
 * therefore always well under half a millisecond, which is what lets the pump honour a small
 * budget honestly rather than overshooting it by one enormous chunk.
 *
 * Same arguments, same return value as planTour.
 */
export function* planTourJob (road, larry, allCust, want, region = null, margin = 100, ringR = Infinity) {
    if (!road || !larry || !allCust?.length || !(want > 0)) return null
    if (region && isFinite(ringR)) {
        allCust = allCust.filter(c => Math.hypot(c.x - region.x, c.z - region.z) <= ringR)
        if (!allCust.length) return null
    }
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
    yield        // the surgery is done and it was sub-ms; everything expensive is below

    const searches = new Map()
    // `fresh` reports whether this call actually ran a search, so the loops below can yield only
    // when work happened rather than once per lookup.
    let fresh = false
    const searchFrom = (k) => {
        fresh = !searches.has(k)
        if (fresh) searches.set(k, _dijkstraFrom(adj, k))
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
        if (fresh) yield
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
                if (fresh) yield                           // one row = at most one Dijkstra
            }
            const from = order.map(c => legLen(larryK, ptKeyOf.get(c.id)))
            const SZ = 1 << n
            // Borrowed, not allocated (FEAT-63): at fifteen stops these are ~3.9 MB + ~1 MB, and
            // allocating that mid-drive is its own hitch plus the GC event that follows it.
            const lease = _leaseHkTables(SZ, n)
            const { dp, par } = lease
            dp.fill(Infinity, 0, SZ * n)
            par.fill(-1, 0, SZ * n)
            try {
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
                    // THE yield that matters — this loop is the entire 14 ms at fifteen stops.
                    if ((mask & (HK_CHUNK - 1)) === 0) yield
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
            } finally {
                // finally, not a plain call: a job the pump abandons is closed by the generator
                // protocol (`.return()`), which runs this and hands the tables back. Without it an
                // abandoned re-plan would strand the lease and every later job would allocate.
                lease.busy = false
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
        const prev = searchFrom(fromK).prev
        if (fresh) yield
        const leg = _pathBack(prev, fromK, toK)
        if (!leg) return null
        for (let i = 1; i < leg.length; i++) walk.push(leg[i])
        fromK = toK
    }

    // Which split-graph nodes are CUSTOMERS — so the segment that arrives at one can be marked as a
    // place the reference driver pulls up (par.js `stop`). Larry and the truck's own origin are
    // spliced points too and are deliberately NOT in here: you do not throw a paper at either.
    // A porch the route passes TWICE is one stop, not two: you throw on the first pass and drive
    // through on the way back. Consumed as the segments are built, so only the first arrival is
    // charged — without this a route that doubles back priced 13 stops for 12 customers.
    const custKeys = new Set(order.map(c => ptKeyOf.get(c.id)))

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
            // …but it IS a place you stop, and par has to know that even though the overlay must
            // not. The two flags say different things about the same point on purpose.
            stop: custKeys.delete(vk),
        })
        pushPoly(ed.centerline, s0, s1)
    }
    if (!segments.length) return null

    // ONE par over the whole route (SM-INV-2).
    // ONE par over the whole route (SM-INV-2) — and the reference driver COMES TO REST at every
    // porch, because the segments carry `stop`. Without that the oracle priced a fifteen-stop round
    // as an uninterrupted 73 km/h blast and the expediency bonus was unreachable by construction
    // (owner-reported 2026-08-14). No extra reference is needed: the stop is a property of the
    // route, so PAR_REF stays the one shared reference driver.
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
     *   onSettle(payout, letter) — EconomySystem.settleFlat; the end-of-route money path
     *   onSpot(amount)  — EconomySystem.addSpot; accuracy money, banked as each paper lands
     *   onBriefing(done)  — play Larry's cards and call `done` when they are read
     *   setMapOpen(open)  — show/hide the 2D map, framed on the route (the offer's preview)
     *   onChange()   — repaint
     *   onEnd()      — the route is over: clear the papers off the lawns
     */
    constructor ({ getRoad, getPois, getRegion, getCar, getSeed, getTerms, getTargetR,
                   onSettle, onSpot, onBriefing, setMapOpen, onChange, onEnd }) {
        this._onSpot = onSpot ?? (() => 0)
        this._setMapOpen = setMapOpen ?? (() => {})
        this._getRoad = getRoad
        this._getPois = getPois
        this._getRegion = getRegion ?? (() => null)
        this._getCar = getCar ?? (() => null)
        // getSeed() — world seed, for the export's per-500 m road-quality column (2026-08-17).
        this._getSeed = getSeed ?? (() => 0)
        this._getTerms = getTerms ?? (() => ({ payTier: 1 }))
        this._getTargetR = getTargetR ?? (() => 5)
        this._onSettle = onSettle ?? (() => null)
        this._onBriefing = onBriefing ?? ((done) => done())
        this._onChange = onChange ?? (() => {})
        this._onEnd = onEnd ?? (() => {})

        this.state = 'idle'
        this.error = null
        this.route = null        // THE CONTRACT: the tour as priced. customers, par, deadline.
        this.guide = null        // FEAT-63: THE LINE TO DRIVE, re-planned. Never carries par.
        this.run = null          // the live route — see accept()
        this.result = null
        this.giver = null        // the POI the route was taken from
        this._startZone = null   // the green threshold at Larry's while staging
        this._briefed = false
        this._planned = false

        // FEAT-63 re-plan state.
        this._rr = null          // the live sliced job, or null
        this._clock = 0          // seconds since the system last reset; drives the indicator only
        this._rrHideAt = 0       // …and the indicator's minimum display
        this._offRouteT = 0      // how long we have been off the line, in seconds
        this._checkT = 0         // trigger-poll accumulator
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
        const r = this.line()
        if (this.state === 'idle' || !r?.poly?.length) return null
        return { start: r.poly[0], end: r.poly[r.poly.length - 1], poly: r.poly }
    }

    /**
     * THE LINE THE PLAYER SHOULD DRIVE — the re-planned guide if there is one, otherwise the tour
     * as priced. This is what the GPS points along and what the 2D map draws.
     *
     * Deliberately NOT `this.route`, and the split is the whole safety property of FEAT-63:
     * `route` is the CONTRACT (who is on the round, what par is, when the bell rings) and nothing
     * in the re-plan path may touch it, while `guide` is only a shape to follow. Scoring, the
     * deadline and the result card all read `route`; the renderers all read this.
     */
    /**
     * FEAT-30 calibration export for a finished paper round — the same `rangersim-run-export/2`
     * shape a point-to-point job produces, through the same shared builder (`buildRunExport`), so
     * both mission types land in one corpus and `test/calibrate-par.mjs` needs no special case.
     *
     * Why this exists [owner, 2026-08-17]: there was no way to save a paper round at all, so the
     * report that the route "seems too easy time-wise" could not be checked against data — par
     * cannot be fitted to a mission type that leaves no record.
     *
     * `extra.paper` carries what only this mission type knows and what a par fit actually needs.
     * The round is priced with a full STOP at every porch (planTour sets `stop`), so customer count
     * is a first-class term in its par rather than dressing.
     */
    exportRun (note = '') {
        const e = this._lastExport, r = this.result
        if (!e || !r) return null
        const ratio = r.par > 0 ? r.elapsed / r.par : 0
        return buildRunExport({
            note,
            segs:  e.segments,
            result: {
                elapsed_s: +r.elapsed.toFixed(2), par_s: +r.par.toFixed(2),
                ratio: +ratio.toFixed(3), letter: r.letter,
                margin_s: +(r.par - r.elapsed).toFixed(2),
            },
            edges: e.edges,
            start: { x: +e.start.x.toFixed(1), z: +e.start.z.toFixed(1), heading_rad: 0 },
            end:   e.customers[e.customers.length - 1] ?? { x: 0, z: 0 },
            trace: e.trace,
            seed:  this._getSeed(),
            extra: {
                mission_type: 'paper_route',
                paper: {
                    tier:          runPaper.tier + 1,
                    customers:     r.customers,
                    delivered:     r.delivered,
                    coverage:      +r.coverage.toFixed(3),
                    mean_accuracy: +r.meanAccuracy.toFixed(3),
                    expedite:      +r.expedite.toFixed(3),
                    complete:      !!r.complete,
                    // The letter is graded against par × coverage (owner, 2026-08-15), so record the
                    // EFFECTIVE par it actually came from — otherwise a refit grades a half-finished
                    // round against the whole round's clock and concludes par is far too generous.
                    par_effective_s: +(r.par * r.coverage).toFixed(2),
                    payout:        r.payout,
                    spot:          r.spot,
                },
            },
        })
    }

    line () { return this.guide ?? this.route }

    /** The customers on THIS route — not the region's. Read-only. */
    routeCustomers () { return this.route?.customers ?? [] }
    /** Has this customer already had their paper? */
    isDelivered (id) { return !!this.run?.hits.has(id) }

    /**
     * What a paper landed at accuracy `q` just earned, in dollars (FEAT-61, owner 2026-08-14).
     *
     * The EXPEDIENCY BONUS IS NOT IN HERE, and that is the honest choice rather than an omission:
     * the bonus depends on when you finish, so quoting a share of it mid-route would be a promise
     * the route can still take back. This is the money already banked for that throw — which is
     * exactly the thing accuracy buys, and the reason it is worth showing the instant it lands.
     */
    paperValue (q) {
        if (!this.run || !this.route) return 0
        return flatPerPaper(this.route.par, this.route.customers.length, this.run.payTier) * q
    }

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
        this.guide = null
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
                                  this._getRegion(), 100, radiusForTier())
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
        // The preview. Fires here, not on arrival at the pad: before this moment there is nothing
        // to look at, because the tour is still routing behind Larry's briefing cards.
        this._setMapOpen(true)
        this._onChange()
    }

    /**
     * Take the papers. Terms freeze here, exactly like a paid job's do — but the CLOCK does not
     * start here: you are parked on Larry's pad. It starts when you drive out of the threshold.
     */
    accept () {
        if (this.state !== 'offer' || !this.route) return
        const terms = this._getTerms() || { payTier: 1 }
        this.run = {
            stock:    stockForTier(),
            inFlight: 0,
            elapsed:  0,
            deadline: deadlineFor(this.route.par),
            payTier:  terms.payTier ?? terms.dayTier ?? 1,   // dayTier fallback: pre-region callers
            // Frozen WITH the day tier, for the same reason (FEAT-53): the rank ramp is part of the
            // deal you accepted. Now that the letter IS the par ratio, a route straddling midnight
            // would otherwise be graded on tomorrow's tighter thresholds.
            thresholds: terms.thresholds ?? RANK_THRESHOLDS_DEFAULT,
            hits:     new Map(),      // customer id → q, one entry per delivered customer
            trace:    [],             // driven-trace rows at TRACE_HZ (FEAT-30 calibration export)
            traceTick: 0,
        }
        this._startZone = { x: this.giver.x, z: this.giver.z, y: this.giver.y ?? 0, r: START_ZONE_R }
        this.state = 'staging'
        this._setMapOpen(false)     // you have seen it; now drive
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
        // Declining or dismissing takes the preview down with the offer that raised it.
        if (this.state === 'offer') this._setMapOpen(false)
        this._cancelReplan()
        this._offRouteT = this._checkT = 0
        this._rrHideAt = 0
        this.state = 'idle'
        this.route = null
        this.guide = null
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
        this._clock += dt
        if (this.state === 'staging') {
            // One distance check. Crossing the threshold is what starts the route — the same rule,
            // and the same green ring, a POI job uses.
            if (this.startZoneExitDist() > 0) { this.state = 'running'; this.run.elapsed = 0; this._onChange() }
            return
        }
        if (this.state !== 'running') return
        this.run.elapsed += dt
        // Driven trace at TRACE_HZ, downsampled off the 60 Hz step — the same sampler a POI job
        // runs, so the two mission types produce directly comparable calibration exports. Cheap:
        // a 4-minute round is ~2400 rows, small next to the topology array.
        if ((this.run.traceTick++ % TRACE_DIV) === 0) {
            const c = this._getCar()
            if (c) this.run.trace.push([
                +this.run.elapsed.toFixed(2), +c.x.toFixed(2), +(c.y ?? 0).toFixed(2), +c.z.toFixed(2),
                +(c.speed ?? 0).toFixed(2), +(c.heading ?? 0).toFixed(3),
                +(c.throttle ?? 0).toFixed(2), +(c.brake ?? 0).toFixed(2), +(c.steer ?? 0).toFixed(3),
            ])
        }
        this._replanTick(dt)
        if (this.run.elapsed >= this.run.deadline) this.finish()
    }

    // ── FEAT-63: the GPS always shows the shortest way to finish ────────────────────────────────
    /**
     * WHY THE GUIDE IS ALLOWED TO DISAGREE WITH PAR (owner, 2026-08-11).
     *
     * Par is frozen at accept and priced over the tour as planned (SM-INV-2). The moment the player
     * leaves that tour it stops being a route they are driving and becomes only a number they are
     * measured against — and the shortest way to finish from where they ACTUALLY are is therefore
     * their best remaining chance of coming in under it. Guiding them faithfully back along a line
     * they have already abandoned would be withholding help from someone who is already behind.
     *
     * So the guide re-plans and par never does. The two are not in tension; the second is the
     * reason for the first.
     */
    isRerouting () { return (!!this._rr && !this._rr.quiet) || this._clock < this._rrHideAt }

    /**
     * Is there a job to pump? Distinct from isRerouting() on purpose: a delivery's re-plan is
     * QUIET — it still has to be computed, but it is bookkeeping rather than news, and flashing
     * RECALCULATING after every paper would train the player to ignore the one time it matters.
     */
    hasReplan () { return !!this._rr }

    /**
     * Spend up to `budgetMs` of this frame's spare time on the live re-plan. Returns true while a
     * job is still outstanding. main.js calls this with whatever the frame did not use.
     *
     * At least one `next()` runs per call even on a zero budget, so a permanently loaded frame
     * cannot starve the job — it only slows it. And because a single `next()` is bounded (one
     * Dijkstra, or HK_CHUNK masks — both well under half a millisecond at fifteen stops), honouring
     * a small budget does not depend on the caller guessing the chunk size right.
     */
    pumpReroute (budgetMs = 2) {
        if (!this._rr) return false
        const t0 = _now()
        let r
        do { r = this._rr.it.next() } while (!r.done && _now() - t0 < budgetMs)
        if (!r.done) return true

        const job = this._rr
        this._rr = null
        const route = r.value

        // THE STALENESS GUARD. The job planned from where the truck WAS. At the measured ~120 ms
        // and 20 m/s that is under three metres, so this should never fire — it is here for a
        // frame-rate collapse, and it logs when it fires precisely because it means the budget
        // model was wrong somewhere.
        //
        // Measured against the CAR's own start position, not the origin the planner used. Those are
        // different points — the origin is snapped to the road — so comparing the two would call a
        // truck parked 60 m off the tarmac permanently stale and re-plan it forever, burning the
        // frame budget for as long as it sat there. The gate caught exactly that.
        //
        // One retry, then take what we have. A route planned from a hundred metres back is a little
        // stale at its first turn and completely fine after that; a re-plan that will not converge
        // is worse than either.
        const car = this._getCar()
        const drifted = car && Math.hypot(car.x - job.cx, car.z - job.cz) > RR_PARAMS.staleM
        if (drifted && !job.retry) {
            console.warn('[paper] re-plan went stale in flight — planning again from here')
            this._startReplan(job.reason, job.quiet, true)
            return !!this._rr
        }
        if (route?.segments?.length) {
            this.guide = route
            this._onChange()
        } else {
            // BUG-47: on a seed where the graph strands part of the region a re-plan can reach
            // nobody. Keep the previous line — a player mid-route must never be left without one.
            console.warn('[paper] re-plan produced no route — keeping the previous line')
        }
        return false
    }

    /** Poll the two triggers. O(customers) plus one polyline scan, four times a second. */
    _replanTick (dt) {
        if (!this.route || this._rr) return
        this._checkT += dt
        if (this._checkT < RR_PARAMS.pollS) return
        this._checkT = 0

        // TRIGGER A — a customer was served out of order, so the rest of the line is a lie.
        // Delivering IN order does not trigger anything: the remaining suffix is still optimal.
        if (this._orderIsStale()) { this._startReplan('out of order'); return }

        // TRIGGER B — genuinely off the line, for long enough that it is a wrong turn and not a
        // wide corner or a lay-by.
        const lat = this._latToLine()
        if (lat > RR_PARAMS.offM) {
            this._offRouteT += RR_PARAMS.pollS
            if (this._offRouteT >= RR_PARAMS.offS) { this._offRouteT = 0; this._startReplan('off route') }
        } else {
            this._offRouteT = 0
        }
    }

    /** Has anything been delivered out of the guide's order? */
    _orderIsStale () {
        const cs = this.line()?.customers
        if (!cs || !this.run) return false
        let sawUndelivered = false
        for (const c of cs) {
            if (!this.run.hits.has(c.id)) sawUndelivered = true
            else if (sawUndelivered) return true
        }
        return false
    }

    /**
     * Distance from the truck to the line, from the baked polyline's vertices. Quantised by the
     * polyline's own ~25 m spacing, which is why RR_OFF_M is comfortably larger than that — this
     * decides "wrong turn or not", and it does not need to be exact to do that.
     */
    _latToLine () {
        const poly = this.line()?.poly, car = this._getCar()
        if (!poly?.length || !car) return 0
        let best = Infinity
        for (let i = 0; i < poly.length; i++) {
            const d = (poly[i].x - car.x) ** 2 + (poly[i].z - car.z) ** 2
            if (d < best) best = d
        }
        return Math.sqrt(best)
    }

    /**
     * The truck's own position as a planner stop: the same `{aId, bId, s}` shape Larry has. This is
     * the one genuinely new piece of machinery the sliced re-plan needs — everything else is the
     * existing planner, driven differently.
     *
     * queryNearest answers in (runKey, arc-along-run) and the planner wants a graph EDGE, so the
     * edge is the one whose arc span over that run contains the hit. Several edges can share a run
     * (a merged deg-2 chain reports its members), hence the span test rather than a key match.
     */
    _originPoint () {
        const road = this._getRoad(), car = this._getCar()
        if (!road?.queryNearest || !car) return null
        const q = road.queryNearest(car.x, car.z, RR_PARAMS.snapM)
        if (!q?.runKey) return null
        const g = road.networkGraph?.()
        if (!g?.edges) return null
        for (const [a, b, runKey] of g.edges) {
            if (runKey !== q.runKey) continue
            const ed = road.edgeParData(a, b)
            if (!ed?.centerline) continue
            const off = ed.arcOffset ?? 0
            const L = ed.arcLength ?? ed.centerline.length
            if (q.arcS < off - 1e-6 || q.arcS > off + L + 1e-6) continue
            return { id: 'origin:truck', aId: a, bId: b, s: q.arcS,
                     x: q.point.x, y: q.point.y, z: q.point.z }
        }
        return null
    }

    /**
     * Start (or restart) a sliced re-plan of everything still undelivered.
     * `quiet` suppresses the indicator — see hasReplan().
     */
    _startReplan (reason, quiet = false, retry = false) {
        if (this.state !== 'running' || !this.route || !this.run) return
        const left = this.route.customers.filter(c => !this.run.hits.has(c.id))
        if (!left.length) return
        const car = this._getCar()
        const origin = this._originPoint()
        if (!origin) return          // off the network entirely; try again on the next poll

        this._cancelReplan()
        this._rr = {
            // want = left.length: the SET is fixed, only the order is in question. No ring filter
            // either — these customers were already inside the tier's ring when the route was
            // planned, and re-applying it around the region centre could drop one the player is
            // standing next to.
            it: planTourJob(this._getRoad(), origin, left, left.length,
                            this._getRegion(), 100, Infinity),
            // cx/cz is where the TRUCK was, which is what the staleness guard measures against;
            // origin is the road point it planned from, and the two are not the same place.
            cx: car?.x ?? origin.x, cz: car?.z ?? origin.z, reason, quiet, retry,
        }
        if (!quiet) this._rrHideAt = this._clock + RR_PARAMS.minShowS
        this._onChange()
    }

    /**
     * Drop a job. `.return()` rather than dropping the reference: the generator's `finally` hands
     * the Held-Karp tables back, and an abandoned job that never ran it would strand the lease and
     * make every later re-plan allocate five megabytes of its own.
     */
    _cancelReplan () {
        this._rr?.it?.return?.()
        this._rr = null
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
        // What that throw just banked, quoted to the player on landing. Zero unless it credited —
        // a paper onto a porch that already has one is spent, and saying it earned something would
        // be the read-out lying about the one number it exists to show.
        // BANKED ON THE SPOT (owner, 2026-08-15). Accuracy money is paid the instant the paper
        // lands, not at the bell, so the figure the read-out quotes is already in the wallet —
        // and the end-of-route payout is left a pure function of the clock.
        const pay = credited ? this._onSpot(this.paperValue(q)) : 0
        if (this.run.hits.size >= this.route.customers.length
            || (this.run.stock <= 0 && this.run.inFlight <= 0)) {
            const out = { customer: best, dist: bd, q, credited, already, pay }
            this.finish()
            return out
        }
        // FEAT-63 / BUG-48: RE-PLAN ON EVERY DELIVERY, not only on an out-of-order one.
        //
        // The old rule — "delivering in order leaves the remaining suffix optimal, so don't bother"
        // — was true about OPTIMALITY and wrong about the line. A served customer stayed on the
        // guide, and `advanceProgress` is a nearest-point projection rather than a ratchet, so
        // turning round and driving back the way you came walked `s` backwards and re-lit the
        // chevron lattice pointing at a porch that already had its paper (owner-reported, seed 90).
        //
        // The invariant that fixes it is not "re-plan when the order is wrong", it is THE LINE ONLY
        // EVER CONTAINS PEOPLE WHO ARE STILL OWED A PAPER. Re-planning here is how that is kept,
        // and it costs nothing the player can see: quiet, so no RECALCULATING flashes for something
        // that is not a wrong turn, and the previous line stays up for the ~120 ms it takes.
        if (credited) this._startReplan('delivered', true)
        return { customer: best, dist: bd, q, credited, already, pay }
    }

    /**
     * The bell, the empty truck, or the last porch. Prices the route, settles it through the one
     * money path, and moves the ladder.
     */
    finish () {
        if (this.state !== 'running') return
        // FEAT-63: a re-plan in flight is answering a question the route no longer has. Dropping it
        // here also stops the indicator sticking: _clock only advances while papers are aboard, so
        // a job left alive past the bell would hold RECALCULATING on screen over the result card.
        this._cancelReplan()
        this._rrHideAt = 0
        const n = this.route.customers.length
        const accuracies = [...this.run.hits.values()]
        const r = scoreRoute(accuracies, n, this.run.elapsed, this.route.par, this.run.payTier,
                             PAPER_PARAMS, this.run.thresholds)
        const settled = this._onSettle(Math.round(r.payout), r.letter) || {}
        const advanced = advancesTier(r, n)
        if (advanced && runPaper.tier < PAPER_PARAMS.tiers.length - 1) runPaper.tier++
        runPaper.routesRun++
        this.result = {
            ...r,
            spot:      Math.round(r.spot * 100) / 100,
            customers: n,
            delivered: accuracies.length,
            elapsed:   this.run.elapsed,
            par:       this.route.par,
            payout:    settled.payout ?? Math.round(r.payout),
            points:    settled.points ?? 0,
            advanced,
            nextTier:  advanced ? customersForTier() : null,
        }
        // Stash what the calibration export needs BEFORE the run object goes: the trace lives on
        // `run`, and `run` is about to be nulled. (FEAT-30, extended to the paper route 2026-08-17 —
        // there was previously no way to record a paper round at all, so par could not be fitted
        // against one.)
        this._lastExport = {
            segments: this.route.segments,
            edges:    this.route.edges,
            distance: this.route.distance,
            trace:    this.run.trace,
            start:    { x: this.giver?.x ?? 0, z: this.giver?.z ?? 0 },
            customers: this.route.customers.map(c => ({ x: +(c.x ?? 0).toFixed(1), z: +(c.z ?? 0).toFixed(1) })),
        }
        this.state = 'done'
        this.run = null
        this._onChange()
    }
}
