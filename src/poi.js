// ── FEAT-46: Story-mode points of interest on lay-by pads ──────────────────────────────────
//
// POIs are the "walk up and get a job" interaction (FEAT-43 slice 1) — an orange placeholder cube
// standing on its own flattened pull-off beside the road, dispersed along the network.
//
// THE DETERMINISM RULE THIS MODULE EXISTS TO HONOUR (owner, 2026-07-28): POIs must not influence
// routing. The same seed opened in free roam and in story mode must produce identical centerlines,
// identical road surface and identical par — you just don't see the pads in free roam. So:
//   • Placement runs strictly DOWNSTREAM of routing. It reads the already-routed network
//     (networkGraph + edgeParData) and writes nothing back. Nothing here reaches RANGER_PARAMS,
//     the abstract graph or the router cost model.
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

import { PROP_MODELS, modelsTagged } from '../data/prop-models.js'   // FEAT-59/60: authored collision metadata
import { REGION_MARGIN } from './mission.js'          // FEAT-61: the wall a customer must sit inside
import { houseRungs, roadDistFromLarry, idKey } from './paper-route.js'   // FEAT-61: the ladder placement serves, in road metres
import { SOURCES } from '../data/offers.js'           // FEAT-67: which types post offers (→ `jobs`)
import { hash32, mulberry32 } from './seed.js'        // per-edge / per-POI PRNG keys (byte-stable)
import { padSd } from './road-carve.js'               // FEAT-71: the pad's own shape, for the yard clip

/** Tunables. Geometry + siting only — none of this may ever enter RANGER_PARAMS. */
export const POI_PARAMS = {
    poiCandidates:    6,      // arcS candidates tried per carrying edge, PER PAD KIND
    // FEAT-105: every candidate that passes is kept if it is at least this far along the edge from
    // the last one kept, so a long edge can offer several pads (it used to stop at the first). The
    // owner asked for "what we need + margin", not a flood: a full 20 m scan was measured at
    // 145–188 pads and 6–8 s per build against today's 41–54 and 0.9 s, so the tries stay random
    // and few. The margin that was actually missing is farm-size pads, which get tries of their own.
    poiPadSpacing:    250,    // m — owner, 2026-10-08: the closest two POIs may sit on one road
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
    poiPumpMinSep:    1000,   // m — FEAT-50: the same anti-clustering floor for the FOUR gas pumps.
                              // Four in a ~3 km region cannot each keep 2 km apart; 1 km still stops
                              // two pumps sharing a junction.
    poiPadHalfLen:    7.0,    // m — half length of the lay-by, along the road
    poiPadHalfWid:    4.0,    // m — half width, across the road
    poiPadGap:        0.6,    // m — gap from the shoulder edge to the pad's near side
    // FEAT-71: corner radius of the carved pad (src/road-carve.js padSd). It was a stadium — round
    // ends of radius poiPadHalfWid — which left no room behind a 12 m trailer's corners, so a
    // building could only stand dead centre with its yard split front and back. Square-ish corners
    // let a model's `seat` push it against the back edge and give the road side a real yard (owner,
    // 2026-10-07). Free in pads: _footprint has always tested the full rectangle. Deepening the pad
    // instead was measured and refused: 10 m deep cost ~35% of viable pads and 5 of 8 census seeds
    // their full roster; 9 m still left 2 short.
    poiPadCornerR:    1.5,    // m
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
    // THE COUNT AND THE DISTANCE BOTH COME FROM THE LADDER — PAPER_PARAMS.tiers and .tierRoadM,
    // read through houseRungs(). There is no poiHouseCount and no poiHouseR: a single count in a
    // single radius cannot serve a ladder, so buildHouses() fills the pool band by band, innermost
    // first, in ROAD metres from Larry's door (owner, 2026-10-15 — this replaced straight-line
    // rings round the region centre, which left Larry on the first ring's edge).
    //
    // COUNT IS HARD, DISTANCE RELAXES — but only as far as it must: a band too sparse to fill its
    // quota borrows the nearest-by-road sites just past its edge, never past the outer band (owner,
    // 2026-10-15; the 2026-08-11 rings were hard, and on a sparse seed left rung one a one-stop
    // route). The outer band and the region wall clamp everything, because past them there is no
    // route — or none inside the ~14 km driving budget.
    poiHouseSpacing:  15,     // m of arc between CANDIDATE sites on one edge. This is how often the
                              // walk LOOKS, not how far apart houses end up — poiHouseMinSep below
                              // owns that, and conflating the two is what starved this pool.
                              // Measured 2026-08-07 at the live 2500 m region radius: at 90 m the
                              // region yielded 6 / 11 / 4 viable customers on seeds 6 / 11 / 42 and
                              // the count could never be met; at 30 m all three place 15 — but only
                              // by letting the ring grow to ~1.7 km. Re-measured 2026-08-11 against
                              // the HARD rings: the FIRST rung's kilometre holds only 5 / 7 / 9 at
                              // 30 m and 9-15 at 15 m, and the first rung is the one that starves.
                              // The step halved because the rings stopped relaxing — the same
                              // supply now has to come out of a third the area. ~230 ms per region,
                              // up from ~110. The reject battery is severe — a target circle needs
                              // naturally flat ground, because unlike a lay-by pad nothing carves it
                              // — so the pool has to be sampled finely to find the flat spots that
                              // do exist. Paid once per region, behind the loading screen, against
                              // a ~15 s cold load.
    poiHouseMinSep:   10,     // m — min spacing between CHOSEN customers, and THE knob that decides
                              // whether a street reads as rural neighbours or as a terrace. Relaxes
                              // (halves) only if the network cannot supply the count at this spacing.
                              // 80 → 10 (owner, 2026-08-11): with hard rings the separation is what
                              // has to give, and 10 m is the owner's floor. In practice it is rarely
                              // reached — the reject battery scatters the viable sites far more
                              // widely than this — so it reads as a backstop, not as a terrace.
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
 * exists. No seed ever ships without its fourth gas pump. The only thing that can shorten the
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
 * `jobs` is WHETHER PARKING HERE OPENS AN OFFER, and it is DERIVED, not hand-set (FEAT-67): a
 * type posts offers iff it has a row in data/offers.js SOURCES (the mission board's source table).
 * Mom's house, the office and the school have none — they only receive (owner, 2026-10-07) — so
 * they wear no interaction ring and answer no park trigger. A marker that wears the ring but answers
 * nothing is the same lie as a prompt drawn wider than its trigger, which this module already
 * refuses to tell; deriving the flag from the one table that decides who posts work is what makes
 * that impossible to get out of step.
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
    // ── Fixtures (R1) ──────────────────────────────────────────────────────────────────────────
    // Exactly one of each per world, and both houses are a short drive from where you wake up.
    // `variant` pins the palette colour (BUG-43): mom's is the authored cyan, Larry's yellow.
    // Both are of the `residence` CLASS (Places and Missions, 2026-10-07) — that tag is what lets a
    // residence-bound delivery end at mom's — and each carries its own fixture tag besides.
    { type: 'momsHouse',    count: 1, model: 'trailerHomeA', siting: 'nearSpawn', variant: 0,
      tags: ['residence', 'mom', 'newsCustomer', 'sleepable'] },
    // Larry hands out the paper route (FEAT-61 Phase E2). He posts offers like any other source,
    // but the brake at his place opens the PaperRouteSystem rather than a point-to-point errand —
    // main.js branches on the type, because he is the only POI whose offer is a different mission.
    { type: 'larrysHouse',  count: 1, model: 'trailerHomeA', siting: 'nearSpawn', variant: 1,
      tags: ['residence', 'larry'] },

    // ── Required classes (10) ──────────────────────────────────────────────────────────────────
    // "Never too far from a station" — the reason the pump and auto-shop slots exist and the reason
    // they are sited by coverage rather than by a spacing rule. Gas and the auto shop are solved
    // INDEPENDENTLY: no constraint was ratified between them, and an auto shop sharing a corner with
    // a pump reads fine.
    //
    // FEAT-50 (owner, 2026-10-16): the PUMP and the STATION are two places. A gas pump is the lone
    // roadside island (ASSET-14) — no storefront, so it only sells fuel: plentiful, because the
    // player fills up often, and it posts nothing (no SOURCES row) and receives nothing
    // (NOT_A_DESTINATION). The gas station IS the convenience store — a general-store variant with
    // its own stock and missions, pump islands plus a storefront lot. It wears the placeholder cube
    // until ASSET-13 joins the 'gasStation' pool, and its pump zones and shop arrive with that model.
    { type: 'gasPump',      count: 4, modelPool: 'gasPump', siting: 'coverage', sepParam: 'poiPumpMinSep' },
    { type: 'gasStation',   count: 1, modelPool: 'gasStation', siting: 'any' },
    { type: 'autoShop',     count: 2, model: null, siting: 'coverage' },
    // ANY FOOD VENDOR (FEAT-67 ruling, 2026-09-26; opening.md amended): the player delivers
    // ready-made meals from it as an independent gig contractor, not as staff, so the opening's
    // "never work there again" still holds. Sited anywhere.
    { type: 'foodVendor',   count: 1, model: null, siting: 'any' },
    // ASSET-74: the country store, on the FARM pad (owner, 2026-10-08) — its paved lot of five
    // nose-in stalls fills the road side, and you park in a stall to be offered work (the model's
    // `park` box, not the round ring). No farm pad free: a lay-by and the placeholder cube, so the
    // roster is never short a store (fallbackModel null = the cube, same ruling).
    { type: 'generalStore', count: 1, model: 'generalStore', fallbackModel: null, siting: 'any' },
    // The type exists so the roster is whole; fishing and The Confluence stay deferred. Do not
    // build its systems off the back of this line.
    { type: 'tackleShop',   count: 1, model: null, siting: 'any' },
    // FEAT-88/91: the firewood yard — the region-1 haul yard. REGION 1 ONLY by design (FEAT-91
    // ruling 2): story mode has one region today, so there is nothing to window yet — the `regions`
    // field lands with region 2. It fits the standard 14 x 8 m lay-by pad (owner, 2026-10-04); the
    // sawmill and quarry will need a bigger pad, also deferred to FEAT-91.
    //
    // `drop` is the DROP ZONE (owner, 2026-10-05): a bed-sized rectangle on the ground, model-local
    // (+X along the road, -Z toward it — the marker's own frame), long axis along X. It replaces
    // the orange ring: park with your bed over it and the yard's offers open; accept and the load
    // drops one piece at a time at FIXED points over the rectangle, not over wherever your truck
    // is. Parking is the skill — a bed half off the zone catches half a load. On the firewood yard
    // it sits in the lane between the bundle row and the pile of splits (ASSET-36). Data, not a
    // model empty, so physics never waits on a fetch.
    { type: 'firewoodYard', count: 1, model: 'splittingYard', siting: 'any',
      drop: { x: -4.0, z: -1.2, halfX: 0.92, halfZ: 0.70 } },
    // The job site. Sited 'any' until FEAT-103 puts it on the region wall; placeholder cube until
    // ASSET-71 ships.
    { type: 'workSite',     count: 1, model: null, siting: 'any' },

    // ── Additional classes (12) ────────────────────────────────────────────────────────────────
    // Job givers and receivers only, for now. They sit BELOW every required class on purpose: a
    // short pad pool takes its shortfall from here, never from a gas station.
    //
    // MODEL POOL, not one model (owner, 2026-08-15). `modelPool` names a data/prop-models.js TAG
    // and each residence draws from every asset carrying it, keyed to the pad's own identity so the
    // choice is a pure function of the seed. Widening the pool is therefore a one-line edit to the
    // registry — and the owner has ruled that widening it MAY reshuffle which marker wears what on
    // an existing seed. That is the licence this design is built on; do not add a stability
    // guarantee here without re-reading that sentence.
    { type: 'residence',    count: 5, modelPool: 'residence', siting: 'any' },
    // Office, school and doctor stand on placeholder cubes until their models ship (ASSET-73/69/70).
    // A farm is a residence too (owner, 2026-10-07), so anything bound for a residence may end at one.
    // FEAT-105: the farm stands on the ASSET-66 barn, doors to the road, on its own 22 x 11.2 m farm
    // pad with a clutter yard beside it. A region with no spot for that pad falls back to a lay-by
    // and the broadside barn, no yard (owner, 2026-10-08). The farm composite (ASSET-65..67)
    // replaces the lone barn later.
    { type: 'farm',         count: 2, model: 'barn', fallbackModel: 'barnBroadside', siting: 'any',
      tags: ['residence'] },
    // FEAT-74 (owner, 2026-10-16): the third farm is the produce stall, its own farm POI on a lay-by —
    // the farmhouse is imagined just off the road. Same class, same jobs, no yard.
    { type: 'farm',         count: 1, model: 'produceStall', siting: 'any', tags: ['residence'] },
    { type: 'office',       count: 1, model: null, siting: 'any' },
    { type: 'school',       count: 1, model: null, siting: 'any' },
    { type: 'doctor',       count: 1, model: null, siting: 'any' },
    // The pad is permanent (worldgen); the broken-down car shows ONLY while the motorist has a job
    // open (FEAT-102, `showWhileJob` — main.js _updatePoiPresence). Idle, it is an empty lay-by.
    { type: 'strandedMotorist', count: 1, model: 'brokenCar', siting: 'any', showWhileJob: true },
]

/**
 * FEAT-88: POI `q`'s drop zone in world space — its centre and the yaw of the marker frame it is
 * authored in (the zone's long axis is that frame's +X). Null for a POI with no drop zone.
 * Same mapping as the mesh: model (x, z) → world (x·cos + z·sin, −x·sin + z·cos).
 * `box` defaults to the drop zone; ASSET-74 passes the model's park box (`q.park`) — same frame.
 */
export function dropZoneWorld (q, box = q?.drop) {
    const b = box
    if (!b) return null
    const yaw = q.modelYaw ?? q.yaw ?? 0
    const cs = Math.cos(yaw), sn = Math.sin(yaw)
    const ox = q.modelX ?? q.x, oz = q.modelZ ?? q.z
    return { x: ox + b.x * cs + b.z * sn, y: q.y, z: oz - b.x * sn + b.z * cs, yaw, halfX: b.halfX, halfZ: b.halfZ }
}

/**
 * FEAT-88: is the world point (x, z) over POI `q`'s drop zone, grown by `slack` metres on every
 * side? Pure. The point is taken into the marker's own frame the way queryContact does (undo
 * modelYaw about Y) and tested against the rectangle. False for a POI with no drop zone.
 * `box` defaults to the drop zone; ASSET-74 passes the model's park box (`q.park`) — same frame.
 */
export function overDropZone (q, x, z, slack = 0, box = q?.drop) {
    const b = box
    if (!b) return false
    const yaw = q.modelYaw ?? q.yaw ?? 0
    const cs = Math.cos(yaw), sn = Math.sin(yaw)
    const wx = x - (q.modelX ?? q.x), wz = z - (q.modelZ ?? q.z)
    const dx = cs * wx - sn * wz, dz = sn * wx + cs * wz
    return Math.abs(dx - b.x) <= b.halfX + slack && Math.abs(dz - b.z) <= b.halfZ + slack
}

/**
 * FEAT-71: which satellite pool (a data/prop-models.js tag) dresses a POI of each CLASS. Asked by
 * tag, so mom's and Larry's houses — `residence` among their tags — are dressed like any other.
 * A class missing here gets no yard at all: nothing spawns without an anchor that reads as owning
 * it (a flamingo on bare dirt is litter, not habitation).
 */
export const YARD_POOLS = { residence: 'lawnFurniture', farm: 'yardClutter' }

const YARD_GAP = 0.05    // m — clearance between two satellites; a cluster stands nearly touching
const YARD_SOLID_GAP = 0.15   // m — clearance from the POI model's own collision boxes

/**
 * FEAT-71: place lawn furniture / yard clutter in POI `q`'s yard. Pure, and deterministic in
 * (seed, q.id) — the same discipline as the model pick — so a re-stream of the region rebuilds the
 * identical yard. Returns [{ key, x, y, z, yaw, variant, lift }] in world space; [] for a POI whose
 * class has no pool or that has no yard.
 *
 * `yard` is rectangles in the MODEL's frame (prop-models.js `yard`). 3–6 props, in GROUPS: an asset
 * comes with 1..n of its own kind (its `yardGroup`), the first on a random point of the yard and
 * each next one nearly touching the last at a random bearing, so drums stand in twos and threes
 * instead of evenly sprinkled. A candidate is a CIRCLE enclosing the asset's footprint at any yaw,
 * and it is kept only if it lies wholly inside a yard rectangle AND the carved pad (padSd — so on
 * graded ground, never off the edge onto raw hillside, and the pad already keeps clear of the road),
 * clear of every model collision box, and clear of every satellite already placed.
 *
 * Static dressing only (owner, 2026-09-22): meshes, no bodies, no contact — the truck drives
 * through them.
 */
export function dressYard (q, seed, yard) {
    const tag = q.tags?.find(t => YARD_POOLS[t])
    if (!tag || !yard?.length) return []
    const pool = modelsTagged(YARD_POOLS[tag])
    if (!pool.length) return []
    const rnd = mulberry32(hash32(`poi-yard:${seed}:${q.id}`))
    // 3–6 props, unless the model's yard is bigger and says so (`yardCount` — the farm's is 5–9).
    const [cMin, cMax] = PROP_MODELS[q.modelKey]?.yardCount ?? [3, 6]
    const want = cMin + Math.floor(rnd() * (cMax - cMin + 1))
    const yaw = q.modelYaw ?? q.yaw
    const cs = Math.cos(yaw), sn = Math.sin(yaw)
    const ox = q.modelX ?? q.x, oz = q.modelZ ?? q.z
    // Model-frame (x, z) → world, the mapping the mesh uses.
    const wx = (x, z) => ox + x * cs + z * sn
    const wz = (x, z) => oz - x * sn + z * cs
    // The model's solid footprint in its own frame; a keyless marker is the placeholder cube.
    const c = q.collision
    const cube = POI_PARAMS.poiCubeSize
    const solids = (c?.boxes ?? [{ c: null, s: c?.size ?? [cube, cube, cube] }])
        .map(b => ({ x: b.c ? b.c[0] : 0, z: b.c ? b.c[2] : 0, hx: b.s[0] * 0.5, hz: b.s[2] * 0.5 }))
    const areas = yard.map(b => b.halfX * b.halfZ)
    const areaSum = areas.reduce((a, b) => a + b, 0)

    const placed = []   // { x, z, r } in the model frame
    const fits = (x, z, r) => {
        if (!yard.some(b => Math.abs(x - b.x) + r <= b.halfX && Math.abs(z - b.z) + r <= b.halfZ)) return false
        if (padSd(q, wx(x, z) - q.x, wz(x, z) - q.z) + r > 0) return false
        for (const b of solids) {
            const ex = Math.max(Math.abs(x - b.x) - b.hx, 0), ez = Math.max(Math.abs(z - b.z) - b.hz, 0)
            if (Math.hypot(ex, ez) < r + YARD_SOLID_GAP) return false
        }
        return placed.every(p => Math.hypot(x - p.x, z - p.z) >= r + p.r + YARD_GAP)
    }
    const randomPoint = () => {
        let k = rnd() * areaSum, i = 0
        while (i < yard.length - 1 && k > areas[i]) k -= areas[i++]
        const b = yard[i]
        return [b.x + (rnd() * 2 - 1) * b.halfX, b.z + (rnd() * 2 - 1) * b.halfZ]
    }

    const out = []
    for (let groupTry = 0; out.length < want && groupTry < 24; groupTry++) {
        const key = pool[Math.floor(rnd() * pool.length)]
        const spec = PROP_MODELS[key]
        const col = spec.collision
        const r = col.radius ?? Math.hypot(col.size[0], col.size[2]) * 0.5
        // A sphere's origin is its centre (the beach ball), so it stands on its radius.
        const lift = col.shape === 'sphere' ? col.radius : 0
        const [gMin, gMax] = spec.yardGroup ?? [1, 1]
        const group = Math.min(want - out.length, gMin + Math.floor(rnd() * (gMax - gMin + 1)))
        let last = null
        for (let k = 0; k < group; k++) {
            let at = null
            for (let t = 0; t < 8 && !at; t++) {
                let x, z
                if (last) {
                    const a = rnd() * Math.PI * 2, d = 2 * r + YARD_GAP + rnd() * 0.15
                    x = last[0] + Math.cos(a) * d; z = last[1] + Math.sin(a) * d
                } else [x, z] = randomPoint()
                if (fits(x, z, r)) at = [x, z]
            }
            if (!at) break   // the group stops where the yard runs out; the next group tries elsewhere
            placed.push({ x: at[0], z: at[1], r })
            last = at
            out.push({
                key,
                x: wx(at[0], at[1]),
                // Provisional: build() re-stands it on the carved ground once the pads exist.
                y: q.y + lift,
                lift,
                z: wz(at[0], at[1]),
                // -Z faces the road (q.yaw, the PAD's yaw — not the model's, a broadside Winnebago
                // must not turn the chairs with it), jittered by the asset's own yardYaw.
                yaw: q.yaw + (rnd() * 2 - 1) * (spec.yardYaw ?? Math.PI),
                variant: Math.floor(rnd() * 0x7fffffff),
            })
        }
    }
    return out
}

/**
 * FEAT-105: the BIG pad kinds, by name. A registry model asks for one with `pad: '<name>'`, and every
 * model naming the same kind draws from ONE pool of those pads — the barn and the general store
 * (ASSET-74) share the farm pad. Named, not sized per model, so two models can never drift onto
 * separate kinds by a typo in their dims. The name is part of each pad's hash and id (`:farm@n`), so
 * renaming a kind reshuffles where its pads land.
 */
export const PAD_KINDS = {
    farm: { halfLen: 11, halfWid: 5.6 },   // 22 m along the road x 11.2 m deep
}

/**
 * FEAT-105: the pad KINDS pass 1 sites. 'std' is the 14 x 8 lay-by every slot used to share; a roster
 * slot whose model names a registry `pad` draws only from pads of that kind. Derived from the roster,
 * so a big-pad kind is sited only while some slot needs it.
 */
export function padKinds (P) {
    const kinds = [{ key: 'std', halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid }]
    for (const slot of POI_ROSTER) {
        const key = slotPadKind(slot)
        if (!kinds.some(k => k.key === key)) kinds.push({ key, ...PAD_KINDS[key] })
    }
    return kinds
}

/** The pad kind a roster slot needs: its model's named kind, else the standard lay-by. */
const slotPadKind = slot => (slot.model && PROP_MODELS[slot.model]?.pad) || 'std'

/**
 * FEAT-105: two candidate pads that cannot BOTH be taken — the same edge, closer than poiPadSpacing
 * along it. Pads of one kind are already that far apart (the scan jumps), so this only ever bites
 * between kinds: a farm pad and a lay-by sited independently on the same stretch. Pads on different
 * edges never clash — _otherRoadNear keeps every pad clear of every other road.
 */
const padsClash = (a, b, spacing) => a.edge === b.edge && Math.abs(a.s - b.s) < spacing

/** Region population (23 in R1), derived from the roster so the two can never drift apart. */
export const POI_COUNT = POI_ROSTER.reduce((n, s) => n + s.count, 0)

// Footprint sampling for the earthwork test: a 3 × 5 lattice over the pad, plus the centre.
const CUTFILL_NU = 5, CUTFILL_NV = 3

// The graph's edges as {ka, kb, a, b} (ka < kb), sorted by canonical key — a stable order for ids.
function _canonEdges (g) {
    const canon = []
    for (const [a, b] of g.edges) {
        const ka = idKey(a), kb = idKey(b)
        canon.push(ka < kb ? { ka, kb, a, b } : { ka: kb, kb: ka, a: b, b: a })
    }
    return canon.sort((u, v) => (u.ka === v.ka ? (u.kb < v.kb ? -1 : 1) : (u.ka < v.ka ? -1 : 1)))
}

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
     * against a 23-slot roster, so anything picking a destination out of this list would end up
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

    /**
     * Everyone who receives a newspaper: the houses, plus any roster POI tagged as a customer.
     * With `maxTier`, only those on that paper-route rung's route — stamped at or below it by
     * buildHouses. A customer past the outer band carries no stamp and is on no route.
     */
    customers (maxTier = null) {
        const all = this.tagged('newsCustomer')
        return maxTier == null ? all : all.filter(c => (c.paperTier ?? Infinity) <= maxTier)
    }

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
     *
     * @param {Set<string>|null} [nodes] BUG-85: the main piece's node keys (world-validate.js
     *        `mainNodes`). An edge with a node outside it is on a STRANDED piece and hosts no POI.
     */
    build (center, radius, nodes = null) {
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
        const canon = _canonEdges(g)

        // PASS 1 — THE POOL. Every edge offers every pad it can seat, of every kind (FEAT-105: the
        // 14 x 8 lay-by, plus each bigger pad a roster model asks for), spaced poiPadSpacing apart
        // along it; nothing is rolled away. Each pad is a pure function of (seed, edge, kind), and
        // the population is not the tail of a coin flip (FEAT-60): pass 2 selects from this pool,
        // which is how a region can be guaranteed a gas station.
        const pool = []
        const seen = new Set()
        const wall = radius - REGION_MARGIN
        const edgeInWall = (id) => { const q = g.pos(id); return Math.hypot(q.x - center.x, q.z - center.z) <= wall }
        for (const e of canon) {
            const ek = `${e.ka}|${e.kb}`
            if (seen.has(ek)) continue      // networkGraph can list an edge twice (both run keys)
            seen.add(ek)
            for (const kind of padKinds(P)) for (const poi of this._padsOnEdge(road, e, P, seed, kind)) {
            // THE REGION CLIP IS A POST-FILTER, NEVER A REJECT TEST. Applied inside candidate
            // selection it would make WHICH arc position wins depend on the region centre — and a
            // POI 400 m inside the wall then moved when the window moved. Window-invariance means
            // the edge decides where its POI goes; the region only decides whether it is kept.
            if (Math.hypot(poi.x - center.x, poi.z - center.z) > radius - poi.halfLen - 20) continue
            // FEAT-67: …and its EDGE must be one the mission planner can use. The planner drops any
            // edge with a node past the wall less REGION_MARGIN (mission.js buildGraphAdj), so a POI
            // standing on one posts offers no route can serve — owner-reported, seed 2987375593: a
            // general store 2403 m out on a 2500 m region showed cards with no route and no pay.
            // The newspaper customers already obey this exact rule (buildHouses); POIs now match.
            // Still a post-filter on (edge, region), so placement stays window-invariant.
            if (!edgeInWall(e.a) || !edgeInWall(e.b)) continue
            // BUG-85: …and it must be on the MAIN piece. A stranded piece is inside the wall but no
            // road joins it to the spawn, so a POI there is a customer nobody can drive to.
            if (nodes && (!nodes.has(e.ka) || !nodes.has(e.kb))) continue
            pool.push(poi)
            }
        }

        // PASS 2 — THE ROSTER. Fill the ratified slots from the pool and discard the rest.
        const out = this._assignRoster(pool, center, seed, P)
        out.forEach((q, i) => { q.index = i })

        this._list = out
        this._pool = pool
        this._built = { x: center.x, z: center.z, r: radius, seed }
        road.setPoiPads(out)
        // FEAT-71: stand the yard on the CARVED ground, which only exists now the pads are handed
        // over. It is not q.y: the bench sits roadClearanceMargin under the pad's design top, and
        // the road-side strip blends with the shoulder by a few cm.
        const ground = this._d.getTerrain?.()
        if (ground?.analyticHeight) {
            for (const q of out) for (const sat of q.satellites) sat.y = ground.analyticHeight(sat.x, sat.z) + sat.lift
        }
        return out
    }

    // ── newspaper customers (FEAT-61) ───────────────────────────────────────────────────────
    /**
     * Place the region's newspaper customers: roadside delivery targets in road-distance bands
     * around Larry's house, each stamped with the paper-route rung it serves (`paperTier`). Call
     * AFTER build() — Larry is where the bands are measured from, and mom (a roster POI) is a
     * customer too.
     *
     * Deliberately NOT the pad path. A customer is a thing you throw at from the road: no bench is
     * carved, no earthwork is billed, and nothing here reaches setPoiPads(). The whole FEAT-46
     * determinism guarantee — that a seed's road surface is identical with and without story mode —
     * is untouched by this feature because it never writes to the carve at all.
     */
    buildHouses (center, radius, nodes = null) {
        const road = this._d.getRoad()
        if (!road || !center) return this._houses
        const P = { ...POI_PARAMS, ...this._d.getParams() }

        // Same canonical edge order as build(), for the same reason: the Map's order is a streaming
        // artifact, and ids have to be stable across windows.
        const g = road.networkGraph()
        const canon = _canonEdges(g)

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
        // pads are: a site's position is a pure function of (seed, edge, step index), and the band
        // below is a POST-FILTER, never a reject test.
        const cands = []
        const seen = new Set()
        for (const e of canon) {
            const ek = `${e.ka}|${e.kb}`
            if (seen.has(ek)) continue
            seen.add(ek)
            if (!nodeInside(e.a) || !nodeInside(e.b)) continue
            if (nodes && (!nodes.has(e.ka) || !nodes.has(e.kb))) continue   // BUG-85: main piece only
            this._placeHousesOnEdge(road, e, P, cands)
        }

        // FILL THE LADDER, INNERMOST BAND FIRST — in ROAD metres from Larry's door (owner,
        // 2026-10-15; replaced the 2026-08-11 straight-line rings round the region centre, which put
        // Larry on the first ring's edge on seed 1097699782 and drew a 7.1 km four-house route).
        //
        // The bands are cumulative (distance, count) quotas — 4 within 1 km of road, 9 within 2 km,
        // 12 within 3 km, 15 within 5 km — and each pass TOPS UP the previous one rather than
        // re-picking. A band the network cannot fill BORROWS the nearest sites past its edge (below).
        // Each house is STAMPED with the rung it was added for (`paperTier`), and a rung's route is
        // everyone stamped at or below it: who is on a route is decided HERE, once,
        // and the planner only orders them. SM-INV-12's nesting is therefore true by construction —
        // the route grows, it never moves. Every house is placed, always; the tier only decides
        // who is on today's route. Only when even the outer band runs dry does a rung stay short.
        //
        // Distance is measured on the planner's own split graph (roadDistFromLarry), so "1 km from
        // Larry" here is the same drive the route will price. No Larry, no route, no houses.
        const larry = this._list.find(q => q.type === 'larrysHouse')
        // Roster POIs that also take a paper (mom). They are stamped like a house and count toward
        // the band they fall in; a stamp from a previous build is cleared first.
        const roster = this._list.filter(q => q.tags?.includes('newsCustomer'))
        for (const q of roster) delete q.paperTier
        const dist = larry ? roadDistFromLarry(road, larry, [...cands, ...roster],
            { x: center.x, z: center.z, r: radius, nodes }, REGION_MARGIN) : null
        if (!dist) { this._houses = []; return this._houses }
        let picked = []
        for (const rung of houseRungs()) {
            const inBand = (q) => (dist.get(q.id) ?? Infinity) <= rung.d
            for (const q of roster) if (q.paperTier == null && inBand(q)) q.paperTier = rung.tier
            const own = roster.filter(q => q.paperTier != null).length
            const had = new Set(picked.map(q => q.id))
            let band = cands.filter(inBand)
            // A SHORT BAND BORROWS (owner, 2026-10-15): the count holds and the distance relaxes as
            // little as it can — the nearest-by-road sites just past the band's edge, never past the
            // outer band. Measured on seed 6 (@4500,600) the 1 km band held ONE viable site; hard,
            // rung one was a one-stop route; borrowing makes it four houses out to 1.93 km.
            const short = rung.n - own - picked.length - band.filter(q => !had.has(q.id)).length
            if (short > 0) {
                const outer = houseRungs().at(-1).d
                const past = cands.filter(q => !had.has(q.id) && !inBand(q) && (dist.get(q.id) ?? Infinity) <= outer)
                    .sort((a, b) => dist.get(a.id) - dist.get(b.id))
                band = band.concat(past.slice(0, short))
            }
            picked = this._pickSpread(band, Math.max(0, rung.n - own), P.poiHouseMinSep, picked)
            for (const q of picked) if (!had.has(q.id)) q.paperTier = rung.tier
            if (picked.length + own < rung.n) {
                console.warn(`[poi] the ${rung.d | 0} m road band holds only ${band.length} viable house`
                    + ` sites (${cands.length} region-wide) — placed ${picked.length + own}/${rung.n} customers`)
            }
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
     * THE OTHER-ROAD KEEP-OUT (owner, 2026-09-07). A site is evaluated against ITS edge: `lat`
     * metres off that centreline, past its shoulder. Nothing checked the OTHER roads. Two legs of
     * a junction leave it a road width and a half apart, and a house target 13 m off one of them
     * landed 2.6 m from the other's centreline — the first customer of seed 1517161527's paper
     * route sat on the neighbouring road's asphalt. So: the road nearest the site must be the
     * site's own, and nothing else may pass inside the same `lat` the site keeps from its own road.
     * One query, no routing change — a router-side keep-out would move roads for a placement
     * problem.
     */
    _otherRoadNear (road, ownKey, cx, cz, lat) {
        if (!road.queryNearest) return false
        const hit = road.queryNearest(cx, cz, lat)
        if (!hit || !hit.point) return false
        if (hit.runKey === ownKey) return false
        return Math.hypot(hit.point.x - cx, hit.point.z - cz) < lat
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
        // 2b. OTHER roads (owner, 2026-09-07): see _otherRoadNear.
        if (this._otherRoadNear(road, ed.key, cx, cz, lat)) return null

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
     *
     * `pre` is a set already chosen by an inner rung: it is kept whole, counts toward `n`, and is
     * what every candidate must clear `minSep` against. Keeping it whole even as the separation
     * relaxes is what makes the rungs nest — see buildHouses().
     */
    _pickSpread (cands, n, minSep, pre = []) {
        const have = new Set(pre.map(q => q.id))
        cands = cands.filter(q => !have.has(q.id))
        if (pre.length + cands.length <= n) return [...pre, ...cands]
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
            const out = pre.slice()
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
        let free = pool.slice()
        const out = []
        // The coverage objective's sample of "where the player will be": the lay-bys alone, so adding a
        // big-pad kind does not re-weight where the gas stations go.
        const stdPool = pool.filter(q => (q.padKind ?? 'std') === 'std')
        const pick = (cands, n, salt, slot) =>
            slot.siting === 'nearSpawn' ? this._pickNearSpawn(cands, center, n, salt, P)
          : slot.siting === 'coverage'  ? this._pickCoverage(cands, stdPool, n, P[slot.sepParam ?? 'poiStationMinSep'])
          :                               this._pickStable(cands, n, salt)
        for (const slot of POI_ROSTER) {
            // FEAT-105: a slot draws only from pads of its own kind. A big-pad slot that comes up short
            // (a region with no spot for a farm pad) falls back to lay-bys wearing its fallbackModel —
            // the roster is never short a farm for want of a big pad (owner, 2026-10-08).
            const kind = slotPadKind(slot)
            const picks = pick(free.filter(q => (q.padKind ?? 'std') === kind), slot.count, slot.type, slot)
            // `'fallbackModel' in slot`, not its truthiness: null is a real fallback — the cube.
            if (picks.length < slot.count && kind !== 'std' && 'fallbackModel' in slot) {
                const lay = free.filter(q => (q.padKind ?? 'std') === 'std' && !picks.some(p => padsClash(p, q, P.poiPadSpacing)))
                picks.push(...pick(lay, slot.count - picks.length, `${slot.type}:fallback`, slot))
            }
            // NOTE `pool` is already this method's pad pool — the model pool needs its own name.
            const models = slot.modelPool ? modelsTagged(slot.modelPool) : null
            for (const q of picks) {
                q.type = slot.type
                // FEAT-61 — see the TAGS note above. The type leads the list, so every POI carries
                // its own class tag (Places and Missions); a fixture adds its class (mom's is a
                // `residence`) through `slot.tags`.
                q.tags = [slot.type, ...(slot.tags ?? [])]
                q.jobs = !!SOURCES[slot.type]   // FEAT-67 — see the `jobs` note above
                q.modelKey = models?.length
                    // Keyed to the pad's own id, the same discipline as _pickStable and for the
                    // same reason: the choice must depend on WHICH pad this is, never on how many
                    // pads happened to be streamed when the pool was gathered.
                    ? models[hash32(`poi-model:${seed}:${q.id}`) % models.length]
                    : (q.padKind ?? 'std') === kind ? (slot.model ?? null) : slot.fallbackModel
                // Stamp the authored collision box NOW, off the registry, not when the GLB
                // resolves: physics must not wait on a fetch, or a marker would be driveable-
                // through for the first seconds of a region and solid afterwards.
                const spec = q.modelKey ? PROP_MODELS[q.modelKey] : null
                q.collision = spec?.collision || null
                // The yaw the MODEL stands at, as opposed to q.yaw's "this pad faces the road".
                // Assets whose length runs down their own -Z (vehicles) are quarter-turned so the
                // long axis lies along the pad's 14 m rather than across its 8 m — see yawOffset
                // in data/prop-models.js. Both the mesh and the oriented contact box read THIS.
                q.modelYaw = q.yaw + (spec?.yawOffset ?? 0)
                // FEAT-71: where the MODEL stands, as opposed to q.x/q.z, the pad centre (which the
                // carve, the ring and the park trigger keep using). `seat` slides it that many metres
                // away from the road so its yard is the road side. Mesh, contact box, drop zone and
                // yard all read THIS origin.
                // FEAT-105: `seatAlong` slides it along its OWN +X as well — the barn stands at one end
                // of its long farm pad with the yard beside it. The model's +X in world is
                // (cos modelYaw, −sin modelYaw), the same mapping the mesh uses.
                const seat = spec?.seat ?? 0, along = spec?.seatAlong ?? 0
                q.modelX = q.x + q.nx * seat + Math.cos(q.modelYaw) * along
                q.modelZ = q.z + q.nz * seat - Math.sin(q.modelYaw) * along
                // BUG-91: the height the model, its colliders and the cube stand on — the CARVED
                // GROUND, not q.y. q.y is the pad's design top; _poiPadCarve grades the bench to
                // q.y − roadClearanceMargin (same default) and physics rides that dirt, so a model
                // base-seated at q.y floated 15 cm over its own pad. The camp seat (main.js) already
                // corrects for the same gap. q.y stays the pad's record: the carve keys off it.
                q.baseY = q.y - (P.roadClearanceMargin ?? 0.25)
                // BUG-43: which colour from the model's curated palette. A slot may pin it (the
                // two story houses must never match); otherwise a raw hash off the pad id, which
                // spawnModel takes modulo the palette length. Ignored by a model with no palette.
                q.modelVariant = slot.variant ?? hash32(`poi-variant:${seed}:${q.id}`)
                q.drop = slot.drop ?? null   // FEAT-88 drop zone — see the firewoodYard slot
                q.showWhileJob = !!slot.showWhileJob   // FEAT-102 — main.js sets q.hidden from the board
                // ASSET-74: the model's PARK box — park inside it to be offered work. Off the model,
                // not the slot: it is the painted stalls, so a fallback cube has none.
                q.park = spec?.park ?? null
                // FEAT-50: the model's PUMP ZONES — pull alongside and pull the handbrake to use the pump.
                // Off the model, like the park box: a pump island has them, a cube does not.
                q.pumpZones = spec?.pumpZones ?? null
                // FEAT-71: the lawn furniture / yard clutter standing in this POI's yard — the
                // model's authored yard, else the slot's (none today; FEAT-105's farm pad will want one).
                q.satellites = dressYard(q, seed, spec?.yard ?? slot.yard)
                // Taken: out of the pool, and so is every pad of another kind it would overlap.
                free = free.filter(o => o !== q && !padsClash(o, q, P.poiPadSpacing))
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
     * n = 2 (the auto shops) is EXHAUSTIVE over pairs: the pool is tens, so ~10^3 distance
     * evaluations, and the result is the true optimum. n > 2 (FEAT-50's four gas pumps) is GREEDY
     * farthest-point: the first pick is the pad that alone covers the pool best, and each next pick
     * is the free pad farthest from every pick so far (subject to the same halving floor), then a
     * swap pass improves it. Greedy k-centre is within 2× of the optimal worst-case distance before
     * the swaps, and the whole search is a few passes instead of C(pool, n) subsets.
     *
     * @param {number} minSep — the slot's anti-clustering floor (poiStationMinSep / poiPumpMinSep).
     */
    _pickCoverage (free, pool, n, minSep) {
        if (free.length <= n) return free.slice()
        if (n > 2) return this._pickCoverageGreedy(free, pool, n, minSep)
        // Worst-case distance from any pad in the pool to the nearer of (a, b).
        const worst = (a, b) => {
            let w = 0
            for (const q of pool) {
                const d = Math.min(Math.hypot(q.x - a.x, q.z - a.z), Math.hypot(q.x - b.x, q.z - b.z))
                if (d > w) w = d
            }
            return w
        }
        for (let sep = minSep; ; sep *= 0.5) {
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

    /** Greedy farthest-point coverage for n > 2 — see _pickCoverage. Ties go to the earlier pad. */
    _pickCoverageGreedy (free, pool, n, minSep) {
        // Order-independent: the swap pass below is a LOCAL search, so the order it visits pads in
        // can pick which local optimum it settles on. Sorting by pad id makes the answer a function of
        // the SET of pads alone — the same region filtered by its main piece or not (region-pieces).
        const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        free = free.slice().sort(byId)
        const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
        let first = null, firstW = Infinity
        for (const a of free) {
            let w = 0
            for (const q of pool) w = Math.max(w, d(q, a))
            if (w < firstW) { firstW = w; first = a }
        }
        const picks = [first]
        while (picks.length < n) {
            const nearest = q => Math.min(...picks.map(p => d(q, p)))
            let next = null
            for (let sep = minSep; !next; sep *= 0.5) {
                let far = -1
                for (const q of free) {
                    if (picks.includes(q)) continue
                    const m = nearest(q)
                    if ((m >= sep || sep < 1) && m > far) { far = m; next = q }
                }
            }
            picks.push(next)
        }
        // Greedy farthest-point leans on the rim (each pick is the worst-covered pad, which is an
        // outlier by construction). One SWAP pass pulls it back: replace any pick with any free pad
        // that lowers the worst-case distance and keeps the floor, until no swap helps. n × pool ×
        // pool per round — a few ×10^4 distance evaluations for four pumps.
        const worst = set => {
            let w = 0
            for (const q of pool) { let m = Infinity; for (const p of set) m = Math.min(m, d(q, p)); if (m > w) w = m }
            return w
        }
        const sepOk = (set, i, c) => set.every((p, k) => k === i || d(p, c) >= minSep)
        let w = worst(picks)
        for (let improved = true; improved;) {
            improved = false
            for (let i = 0; i < picks.length; i++) for (const c of free) {
                if (picks.includes(c) || !sepOk(picks, i, c)) continue
                const trial = picks.slice(); trial[i] = c
                const tw = worst(trial)
                if (tw < w - 1e-9) { picks[i] = c; w = tw; improved = true }
            }
        }
        return picks
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
            if (q.hidden) continue                    // FEAT-102: an absent motorist answers nothing
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
     * dims, rotated to the marker's modelYaw (an ORIENTED box — a 12 m trailer standing at 40° to the
     * world axes has a world AABB half again its size, and you would bounce off thin air two metres
     * from the wall). Keyless POIs keep the poiCubeSize cube, which the yaw leaves unchanged
     * because a cube is rotation-invariant — so their contact is bit-identical to before.
     */
    queryContact (cx, cy, cz, r) {
        const cube = (this._d.getParams?.()?.poiCubeSize ?? POI_PARAMS.poiCubeSize) * 0.5
        for (const q of this._list) {
            if (q.hidden) continue                    // FEAT-102: a hidden marker has no collider
            const hit = this._boxesContact(q, cube, cx, cy, cz, r)
            if (hit) return hit
        }
        return null
    }

    /**
     * One marker's contact. Its solid shape is `collision.boxes` when the asset lists several
     * (offset, model-local — a yard of separate things), else one box of `collision.size` centred
     * on the marker, else the placeholder cube. First box in contact wins, as POIs never overlap.
     */
    _boxesContact (q, cube, cx, cy, cz, r) {
        const c = q.collision
        const boxes = c?.boxes ?? [{ c: null, s: c?.size ?? [cube * 2, cube * 2, cube * 2] }]
        for (const b of boxes) {
            const hx = b.s[0] * 0.5, hy = b.s[1] * 0.5, hz = b.s[2] * 0.5
            const ox = b.c ? b.c[0] : 0, oy = b.c ? b.c[1] : hy, oz = b.c ? b.c[2] : 0
            // Broad phase in world space against the box's bounding radius (about the marker
            // origin, so an offset box is still enclosed) — cheap and rotation-proof, so the
            // oriented test below only runs for a marker actually within reach.
            const wx = cx - (q.modelX ?? q.x), wz = cz - (q.modelZ ?? q.z)
            const reach = Math.hypot(Math.abs(ox) + hx, Math.abs(oz) + hz) + r
            if (wx * wx + wz * wz > reach * reach) continue
            const bcy = (q.baseY ?? q.y) + oy         // box centre: base-seated on the carved ground (BUG-91)
            const dy = cy - bcy
            if (dy > hy + r || dy < -hy - r) continue
            // Into the marker's own frame: undo yaw about Y. (cos, −sin; sin, cos) is the inverse
            // of the rotation applied to the mesh, so dx runs along the model's +X and dz its +Z.
            // modelYaw, NOT the pad yaw — a quarter-turned Winnebago's box must turn with it.
            const cs = Math.cos(q.modelYaw ?? q.yaw ?? 0), sn = Math.sin(q.modelYaw ?? q.yaw ?? 0)
            const dx =  cs * wx - sn * wz - ox
            const dz =  sn * wx + cs * wz - oz
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
     * FEAT-105: the pads of kind `kind` this edge offers. `poiCandidates` arc positions are drawn
     * from the edge's own PRNG, each tries both sides, and every one that passes is kept if it lies
     * poiPadSpacing or more along the edge from the last kept — so a long edge can offer several,
     * a short one at most one. A pure function of (seed, edge, kind): the same edge yields the same
     * pads from any window, so placement stays window-invariant (FEAT-60), keyed off the graph edge
     * and never the streamed runKey.
     *
     * `kind` is { key, halfLen, halfWid }: 'std' is the 14 x 8 lay-by; a model that needs more asks
     * through its registry `pad` and gets its own tries, so a pad's kind is decided when it is sited.
     */
    _padsOnEdge (road, e, P, seed, kind) {
        const ed = road.edgeParData(e.a, e.b)
        if (!ed || !ed.centerline) return []
        // QUAL-24: this edge may be a STRETCH of a longer run — a deg-2 chain merge swallowed it — so
        // its arc domain is [off, off+L] inside the registered run, not [0, len]. `s` below stays in
        // that run's GLOBAL arc domain, which is what the pad record, tunnelSpanAt and the mission
        // anchor all expect. An unmerged edge reports off=0 and L=len, so this is identity there.
        const off = ed.arcOffset ?? 0
        const L = ed.arcLength ?? ed.centerline.length
        const clear = P.poiEndClearM
        if (!(L > 2 * clear + 40)) return []      // too short to hold a pad clear of both ends

        const halfWidth     = P.roadHalfWidth     ?? 5
        const shoulderWidth = P.roadShoulderWidth ?? 2.5
        // The pad's own geometry, for _evaluate / _footprint (they read it off P).
        const K = { ...P, poiPadHalfLen: kind.halfLen, poiPadHalfWid: kind.halfWid }
        // Lateral offset from the CENTERLINE to the pad centre: past the shoulder, past the gap,
        // then half the pad. The pad's near edge therefore sits `poiPadGap` beyond the shoulder.
        const lat = halfWidth + shoulderWidth + P.poiPadGap + kind.halfWid
        const ek = `${e.ka}|${e.kb}`
        const tag = kind.key === 'std' ? '' : `:${kind.key}`
        const rnd = mulberry32(hash32(`poi:${seed}:${ek}${tag}`))

        const stations = []
        for (let k = 0; k < P.poiCandidates; k++) stations.push(off + clear + rnd() * (L - 2 * clear))
        stations.sort((a, b) => a - b)
        const out = []
        let last = -Infinity
        for (const s of stations) {
            if (s - last < P.poiPadSpacing) continue
            // WHICH SIDE is decided by the ground, not by the hash: try both and take the one that
            // needs less earthwork. On a mountain road the two sides are wildly asymmetric — one is
            // a 1:1 cut bank, the other a 3:1 fill slope — so letting the terrain choose is both the
            // cheaper bench and the more believable siting. Emergent, not injected.
            let best = null
            for (const side of [1, -1]) {
                const cand = this._evaluate(road, ed, s, side, lat, K)
                if (cand && (!best || cand.cut < best.cut)) best = cand
            }
            if (!best) continue
            out.push({ id: `poi:${ek}${tag}@${out.length}`, index: -1, aId: e.a, bId: e.b, edge: ek,
                       padKind: kind.key, s, runKey: ed.key, ...best })
            last = s
        }
        return out
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
        // 2b. OTHER roads (owner, 2026-09-07): see _otherRoadNear.
        if (this._otherRoadNear(road, ed.key, cx, cz, lat)) return null

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

        // 5. EARTHWORK CAP — the "flat open ground" test, measured against the ROAD-CARVED surface
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

        // 6. ON water — pond no-go (radius + skirt) or a stream channel under the footprint. LAST, not
        //    fifth (FEAT-105, measured): the water probes cost ~15x the earthwork lattice and the cap
        //    rejects most candidates, so testing it first skips them on doomed sites. Every test here
        //    is a pure reject, so the order changes the cost and never the accepted set.
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

        return {
            x: cx, z: cz, y: topY, cut,
            tx, tz, nx, nz, side,
            // FEAT-60: the yaw a marker MODEL stands at. Model forward is −Z (ASSETS.md), and a
            // building on a lay-by faces the road it was built for — so −Z maps to −n (the pad
            // normal points away from the centerline). An object at rotation.y = θ aims its −Z at
            // (−sinθ, −cosθ), hence θ = atan2(nx, nz). Its +X then runs along the road, which is
            // also the only orientation a 12 m trailer fits a 14 × 8 m pad in.
            yaw: Math.atan2(nx, nz),
            halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid, cornerR: P.poiPadCornerR,
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
