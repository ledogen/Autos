// GATE (FEAT-46): story-mode POIs on lay-by pads.
//
// Five properties, in priority order. The first is the ratified one and the reason this gate is
// heavy rather than a unit test:
//
//   1. POIs NEVER INFLUENCE ROUTING DETERMINISM (owner, 2026-07-28). The same seed opened in free
//      roam and in story mode must produce identical centerlines and an identical ROAD SURFACE —
//      you just don't see the pads in free roam. Two checks: placement is downstream of routing
//      (routing a network, placing POIs, and re-reading it changes nothing), and the carve along
//      every road centerline is bit-identical with and without the pads set. That second one is
//      the load-bearing test of _poiPadCarve's road gate, which is what makes the guarantee
//      structural instead of merely intended.
//
//   2. WINDOW-INVARIANCE. Placement is keyed off the ABSTRACT GRAPH EDGE (site-id pairs), never the
//      streamed runKey, because post-BUG-25 the crossing cull can flip whole edges on a re-stream.
//      A POI seen from one stream centre must be in exactly the same place from another.
//
//   3. THE PAD IS REAL. Carving is on off the shoulder (mesh == collision is covered by the shared
//      cross-section gates; here we only pin that the bench exists and is flat).
//
//   4. THE REJECT RULES BITE. Nothing on water, nothing stacked on a junction's ground, earthwork
//      inside the cap.
//
//   5. A JOB TAKEN FROM A POI STARTS AT THAT POI — on every offer. FEAT-67: the board's offers are
//      seeded (same offer → same route), a POI destination ends at that POI, and the parked panel
//      presents the board's live offers (cycle, memoised re-park, accept takes, cancel locks).
//
// Heavy: needs a real streamed, routed network.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS, POI_ROSTER, POI_COUNT } from '../src/poi.js'
import { PROP_MODELS, modelsTagged } from '../data/prop-models.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { OfferBoard } from '../src/offer-board.js'
import { SOURCES } from '../data/offers.js'
import { mulberry32 } from '../src/seed.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const SEED = 6
const C = { x: 4500, z: 600 }
// A workable slice of a story region, cheap enough for a gate. Sized so the gate sees a COMPLETE
// region: 1200 m held 13 pads against FEAT-60's 14-slot roster, so it went to 1600; the 23-slot
// class roster (FEAT-98) found 16 pads at 1600 and 22 at 2000, and 2200 holds exactly 23 (~66 s).
// The short-pool degradation is still covered — property 6 truncates the pool by hand, which
// costs nothing.
const R = 2200

// FEAT-60 retired poiEdgeChance: every viable edge now enters the candidate pool and the roster
// selects from it, so there is no density roll left to force. The gate runs the shipped params.
const PARAMS = RANGER_PARAMS

function makeWorld (cx, cz, radius) {
    const road = new RoadSystem(SEED, RANGER_PARAMS)
    road.setRadius(radius)
    road.update(new THREE.Vector3(cx, 0, cz))
    const terrain = makeTerrainHeadless(SEED, RANGER_PARAMS, road)
    const water = new WaterSystem(SEED, RANGER_PARAMS, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({
        getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
        getSeed: () => SEED, getParams: () => PARAMS,
    })
    return { road, terrain, water, poi }
}

const W = makeWorld(C.x, C.z, R)

// ── 1. placement is downstream of routing: it may not perturb the network ───────────────────────
{
    const before = [...W.road._network.keys()].sort().join('|')
    const beforeRev = W.road._networkRev
    const list = W.poi.build(C, R)
    const after = [...W.road._network.keys()].sort().join('|')
    check('placing POIs registers/deletes no network edge', before === after,
        `${W.road._network.size} edges`)
    check('placing POIs does not bump _networkRev (route/junction caches survive)',
        W.road._networkRev === beforeRev, `${beforeRev} → ${W.road._networkRev}`)
    check('the region fills its whole roster — a selection, not the tail of a coin flip',
        list.length === POI_COUNT, `${list.length} POIs vs roster ${POI_COUNT}`)
    console.log(`       ${list.length} POIs selected from ${W.road._network.size} edge slots over r=${R}`)
}

// ── 2. THE RATIFIED ONE: the road surface is bit-identical with and without pads ─────────────────
// Walk every registered centerline and sample the carve laterally right across the road — crown to
// shoulder edge to just beyond — with the pads SET and with them CLEARED. Any difference means a
// pad moved the road, which would mean a story-mode seed no longer drives like its free-roam twin.
{
    const p = RANGER_PARAMS
    const edgeLat = (p.roadHalfWidth ?? 5) + (p.roadShoulderWidth ?? 2.5)
    const lats = [-edgeLat, -edgeLat * 0.6, 0, edgeLat * 0.6, edgeLat]
    const probes = []
    for (const [, e] of W.road._network) {
        const pts = e.points
        if (!pts || pts.length < 3) continue
        for (let i = 1; i < pts.length; i += 4) {
            const a = pts[i - 1], b = pts[i]
            const dx = b.x - a.x, dz = b.z - a.z
            const L = Math.hypot(dx, dz) || 1
            const tx = dx / L, tz = dz / L
            for (const lat of lats) probes.push([b.x + tz * lat, b.z - tx * lat])
        }
    }
    const sample = () => probes.map(([x, z]) => {
        const raw = W.terrain.rawHeightWorld(x, z)
        const cs = W.road._sampleCarveWorld(x, z, raw)
        return cs ? `${cs.blendW.toFixed(9)},${cs.gradeY.toFixed(9)}` : 'null'
    })

    const withPads = sample()
    W.road.setPoiPads(null)
    const without = sample()
    W.road.setPoiPads(W.poi.list())          // restore for the checks below

    let diff = 0, worst = 0, worstAt = null
    for (let i = 0; i < probes.length; i++) {
        if (withPads[i] === without[i]) continue
        diff++
        const a = parseFloat((withPads[i].split(',')[1] ?? 'NaN'))
        const b = parseFloat((without[i].split(',')[1] ?? 'NaN'))
        const d = Math.abs(a - b)
        if (!(d <= worst)) { worst = d; worstAt = probes[i] }
    }
    check('the ROAD SURFACE is bit-identical with and without POI pads (free roam == story mode)',
        diff === 0, `${diff}/${probes.length} probes differ, worst ${worst.toFixed(4)} m at ${worstAt}`)
    console.log(`       ${probes.length} carve probes across ${lats.length} lateral offsets on every registered run`)
}

// ── 3. window-invariance: the same PADS from a different stream centre ──────────────────────────
// FEAT-60 moved where this guarantee lives. A pad's POSITION is still a pure function of (seed,
// edge) and must be identical from any stream centre — that is what this asserts, over the
// candidate POOL. Which pads get promoted to POIs, and what type they become, is now necessarily
// region-scoped: no edge-local rule can promise a region two gas stations. build() runs once per
// region on the spawn, so the selection is stable in play; the pool is what has to be invariant.
{
    const W2 = makeWorld(C.x + 640, C.z - 384, R)
    W2.poi.build({ x: C.x + 640, z: C.z - 384 }, R)
    const byId = new Map(W2.poi.pool().map(q => [q.id, q]))
    let shared = 0, moved = 0, worst = 0
    for (const q of W.poi.pool()) {
        // Only compare POIs comfortably inside BOTH windows — an edge clipped by one window's
        // region test is legitimately absent there, and that is the region filter, not drift.
        if (Math.hypot(q.x - (C.x + 640), q.z - (C.z - 384)) > R - 400) continue
        // FEAT-67: the region test also demands the pad's EDGE sits inside the planner wall
        // (R − REGION_MARGIN) — a long edge running out past one window's wall is clipped there.
        const g = W.road.networkGraph()
        const inWall2 = (id) => { const p = g.pos(id); return Math.hypot(p.x - (C.x + 640), p.z - (C.z - 384)) <= R - REGION_MARGIN }
        if (!inWall2(q.aId) || !inWall2(q.bId)) continue
        const o = byId.get(q.id)
        if (!o) { moved++; continue }
        shared++
        const d = Math.hypot(q.x - o.x, q.z - o.z)
        if (d > worst) worst = d
    }
    check('pads well inside both windows are present in both (no window-dependent existence)',
        moved === 0, `${moved} missing of ${moved + shared}`)
    check('shared pads sit at exactly the same place (keyed off the graph edge, not the runKey)',
        worst < 1e-6, `worst drift ${worst.toFixed(6)} m over ${shared} shared pads`)
    console.log(`       ${shared} pads compared across two stream centres 745 m apart`)
}

// ── 3b. placement has no HISTORY ────────────────────────────────────────────────────────────────
// `_evaluate`'s junction reject reads padReachNodes(), which lists POI pads alongside junction
// pads — so without clearing the previous build's pads first, a REBUILD sites against the region it
// is replacing. That is history, not determinism. Now that the roster selects from the whole pool
// the stakes are higher, not lower: a drifting pool changes which pads win the constrained slots,
// so mom's house could move because you visited another region first.
{
    const s = new PoiSystem({
        getRoad: () => W.road, getWater: () => W.water, getTerrain: () => W.terrain,
        getSeed: () => SEED, getParams: () => PARAMS,
    })
    const sig = (l) => l.map(q => `${q.type}:${q.id}@${q.x.toFixed(6)}`).join('|')
    const first = sig(s.build(C, R))
    s.build({ x: C.x + 300, z: C.z }, R)          // a different region in between
    const again = sig(s.build(C, R))
    check('rebuilding after a DIFFERENT region reproduces the same layout AND the same types',
        first === again && first.length > 0)

    W.road.setPoiPads(W.poi.list())               // restore the region under test
}

// ── 4. the pad is a real, flat bench off the shoulder ───────────────────────────────────────────
{
    let checked = 0, notFlat = 0, notCarved = 0, worstFlat = 0
    for (const q of W.poi.list()) {
        checked++
        // Sample the pad interior, staying a metre inside the rim so the toe ramp isn't included.
        let lo = Infinity, hi = -Infinity, carved = 0, n = 0
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const u = i * (q.halfLen - 1.5), v = j * (q.halfWid - 1.5)
            const x = q.x + q.tx * u + q.nx * v, z = q.z + q.tz * u + q.nz * v
            const raw = W.terrain.rawHeightWorld(x, z)
            const cs = W.road._sampleCarveWorld(x, z, raw)
            n++
            if (cs && cs.blendW > 0.99) carved++
            const y = cs ? cs.gradeY : raw
            if (y < lo) lo = y
            if (y > hi) hi = y
        }
        if (carved < n) notCarved++
        const span = hi - lo
        if (span > worstFlat) worstFlat = span
        if (span > 0.05) notFlat++
    }
    check('every pad interior is fully carved (blendW == 1)', notCarved === 0, `${notCarved}/${checked} pads`)
    check('every pad interior is FLAT', notFlat === 0,
        `${notFlat}/${checked} pads vary, worst ${worstFlat.toFixed(3)} m across the bench`)
}

// ── 5. the reject rules bite ────────────────────────────────────────────────────────────────────
{
    let onWater = 0, onJunction = 0, overCut = 0, worstCut = 0
    // padReachNodes() now lists the POI pads too — drop those, or every POI trivially "overlaps".
    const poiXZ = new Set(W.poi.list().map(q => `${q.x},${q.z}`))
    const junctions = W.road.padReachNodes().filter(nd => !poiXZ.has(`${nd.x},${nd.z}`))
    for (const q of W.poi.list()) {
        // streamChannelAt always returns a record — read inChannel, don't truth-test it. The BANK
        // is legal: near water is a good pullout, ON water is not (owner, 2026-07-28).
        if (W.water.isRoadNoGo(q.x, q.z) || W.water.streamChannelAt(q.x, q.z)?.inChannel) onWater++
        for (const nd of junctions) if (Math.hypot(nd.x - q.x, nd.z - q.z) <= nd.reach) { onJunction++; break }
        // q.cut is the earthwork measured at placement time, against the road-carved ground and
        // BEFORE this pad existed — re-measuring it now would read the pad's own finished bench.
        if (q.cut > worstCut) worstCut = q.cut
        if (q.cut > POI_PARAMS.poiMaxCutFill + 1e-9) overCut++
    }
    check('no POI sits on water', onWater === 0, `${onWater} on water`)
    check('no POI stacks on a junction pad / connector footprint', onJunction === 0, `${onJunction} overlapping`)
    check('every pad is inside the earthwork cap', overCut === 0,
        `worst cut/fill ${worstCut.toFixed(2)} m vs cap ${POI_PARAMS.poiMaxCutFill} m`)
}

// ── 6. a job taken from a POI STARTS at that POI — on every offer ────────────────────────────────
// The anchored roll pins the start to the marker's own (edge, arcS) and prepends that partial
// stretch as the first par segment. Every board offer at a POI is an anchored roll, so every one of
// them must start there — a quest giver offers a different job, not a different place to stand.
// FEAT-67 adds: the roll is SEEDED (same offer stream → the same route), and a POI destination ends
// on that POI's own edge, entered from the nearer node.
{
    const ms = new MissionSystem({
        getRoad: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    let rolls = 0, strays = 0, worst = 0, noRoute = 0
    const tried = []
    for (const q of W.poi.list()) {
        const anchor = { aId: q.aId, bId: q.bId, s: q.s, poiId: q.id }
        // Ten independent rolls per POI stand in for ten different offers from that marker.
        let got = 0
        for (let i = 0; i < 10; i++) {
            const m = ms._roll(anchor)
            if (!m) { noRoute++; continue }
            rolls++; got++
            const d = Math.hypot(m.start.x - q.roadX, m.start.z - q.roadZ)
            if (d > worst) worst = d
            if (d > 1.0) strays++
        }
        tried.push(got)
    }
    check('every anchored roll starts AT the POI (every offer from a marker starts there)',
        rolls > 0 && strays === 0,
        `${strays}/${rolls} strayed, worst ${worst.toFixed(2)} m from the marker`)
    console.log(`       ${rolls} anchored rolls over ${tried.length} POIs `
        + `(${noRoute} found no qualifying leg — a dead-end marker, not a stray)`)

    // FEAT-67: seeded — the same stream plans the same route, twice.
    const src = W.poi.list().find(q => q.type === 'foodVendor') ?? W.poi.list()[0]
    const rngOf = (k) => mulberry32(k)
    const pois = W.poi.list().filter(q => q.id !== src.id)
    let same = true, planned = 0
    for (let k = 1; k <= 12; k++) {
        const a = ms.planOffer(src, { rng: rngOf(k), dest: { kind: k % 2 ? 'poi' : 'roadside', pick: k / 13, pois } })
        const b = ms.planOffer(src, { rng: rngOf(k), dest: { kind: k % 2 ? 'poi' : 'roadside', pick: k / 13, pois } })
        if (!a !== !b) { same = false; continue }
        if (!a) continue
        planned++
        if (JSON.stringify(a.poly) !== JSON.stringify(b.poly) || a.endPoiId !== b.endPoiId) same = false
    }
    check('planOffer is deterministic in its stream (same offer → the same route)', same && planned > 0, `${planned} planned`)

    // FEAT-67: a POI destination ends AT that POI's road point, on its own edge.
    let poiEnds = 0, farEnds = 0, worstEnd = 0, fellBack = 0
    for (const q of W.poi.list()) {
        for (let k = 0; k < 6; k++) {
            const m = ms.planOffer(q, { rng: rngOf(1000 + k), dest: { kind: 'poi', pick: k / 6,
                pois: W.poi.list().filter(p => p.id !== q.id) } })
            if (!m) continue
            if (!m.endPoiId) { fellBack++; continue }
            poiEnds++
            const d = W.poi.list().find(p => p.id === m.endPoiId)
            const e = Math.hypot(m.end.x - d.roadX, m.end.z - d.roadZ)
            if (e > worstEnd) worstEnd = e
            if (e > 1.0) farEnds++
            if (m.endPoiId === q.id) farEnds++
        }
    }
    check('a POI destination ends AT that POI (never the source)', poiEnds > 0 && farEnds === 0,
        `${farEnds}/${poiEnds} off, worst ${worstEnd.toFixed(2)} m`)
    console.log(`       ${poiEnds} POI-destination plans, ${fellBack} fell back to roadside (no POI in reach)`)
    // Report-only (wall clock is flaky): the map plans a hovered offer synchronously, so the cost of
    // one plan is the hitch a hover can cause.
    {
        const t0 = performance.now(); let n = 0
        for (const q of W.poi.list()) for (let k = 0; k < 4; k++) {
            ms.planOffer(q, { rng: rngOf(5000 + k), dest: { kind: k % 2 ? 'poi' : 'roadside', pick: 0.3, pois } }); n++
        }
        console.log(`       planOffer: ${((performance.now() - t0) / n).toFixed(2)} ms per offer (mean of ${n}, report-only)`)
    }
    const rb = ms.planOffer(src, { rng: rngOf(7), dest: { kind: 'poi', pick: 0.5, pois: [] } })
    check('a POI wish with no candidate falls back to a roadside drop', !rb || rb.endPoiId === null)
}

// A board + plan callback in the shape main.js wires them (the parked panel's inputs).
function boardRig (ms, nowH = 6) {
    const board = new OfferBoard({ seed: SEED, pois: W.poi.list(), nowH })
    // The same planner main.js wires (_planOffer): board.planDistinct owns the no-duplicates rule.
    const plan = (o) => {
        const sp = board.spec(o)
        if (!sp || sp.family === 'papers') return null
        return board.planDistinct(o, (x, exclude) => {
            const s = board.spec(x)
            const poi = W.poi.list().find(q => q.id === x.poiId)
            const m = ms.planOffer(poi, { rng: board.routeRng(x), dest: board.destWish(x, W.poi.list(), exclude) })
            if (m) { m.offerId = x.id; m.bonus = s.bonus; m.payMult = s.payMult }
            return m
        })
    }
    // A POI whose live offers actually route (some markers are dead ends with no leg in band).
    const plannable = () => W.poi.list().find(q => q.jobs && q.type !== 'larrysHouse'
        && board.offers(q.id, nowH).some(o => plan(o)))
    return { board, plan, plannable }
}

// ── 7. FEAT-67: the parked panel presents the BOARD's live offers ────────────────────────────────
// Replaces FEAT-53's single hidden offer per POI per day. Parking shows the POI's live offers one at
// a time; Q/E (cycle) steps through them; re-parking presents the same offers (memoised routes — no
// reroll farming); accept takes the offer OFF the board.
{
    const ms = new MissionSystem({
        getRoad: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        getTerms: () => ({ day: 1, dayTier: 1, payTier: 1, thresholds: undefined }),
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    const { board, plan } = boardRig(ms)
    const food = W.poi.list().find(q => q.type === 'foodVendor')
    const offers = board.offers(food.id, 6)
    ms.enterFromPoi(food, offers, plan)
    check('parking opens the board offers synchronously', ms.state === 'offer' && !!ms.mission && !!ms.offer)
    check('the panel holds every plannable live offer', ms.offers.length >= 1 && ms.offers.length <= offers.length,
        `${ms.offers.length}/${offers.length}`)
    check('the mission IS the shown offer (offerId stamped)', ms.mission.offerId === ms.offer.id)
    if (ms.offers.length > 1) {
        const first = ms.mission
        ms.cycle(+1)
        check('cycle(+1) steps to the next offer', ms.offerIdx === 1 && ms.mission !== first)
        ms.cycle(-1)
        check('cycle(−1) steps back to the SAME planned mission (memoised)', ms.offerIdx === 0 && ms.mission === first)
    }
    const shown = ms.mission
    ms.exit()
    ms.enterFromPoi(food, board.offers(food.id, 6), plan)
    check('re-park presents the IDENTICAL mission object (no reroll farming)', ms.mission === shown)

    // Determinism across a rebuild: a fresh board on the same seed plans the same route.
    const rig2 = boardRig(ms)
    const again = rig2.plan(rig2.board.offers(food.id, 6).find(o => o.id === shown.offerId))
    check('the same offer on a fresh board plans the same route',
        !!again && JSON.stringify(again.poly) === JSON.stringify(shown.poly))

    const taken = board.take(ms.offer.id, 6)
    ms.accept()
    check('accept stamps the frozen terms onto the mission (SM-INV-4 lock)', ms.mission.terms?.day === 1)
    check('a taken offer leaves the board', !!taken && !board.offers(food.id, 6).some(o => o.id === taken.id))
    const cancelled = ms.cancel()
    check('cancel() drops the job and hands back its board offer id', cancelled === taken.id && ms.state === 'idle')
    check('…and the board locks that slot for the full life', board.abandon(cancelled, 6.1)
        && board._slotOf(cancelled).state === 'locked')
    ms.exit()
}

// ── 7a. FEAT-67: every offer a source posts can be driven ───────────────────────────────────────
// Owner-reported (seed 2987375593): a store past the planner wall showed cards with no route and no
// pay. A card with no route is an offer the player cannot take, so every source's offers must plan
// — over several days of turnover, not just the first roll.
{
    const ms = new MissionSystem({
        getRoad: () => W.road, getCar: () => ({ x: C.x, z: C.z, speed: 0 }), getSeed: () => SEED,
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    const { board, plan } = boardRig(ms)
    let n = 0, tagged = 0
    const bad = [], tagBad = []
    for (let t = 6; t < 6 + 24 * 3; t += 4) {
        for (const id of board.sources()) for (const o of board.offers(id, t)) {
            if (board.spec(o).family === 'papers') continue
            n++
            const r = plan(o), to = board.spec(o).to
            if (!r) bad.push(W.poi.list().find(q => q.id === id)?.type)
            // FEAT-100: a tagged thing always ends at a matching class.
            else if (to) {
                tagged++
                const end = W.poi.list().find(q => q.id === r.endPoiId)
                if (!end || !to.some(x => end.tags.includes(x))) tagBad.push(board.spec(o).thingId)
            }
        }
    }
    // …and NO TWO LIVE OFFERS AT A POI ARE THE SAME JOB (owner, 2026-09-27): same thing + same
    // reward + same destination is a duplicate. Checked on every POI at every sampled time.
    let dups = 0, pairs = 0
    for (let t = 6; t < 6 + 24 * 3; t += 0.5) {
        for (const id of board.sources()) {
            const sig = board.offers(id, t).filter(o => board.spec(o).family !== 'papers').map(o => {
                const r = plan(o), sp = board.spec(o)
                return `${sp.thingId}|${sp.bonus?.rewardId ?? ''}|${r?.endPoiId ?? 'road:' + r?.placeName}`
            })
            pairs += sig.length
            if (new Set(sig).size !== sig.length) dups++
        }
    }
    check('no two live offers at a POI are the same job (thing + reward + destination)', dups === 0,
        `${dups} duplicate sets over ${pairs} offer-samples`)
    check('every delivery offer a source posts plans a route (no route-less cards)', bad.length === 0,
        `${bad.length}/${n} failed: ${[...new Set(bad)].join(', ')}`)
    check('an offer for a tagged thing always ends at a matching class (FEAT-100)',
        tagged > 0 && tagBad.length === 0, `${tagBad.length}/${tagged}: ${tagBad.join(', ')}`)
    console.log(`       ${n} offers planned over 3 days of turnover (${tagged} tagged)`)
}

// ── 7b. The POI start zone: no countdown, no hold, the clock starts at the threshold ────────────
// Owner, 2026-08-02: a POI job must not launch on a 3-2-1 handbrake count — you are parked on a pad
// and may be facing the wrong way. Accept puts the job in 'staging' instead: free to manoeuvre,
// timed from the moment you cross out of the marker's radius. Quick Job is untouched — it teleports
// you to a pin already pointing the right way, so its countdown is still the right ritual.
{
    const car = { x: 0, z: 0, speed: 0 }
    const ms = new MissionSystem({
        getRoad: () => W.road,
        getCar: () => car,
        getSeed: () => SEED,
        teleport (x, z) { car.x = x; car.z = z },
        setMapOpen () {}, onChange () {},
    })
    const tick = () => new Promise(r => setTimeout(r, 5))
    const { board, plan, plannable } = boardRig(ms)
    const poi = plannable()
    car.x = poi.x; car.z = poi.z

    ms.enterFromPoi(poi, board.offers(poi.id, 6), plan)
    ms.accept()
    check('a POI job stages instead of counting down', ms.state === 'staging')
    check('...and does NOT hold the truck (manoeuvring room is the whole point)', ms.isHeld() === false)
    const z = ms.startZone()
    check('the start zone is centred on the MARKER, not the road-side start pin',
        !!z && Math.hypot(z.x - poi.x, z.z - poi.z) < 1e-9,
        z ? `${Math.hypot(z.x - poi.x, z.z - poi.z).toFixed(2)} m off` : 'no zone')

    // Inside the radius: no clock, whatever the truck does.
    car.x = poi.x + z.r - 1
    ms.update(0.5)
    check('inside the zone the run has not started', ms.state === 'staging' && ms.elapsed === 0)

    // Crossing out: the run starts, and the elapsed clock starts from zero at the threshold.
    car.x = poi.x + z.r + 1
    ms.update(0.5)
    check('crossing the threshold starts the run', ms.state === 'running')
    check('...with the clock from zero at the line, not from accept', ms.elapsed === 0)

    // The threshold is one-way: driving back in cannot un-start a run.
    car.x = poi.x; car.z = poi.z
    ms.update(0.5)
    check('re-entering the zone does not stop the clock', ms.state === 'running' && ms.elapsed > 0)

    // Quick Job keeps the countdown + the hold.
    ms.exit()
    ms._generate(); await tick()
    if (ms.state === 'offer') {
        ms.accept()
        check('a Quick Job still counts down', ms.state === 'countdown' && ms.startZone() === null)
        check('...and still holds the truck through the count', ms.isHeld() === true)
    } else {
        check('a Quick Job still counts down (roll found no route — cannot exercise)', false, `state=${ms.state}`)
    }
    ms.exit()
}

// ── 8. do-over lockout: paid jobs have no regenerate/retry; Quick Job keeps both ─────────────────
{
    const ms = new MissionSystem({
        getRoad: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    const tick = () => new Promise(r => setTimeout(r, 5))
    const { board, plan, plannable } = boardRig(ms)
    const poi = plannable()

    ms.enterFromPoi(poi, board.offers(poi.id, 6), plan)
    const offered = ms.mission
    ms.regenerate()
    check('regenerate is INERT on a POI job (its offers are the board\'s)',
        ms.state === 'offer' && ms.mission === offered)
    ms.state = 'done'; ms.result = { elapsed: 1, par: 1 }
    ms.retry()
    check('retry is INERT on a POI job (the payout exploit is closed)',
        ms.state === 'done' && ms.result !== null)
    ms.exit()

    ms.enter(); await tick()
    if (ms.state === 'offer') {
        ms.regenerate()
        check('Quick Job keeps regenerate (the calibration rig, pays nothing)', ms.state === 'generating')
        await tick()
        ms.state = 'done'; ms.result = { elapsed: 1, par: 1 }
        ms.retry()
        check('Quick Job keeps retry', ms.state === 'countdown' && ms.result === null)
    } else {
        check('Quick Job keeps regenerate (roll found no route — cannot exercise)', false, `state=${ms.state}`)
        check('Quick Job keeps retry (roll found no route — cannot exercise)', false, `state=${ms.state}`)
    }
    ms.exit()
}

// ── 6. THE ROSTER (FEAT-60): a region is guaranteed its cast, not handed dice ───────────────────
// The reason placement stopped being a coin flip. "There is a gas station in this region" has to be
// true on every seed, or story mode is built on sand.
{
    const list = W.poi.list()
    const counts = {}
    for (const q of list) counts[q.type] = (counts[q.type] || 0) + 1
    const short = POI_ROSTER.filter(s => (counts[s.type] || 0) !== s.count)
    check('every roster slot is filled exactly to its count',
        short.length === 0,
        short.map(s => `${s.type} ${counts[s.type] || 0}/${s.count}`).join(', '))
    check('nothing is placed that the roster did not ask for',
        list.length === POI_COUNT, `${list.length} vs ${POI_COUNT}`)
    console.log('       ' + POI_ROSTER.map(s => `${s.type} ×${counts[s.type] || 0}`).join('  '))

    // Mom's and Larry's are a short drive from where you wake up. The radius may have relaxed on a
    // bare seed, so the assertion is against the relaxed ladder, not the nominal 1000 m.
    const houses = list.filter(q => q.type === 'momsHouse' || q.type === 'larrysHouse')
    const nearR = POI_PARAMS.poiNearSpawnR
    const farHouse = houses.map(q => Math.hypot(q.x - C.x, q.z - C.z)).sort((a, b) => b - a)[0] ?? 0
    check('both houses sit inside the near-spawn ring', farHouse <= nearR,
        `furthest house ${farHouse.toFixed(0)} m vs ${nearR} m`)

    // COVERAGE IS THE POINT, not spacing. Assert the pair actually chosen is the OPTIMUM of the
    // objective over every admissible pair — a coverage siting that quietly degraded to "first two
    // that are far enough apart" would still look plausible in a screenshot.
    const worstCover = (a, b) => W.poi.pool().reduce((w, q) => Math.max(w,
        Math.min(Math.hypot(q.x - a.x, q.z - a.z), Math.hypot(q.x - b.x, q.z - b.z))), 0)
    // Optimality is judged against what the slot could ACTUALLY reach: each slot picks from a pool
    // its seniors have already drawn from, so the service pair is optimal over the pads gas left
    // behind, not over the whole region. Walking the roster in order is what makes that concrete.
    const taken = new Set()
    for (const slot of POI_ROSTER) {
        const picks = list.filter(q => q.type === slot.type)
        if (slot.siting !== 'coverage') { picks.forEach(q => taken.add(q.id)); continue }
        const type = slot.type
        const pair = picks
        const sep = Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z)
        const got = worstCover(pair[0], pair[1])
        // Best achievable over the pads still free at this slot, under the same floor.
        let best = Infinity
        const pool = W.poi.pool().filter(q => !taken.has(q.id))
        for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
            if (Math.hypot(pool[i].x - pool[j].x, pool[i].z - pool[j].z) < POI_PARAMS.poiStationMinSep) continue
            best = Math.min(best, worstCover(pool[i], pool[j]))
        }
        picks.forEach(q => taken.add(q.id))
        check(`${type} pair minimises the worst drive to the nearest one`,
            got <= best + 1e-6, `got ${got.toFixed(0)} m, best available ${best.toFixed(0)} m`)
        check(`${type} pair clears the anti-clustering floor`,
            sep >= POI_PARAMS.poiStationMinSep - 1e-6,
            `${sep.toFixed(0)} m vs ${POI_PARAMS.poiStationMinSep} m`)
        console.log(`       ${type}: ${sep.toFixed(0)} m apart, worst drive to one ${got.toFixed(0)} m`)
    }

    // Only a marker with a mechanic behind it answers the park trigger. Everything else is a place
    // that exists before its mechanic does, and a marker that opens an offer it cannot fill is a
    // lie to the player.
    //
    // Larry joined the givers when FEAT-61 Phase E2 landed: his brake opens the PAPER ROUTE, not an
    // errand, so he passes the test this check is actually making. The day fuel or repairs ship,
    // their types come off the false side of this line the same way — by having something to say.
    // FEAT-67: the flag is DERIVED from the board's source table — a type posts work iff it has a
    // SOURCES row. The gas station, tackle shop and mom's house do not.
    const GIVERS = new Set(Object.keys(SOURCES))
    check('exactly the markers with a mechanic source jobs',
        list.every(q => q.jobs === GIVERS.has(q.type)),
        list.filter(q => q.jobs !== GIVERS.has(q.type)).map(q => q.type).join(', '))
    check('mom\'s house does not hand out freight (her doorstep must win the park trigger)',
        W.poi.nearest(list.find(q => q.type === 'momsHouse').x,
                      list.find(q => q.type === 'momsHouse').z, POI_PARAMS.poiInteractR, true) === null)

    // A modelled POI carries its authored contact box and a yaw, both stamped at build time — the
    // physics must never wait on a GLB fetch to decide whether a building is solid.
    const modelled = list.filter(q => q.modelKey)
    check('modelled POIs exist (the ticket\'s proof: a type that looks like what it is)',
        modelled.length > 0, `${modelled.length} modelled of ${list.length}`)
    check('every modelled POI carries its registry collision box and a model yaw',
        modelled.every(q => q.collision?.size?.length === 3 && Number.isFinite(q.modelYaw)
            && q.collision === PROP_MODELS[q.modelKey].collision))
    check('keyless POIs carry no box (they fall back to the cube)',
        list.filter(q => !q.modelKey).every(q => q.collision === null))

    // THE MODEL POOL (owner, 2026-08-15). The five residences draw from every asset tagged
    // 'residence' rather than all wearing one model. What is gated is membership, not the
    // distribution: which giver draws what is allowed to move when the pool is widened, so an
    // "at least two distinct models appear" check would be a tripwire on a sanctioned change.
    const pool = modelsTagged('residence')
    check('the residence pool has more than one asset in it (else it is not a pool)',
        pool.length > 1, pool.join(', '))
    const givers = list.filter(q => q.type === 'residence')
    check('every residence draws its model from that pool',
        givers.length > 0 && givers.every(q => pool.includes(q.modelKey)),
        givers.map(q => q.modelKey).join(', '))

    // EVERY modelled marker must FIT ITS PAD, which is what yawOffset exists to buy. The pad is
    // 2·poiPadHalfLen along the road by 2·poiPadHalfWid across it, and the model's own box is
    // turned into that frame by its offset alone (the pad yaw cancels — it IS the frame). An
    // unturned 8 m Winnebago spans the full 8 m width with its nose on the shoulder edge; this is
    // the check that catches the next asset someone registers without thinking about which way
    // its length runs.
    const seenKeys = new Set()
    for (const q of modelled) {
        if (seenKeys.has(q.modelKey)) continue   // the box is per-ASSET; one probe per key is the test
        seenKeys.add(q.modelKey)
        const [sx, , sz] = q.collision.size
        const d = q.modelYaw - q.yaw
        const along = Math.abs(Math.cos(d)) * sx + Math.abs(Math.sin(d)) * sz
        const across = Math.abs(Math.sin(d)) * sx + Math.abs(Math.cos(d)) * sz
        check(`${q.modelKey} fits its pad (${along.toFixed(1)} x ${across.toFixed(1)} m in a ` +
              `${2 * POI_PARAMS.poiPadHalfLen} x ${2 * POI_PARAMS.poiPadHalfWid} m bay)`,
            along <= 2 * POI_PARAMS.poiPadHalfLen && across <= 2 * POI_PARAMS.poiPadHalfWid)
    }

    // The marker is SOLID, and for a modelled one that means solid at its own size. Probe just
    // outside and just inside the long face of a trailer, in ITS frame — a world-AABB regression
    // would report contact metres off the wall. Pinned to a trailerHomeA: the assertions below are
    // written about a 12 m box whose length runs down its own +X, which is that asset's geometry
    // and not a property of "whatever is modelled first".
    const t = modelled.find(q => q.modelKey === 'trailerHomeA')
    check('a trailerHomeA marker exists to probe', !!t)
    const s3 = t.collision.size
    const cs = Math.cos(t.modelYaw), sn = Math.sin(t.modelYaw)
    const toWorld = (lx, lz) => ({ x: t.x + cs * lx + sn * lz, z: t.z - sn * lx + cs * lz })
    const inside = toWorld(0, s3[2] * 0.5 - 0.2), outside = toWorld(0, s3[2] * 0.5 + 2.0)
    check('a modelled marker is solid at its own footprint',
        W.poi.queryContact(inside.x, t.y + 1.0, inside.z, 0.3) !== null)
    check('…and is not solid two metres clear of its wall',
        W.poi.queryContact(outside.x, t.y + 1.0, outside.z, 0.3) === null)
    // The long axis runs ALONG the road, which is the only way 12 m fits a 14 m pad. Probe the
    // ends: solid just inside, clear just beyond — and the box is 12 m end-to-end, not 3.5.
    const endIn = toWorld(s3[0] * 0.5 - 0.2, 0), endOut = toWorld(s3[0] * 0.5 + 2.0, 0)
    const hit = (p) => W.poi.queryContact(p.x, t.y + 1.0, p.z, 0.3) !== null
    check('the box extends its full length along the marker\'s own +X', hit(endIn))
    check('…and stops there', !hit(endOut))
    // Along the road means the tangent, not the normal: step out along the pad normal and you
    // leave the trailer within 3.5 m, but along the tangent you do not until 12 m.
    const alongRoad = Math.abs(Math.cos(t.modelYaw) * t.tx - Math.sin(t.modelYaw) * t.tz)
    check('the marker\'s +X is the road tangent (long side faces the road)', alongRoad > 0.999,
        `|+X · t| = ${alongRoad.toFixed(4)}`)
}

// ── 6b. the priority order bites when the pool runs short ───────────────────────────────────────
// Free: no world build, just the roster against a hand-truncated pool. A region smaller than its
// roster must still get mom's house and its gas stations; what it loses is the additional classes,
// because they sit at the BOTTOM of POI_ROSTER. This is the whole reason the order is a priority order.
{
    const pool = W.poi.pool().slice(0, POI_COUNT - 3)
    const P = { ...POI_PARAMS, ...PARAMS }
    const out = W.poi._assignRoster(pool, C, SEED, P)
    const counts = {}
    for (const q of out) counts[q.type] = (counts[q.type] || 0) + 1
    // Top-down: each slot takes its full count while pads last, so the 3 missing come off the end.
    let left = POI_COUNT - 3
    const want = POI_ROSTER.map(s => { const n = Math.min(s.count, left); left -= n; return n })
    const required = POI_ROSTER.slice(0, POI_ROSTER.findIndex(s => s.type === 'residence'))
    check('a short pool still fills every required slot',
        required.every(s => counts[s.type] === s.count),
        required.map(s => `${s.type} ${counts[s.type] || 0}/${s.count}`).join(', '))
    check('…and the shortfall comes off the bottom of the roster alone',
        POI_ROSTER.every((s, i) => (counts[s.type] || 0) === want[i]),
        POI_ROSTER.map((s, i) => `${s.type} ${counts[s.type] || 0}/${want[i]}`).join(', '))

    W.poi.build(C, R)                              // restore the region under test
    W.road.setPoiPads(W.poi.list())
}


// ── 6c. THE ROSTER SURVIVES A SPAWN THAT MOVED (BUG-45) ─────────────────────────────────────────
//
// Owner-reported 2026-08-09: leave story mode and re-enter on the SAME seed, and mom's house and
// Larry's house have swapped places. The region centre is wherever the truck lands, and the spawn
// probe (_reseatTruckAtSpawn) resolves against whatever is streamed at the time — so a warm
// re-entry can seat the truck tens of metres from where the cold entry did.
//
// That must not re-cast the roster. It used to: the picks were an INDEX into a filtered list
// (`floor(rnd() * ring.length)`), so one pad crossing the near-spawn ring shifted every index
// after it. Selection is now keyed to each pad's own id, so it depends on WHICH pads exist and
// not on HOW MANY — a pad away from the boundary keeps its slot whatever churns at the rim.
{
  const ref = makeWorld(C.x, C.z, R)
  const refList = ref.poi.build(C, R)
  const idOf = (list, t) => list.find(q => q.type === t)?.id ?? null
  const refMom = idOf(refList, 'momsHouse'), refLarry = idOf(refList, 'larrysHouse')
  check('the reference region has both houses', !!refMom && !!refLarry)

  // A spawn drift well past anything the probe could plausibly produce.
  for (const d of [5, 20, 50]) {
    const C2 = { x: C.x + d, z: C.z }
    const w = makeWorld(C2.x, C2.z, R)
    const list = w.poi.build(C2, R)
    const mom = idOf(list, 'momsHouse'), larry = idOf(list, 'larrysHouse')
    check(`a ${d} m spawn drift does not swap mom and Larry`,
      mom === refMom && larry === refLarry,
      `mom ${refMom} → ${mom}, larry ${refLarry} → ${larry}`)
  }

  // …and the selection is still deterministic: same centre, same answer, twice.
  const twice = makeWorld(C.x, C.z, R).poi.build(C, R)
  check('the roster is still a pure function of (seed, pool)',
    idOf(twice, 'momsHouse') === refMom && idOf(twice, 'larrysHouse') === refLarry)

  // Every slot is distinct — a keyed pick must never hand the same pad to two slots.
  const ids = refList.map(q => q.id)
  check('no pad is assigned to two roster slots', new Set(ids).size === ids.length)
}

console.log(fails === 0 ? '\nALL POI CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
