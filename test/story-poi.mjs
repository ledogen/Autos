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
//   5. A JOB TAKEN FROM A POI STARTS AT THAT POI — every roll, including every regenerate. The
//      anchor has to survive a re-roll, or the second offer from a marker is a free Quick Job
//      starting somewhere across the region while the player is parked in a pullout.
//
// Heavy: needs a real streamed, routed network.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { MissionSystem } from '../src/mission.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

const SEED = 6
const C = { x: 4500, z: 600 }
const R = 1200                       // a workable slice of a story region, cheap enough for a gate

// The gate forces EVERY edge to carry a POI. At the shipped density (poiEdgeChance 0.10) a 1200 m
// window holds ~40 edge slots and therefore ~1 POI — too few to assert anything about. Forcing the
// roll exercises the identical placement path on every edge and gives a real sample; the sparsity
// knob itself is not what needs a gate, the siting and the road-parity guarantee are.
const PARAMS = { ...RANGER_PARAMS, poiEdgeChance: 1.0 }

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
    const perEdge = list.length / W.road._network.size
    check('POIs are actually placed — most edges yield one, the rest are rejected on their ground',
        list.length >= 5 && perEdge > 0.2 && perEdge <= 1.0, `${list.length} POIs over r=${R}`)
    console.log(`       ${list.length} POIs from ${W.road._network.size} forced edge slots `
        + `(${(100 * perEdge).toFixed(0)}% accept ⇒ ~${Math.round(216 * POI_PARAMS.poiEdgeChance * perEdge)} `
        + `at the shipped density ${POI_PARAMS.poiEdgeChance} over a 216-edge region)`)
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

// ── 3. window-invariance: the same POIs from a different stream centre ──────────────────────────
{
    const W2 = makeWorld(C.x + 640, C.z - 384, R)
    const l2 = W2.poi.build({ x: C.x + 640, z: C.z - 384 }, R)
    const byId = new Map(l2.map(q => [q.id, q]))
    let shared = 0, moved = 0, worst = 0
    for (const q of W.poi.list()) {
        // Only compare POIs comfortably inside BOTH windows — an edge clipped by one window's
        // region test is legitimately absent there, and that is the region filter, not drift.
        if (Math.hypot(q.x - (C.x + 640), q.z - (C.z - 384)) > R - 400) continue
        const o = byId.get(q.id)
        if (!o) { moved++; continue }
        shared++
        const d = Math.hypot(q.x - o.x, q.z - o.z)
        if (d > worst) worst = d
    }
    check('POIs well inside both windows are present in both (no window-dependent existence)',
        moved === 0, `${moved} missing of ${moved + shared}`)
    check('shared POIs sit at exactly the same place (keyed off the graph edge, not the runKey)',
        worst < 1e-6, `worst drift ${worst.toFixed(6)} m over ${shared} shared POIs`)
    console.log(`       ${shared} POIs compared across two stream centres 745 m apart`)
}

// ── 3b. placement has no HISTORY, and density only adds ─────────────────────────────────────────
// Two properties that a shared reject list quietly breaks. `_evaluate`'s junction reject reads
// padReachNodes(), which lists POI pads alongside junction pads — so without clearing the previous
// build's pads first, a REBUILD sites against the region it is replacing. That is history, not
// determinism, and it showed up as the density sweep below disagreeing with the forced set (1 POI
// at chance 0.5, 4 at 0.75). It also validates this gate's own forcing trick: because the chance
// draw is the FIRST call on each edge's PRNG, forcing the roll cannot shift the candidate stream,
// so the shipped-density layout is exactly a subset of the forced one — the gate tests a superset
// of what ships, not a different thing.
{
    const mk = (chance) => {
        const s = new PoiSystem({
            getRoad: () => W.road, getWater: () => W.water, getTerrain: () => W.terrain,
            getSeed: () => SEED, getParams: () => ({ ...RANGER_PARAMS, poiEdgeChance: chance }),
        })
        return s.build(C, R).map(q => `${q.id}@${q.x.toFixed(6)},${q.z.toFixed(6)}`)
    }
    const forced = new Set(mk(1.0))
    let strays = 0, tested = 0
    for (const c of [0.35, 0.5, 0.75, 0.9]) {
        const l = mk(c)
        tested += l.length
        strays += l.filter(k => !forced.has(k)).length
    }
    check('a lower density only REMOVES POIs — every one it keeps is identical to the forced set',
        strays === 0, `${strays} of ${tested} differ`)

    const s = new PoiSystem({
        getRoad: () => W.road, getWater: () => W.water, getTerrain: () => W.terrain,
        getSeed: () => SEED, getParams: () => ({ ...RANGER_PARAMS, poiEdgeChance: 1.0 }),
    })
    const first = s.build(C, R).map(q => `${q.id}@${q.x.toFixed(6)}`).join('|')
    s.build({ x: C.x + 300, z: C.z }, R)          // a different region in between
    const again = s.build(C, R).map(q => `${q.id}@${q.x.toFixed(6)}`).join('|')
    check('rebuilding after a DIFFERENT region reproduces the same layout (no history)',
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

// ── 6. a job taken from a POI STARTS at that POI — including every regenerate ────────────────────
// The anchored roll pins the start to the marker's own (edge, arcS) and prepends that partial
// stretch as the first par segment. Regenerating must re-roll the DESTINATION ONLY: it used to drop
// the anchor and hand back a free anywhere-to-anywhere Quick Job, so the second offer from a marker
// had nothing to do with the marker — you would accept a job starting across the region while
// parked in a pullout. A quest giver offers a different job, not a different place to stand.
{
    const ms = new MissionSystem({
        getRoad: () => W.road,
        makePlanner: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    let rolls = 0, strays = 0, worst = 0, noRoute = 0
    const tried = []
    for (const q of W.poi.list()) {
        const anchor = { aId: q.aId, bId: q.bId, s: q.s, poiId: q.id }
        // Ten independent rolls per POI stands in for "accept, then hit regenerate nine times":
        // _roll is what regenerate re-runs, and the destination is Math.random per roll.
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
    check('every anchored roll starts AT the POI (regenerate re-rolls the destination only)',
        rolls > 0 && strays === 0,
        `${strays}/${rolls} strayed, worst ${worst.toFixed(2)} m from the marker`)
    console.log(`       ${rolls} anchored rolls over ${tried.length} POIs `
        + `(${noRoute} found no qualifying leg — a dead-end marker, not a stray)`)

    // The wiring: _generate must REMEMBER the anchor, or regenerate() has nothing to pass on.
    const a0 = { aId: W.poi.list()[0].aId, bId: W.poi.list()[0].bId, s: W.poi.list()[0].s, poiId: 'x' }
    ms._generate(a0)
    check('the offer remembers its anchor, so regenerate() can re-use it', ms._anchor === a0)
    ms._generate(null)
    check('a free Quick Job roll clears the anchor', ms._anchor === null)
}

// ── 7. FEAT-53 single-offer rule: one job per (POI, day), re-park = same offer ───────────────────
// A giver you can decline-and-re-park into a fresh roll is the same slot machine as the regenerate
// button. The offer is cached per (poi.id, day): identical object on re-entry, re-rolled only at a
// day boundary, consumed by accept.
{
    let day = 1
    const ms = new MissionSystem({
        getRoad: () => W.road,
        makePlanner: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        getTerms: () => ({ day, dayTier: 1, thresholds: undefined }),
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    const tick = () => new Promise(r => setTimeout(r, 5))
    const poi = W.poi.list()[0]

    ms.enterFromPoi(poi); await tick()
    const m1 = ms.mission
    check('first park of the day rolls an offer', ms.state === 'offer' && !!m1)

    ms.exit()
    ms.enterFromPoi(poi)     // cache hit is synchronous — no generate, no spinner
    check('re-park presents the IDENTICAL mission object (no reroll farming)',
        ms.state === 'offer' && ms.mission === m1)

    day = 2
    ms.exit()
    ms.enterFromPoi(poi)
    check('a day boundary re-rolls the offer', ms.state === 'generating')
    await tick()
    check('the new day\'s offer is a fresh roll', ms.state === 'offer' && ms.mission !== m1)

    ms.accept()
    check('accept stamps the frozen terms onto the mission (SM-INV-4 lock)',
        ms.mission.terms && ms.mission.terms.day === 2)
    const taken = ms.mission
    ms.exit()
    ms.enterFromPoi(poi)
    check('accept CONSUMES the offer — the next park generates, not re-presents',
        ms.state === 'generating')
    await tick()
    check('...and the post-accept roll is not the taken job', ms.mission !== taken)

    ms.invalidatePlan()
    check('invalidatePlan clears the offer cache (no dead-RoadSystem pinning)', ms._offers.size === 0)
    ms.exit()
}

// ── 8. FEAT-53 do-over lockout: paid jobs have no regenerate/retry; Quick Job keeps both ─────────
{
    const ms = new MissionSystem({
        getRoad: () => W.road,
        makePlanner: () => W.road,
        getCar: () => ({ x: C.x, z: C.z, speed: 0 }),
        getSeed: () => SEED,
        teleport () {}, setMapOpen () {}, onChange () {},
    })
    const tick = () => new Promise(r => setTimeout(r, 5))
    const poi = W.poi.list()[0]

    ms.enterFromPoi(poi); await tick()
    const offered = ms.mission
    ms.regenerate()
    check('regenerate is INERT on a POI job (no do-overs on paid work)',
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

console.log(fails === 0 ? '\nALL POI CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
