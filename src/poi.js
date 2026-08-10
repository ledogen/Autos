// ── FEAT-46: Story-mode points of interest on lay-by pads ──────────────────────────────────
//
// POIs are the "walk up and get a job" interaction (FEAT-43 slice 1) — an orange placeholder cube
// standing on its own flattened pull-off beside the road, dispersed along the network.
//
// THE DETERMINISM RULE THIS MODULE EXISTS TO HONOUR (owner, 2026-07-28): POIs must not influence
// routing. The same seed opened in free roam and in story mode must produce identical centerlines,
// identical road surface and identical par — you just don't see the pads in free roam. So:
//   • Placement runs strictly DOWNSTREAM of routing. It reads the already-routed network
//     (networkGraph + edgeParData) and writes nothing back. Nothing here reaches routeCacheSig,
//     the abstract graph, the router cost model or the crossing cull.
//   • The pad carve (RoadSystem._poiPadCarve) is gated to zero authority inside the road's own
//     cross-section, so the ribbon the truck drives is bit-identical with or without a pad beside it.
//   • Free roam never calls build(), so it never sets a pad and pays nothing.
//
// Placement is keyed off the ABSTRACT GRAPH EDGE (the two site ids), never the streamed runKey:
// post-BUG-25 the window-bounded crossing cull can flip whole edges on a re-stream, so a
// runKey-derived roll would not be window-invariant. Site ids are `[cellX, cellZ, index]` triples —
// a pure function of (seed, params), stable from any stream centre.
//
// DESIGN.md "Where missions and POIs live" [RATIFIED 2026-07-20]: a POI is an arbitrary
// (edge, arcS) point, NEVER snapped to a graph node. Nodes are a routing artifact ~640 m apart and
// mostly junctions; a place is no likelier at a T than halfway down a road.

import { PROP_MODELS } from '../data/prop-models.js'   // FEAT-59/60: authored collision metadata
import { REGION_MARGIN } from './mission.js'          // FEAT-61: the wall a customer must sit inside

/** Tunables. Geometry + siting only — none of this may ever enter routeCacheSig. */
export const POI_PARAMS = {
    poiCandidates:    6,      // arcS candidates tried per carrying edge before giving up
    // FEAT-60 SITING KNOBS. These bound the roster's *preferences*, never its count — see the
    // relax-the-distance-not-the-count rule on POI_ROSTER.
    poiNearSpawnR:    1000,   // m — 'nearSpawn' slots (mom's, Larry's) want to be inside this
    poiNearSpawnStep: 500,    // m — how far the near-spawn radius grows per relax step
    poiStationMinSep: 2000,   // m — anti-clustering floor between the two members of a 'coverage'
                              // pair. NOT the coverage guarantee itself (that is the objective
                              // below) — just a stop on both stations landing on the same corner.
                              // Owner asked for 3500 (2026-08-05); measured down to 2000 because a
                              // 2500 m region only ever offers ~4.7 km of spread and 3500 forced
                              // both stations onto opposite rims, leaving spawn in a station-free
                              // band. See the coverage note on _pickCoverage.
    poiPadHalfLen:    7.0,    // m — half length of the lay-by, along the road
    poiPadHalfWid:    4.0,    // m — half width, across the road
    poiPadGap:        0.6,    // m — gap from the shoulder edge to the pad's near side
    // EARTHWORK CAP — the "flat open ground" test, and the most consequential number here.
    // Measured against the ROAD-CARVED surface, not raw terrain: raw would charge the pad for the
    // road's own cut/fill (median 10 m of it on seed 6 — the road can sit deep in a bench), which
    // is not the pad's scar and rejected essentially everything. Against the carved surface the
    // best-of-two-sides distribution on seed 6 runs p25 2.7 m / p50 3.5 m, so 3.0 admits roughly a
    // third of candidates — a couple of metres of bench, which is what a real forest-service
    // pullout looks like, and far short of a gouge.
    poiMaxCutFill:    3.0,    // m
    // Reject a lay-by hung off a superelevated sweeper (it reads wrong and drains into the road).
    // Seed-6 cross-slope runs p50 0.067 / p75 0.142, so 0.12 (≈7°) keeps the obviously-banked
    // corners out without rejecting the ordinary crowned straight.
    poiMaxCrossSlope: 0.12,
    poiEndClearM:     55,     // m — keep clear of both edge ends (junction pads live there)
    poiInteractR:     10,     // m — interaction radius: where the prompt shows AND where latching
                              // the parking brake opens the offer. ONE radius on purpose — a prompt
                              // visible further out than the trigger works would be a lie.
                              // Tightened from 18 (owner, 2026-08-02): 18 m armed the offer from
                              // the road itself, well short of the pad. 10 m is a little over the
                              // pad's own half-diagonal (√(7² + 4²) ≈ 8.1), so it means "parked on
                              // the lay-by" and nothing looser — the step toward the marker being a
                              // highlighted parking spot you actually pull into.
    poiCubeSize:      1.6,    // m — the placeholder marker cube's edge length

    // ── FEAT-61: newspaper customers ────────────────────────────────────────────────────────
    // A CUSTOMER IS NOT A LAY-BY. You never park at one, never open an offer, never interact —
    // you throw at it from the road. So a house takes none of the pad machinery above: no bench,
    // no earthwork, no entry in setPoiPads, and therefore ZERO contact with the carve or with
    // FEAT-46's routing-determinism guarantee. That is the main reason this shape was chosen.
    //
    // It is also the only shape that fits. Measured on seed 6: 43 viable PADS region-wide but
    // only 8 inside 1 km, two of which the roster spends on mom and Larry. Fifteen house pads in
    // a 1 km ring is geometrically impossible; fifteen roadside targets is easy, because an edge
    // is ~640 m long and can carry several.
    poiHouseCount:    15,     // HARD. Count is the contract; the radius below is what relaxes.
    poiHouseR:        1000,   // m — the ring customers are drawn from (owner, 2026-08-05)
    poiHouseStep:     250,    // m — how far that ring grows per relax step when a seed is sparse.
                              // Small on purpose: measured on seed 6, only 10 viable sites lie
                              // inside 1 km but 19 lie inside 1.25 km, so a coarse step overshoots
                              // to 1.5 km and scatters the route further than it needs to go. The
                              // ring is a preference; the COUNT is the contract.
    poiHouseSpacing:  30,     // m of arc between CANDIDATE sites on one edge. This is how often the
                              // walk LOOKS, not how far apart houses end up — poiHouseMinSep below
                              // owns that, and conflating the two is what starved this pool.
                              // Measured 2026-08-07 at the live 2500 m region radius: at 90 m the
                              // region yielded 6 / 11 / 4 viable customers on seeds 6 / 11 / 42 and
                              // the count could never be met; at 30 m all three place the full 15,
                              // with the closest chosen pair still 99-197 m apart (the 80 m floor is
                              // never even reached) and the ring settling at ~1.7 km. The reject
                              // battery is severe — a target circle needs naturally flat ground,
                              // because unlike a lay-by pad nothing carves it — so the pool has to
                              // be sampled finely to find the flat spots that do exist. Costs ~110 ms
                              // once per region, behind the loading screen, against a ~15 s cold load.
    poiHouseMinSep:   80,     // m — min spacing between CHOSEN customers, and THE knob that decides
                              // whether a street reads as rural neighbours or as a terrace. Relaxes
                              // (halves) only if the network cannot supply the count at this spacing.
    poiHouseLat:      13,     // m from centerline to the target centre. Past the shoulder edge
                              // (7.5) by more than the target radius, so the circle never overlaps
                              // road surface — a paper that lands on the tarmac must not score.
                              // Moved out with the radius below (12 → 13): at 12 a 5 m circle would
                              // have reached lat 7, back onto the shoulder, and that invariant is
                              // the reason the offset exists at all.
    poiHouseTargetR:  5,      // m — the delivery circle (owner: 3 → 5 on 2026-08-07)
    poiHouseMaxDrop:  1.5,    // m — max height spread across the target circle's rim. A circle
                              // draped over a cliff edge reads as broken, and you could not land a
                              // paper in it anyway. The light stand-in for the pad's earthwork cap.
}

/**
 * THE REGION-1 POI ROSTER (owner, ratified 2026-08-05).
 *
 * FEAT-46 shipped POIs as a per-edge coin flip: every marker was interchangeable and the region's
 * population was whatever the dice gave (10 on seed 6, unknown elsewhere). Story mode cannot be
 * built on that — "there is a gas station" has to be true on EVERY seed. So placement is now a
 * SELECTION, not a roll: gather every viable pad in the region, then fill this roster from the
 * pool. The pool is deep enough for it — seed 6 offers 46 viable pads over a 2500 m region.
 *
 * THE RULE WHEN A SEED CANNOT COMPLY (owner, 2026-08-05): **the count is hard, the distances
 * relax.** A region always gets its full roster; the siting radii widen in steps until a placement
 * exists. No seed ever ships without its second gas station. The only thing that can shorten the
 * roster is a pool with fewer pads than slots, which the region radius makes impossible in play
 * (it happens in the small-window gates, and they assert the priority order instead).
 *
 * ORDER IS PRIORITY. Slots are filled top-down and each takes its pads out of the pool, so the
 * constrained sitings must come first — an 'any' slot that grabbed the last near-spawn pad would
 * push mom's house across the region. Do not reorder without re-reading that sentence.
 *
 * Sitings:
 *   'nearSpawn' — inside poiNearSpawnR of the region centre (which IS the spawn).
 *   'coverage'  — the set that minimises the worst drive from any pad to its nearest member.
 *   'any'       — anywhere in the pool.
 *
 * `jobs` is WHETHER PARKING HERE OPENS AN OFFER, and it is deliberately false for most of the
 * roster. The services (fuel, repair, shopping, tackle) are in-run mechanics nobody has built yet,
 * mom's house is a bed, and the burger joint is scenery — so today only mission givers do anything
 * when you pull the brake. A marker that wears the interaction ring but answers nothing is the
 * same lie as a prompt drawn wider than its trigger, which this module already refuses to tell.
 * Turn a row true the day its mechanic lands.
 *
 * TAGS vs TYPE (FEAT-61, owner 2026-08-05). `type` is the roster slot — one identity, the thing
 * the POI IS. `tags` is everything it also PARTICIPATES IN, and a POI can carry several: mom's
 * house is a roster landmark AND a newspaper customer AND somewhere you can sleep, and no single
 * enum can say that. Systems ask by tag ("who receives papers", "where can I sleep") so a new
 * mechanic adds a tag instead of re-cutting the type list. Larry deliberately carries no
 * 'newsCustomer' — he is where the route STARTS, and delivering to the man who handed you the
 * papers is nonsense.
 */
export const POI_ROSTER = [
    // Exactly one of each per world, and both houses are a short drive from where you wake up.
    { type: 'momsHouse',    count: 1, model: 'trailerHomeA', jobs: false, siting: 'nearSpawn',
      tags: ['newsCustomer', 'sleepable'] },
    // Larry hands out the paper route (FEAT-61 Phase E2). His `jobs` is true like any other giver's,
    // but the brake at his place opens the PaperRouteSystem rather than a point-to-point errand —
    // main.js branches on the type, because he is the only POI whose offer is a different mission.
    { type: 'larrysHouse',  count: 1, model: 'trailerHomeA', jobs: true, siting: 'nearSpawn' },
    // "Never too far from a station" — the reason these two slots exist and the reason they are
    // sited by coverage rather than by a spacing rule. Gas and service are solved INDEPENDENTLY:
    // no constraint was ratified between them, and a service shop sharing a corner with a pump
    // reads fine.
    { type: 'gasStation',   count: 2, model: null, jobs: false, siting: 'coverage' },
    { type: 'serviceShop',  count: 2, model: null, jobs: false, siting: 'coverage' },
    // The place the player is fired from in the opening (FEAT-60 ruling, 2026-08-05): a story
    // landmark, NOT a food vendor and not a hub. Sited anywhere — the point is that you keep
    // driving past it.
    { type: 'burgerJoint',  count: 1, model: null, jobs: false, siting: 'any' },
    { type: 'generalStore', count: 1, model: null, jobs: false, siting: 'any' },
    // The type exists so the roster is whole; fishing and The Confluence stay deferred. Do not
    // build its systems off the back of this line.
    { type: 'tackleShop',   count: 1, model: null, jobs: false, siting: 'any' },
    // Everything left over. Most POIs are mission givers, and a mission giver MAY present as a
    // food vendor (owner, 2026-08-05) — food vendors get no reservation of their own because a
    // vendor that also hands out work costs the region nothing.
    { type: 'missionGiver', count: 5, model: null, jobs: true, siting: 'any' },
]

/** Region population: 14, derived from the roster so the two can never drift apart. */
export const POI_COUNT = POI_ROSTER.reduce((n, s) => n + s.count, 0)

/** Newspaper customers are deferred until the paper-route branch merges — no slot yet (FEAT-60). */

// Footprint sampling for the earthwork test: a 3 × 5 lattice over the pad, plus the centre.
const CUTFILL_NU = 5, CUTFILL_NV = 3

/**
 * FNV-1a over a string → uint32. Used only to seed the per-edge PRNG; any stable hash would do,
 * but it must stay stable, so do not "improve" it — the POI layout of every existing seed rides on it.
 *
 * EXPORTED and shared with src/camp.js (FEAT-45 camping zones), which keys its per-cell PRNG the
 * same way. Two layouts now ride on this function being byte-stable, not one.
 */
export function hash32 (str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

/**
 * mulberry32 — small, fast, well-distributed. Deterministic stream from one uint32 seed.
 * Exported alongside hash32 and shared with src/camp.js; same stability contract.
 */
export function mulberry32 (a) {
    return function () {
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const idKey = (id) => `${id[0]},${id[1]},${id[2]}`

/**
 * The POI layer. Owns placement, the pad records the road carve consumes, and the
 * nearest-POI query the interaction prompt reads. Holds no THREE and no worldgen of its own —
 * everything comes through the `deps` adapter, the same isolation discipline src/story.js uses.
 */
export class PoiSystem {
    /**
     * @param {object} deps
     *   getRoad()      — the play RoadSystem (a getter: main.js swaps instances on reseed)
     *   getWater()     — WaterSystem, for the on-water reject (may return null)
     *   getTerrain()   — TerrainSystem, for rawHeightWorld (the earthwork test)
     *   getSeed()      — numeric worldSeed
     *   getParams()    — the live params object (pad geometry knobs live alongside road params)
     */
    constructor (deps) {
        this._d = deps
        this._list = []
        this._pool = []         // every viable pad the last build saw; see pool()
        this._houses = []       // FEAT-61 newspaper customers; see houses()
        this._built = null      // {x,z,r,seed} the current list was built for
    }

    /**
     * Every placed POI. Read-only to callers.
     *
     * FEAT-61: newspaper customers are NOT in here — see houses(). That is deliberate and it is the
     * whole enforcement of the owner's "most missions must not go to houses": there are 15 of them
     * against a 14-slot roster, so anything picking a destination out of this list would end up
     * delivering to a stranger's porch most of the time. Keeping them in a separate list means the
     * mission planner cannot reach them by accident, with no weighting hack to tune or forget.
     */
    list () { return this._list }

    /**
     * The FEAT-61 newspaper customers. Read-only. Empty until buildHouses() runs.
     *
     * Mom is a customer too but lives in list(), not here — she is a roster POI that also carries
     * the 'newsCustomer' tag. The paper route's customer pool is therefore
     * `houses().concat(list().filter(hasTag('newsCustomer')))`, which is what customers() returns.
     */
    houses () { return this._houses }

    /** Every POI or house carrying `tag`. The tag-driven query systems ask instead of type-matching. */
    tagged (tag) {
        const out = this._list.filter(q => q.tags?.includes(tag))
        for (const h of this._houses) if (h.tags?.includes(tag)) out.push(h)
        return out
    }

    /** Everyone who receives a newspaper: the houses, plus any roster POI tagged as a customer. */
    customers () { return this.tagged('newsCustomer') }

    /**
     * Every VIABLE pad the last build considered, before the roster picked from it. Read-only.
     *
     * This is where the window-invariance guarantee now lives (FEAT-60). A pad's position is still
     * a pure function of (seed, edge), so the pool is identical from any stream centre — but WHICH
     * pads become POIs, and what type they are, is necessarily region-scoped: you cannot promise a
     * region two gas stations from decisions each edge makes alone. build() runs once per region on
     * the spawn, so selection is stable in play; the invariant that survives is this one.
     */
    pool () { return this._pool }

    /**
     * Place POIs across the routed network inside a circle, and hand the pads to the RoadSystem so
     * the terrain carve flattens them. Idempotent for the same (centre, radius, seed).
     *
     * Cost: one pass over the region's graph edges, a handful of terrain/water samples per
     * candidate. Runs ONCE at story-mode entry (behind the loading screen), never in the frame loop.
     */
    build (center, radius) {
        const road = this._d.getRoad()
        if (!road || !center) return this._list
        const seed = this._d.getSeed()
        if (this._built && this._built.seed === seed
            && this._built.r === radius
            && Math.hypot(this._built.x - center.x, this._built.z - center.z) < 1e-6) return this._list

        // CLEAR THE PREVIOUS BUILD'S PADS FIRST. _evaluate's junction reject reads padReachNodes(),
        // which lists POI pads alongside junction pads — so a REBUILD (a new seed, a re-anchored
        // region) would site against the pads of the region it is replacing and produce a different,
        // history-dependent layout. Within one build there is no self-interference: pads are handed
        // over once at the end. Determinism means the answer depends on (seed, params, network) and
        // nothing else, including what this system did a minute ago.
        road.setPoiPads(null)

        const g = road.networkGraph()
        const p = this._d.getParams()
        const P = { ...POI_PARAMS, ...p }

        // Deterministic edge ORDER: the network Map's insertion order is a streaming artifact, so
        // sort by the canonical edge key. Placement is per-edge independent, but sorting keeps the
        // ids stable, which the map icons and the mission anchor both key off.
        const canon = []
        for (const [a, b] of g.edges) {
            const ka = idKey(a), kb = idKey(b)
            canon.push(ka < kb ? { ka, kb, a, b } : { ka: kb, kb: ka, a: b, b: a })
        }
        canon.sort((u, v) => (u.ka === v.ka ? (u.kb < v.kb ? -1 : 1) : (u.ka < v.ka ? -1 : 1)))

        // PASS 1 — THE POOL. Every edge that can hold a pad offers one; nothing is rolled away.
        // The per-edge PRNG still decides WHERE on its edge the pad sits, so a pad's position is
        // the same pure function of (seed, edge) it has always been. What changed (FEAT-60) is that
        // the population is no longer the tail of a coin flip: pass 2 selects from this pool, which
        // is how a region can be guaranteed a gas station.
        const pool = []
        const seen = new Set()
        for (const e of canon) {
            const ek = `${e.ka}|${e.kb}`
            if (seen.has(ek)) continue      // networkGraph can list an edge twice (both run keys)
            seen.add(ek)
            const rnd = mulberry32(hash32(`poi:${seed}:${ek}`))
            const poi = this._placeOnEdge(road, e, rnd, P)
            if (!poi) continue
            // THE REGION CLIP IS A POST-FILTER, NEVER A REJECT TEST. Applied inside candidate
            // selection it would make WHICH arc position wins depend on the region centre — and a
            // POI 400 m inside the wall then moved when the window moved. Window-invariance means
            // the edge decides where its POI goes; the region only decides whether it is kept.
            if (Math.hypot(poi.x - center.x, poi.z - center.z) > radius - poi.halfLen - 20) continue
            pool.push(poi)
        }

        // PASS 2 — THE ROSTER. Fill the ratified slots from the pool and discard the rest.
        const out = this._assignRoster(pool, center, seed, P)
        out.forEach((q, i) => { q.index = i })

        this._list = out
        this._pool = pool
        this._built = { x: center.x, z: center.z, r: radius, seed }
        road.setPoiPads(out)
        return out
    }

    // ── newspaper customers (FEAT-61) ───────────────────────────────────────────────────────
    /**
     * Place the region's newspaper customers: roadside delivery targets in a small ring around
     * spawn. Call AFTER build() — mom is a customer, and she is a roster POI.
     *
     * Deliberately NOT the pad path. A customer is a thing you throw at from the road: no bench is
     * carved, no earthwork is billed, and nothing here reaches setPoiPads(). The whole FEAT-46
     * determinism guarantee — that a seed's road surface is identical with and without story mode —
     * is untouched by this feature because it never writes to the carve at all.
     *
     * COUNT IS HARD, THE RADIUS RELAXES (FEAT-60's rule): a region always gets poiHouseCount
     * customers; the ring grows in poiHouseStep increments until the network can supply them.
     */
    buildHouses (center, radius) {
        const road = this._d.getRoad()
        if (!road || !center) return this._houses
        const seed = this._d.getSeed()
        const P = { ...POI_PARAMS, ...this._d.getParams() }

        // Same canonical edge order as build(), for the same reason: the Map's order is a streaming
        // artifact, and ids have to be stable across windows.
        const g = road.networkGraph()
        const canon = []
        for (const [a, b] of g.edges) {
            const ka = idKey(a), kb = idKey(b)
            canon.push(ka < kb ? { ka, kb, a, b } : { ka: kb, kb: ka, a: b, b: a })
        }
        canon.sort((u, v) => (u.ka === v.ka ? (u.kb < v.kb ? -1 : 1) : (u.ka < v.ka ? -1 : 1)))

        // THE WALL (FEAT-61 Phase E2). A customer's edge must lie WHOLLY inside the region, because
        // the route is routed on the same region-filtered graph the missions are: an edge with one
        // node past the wall is dropped from that graph, so a house on it is a person the tour can
        // never reach — the paper route would simply skip them, silently and forever. Measured on
        // seed 6, three of the sixteen customers were exactly this.
        //
        // This is the one place the ratified "count is hard, distance relaxes" rule has to yield.
        // The distance cannot relax past the wall, because past the wall there is no route.
        const wall = radius - REGION_MARGIN
        const nodeInside = (id) => {
            const p = g.pos(id)
            return Math.hypot(p.x - center.x, p.z - center.z) <= wall
        }

        // Every viable site on every edge, in canonical order. Window-invariant for the same reason
        // pads are: a site's position is a pure function of (seed, edge, step index), and the ring
        // below is a POST-FILTER, never a reject test.
        const cands = []
        const seen = new Set()
        for (const e of canon) {
            const ek = `${e.ka}|${e.kb}`
            if (seen.has(ek)) continue
            seen.add(ek)
            if (!nodeInside(e.a) || !nodeInside(e.b)) continue
            this._placeHousesOnEdge(road, e, P, cands)
        }

        const want = P.poiHouseCount
        let picked = []
        for (let r = Math.min(P.poiHouseR, wall); ; r += P.poiHouseStep) {
            const ring = cands.filter(q => Math.hypot(q.x - center.x, q.z - center.z) <= r)
            picked = this._pickSpread(ring, want, P.poiHouseMinSep)
            if (picked.length >= want) break
            if (ring.length === cands.length) break     // the ring is the whole region; nothing left to relax into
            if (r >= wall) break                        // …and it can never grow past the wall
        }
        if (picked.length < want) {
            console.warn(`[poi] region supplied only ${cands.length} viable house sites — placed ${picked.length}/${want}`)
        }

        picked.forEach((q, i) => { q.index = i; q.type = 'house'; q.tags = ['newsCustomer'] })
        this._houses = picked
        return picked
    }

    /**
     * Walk one edge at poiHouseSpacing and push every viable customer site onto `out`.
     *
     * Several per edge is the point — an edge is ~640 m, and one target per edge is both too few
     * (15 customers inside 1 km is unreachable) and wrong-looking (a road where every house is
     * exactly one house apart). The per-edge PRNG jitters each step so the spacing does not read as
     * a ruler, and the stream is keyed to the edge alone, so the sites are identical from any window.
     *
     * THIS IS THE POOL, NOT THE ROSTER — the same shape build() uses for pads (gather every viable
     * site, then select). So the walk should be GENEROUS: a rejected step is a step the selection
     * never gets to consider, and _evaluateHouse rejects most of them (a target circle needs
     * naturally flat ground, because unlike a pad nothing carves it flat for you). See the
     * measurement on poiHouseSpacing for what the step size is actually worth.
     */
    _placeHousesOnEdge (road, e, P, out) {
        const ed = road.edgeParData(e.a, e.b)
        if (!ed || !ed.centerline) return
        const off = ed.arcOffset ?? 0
        const L = ed.arcLength ?? ed.centerline.length
        const clear = P.poiEndClearM
        if (!(L > 2 * clear + P.poiHouseSpacing)) return

        const rnd = mulberry32(hash32(`poi-house:${this._d.getSeed()}:${e.ka}|${e.kb}`))
        const span = L - 2 * clear
        const steps = Math.floor(span / P.poiHouseSpacing)
        for (let k = 0; k < steps; k++) {
            // Jitter inside the step, never across it, so two neighbours can never collapse together.
            const s = off + clear + (k + 0.15 + rnd() * 0.7) * P.poiHouseSpacing
            // Side is a coin flip here, not a terrain choice: both sides of the road have houses on
            // them, and there is no bench to make cheap. Evaluate the chosen side only — if it fails
            // (water, a junction, a cliff) that is simply a gap in the street, which is honest.
            const side = rnd() < 0.5 ? 1 : -1
            const h = this._evaluateHouse(road, ed, s, side, P)
            if (h) out.push({ id: `house:${e.ka}|${e.kb}:${k}`, index: -1, aId: e.a, bId: e.b, s, runKey: ed.key, ...h })
        }
    }

    /**
     * The customer reject tests. Much lighter than _evaluate's: with no bench to carve there is no
     * earthwork to cap and no cross-slope to keep water off a pullout. What remains is "is there
     * real road here, and is the target on believable ground".
     */
    _evaluateHouse (road, ed, s, side, P) {
        const cl = ed.centerline
        const cp = cl.pointAt(s)
        const ct = cl.tangentAt(s)
        const tl = Math.hypot(ct.x, ct.z) || 1
        const tx = ct.x / tl, tz = ct.z / tl
        const nx = tz * side, nz = -tx * side
        const lat = P.poiHouseLat
        const cx = cp.x + nx * lat, cz = cp.z + nz * lat

        // 1. Tunnels own their ground — and there is no roadside inside a bore to throw at.
        if (road.tunnelSpanAt?.(ed.key, s)) return null

        // 2. Junction pads: a target in the middle of an intersection apron is not a front yard.
        for (const nd of road.padReachNodes()) {
            if (Math.hypot(nd.x - cx, nd.z - cz) <= nd.reach) return null
        }

        // 3. There must actually be road to throw FROM. Null means the resolver found none here.
        const edgeLat = P.roadHalfWidth + P.roadShoulderWidth
        if (road.sampleRoadTopY(cp.x + nx * edgeLat, cp.z + nz * edgeLat) == null) return null

        // 4. Never on water. A paper in a pond is a lost paper, not a delivery.
        const water = this._d.getWater?.()
        if (water) {
            if (water.isRoadNoGo(cx, cz)) return null
            if (water.streamChannelAt?.(cx, cz)?.inChannel) return null
        }

        // 5. The circle has to lie on ground you could land a paper on: sample the rim and reject a
        //    target draped over a cliff edge or a ditch. This is the light stand-in for the pad's
        //    earthwork cap — it bounds what the ring LOOKS like, which is the thing that reads wrong.
        const terrain = this._d.getTerrain?.()
        const groundAt = terrain?.analyticHeight ? ((x, z) => terrain.analyticHeight(x, z))
            : terrain?.rawHeightWorld ? ((x, z) => terrain.rawHeightWorld(x, z)) : null
        let y = 0
        if (groundAt) {
            y = groundAt(cx, cz)
            if (!isFinite(y)) return null
            const R = P.poiHouseTargetR
            let lo = y, hi = y
            for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
                const gy = groundAt(cx + ox, cz + oz)
                if (!isFinite(gy)) return null
                if (gy < lo) lo = gy
                if (gy > hi) hi = gy
            }
            if (hi - lo > P.poiHouseMaxDrop) return null
        }

        // yaw matches the pad convention (model −Z faces the road) so a modelled house can drop
        // straight in when FEAT-60 gets around to one.
        return { x: cx, y, z: cz, tx, tz, nx, nz, side, yaw: Math.atan2(nx, nz) }
    }

    /**
     * Take up to `n` sites spread across the network: shuffle deterministically, then accept a site
     * only if it is at least `minSep` from every site already accepted. If that cannot fill the
     * count, halve the separation and try again — the count-hard/distance-relaxes rule, in the same
     * shape _pickCoverage uses for the stations.
     *
     * Spread rather than nearest-first on purpose: nearest-first would pack every customer onto the
     * two streets by the spawn and make the route a lap of the block instead of a proper round trip.
     */
    _pickSpread (cands, n, minSep) {
        if (cands.length <= n) return cands.slice()
        // Ordered by a STABLE PER-SITE KEY, not shuffled (BUG-45). A Fisher-Yates consumes one
        // draw per element, so a ring holding one more candidate re-orders the WHOLE list and
        // picks fifteen different customers — and the ring's contents move whenever the region
        // centre does. See _pickStable for the mechanism and why the centre is not stable.
        const seed = this._d.getSeed()
        const order = cands
            .map(q => ({ q, k: hash32(`poi-spread:${seed}:${q.id}`) }))
            .sort((a, b) => (a.k - b.k) || (a.q.id < b.q.id ? -1 : 1))
            .map(e => e.q)
        for (let sep = minSep; ; sep *= 0.5) {
            const out = []
            for (const q of order) {
                if (out.length >= n) break
                if (out.every(p => Math.hypot(p.x - q.x, p.z - q.z) >= sep)) out.push(q)
            }
            if (out.length >= n || sep < 1) return out
        }
    }

    // ── the roster (FEAT-60) ────────────────────────────────────────────────────────────────
    /**
     * Fill POI_ROSTER from the candidate pool and return the typed POIs, in roster order.
     *
     * Deterministic in (seed, pool) alone: the pool arrives in canonical edge order and every
     * arbitrary choice comes off one region PRNG seeded from the world seed. No wall clock, no
     * insertion order, no dependence on what a previous build did.
     *
     * Slots are filled top-down and each removes its pads from `free` — see the ORDER IS PRIORITY
     * note on POI_ROSTER. A slot that cannot be filled because the pool ran dry is skipped, not
     * substituted; the roster above it is already placed, which is what makes the order a priority
     * order and not just a listing.
     */
    _assignRoster (pool, center, seed, P) {
        const free = pool.slice()
        const out = []
        for (const slot of POI_ROSTER) {
            const picks = slot.siting === 'nearSpawn' ? this._pickNearSpawn(free, center, slot.count, slot.type, P)
                        : slot.siting === 'coverage'  ? this._pickCoverage(free, pool, slot.count, P)
                        :                               this._pickStable(free, slot.count, slot.type)
            for (const q of picks) {
                q.type = slot.type
                q.tags = slot.tags ? slot.tags.slice() : []   // FEAT-61 — see the TAGS note above
                q.jobs = !!slot.jobs
                q.modelKey = slot.model ?? null
                // Stamp the authored collision box NOW, off the registry, not when the GLB
                // resolves: physics must not wait on a fetch, or a marker would be driveable-
                // through for the first seconds of a region and solid afterwards.
                q.collision = (slot.model && PROP_MODELS[slot.model]?.collision) || null
                const i = free.indexOf(q)
                if (i >= 0) free.splice(i, 1)
                out.push(q)
            }
        }
        if (out.length < POI_COUNT) {
            console.warn(`[poi] region supplied only ${pool.length} viable pads — roster filled ${out.length}/${POI_COUNT}`)
        }
        return out
    }

    /**
     * Take `n` pads, chosen by a STABLE PER-PAD KEY rather than by drawing indices out of a list.
     *
     * BUG-45, and the reason this is not a shuffle. The old version did
     * `avail.splice(floor(rnd() * avail.length), 1)` — an index into a list whose LENGTH is a
     * function of the region centre and of whatever happened to be streamed when the pool was
     * gathered. Both of those move: the spawn probe (`_reseatTruckAtSpawn`) resolves against the
     * network that is streamed at the time, so re-entering story mode on an already-loaded seed
     * can land the truck tens of metres from where the cold entry did. One pad entering or leaving
     * the ring then shifted every index after it, and mom and Larry swapped houses.
     *
     * Keying the choice to the pad's own identity makes the selection depend on WHICH pads exist,
     * not on HOW MANY. A pad that is not near the boundary keeps its slot no matter what churns at
     * the rim. It is the same discipline the pad's own position already follows — keyed off the
     * abstract graph edge, never the streamed runKey (see the header).
     *
     * `salt` is the roster slot, so two slots drawing from the same pool do not both want the same
     * pad. Ties break on the id, so equal hashes are still an order and not an accident.
     */
    _pickStable (cands, n, salt) {
        if (!(n > 0) || !cands.length) return []
        const seed = this._d.getSeed()
        return cands
            .map(q => ({ q, k: hash32(`poi-pick:${seed}:${salt}:${q.id}`) }))
            .sort((a, b) => (a.k - b.k) || (a.q.id < b.q.id ? -1 : 1))
            .slice(0, n)
            .map(e => e.q)
    }

    /**
     * Take `n` pads within poiNearSpawnR of the region centre — which IS the spawn, so this is
     * "a short drive from where you wake up" (mom's and Larry's).
     *
     * THE COUNT IS HARD, THE DISTANCE RELAXES (owner, 2026-08-05): if the ring holds too few pads
     * it grows by poiNearSpawnStep until it does. On seed 6 it never has to — 11 of the 46 pads
     * sit inside the first kilometre — but a seed whose spawn is on a bare stretch must still get
     * both houses, further out rather than not at all.
     */
    _pickNearSpawn (free, center, n, salt, P) {
        for (let r = P.poiNearSpawnR; ; r += P.poiNearSpawnStep) {
            const ring = free.filter(q => Math.hypot(q.x - center.x, q.z - center.z) <= r)
            if (ring.length >= n) return this._pickStable(ring, n, salt)
            if (ring.length === free.length) return this._pickStable(free, n, salt)  // ring is the pool
        }
    }

    /**
     * Take the `n` pads that best COVER the region: the set minimising the worst distance from any
     * pad in the pool to its nearest member. Subject to a poiStationMinSep floor between members,
     * relaxed (halved) until a valid set exists.
     *
     * WHY COVERAGE AND NOT A SPACING RULE (owner ruling, 2026-08-05). The ask was "you're never too
     * far from a gas station", first expressed as a 3.5 km minimum separation. Measured, that
     * backfires: a 2500 m region only offers ~4.7 km of spread between its furthest pads, so a
     * 3.5 km floor admits almost nothing and drives both stations onto opposite rims — leaving a
     * 3.5 km band through the middle, spawn included, with no station in it. Min-separation is an
     * anti-clustering proxy, not a coverage guarantee; at this region size the two pull opposite
     * ways. So the floor stays only as anti-clustering (poiStationMinSep) and the objective states
     * the actual requirement. The pool doubles as the sample of "where the player will be" — every
     * pad is on a road, and they are spread over the region by construction.
     *
     * Exhaustive over pairs: n is 2 and the pool is tens, so this is ~10^3 distance evaluations.
     * Guard rather than generalise — a third station would need a different search and a fresh
     * ruling about what it is for.
     */
    _pickCoverage (free, pool, n, P) {
        if (n !== 2) throw new Error(`[poi] coverage siting is pair-only (asked for ${n})`)
        if (free.length < 2) return free.slice(0, n)
        // Worst-case distance from any pad in the pool to the nearer of (a, b).
        const worst = (a, b) => {
            let w = 0
            for (const q of pool) {
                const d = Math.min(Math.hypot(q.x - a.x, q.z - a.z), Math.hypot(q.x - b.x, q.z - b.z))
                if (d > w) w = d
            }
            return w
        }
        for (let sep = P.poiStationMinSep; ; sep *= 0.5) {
            let best = null, bestW = Infinity
            for (let i = 0; i < free.length; i++) {
                for (let j = i + 1; j < free.length; j++) {
                    const a = free[i], b = free[j]
                    if (Math.hypot(a.x - b.x, a.z - b.z) < sep) continue
                    const w = worst(a, b)
                    if (w < bestW) { bestW = w; best = [a, b] }   // strict <: first pair wins ties
                }
            }
            if (best) return best
            if (sep < 1) return free.slice(0, 2)                  // pathological pool — take any two
        }
    }

    /** Drop every POI and release the pads (leaving story mode). */
    clear () {
        this._list = []
        this._pool = []
        this._houses = []
        this._built = null
        const road = this._d.getRoad()
        if (road) road.setPoiPads(null)
    }

    /**
     * The POI the player may interact with from (x,z), or null. Radius test only — the prompt is a
     * proximity affordance, not a trigger volume.
     *
     * `jobsOnly` restricts the answer to markers that actually open an offer (see `jobs` on
     * POI_ROSTER). Without it, parking at mom's house would win the park trigger and answer with
     * "park to begin mission" — mom does not hand out freight.
     */
    nearest (x, z, maxR = POI_PARAMS.poiInteractR, jobsOnly = false) {
        let best = null, bestD = maxR
        for (const q of this._list) {
            if (jobsOnly && !q.jobs) continue
            const d = Math.hypot(q.x - x, q.z - z)
            if (d < bestD) { bestD = d; best = q }
        }
        return best
    }

    /**
     * Hard contact against the markers, for the physics contact pipeline. The marker is SOLID,
     * because one you drive through reads as scenery and this project's whole premise is that the
     * physics is honest. Returns the prop-collider convention ({nx,ny,nz,depth}, normal points OUT
     * of the solid) so main.js's queryContacts splice is identical to the prop one. THREE-free.
     *
     * FEAT-60: the box is now per-POI. A modelled marker uses the registry's AUTHORED collision
     * dims, rotated to the marker's yaw (an ORIENTED box — a 12 m trailer standing at 40° to the
     * world axes has a world AABB half again its size, and you would bounce off thin air two metres
     * from the wall). Keyless POIs keep the poiCubeSize cube, which the yaw leaves unchanged
     * because a cube is rotation-invariant — so their contact is bit-identical to before.
     */
    queryContact (cx, cy, cz, r) {
        const cube = (this._d.getParams?.()?.poiCubeSize ?? POI_PARAMS.poiCubeSize) * 0.5
        for (const q of this._list) {
            const s = q.collision?.size
            const hx = s ? s[0] * 0.5 : cube, hy = s ? s[1] * 0.5 : cube, hz = s ? s[2] * 0.5 : cube
            // Broad phase in world space against the box's bounding radius — cheap and rotation-
            // proof, so the oriented test below only runs for a marker actually within reach.
            const wx = cx - q.x, wz = cz - q.z
            const reach = Math.hypot(hx, hz) + r
            if (wx * wx + wz * wz > reach * reach) continue
            const bcy = q.y + hy                      // box centre: the marker stands ON the pad
            const dy = cy - bcy
            if (dy > hy + r || dy < -hy - r) continue
            // Into the marker's own frame: undo yaw about Y. (cos, −sin; sin, cos) is the inverse
            // of the rotation applied to the mesh, so dx runs along the model's +X and dz its +Z.
            const cs = Math.cos(q.yaw ?? 0), sn = Math.sin(q.yaw ?? 0)
            const dx =  cs * wx - sn * wz
            const dz =  sn * wx + cs * wz
            if (dx > hx + r || dx < -hx - r || dz > hz + r || dz < -hz - r) continue
            // Closest point on the box to the query centre, in box-local axes.
            const qx = dx < -hx ? -hx : dx > hx ? hx : dx
            const qy = dy < -hy ? -hy : dy > hy ? hy : dy
            const qz = dz < -hz ? -hz : dz > hz ? hz : dz
            const ex = dx - qx, ey = dy - qy, ez = dz - qz
            const d2 = ex * ex + ey * ey + ez * ez
            let lx, ly, lz, depth
            if (d2 >= r * r) continue
            if (d2 > 1e-12) {
                const d = Math.sqrt(d2)
                lx = ex / d; ly = ey / d; lz = ez / d; depth = r - d
            } else {
                // Centre inside the box: push out along the axis with the least penetration.
                const px = hx - Math.abs(dx), py = hy - Math.abs(dy), pz = hz - Math.abs(dz)
                if (px <= py && px <= pz)      { lx = Math.sign(dx) || 1; ly = 0; lz = 0; depth = px + r }
                else if (py <= pz)             { lx = 0; ly = Math.sign(dy) || 1; lz = 0; depth = py + r }
                else                           { lx = 0; ly = 0; lz = Math.sign(dz) || 1; depth = pz + r }
            }
            // Back to world: re-apply the yaw to the normal (it is a direction, so rotation only).
            return { nx: cs * lx + sn * lz, ny: ly, nz: -sn * lx + cs * lz, depth }
        }
        return null
    }

    // ── placement ───────────────────────────────────────────────────────────────────────────
    /**
     * Try `poiCandidates` arc positions on one edge and return the first that passes every reject
     * test, or null. Candidates are drawn from the edge's own PRNG so the result is a pure function
     * of (seed, edge) — the same edge yields the same POI (or the same nothing) from any window.
     */
    _placeOnEdge (road, e, rnd, P) {
        const ed = road.edgeParData(e.a, e.b)
        if (!ed || !ed.centerline) return null
        // QUAL-24: this edge may be a STRETCH of a longer run — a deg-2 chain merge swallowed it — so
        // its arc domain is [off, off+L] inside the registered run, not [0, len]. `s` below stays in
        // that run's GLOBAL arc domain, which is what the pad record, tunnelSpanAt and the mission
        // anchor all expect. An unmerged edge reports off=0 and L=len, so this is identity there.
        const off = ed.arcOffset ?? 0
        const L = ed.arcLength ?? ed.centerline.length
        const clear = P.poiEndClearM
        if (!(L > 2 * clear + 40)) return null      // too short to hold a pad clear of both ends

        const halfWidth     = P.roadHalfWidth     ?? 5
        const shoulderWidth = P.roadShoulderWidth ?? 2.5
        // Lateral offset from the CENTERLINE to the pad centre: past the shoulder, past the gap,
        // then half the pad. The pad's near edge therefore sits `poiPadGap` beyond the shoulder.
        const lat = halfWidth + shoulderWidth + P.poiPadGap + P.poiPadHalfWid

        for (let k = 0; k < P.poiCandidates; k++) {
            const s = off + clear + rnd() * (L - 2 * clear)
            // WHICH SIDE is decided by the ground, not by the hash: try both and take the one that
            // needs less earthwork. On a mountain road the two sides are wildly asymmetric — one is
            // a 1:1 cut bank, the other a 3:1 fill slope — so letting the terrain choose is both the
            // cheaper bench and the more believable siting. Emergent, not injected.
            let best = null
            for (const side of [1, -1]) {
                const cand = this._evaluate(road, ed, s, side, lat, P)
                if (cand && (!best || cand.cut < best.cut)) best = cand
            }
            if (best) return { id: `poi:${e.ka}|${e.kb}`, index: -1, aId: e.a, bId: e.b, s, runKey: ed.key, ...best }
        }
        return null
    }

    /**
     * The reject tests, in ascending cost order. Returns the pad record on acceptance, else null.
     *
     * ON water rejects; NEAR water does not (owner, 2026-07-28) — a waterside pullout is good, and
     * FEAT-45's camp scoring wants water proximity as a POSITIVE. The earthwork cap is how "flat
     * open ground bordering a road" is expressed: it bounds the visible scar directly, which is the
     * thing that actually looks wrong, rather than proxying it through an abstract slope threshold.
     */
    _evaluate (road, ed, s, side, lat, P) {
        const cl = ed.centerline
        const cp = cl.pointAt(s)
        const ct = cl.tangentAt(s)
        const tl = Math.hypot(ct.x, ct.z) || 1
        const tx = ct.x / tl, tz = ct.z / tl
        // Right-hand normal (matches the signedLat convention: positive = right of road heading).
        const nx = tz * side, nz = -tx * side

        const cx = cp.x + nx * lat, cz = cp.z + nz * lat

        // Every test below reads only the edge and its immediate surroundings — nothing about the
        // window or the region. That is what keeps placement window-invariant (the region clip is
        // a post-filter in build()).

        // 1. Inside a tunnel bore, or close enough to a portal that the pad would hang off the
        //    headwall. The bore owns its own earthwork (FEAT-40) and a pullout there is nonsense.
        if (road.tunnelSpanAt) {
            for (const ds of [-40, 0, 40]) {
                const sa = Math.min(cl.length, Math.max(0, s + ds))
                if (road.tunnelSpanAt(ed.key, sa)) return null
            }
        }

        // 2. Junction pads / connector fillets already own their ground — never stack on one.
        for (const nd of road.padReachNodes()) {
            if (Math.hypot(nd.x - cx, nd.z - cz) <= nd.reach) return null
        }

        // 3. The road's own surface at the shoulder edge on the pad side IS the pad's design top:
        //    carve the pad flush with the carved shoulder dirt and the lay-by is driveable-onto with
        //    no step. Null means the resolver found no road here — nothing to hang a pullout off.
        const edgeLat = P.roadHalfWidth + P.roadShoulderWidth
        const topY = road.sampleRoadTopY(cp.x + nx * edgeLat, cp.z + nz * edgeLat)
        if (topY == null || !isFinite(topY)) return null

        // 4. Cross-slope: a pullout on a superelevated corner reads wrong (and drains into the road).
        const yL = road.sampleRoadTopY(cp.x + tz * edgeLat, cp.z - tx * edgeLat)
        const yR = road.sampleRoadTopY(cp.x - tz * edgeLat, cp.z + tx * edgeLat)
        if (yL != null && yR != null && Math.abs(yL - yR) / (2 * edgeLat) > P.poiMaxCrossSlope) return null

        // 5. ON water — pond no-go (radius + skirt) or a stream channel under the footprint.
        const water = this._d.getWater?.()
        if (water) {
            for (const [px, pz] of this._footprint(cx, cz, tx, tz, nx, nz, P, 3, 2)) {
                if (water.isRoadNoGo(px, pz)) return null
                // NB: streamChannelAt ALWAYS returns a record — {inChannel:false,inBank:false,
                // stream:null} away from any stream — so it must be READ, not truth-tested.
                // Only inChannel rejects: the BANK is exactly the waterside pullout we want.
                if (water.streamChannelAt?.(px, pz)?.inChannel) return null
            }
        }

        // 6. EARTHWORK CAP — the "flat open ground" test, measured against the ROAD-CARVED surface
        //    (analyticHeight), not raw terrain. Raw would bill the pad for the ROAD's cut/fill,
        //    which is already-spent earthwork and not the pad's scar; on seed 6 that reads a median
        //    of 10 m and rejects everything. Falling back to raw only keeps a terrain stub honest.
        const terrain = this._d.getTerrain?.()
        const groundAt = terrain?.analyticHeight ? ((x, z) => terrain.analyticHeight(x, z))
            : terrain?.rawHeightWorld ? ((x, z) => terrain.rawHeightWorld(x, z)) : null
        let cut = 0
        if (groundAt) {
            for (const [px, pz] of this._footprint(cx, cz, tx, tz, nx, nz, P, CUTFILL_NU, CUTFILL_NV)) {
                const gy = groundAt(px, pz)
                if (!isFinite(gy)) return null
                const d = Math.abs(gy - topY)
                if (d > cut) cut = d
            }
            if (cut > P.poiMaxCutFill) return null
        }

        return {
            x: cx, z: cz, y: topY, cut,
            tx, tz, nx, nz, side,
            // FEAT-60: the yaw a marker MODEL stands at. Model forward is −Z (ASSETS.md), and a
            // building on a lay-by faces the road it was built for — so −Z maps to −n (the pad
            // normal points away from the centerline). An object at rotation.y = θ aims its −Z at
            // (−sinθ, −cosθ), hence θ = atan2(nx, nz). Its +X then runs along the road, which is
            // also the only orientation a 12 m trailer fits a 14 × 8 m pad in.
            yaw: Math.atan2(nx, nz),
            halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid,
            // The mission start point: ON the road at this arc position, facing along the edge.
            roadX: cp.x, roadZ: cp.z,
        }
    }

    /** Lattice of world points covering the pad footprint (inclusive of the rim). */
    * _footprint (cx, cz, tx, tz, nx, nz, P, nu, nv) {
        for (let i = 0; i <= nu; i++) {
            const u = (i / nu * 2 - 1) * P.poiPadHalfLen
            for (let j = 0; j <= nv; j++) {
                const v = (j / nv * 2 - 1) * P.poiPadHalfWid
                yield [cx + tx * u + nx * v, cz + tz * u + nz * v]
            }
        }
    }
}
