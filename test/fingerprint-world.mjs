// test/fingerprint-world.mjs — full-precision WORLDGEN fingerprint, for proving a refactor is
// output-identical (review-2, S-80). Rainy-day script, NOT a gate.
//
// For six fixed (seed, centre, radius) windows it builds the road network synchronously — water
// no-go wired as main.js does — and hashes (sha256 over JSON numbers, which round-trip doubles
// exactly, or over Float64 bytes) one value per component:
//   network   exportNetwork(): run keys, cells, point/polyCum/clArc arrays, prims, graph, promoted
//   profiles  _buildRunProfile(key) for every run: arcPos/gradeY/gradeM/camberRad/tx/tz
//   junctions _detectNodeJunctions(): node pos, legs, ring/pad data
//   poi       PoiSystem build + buildHouses (story-poi's builder): roster, pool, customers —
//             STORY windows only: a 320 m play window holds no viable pad, so its hash is vacuous
//   surface   physics surface on an XZ lattice: analyticHeight + analyticNormal + debugSampleAt
//   carve     TerrainSystem._buildCarveTable for every chunk the network touches in the window
//   tiles     every road tile's render geometry (_buildRoadTile: ribbons, pads, bores, portals)
//   water     ponds + streams in the window, and their stream/bed ribbon geometry
//   props     scatterChunk output for the 3x3 chunks at the centre, main.js's sampler set
// The POIs are built right after the network (as story mode does) so every later component sees
// their pads. The terrain is test/lib/terrain-headless.mjs: road carve yes, stream carve no.
//
//   node test/fingerprint-world.mjs --out=/path/a.json                 (writes the hashes)
//   node test/fingerprint-world.mjs --out=/path/b.json --compare=/path/a.json   (exit 1 on mismatch)

import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { TerrainSystem, CHUNK_SIZE } from '../src/terrain.js'
import { WaterSystem } from '../src/water.js'
import { streamSpans, buildStreamMesh, buildStreamBedMesh } from '../src/water-render.js'
import { PoiSystem } from '../src/poi.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]
const OUT = arg('out'), CMP = arg('compare')

// Centres are the ones the existing gates use (network-worker-parity, world-determinism, road-battery).
const WINDOWS = [
  { name: 'seed6 origin story',  seed: 6,  cx: 0,     cz: 0,    r: 1400, step: 16 },
  { name: 'seed11 origin story', seed: 11, cx: 0,     cz: 0,    r: 1400, step: 16 },
  { name: 'seed6 ponds play',    seed: 6,  cx: 139,   cz: 341,  r: 320,  step: 4 },
  { name: 'seed6 fork play',     seed: 6,  cx: -1582, cz: 1333, r: 320,  step: 4 },
  { name: 'seed7 origin play',   seed: 7,  cx: 0,     cz: 0,    r: 320,  step: 4 },
  { name: 'seed3 origin play',   seed: 3,  cx: 0,     cz: 0,    r: 320,  step: 4 },
]

// ── hashing ──────────────────────────────────────────────────────────────────────────────────────
const digest = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
const hashFloats = (arr) => digest(Buffer.from(Float64Array.from(arr).buffer))
const replacer = (k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v]
  : ArrayBuffer.isView(v) ? Array.from(v) : v)
const hashJSON = (x) => digest(JSON.stringify(x, replacer))
const geoFloats = (g) => {
  const out = []
  for (const name of Object.keys(g.attributes).sort()) out.push(...g.attributes[name].array)
  if (g.index) out.push(...g.index.array)
  return out
}

function fingerprint (W) {
  const h = {}, t = {}
  const time = (k, fn) => { const t0 = performance.now(); h[k] = fn(); t[k] = Math.round(performance.now() - t0) }
  const { cx, cz, r, seed } = W
  const x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r

  const { rawHeightWorld } = makeTerrainHeadless(seed, P, null)
  const water = new WaterSystem(seed, P, rawHeightWorld)
  const road = new RoadSystem(seed, P)
  time('network', () => {
    road.setWaterNoGo((x, z) => water.isRoadNoGo(x, z), (a, b, c, d) => {
      const o = []; for (const p of water.pondsNear(a, b, c, d)) o.push(p.floorX, p.floorZ, p.radius + p.skirt); return o
    })
    road.setRadius(r)
    road.update(new THREE.Vector3(cx, 0, cz))
    return hashJSON(road.exportNetwork())
  })
  const terr = makeTerrainHeadless(seed, P, road)

  time('profiles', () => hashJSON([...road._network.keys()].sort().map((k) => [k, road._buildRunProfile(k)])))
  time('junctions', () => hashJSON([...road._detectNodeJunctions()]))
  if (r >= 1000) time('poi', () => {
    const poi = new PoiSystem({ getRoad: () => road, getWater: () => water, getTerrain: () => terr,
      getSeed: () => seed, getParams: () => P })
    const C = { x: cx, z: cz }
    poi.build(C, r); poi.buildHouses(C, r)
    return hashJSON({ list: poi.list(), pool: poi.pool(), houses: poi.houses() })
  }); else h.poi = '-', t.poi = 0
  time('surface', () => {
    const f = []
    for (let x = x0; x <= x1; x += W.step) for (let z = z0; z <= z1; z += W.step) {
      const n = terr.analyticNormal(x, z)
      f.push(terr.analyticHeight(x, z), n.x, n.y, n.z)
    }
    const deck = []
    for (let x = x0; x <= x1; x += W.step * 2) for (let z = z0; z <= z1; z += W.step * 2) deck.push(road.debugSampleAt(x, z))
    return hashFloats(f).slice(0, 8) + hashJSON(deck).slice(0, 8)
  })

  // Chunks the network touches inside the window (carve-mesh-smoothness.mjs's rule), sorted.
  const chunks = new Set()
  for (const [, e] of road._network) for (const p of e.points)
    if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) chunks.add(`${Math.floor(p.x / CHUNK_SIZE)},${Math.floor(p.z / CHUNK_SIZE)}`)
  const chunkList = [...chunks].sort()
  let nTiles = 0, nGeos = 0
  time('carve', () => {
    const N = CHUNK_SIZE + 1, amp = P.terrainAmplitude ?? 1, noise = makeNoise(seed)
    const fakeT = { _roadSystem: road, _params: P,
      _noiseCoarse: noise.noiseCoarse, _noiseFine: noise.noiseFine, _noiseRegional: noise.noiseRegional }
    const f = []
    for (const ck of chunkList) {
      const [tx, tz] = ck.split(',').map(Number)
      const raw = new Float32Array(N * N)
      for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++)
        raw[zi * N + xi] = terr.rawHeightWorld(tx * CHUNK_SIZE + xi, tz * CHUNK_SIZE + zi) / amp
      const table = TerrainSystem.prototype._buildCarveTable.call(fakeT, tx, tz, raw)
      f.push(table ? table.length : -1); if (table) f.push(...table)
    }
    return hashFloats(f)
  })

  time('tiles', () => {
    const geos = []
    const mesh = new RoadMeshSystem({ add (o) { if (o.geometry) geos.push(o.geometry) } }, road, null, P, seed)
    mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null   // canvas textures are browser-only
    const keys = [...road._tiles.keys()].filter((k) => {
      const [tx, tz] = k.split(',').map(Number)
      return (tx + 1) * CHUNK_SIZE >= x0 && tx * CHUNK_SIZE <= x1 && (tz + 1) * CHUNK_SIZE >= z0 && tz * CHUNK_SIZE <= z1
    }).sort()
    nTiles = keys.length
    const f = []
    for (const k of keys) {
      const [tx, tz] = k.split(',').map(Number)
      const n0 = geos.length
      mesh._buildRoadTile(tx, tz, k)
      f.push(geos.length - n0)
      for (const g of geos.slice(n0)) f.push(...geoFloats(g))
    }
    nGeos = geos.length
    return hashFloats(f)
  })

  time('water', () => {
    const ponds = water.pondsInBBox(x0, z0, x1, z1), streams = water.streamsInBBox(x0, z0, x1, z1)
    const surfaceAt = (x, z) => ({ h: terr.analyticHeight(x, z),
      blendW: road._sampleCarveWorld(x, z, rawHeightWorld(x, z))?.blendW ?? 0 })
    const bbox = { minX: x0, minZ: z0, maxX: x1, maxZ: z1 }
    const f = []
    for (const st of streams) {
      const sp = streamSpans(st, bbox, surfaceAt)
      for (const m of [buildStreamMesh(st, undefined, bbox, surfaceAt, sp),
                       buildStreamBedMesh(st, undefined, bbox, surfaceAt, sp)]) {
        f.push(m ? 1 : 0); if (m) f.push(...geoFloats(m.geometry))
      }
    }
    return hashJSON({ ponds, streams }).slice(0, 8) + hashFloats(f).slice(0, 8)
  })

  time('props', () => {
    // main.js makePropSamplers, minus sunShear (absent headless) and the perf timers.
    const T = { ...terr, _params: P, groundClassify: TerrainSystem.prototype.groundClassify }
    const ex = FLORA_PARAMS.scatter.roadExclusion
    const s = {
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
    }
    const ccx = Math.floor(cx / CHUNK_SIZE), ccz = Math.floor(cz / CHUNK_SIZE), out = []
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push(scatterChunk(ccx + dx, ccz + dz, seed, s))
    return hashJSON(out)
  })
  return { hashes: h, ms: t, counts: `${road._network.size} runs, ${chunkList.length} carve chunks, ${nTiles} tiles / ${nGeos} meshes` }
}

const t0 = performance.now()
const result = {}
const COMPONENTS = ['network', 'profiles', 'junctions', 'poi', 'surface', 'carve', 'tiles', 'water', 'props']
console.log('window'.padEnd(20) + COMPONENTS.map((c) => c.padEnd(17)).join(''))
for (const W of WINDOWS) {
  const fp = fingerprint(W)
  result[W.name] = fp.hashes
  console.log(W.name.padEnd(20) + COMPONENTS.map((c) => fp.hashes[c].padEnd(17)).join(''))
  console.log(''.padEnd(20) + COMPONENTS.map((c) => `${fp.ms[c]} ms`.padEnd(17)).join('')
    + `  (${fp.counts})`)
}
console.log(`total ${((performance.now() - t0) / 1000).toFixed(1)} s`)
if (OUT) { writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log(`wrote ${OUT}`) }

if (CMP) {
  const ref = JSON.parse(readFileSync(CMP, 'utf8'))
  let bad = 0
  for (const W of WINDOWS) for (const c of COMPONENTS) {
    const ok = ref[W.name]?.[c] === result[W.name][c]
    if (!ok) bad++
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${W.name} · ${c}`)
  }
  console.log(bad ? `\n${bad} COMPONENT(S) DIFFER from ${CMP}` : `\nALL IDENTICAL to ${CMP}`)
  process.exit(bad ? 1 : 0)
}
