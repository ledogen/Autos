// test/bench-worldgen.mjs — headless worldgen timing bench (PERF-08 harness). Node-only, no browser.
//
// Times the two halves of "why does the world take so long":
//   A. ROAD NETWORK — real RoadSystem over the REAL coarse-height closure (ctor builds it from
//      (seed, RANGER_PARAMS) when no override is passed): cold graph build + routing, warm
//      re-stream after a band move, and the spawn-style 3×3 ensureTile loop. Seed 6 mirrors the
//      shipped default (in-browser this is bundled-cache-hit; here it routes for real, i.e. the
//      NON-default-seed cold-load cost the bundled cache hides). Extra seeds show variance.
//   B. TERRAIN CHUNK main-thread stages, per chunk (the _flushPendingQueue work that is NOT on the
//      Worker): 65×65 height sampling (proxy for the Worker's generate), _buildCarveTable,
//      _computeGridNormals, _writeChunkVertexColors — via the prototype + fake-this recipe proven
//      by test/carve-mesh-smoothness.mjs. This sizes the "move carve/normals/colors to the Worker"
//      win BEFORE writing any worker code.
//
// Run: node test/bench-worldgen.mjs [--seeds=6,42,1337] [--chunks=12]
// Not (yet) a gate — thresholds get blessed into run-all after the Phase-2 baseline (see plan).

import * as THREE from 'three'
import { performance } from 'node:perf_hooks'
import { RoadSystem } from '../src/road.js'
import { TerrainSystem } from '../src/terrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeTerrainHeadless, makeNoise } from './lib/terrain-headless.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
const SEEDS = flag('seeds', '6,42,1337').split(',').map(Number)
const N_CHUNKS = Number(flag('chunks', 12))
const N = 65, CS = 64
const ms = v => v.toFixed(1).padStart(8)

console.log('── A. road network (real coarse closure — headless ≈ non-default-seed browser cost) ──')
console.log('   seed |  cold ms | restream ms | ensure3x3 ms |  runs | conns cached')
const roadBySeed = new Map()
for (const seed of SEEDS) {
  // Cold: fresh system, first stream at origin — graph assembly + every connection routed.
  let t0 = performance.now()
  const road = new RoadSystem(seed, RANGER_PARAMS)
  road.update(new THREE.Vector3(0, 0, 0))
  const cold = performance.now() - t0

  // Re-stream: move one band (>PROTO_REGEN_MOVE) — cache-hit assembly + newly-entered-band routing.
  t0 = performance.now()
  road.update(new THREE.Vector3(640, 0, 0))
  const restream = performance.now() - t0

  // Spawn analogue: fresh system, the resolveSpawn-style 3×3 ensureTile warm loop (synchronous,
  // i.e. what the browser pays when the worker-pool pre-warm has NOT filled the cache).
  t0 = performance.now()
  const road2 = new RoadSystem(seed, RANGER_PARAMS)
  for (let tx = -1; tx <= 1; tx++) for (let tz = -1; tz <= 1; tz++) road2.ensureTile(tx, tz)
  const ensure = performance.now() - t0

  const conns = road._proto?.cls?.size ?? 0
  console.log(`   ${String(seed).padStart(4)} | ${ms(cold)} | ${ms(restream).padStart(11)} | ${ms(ensure).padStart(12)} | ${String(road._network.size).padStart(5)} | ${conns}`)
  roadBySeed.set(seed, road)
}

console.log('\n── B. terrain chunk main-thread stages (per 65×65 chunk, avg over sampled chunks) ──')
{
  const seed = SEEDS[0]
  const road = roadBySeed.get(seed)
  const terr = makeTerrainHeadless(seed, RANGER_PARAMS, road)
  const noise = makeNoise(seed)
  const amp = RANGER_PARAMS.terrainAmplitude ?? 1
  // Fake `this` recipes (same pattern as carve-mesh-smoothness.mjs): exactly the fields each
  // prototype method reads. Drift here shows up as a crash, not a wrong number.
  const fakeCarve = { _roadSystem: road, _params: RANGER_PARAMS, _noiseCoarse: noise.noiseCoarse, _noiseFine: noise.noiseFine, _noiseRegional: noise.noiseRegional }
  const fakeColor = { _params: RANGER_PARAMS, rawHeightWorld: (x, z) => terr.rawHeightWorld(x, z), _localMeanGrid: TerrainSystem.prototype._localMeanGrid }

  // Sample chunks: half carve-bearing (near network points), half plain terrain.
  const carveChunks = new Set(), plainChunks = new Set()
  for (const [, entry] of road._network) {
    for (let i = 0; i < entry.points.length && carveChunks.size < Math.ceil(N_CHUNKS / 2); i += 16) {
      const p = entry.points[i]
      carveChunks.add(`${Math.floor(p.x / CS)},${Math.floor(p.z / CS)}`)
    }
    if (carveChunks.size >= Math.ceil(N_CHUNKS / 2)) break
  }
  for (let i = 0; plainChunks.size < Math.floor(N_CHUNKS / 2); i++) plainChunks.add(`${20 + i * 3},${20 + i * 5}`)  // far from origin network

  const sum = { height: 0, carve: 0, normals: 0, colors: 0, n: 0, carveHits: 0 }
  const geom = new THREE.PlaneGeometry(CS, CS, N - 1, N - 1)
  geom.rotateX(-Math.PI / 2)   // XY → XZ, matching the pooled chunk geometry (terrain.js:674)
  for (const ck of [...carveChunks, ...plainChunks]) {
    const [cx, cz] = ck.split(',').map(Number)

    let t0 = performance.now()
    const rawPre = new Float32Array(N * N)
    for (let zi = 0; zi < N; zi++) for (let xi = 0; xi < N; xi++) {
      rawPre[zi * N + xi] = terr.rawHeightWorld(cx * CS + xi, cz * CS + zi) / amp
    }
    sum.height += performance.now() - t0

    t0 = performance.now()
    const table = TerrainSystem.prototype._buildCarveTable.call(fakeCarve, cx, cz, rawPre)
    sum.carve += performance.now() - t0
    if (table) sum.carveHits++

    // Y-write + grid-FD normals on the real pooled-geometry layout.
    t0 = performance.now()
    const posArr = geom.attributes.position.array
    for (let i = 0; i < N * N; i++) {
      const raw = rawPre[i] * amp
      posArr[i * 3 + 1] = table ? raw + table[i * 2] * (table[i * 2 + 1] * amp - raw) : raw
    }
    TerrainSystem.prototype._computeGridNormals.call(fakeColor, geom)
    sum.normals += performance.now() - t0

    t0 = performance.now()
    const heights = new Float32Array(N * N)
    for (let i = 0; i < N * N; i++) heights[i] = posArr[i * 3 + 1]
    TerrainSystem.prototype._writeChunkVertexColors.call(fakeColor, geom, table, heights, amp, cx, cz)
    sum.colors += performance.now() - t0

    sum.n++
  }
  const per = k => (sum[k] / sum.n)
  const perChunk = per('height') + per('carve') + per('normals') + per('colors')
  console.log(`   chunks sampled: ${sum.n} (${sum.carveHits} carve-bearing)`)
  console.log(`   height 65×65 : ${ms(per('height'))} ms   (Worker-side today — sampling proxy)`)
  console.log(`   carve table  : ${ms(per('carve'))} ms   (main thread, _flushPendingQueue)`)
  console.log(`   grid normals : ${ms(per('normals'))} ms   (main thread)`)
  console.log(`   vertex colors: ${ms(per('colors'))} ms   (main thread)`)
  console.log(`   per chunk    : ${ms(perChunk)} ms  → Normal ring (25 chunks) ≈ ${(perChunk * 25 / 1000).toFixed(2)} s of build work`)
  console.log(`   main-thread share (carve+normals+colors): ${ms(per('carve') + per('normals') + per('colors'))} ms/chunk — the "move to Worker" prize`)
}
