// GATE (BUG-214): a POI or camp bench never throws a spike up round its rim, and its mesh == its collision.
//
// The bench is composed over the road's carve as a second earthwork layer (road.js _withPoiPad), so the ground in
// its ring always lies between the bench's design and the ground without it. The old composition took max(blendW)
// with a dom-weighted target and let a road's target leak in under the bench's coverage: here, a camp bench on
// seed 281831 whose ring met the 0.001-weight toe of a road 16 m up the hill stood a 3.6 m spike (a 4.1 m step on
// one 1 m grid edge); a 12-seed census (test/pad-wall-census.mjs) found 177 of 468 pads with > 0.3 m, worst 5.7 m.
//
// Window: seed 281831 round that camp (the network is window-invariant), the POI build over it, plus the camp.
// For every pad, on the chunk vertex lattice inside the ring (1 m, integer world metres):
//   1. no vertex stands more than 5 cm outside [min, max] of the no-pad ground and the design of every bench whose
//      ring reaches it (this window sites a POI 9 m from the camp, so two rings overlap there);
//   2. the chunk mesh (_buildCarveTable + _composeCarvedY) equals analyticHeight to 1 mm wherever the bench moved it.
// Main before the fix: (1) fails at the camp (3.6 m).   ~25 s.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WaterSystem } from '../src/water.js'
import { PoiSystem } from '../src/poi.js'
import { padSd, PAD_RIM_HOLD } from '../src/road-carve.js'
import { TerrainSystem, CHUNK_SIZE, GRID_SAMPLES } from '../src/terrain.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEED = 281831, C = { x: 1300, z: 1200 }, R = 1000
const CAMP = { x: 1327.426436757692, z: 1205.2772856312517, y: 170.59308733521218, tx: Math.SQRT1_2, tz: Math.SQRT1_2,
               nx: Math.SQRT1_2, nz: -Math.SQRT1_2, halfLen: 3, halfWid: 3 }
const REACH = PAD_RIM_HOLD + (P.roadShoulderWidth ?? 2.5) + (P.roadMaxEmbankmentToe ?? 10)
const clr = P.roadClearanceMargin ?? 0.15

const t0 = Date.now()
const { rawHeightWorld } = makeTerrainHeadless(SEED, P, null)
const water = new WaterSystem(SEED, P, rawHeightWorld)
const road = new RoadSystem(SEED, P)
road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (a, b, c, d) => { const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o })
road.setRadius(R); road.update(new THREE.Vector3(C.x, 0, C.z))
const terr = makeTerrainHeadless(SEED, P, road)
const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terr, getSeed: () => SEED, getParams: () => P })
poi.build(C, R)
road.setCampPads([CAMP])
const pads = [...(road._poiPads || []).map(q => ({ q, name: 'poi' })), { q: CAMP, name: 'camp' }]

let fails = 0
const check = (label, ok, detail = '') => { console.log(`  ${ok ? '[ ok ]' : '[FAIL]'} ${label}${detail ? '  ' + detail : ''}`); if (!ok) fails++ }

const TP = TerrainSystem.prototype, N = GRID_SAMPLES, S = CHUNK_SIZE
const meshMemo = new Map()
const meshAt = (x, z) => {
    const cx = Math.floor(x / S), cz = Math.floor(z / S), key = `${cx},${cz}`
    if (!meshMemo.has(key)) {
        const raw = new Float32Array(N * N)
        for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) raw[zi * N + xi] = rawHeightWorld(cx * S + xi, cz * S + zi)
        const ct = TP._buildCarveTable.call(terr.self, cx, cz, raw), st = TP._buildStreamTable.call(terr.self, cx, cz, raw)
        const y = new Float64Array(N * N); for (let i = 0; i < N * N; i++) y[i] = TP._composeCarvedY.call(terr.self, raw[i], ct, st, i)
        meshMemo.set(key, y)
    }
    return meshMemo.get(key)[(z - cz * S) * N + (x - cx * S)]
}

let worstOver = { d: 0 }, worstMesh = { d: 0 }, verts = 0
for (const { q, name } of pads) {
    const ext = Math.ceil(Math.hypot(q.halfLen, q.halfWid) + REACH + 1)
    const pts = []
    for (let z = Math.floor(q.z) - ext; z <= Math.floor(q.z) + ext; z++) for (let x = Math.floor(q.x) - ext; x <= Math.floor(q.x) + ext; x++) {
        const sd = padSd(q, x - q.x, z - q.z); if (sd > 0 && sd <= REACH) pts.push([x, z, terr.analyticHeight(x, z)])
    }
    const keepPoi = road._poiPads, keepCamp = road._campPads
    road.setPoiPads(null); road.setCampPads(null)
    const base = pts.map(([x, z]) => terr.analyticHeight(x, z))
    road.setPoiPads(keepPoi); road.setCampPads(keepCamp)
    pts.forEach(([x, z, h], i) => {
        verts++
        let lo = base[i], hi = base[i]
        for (const o of pads) if (padSd(o.q, x - o.q.x, z - o.q.z) <= REACH) { lo = Math.min(lo, o.q.y - clr); hi = Math.max(hi, o.q.y - clr) }
        const d = Math.max(h - hi, lo - h)
        if (d > worstOver.d) worstOver = { d, x, z, name }
        if (Math.abs(h - base[i]) > 0.02) { const m = Math.abs(meshAt(x, z) - h); if (m > worstMesh.d) worstMesh = { d: m, x, z, name } }
    })
}
console.log(`seed ${SEED}: ${pads.length} pads (${pads.length - 1} POI + 1 camp), ${verts} ring vertices, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
check('no ring vertex stands > 5 cm outside the bench designs and the no-pad ground', worstOver.d <= 0.05,
      `worst ${worstOver.d.toFixed(3)} m${worstOver.name ? ` at ${worstOver.x},${worstOver.z} (${worstOver.name})` : ''}`)
check('the chunk mesh equals analyticHeight to 1 mm where a bench moved the ground', worstMesh.d <= 0.001,
      `worst ${worstMesh.d.toFixed(4)} m${worstMesh.name ? ` at ${worstMesh.x},${worstMesh.z} (${worstMesh.name})` : ''}`)
check('the camp bench is in the window and carved', pads.length > 1 && Math.abs(terr.analyticHeight(CAMP.x, CAMP.z) - (CAMP.y - clr)) < 0.05)
if (fails) { console.log(`\npoi-pad-spike: ${fails} FAIL`); process.exit(1) }
console.log('\npoi-pad-spike: all ok')
