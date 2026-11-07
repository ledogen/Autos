// GATE (BUG-135): every story start seats the truck clear of anything solid.
//
// Owner, 2026-11-07: "I just spawned into the story mode, skipped the tutorial, and found my truck parked over the
// cinder block fire pit. I was literally completely immobilized because I couldn't drive off of it." The skip seated
// the truck on mom's pad, 2.8 m in from its centre, which is her trailer's YARD: the lawn furniture's strips either
// side of the door path. poi.js startSeat now parks it in the road's near lane in front of any POI with a yard.
//
// The starts (poi.js startSeat, which main.js _seatAt seats): the burger joint (a played opening: the run starts
// there), mom's (a skipped opening: the night at hers), Larry's (the paper scenario). For each, on story regions
// built as story entry builds them, the truck's plan footprint (the Ranger's 1.86 x 5.15 m body, grown to 2.0 x 5.4)
// overlaps:
//   1. no POI solid: a marker's collision boxes (Larry's van is one of his), and every yard satellite (satSolid: the
//      fire pit, the grill, the chairs). Exact rectangle overlap in plan, so a hit names what it is.
//   2. no solid prop (trees, rocks, boulders, logs, bushes), scattered with main.js's samplers (the
//      fingerprint-world copy) over the chunks under the seat.
//   3. THE RULER SEES THE BUG: the old seat (mom's pad strip) is checked with the same test and the hits are
//      reported, and a footprint over every fire pit found in the sample is flagged — so a clear start is a real result.
//
// Seeds: 1, plus a pinned sample of random ones (the BUG-131 census list) and two RANDOM seeds per run, printed so a
// miss replays. No default seed: seed 6 is not in the sample.
// Heavy: builds a full story region per seed (~25 s each).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { parseWorldSeed } from '../src/seed.js'
import { WaterSystem } from '../src/water.js'
import { TerrainSystem } from '../src/terrain.js'
import { PoiSystem, POI_PARAMS, satSolid, startSeat } from '../src/poi.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { buildPalette, blobRadii } from '../src/props/prop-palette.js'
import { validateArea, discArea } from '../src/world-validate.js'
import { REGION_MARGIN } from '../src/mission.js'
import { REGION_RADIUS_M, REGION_WARM_RADIUS_M } from '../src/story.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { spawnDecision } from './lib/spawn-decision.mjs'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

const HALF_W = 1.0, HALF_L = 2.7   // m — the truck's plan footprint, a little generous
const SOLID_PROPS = new Set(['aspen', 'pine', 'rock', 'boulder', 'log', 'bush'])

// ── plan-view rectangles: { x, z, hx, hz, yaw } with the model frame's mapping (local x → (cos, −sin), z → (sin, cos))
const axes = (r) => { const c = Math.cos(r.yaw), s = Math.sin(r.yaw); return [[c, -s], [s, c]] }
const overlap = (a, b) => {
  for (const [ux, uz] of [...axes(a), ...axes(b)]) {
    const reach = (r) => { const [ax, bx] = axes(r); return r.hx * Math.abs(ax[0] * ux + ax[1] * uz) + r.hz * Math.abs(bx[0] * ux + bx[1] * uz) }
    if (Math.abs((a.x - b.x) * ux + (a.z - b.z) * uz) > reach(a) + reach(b)) return false
  }
  return true
}
/** The truck at a seat: forward (−sin h, −cos h) is the rectangle's local −z, so its yaw is the heading. */
const truck = (seat) => ({ x: seat.x, z: seat.z, hx: HALF_W, hz: HALF_L, yaw: seat.heading })
/** A marker's (or a satellite's solid record's) boxes in plan. */
function boxesOf (q, cube) {
  const c = q.collision, yaw = q.modelYaw ?? q.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw)
  const ox = q.modelX ?? q.x, oz = q.modelZ ?? q.z
  return (c?.boxes ?? [{ c: null, s: c?.size ?? [cube, cube, cube] }]).map(b => {
    const bx = b.c ? b.c[0] : 0, bz = b.c ? b.c[2] : 0
    return { x: ox + bx * cs + bz * sn, z: oz - bx * sn + bz * cs, hx: b.s[0] / 2, hz: b.s[2] / 2, yaw }
  })
}
/** Everything solid of the POI system's, named. */
function poiSolids (poi) {
  const out = []
  for (const q of poi.list()) {
    if (q.hidden) continue
    for (const r of boxesOf(q, POI_PARAMS.poiCubeSize)) out.push({ ...r, what: `${q.type}'s ${q.modelKey ?? 'marker'}` })
    for (const sat of q.satellites ?? []) {
      const s = satSolid(sat)
      if (s) for (const r of boxesOf(s, 0)) out.push({ ...r, what: `${q.type}'s ${sat.key}`, key: sat.key })
    }
  }
  return out
}

function region (s) {
  const seed = parseWorldSeed(s), sp = spawnDecision(seed, P), C = { x: sp.x, z: sp.z }
  const road = new RoadSystem(seed, P); wirePondNoGo(road, seed, P)
  road.setRadius(REGION_WARM_RADIUS_M); road.update(new THREE.Vector3(C.x, 0, C.z))
  const rep = validateArea(road, C, discArea(REGION_RADIUS_M, REGION_MARGIN), P)
  const terr = makeTerrainHeadless(seed, P, road), water = new WaterSystem(seed, P, (x, z) => terr.rawHeightWorld(x, z))
  const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terr, getSeed: () => seed, getParams: () => P })
  poi.build(C, REGION_RADIUS_M, rep.mainNodes)
  // main.js makePropSamplers, as test/fingerprint-world.mjs copies it.
  const T = { ...terr, _params: P, groundClassify: TerrainSystem.prototype.groundClassify }
  const ex = FLORA_PARAMS.scatter.roadExclusion
  const samplers = {
    heightAt: (x, z) => terr.analyticHeight(x, z),
    normalAt: (x, z) => terr.analyticNormal(x, z),
    roadBlocked: (x, z) => !!road.queryNearest(x, z, ex) || road.poiPadBlocked(x, z, ex),
    roadClear: (x, z, k) => !road.queryNearest(x, z, k) && !road.poiPadBlocked(x, z, k),
    roadDist: (x, z) => { const nr = road.queryNearest(x, z, 25); return nr ? Math.hypot(x - nr.point.x, z - nr.point.z) : Infinity },
    waterAt: (x, z) => water.pondSkirtAt(x, z),
    streamAt: (x, z) => water.streamChannelAt(x, z),
    waterNear: (a, b, c, d) => water.waterNearBBox(a, b, c, d),
    roadWalk: (tx, tz, st) => road.walkTileRoads(tx, tz, st),
    groundAt: (x, z) => TerrainSystem.prototype.groundAt.call(T, x, z),
    groundClassify: (sl, y) => T.groundClassify(sl, y),
    padBlocked: (x, z, k) => road.poiPadBlocked(x, z, k) || road.junctionPadBlocked(x, z, k),
    blobRadius: blobRadii(buildPalette(seed).variants),
  }
  const chunks = new Map(), size = FLORA_PARAMS.chunkSize
  /** The solid props within `r` of (x, z), scattered once per chunk. */
  const propsNear = (x, z, r) => {
    const out = []
    for (let cx = Math.floor((x - r) / size); cx <= Math.floor((x + r) / size); cx++)
      for (let cz = Math.floor((z - r) / size); cz <= Math.floor((z + r) / size); cz++) {
        const k = `${cx},${cz}`
        if (!chunks.has(k)) chunks.set(k, scatterChunk(cx, cz, seed, samplers))
        for (const p of chunks.get(k)) if (SOLID_PROPS.has(p.cat) && Math.hypot(p.x - x, p.z - z) < r) out.push(p)
      }
    return out
  }
  return { poi, propsNear }
}

/** What blocks a seat: POI solids by exact overlap; a solid prop whose centre is within its own radius of the footprint. */
function blockers (solids, propsNear, seat) {
  const t = truck(seat)
  const hits = solids.filter(r => overlap(t, r)).map(r => r.what)
  for (const p of propsNear(seat.x, seat.z, HALF_L + 8)) {
    const r = (p.cat === 'aspen' || p.cat === 'pine' ? 0.5 : 1.0) * (p.scale ?? 1) * (p.cat === 'boulder' ? 3 : 1)
    if (overlap(t, { x: p.x, z: p.z, hx: r, hz: r, yaw: 0 })) hits.push(`a ${p.cat}`)
  }
  return hits
}

const rand = () => { let s; do s = String((Math.random() * 2 ** 32) >>> 0); while (s === '6'); return s }
const SEEDS = process.argv.length > 2 ? process.argv.slice(2) : ['1', '1780111592', '3146249519', '1973545288', '3219742435', rand(), rand()]
const START = { foodVendor: 'the burger joint (a played opening)', momsHouse: "mom's (a skipped opening)", larrysHouse: "Larry's (the paper scenario)" }
let oldHits = 0, pits = 0, pitsFlagged = 0
for (const s of SEEDS) {
  const t0 = Date.now(), { poi, propsNear } = region(s), solids = poiSolids(poi)
  console.log(`seed ${s}`)
  for (const [type, label] of Object.entries(START)) {
    const q = poi.list().find(p => p.type === type)
    if (!q) { check(`${label}: the POI exists`, false, 'none in the region'); continue }
    const hits = blockers(solids, propsNear, startSeat(q, P.roadWidth))
    check(`${label}: the start seat is clear`, hits.length === 0, hits.join(', '))
  }
  // 3. the ruler: the old seat, and every fire pit.
  const mom = poi.list().find(p => p.type === 'momsHouse')
  if (mom) {
    const old = blockers(solids, propsNear, { x: mom.x - mom.nx * 2.8, z: mom.z - mom.nz * 2.8, heading: Math.atan2(-mom.tx, -mom.tz) })
    if (old.length) { oldHits++; console.log(`       the old seat on mom's pad strip: ${old.join(', ')}`) }
  }
  for (const r of solids.filter(r => r.key === 'firePit')) {
    pits++
    if (blockers(solids, propsNear, { x: r.x, z: r.z, heading: 0.3 }).some(w => /firePit/.test(w))) pitsFlagged++
  }
  console.log(`       ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
console.log(`  the old seat (mom's pad strip) was blocked on ${oldHits} of ${SEEDS.length} seeds; ${pits} fire pits in the sample`)
check('the ruler flags a truck over a fire pit, every one in the sample', pitsFlagged === pits, `${pitsFlagged} of ${pits}`)

console.log(fails ? `\n${fails} FAILED` : '\nstory-start-clear: ALL OK')
process.exit(fails ? 1 : 0)
