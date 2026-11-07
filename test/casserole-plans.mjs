// GATE (BUG-124): MOM'S CASSEROLE ALWAYS PLANS, so a run can always start.
//
// The casserole (data/offers.js FIRST_JOB) runs to Larry's and nowhere else, and since BUG-117 every other job waits
// for it. The planner never ends a job on its start's own graph edge (mission.js _roll, srcEdge), so a Larry on mom's
// edge was a world whose run could not start (2646203056: two pads down the same road, 293 m apart). The guarantee is
// CONSTRUCTIVE, at placement: Larry's slot is `offEdgeOf: 'momsHouse'` (src/poi.js POI_ROSTER, _assignRoster).
//
//   1. THE RULE, exactly (fast, no network): synthetic pools through the REAL roster fill, where the only two pads
//      near the spawn share one edge. Mom takes one; Larry must go elsewhere, never the other.
//   2. THE JOB, end to end (heavy): regions built as story entry builds them (tests/expedition-camp's recipe) —
//      2646203056, the report, plus two RANDOM seeds per run. On each, mom's and Larry's are on different edges and
//      the casserole plans a route that ends at Larry's. The random seeds are a SAMPLE, printed so a miss replays; the
//      guarantee is part 1's rule, not this sample.
//
// Heavy: routes a full region per seed (~25 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem, POI_PARAMS } from '../src/poi.js'
import { OfferBoard } from '../src/offer-board.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { MissionSystem, REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
    if (!ok) fails++
}

// ── 1. the rule ─────────────────────────────────────────────────────────────────────────────────
{
    const P = { ...POI_PARAMS }
    let SEED = 0
    const poi = new PoiSystem({ getParams: () => ({}), getSeed: () => SEED })
    const C = { x: 0, z: 0 }
    // Two lay-bys on edge 'near', 320 m apart along it (past poiPadSpacing, so taking one leaves the other free), inside
    // poiNearSpawnR; 34 more, each on its own edge, on a ring past it. Without the rule Larry takes the second: 40/40.
    const pad = (id, edge, x, z, s = 100) => ({ id, edge, s, padKind: 'std', x, z, y: 100, tx: 1, tz: 0, nx: 0, nz: -1,
        yaw: Math.atan2(0, -1), halfLen: P.poiPadHalfLen, halfWid: P.poiPadHalfWid, cornerR: P.poiPadCornerR, cut: 0 })
    const pool = () => {
        const out = [pad('poi:near@0', 'near', -160, 0, 100), pad('poi:near@1', 'near', 160, 0, 420)]
        for (let i = 0; i < 34; i++) {
            const th = i / 34 * Math.PI * 2, r = P.poiNearSpawnR + 600
            out.push(pad(`poi:e${i}@0`, `e${i}`, Math.cos(th) * r, Math.sin(th) * r))
        }
        return out
    }
    let bad = 0, ok = 0
    for (let seed = 1; seed <= 40; seed++) {
        SEED = seed
        const list = poi._assignRoster(pool(), C, seed, P)
        const mom = list.find(q => q.type === 'momsHouse'), larry = list.find(q => q.type === 'larrysHouse')
        if (!mom || !larry || mom.edge === larry.edge) bad++
        else if (mom.edge === 'near') ok++
    }
    check('Larry never takes a pad on mom\'s edge (40 synthetic pools whose only near-spawn pads share one edge)',
        bad === 0 && ok === 40, `${bad} shared or missing, mom on the near edge ${ok}/40`)
}

// ── 2. the job ──────────────────────────────────────────────────────────────────────────────────
const P = RANGER_PARAMS
const rand = () => { let s; do s = String((Math.random() * 2 ** 32) >>> 0); while (s === '6'); return s }
const SEEDS = ['2646203056', rand(), rand()]
for (const s of SEEDS) {
    const seed = parseWorldSeed(s), t0 = Date.now()
    const sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
    const road = new RoadSystem(seed, P)
    wirePondNoGo(road, seed, P)
    road.setRadius(REGION_WARM_RADIUS_M)
    road.update(new THREE.Vector3(C.x, 0, C.z))
    const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
    const region = { x: C.x, z: C.z, r: REGION_RADIUS_M, nodes: rep.mainNodes }
    const terrain = makeTerrainHeadless(seed, P, road)
    const water = new WaterSystem(seed, P, (x, z) => terrain.rawHeightWorld(x, z))
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terrain,
                                getSeed: () => seed, getParams: () => P })
    poi.build(C, REGION_RADIUS_M, rep.mainNodes)
    poi.buildHouses(C, REGION_RADIUS_M, rep.mainNodes)
    const list = poi.list()
    const mom = list.find(q => q.type === 'momsHouse'), larry = list.find(q => q.type === 'larrysHouse')
    const ms = new MissionSystem({ getRoad: () => road, getCar: () => C, getSeed: () => seed, getRegion: () => region,
                                   teleport () {}, setMapOpen () {}, onChange () {} })
    const board = new OfferBoard({ seed, pois: list, nowH: 6 })
    board.openFirst(6)
    const o = mom && board.offers(mom.id, 6).find(o => board.spec(o)?.first)
    const m = o && ms.planOffer(mom, { rng: board.routeRng(o), dest: board.destWish(o, list, new Set()) })
    console.log(`seed ${s}${s === SEEDS[0] ? ' (the BUG-124 report)' : ' (random)'}  ${((Date.now() - t0) / 1000).toFixed(0)} s`
        + `  mom ${mom?.edge ?? '—'}  larry ${larry?.edge ?? '—'}  route ${m ? (m.distance / 1000).toFixed(2) + ' km' : '—'}`)
    check(`${s}: mom's and Larry's both placed, on different edges`, !!mom && !!larry && mom.edge !== larry.edge)
    check(`${s}: the casserole plans, and ends at Larry's`, !!m && m.endPoiId === larry?.id,
        m ? `ends at ${m.endPoiId}` : 'no route')
}

console.log(fails ? `\n${fails} CASSEROLE CHECK(S) FAILED` : '\nALL CASSEROLE CHECKS PASSED')
process.exit(fails ? 1 : 0)
