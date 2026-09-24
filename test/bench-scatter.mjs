// test/bench-scatter.mjs — per-chunk PROP SCATTER cost (PERF-08 harness family). Node-only.
//
// Real RoadSystem + the headless analytic terrain (test/lib/terrain-headless.mjs) behind the
// SAME sampler set main.js hands PropSystem, minus the water system (the stream passes are inert
// in every row — same handicap for all). Scatters the ring-2 window (25 chunks) at the origin per
// configuration and prints mean / max ms per chunk with sampler call counts, so a density or
// placement change can be priced before it is felt: the frame loop drips scatter at 3 ms/frame
// and falls back to a synchronous hard scatter of the truck's 3×3 when a chunk row outruns it.
// The first row's max is JIT warm-up (first chunk of the run) — read the mean.
//
// Rows: main-equivalent (the pre-FEAT-84/85 densities) → each addition → the branch defaults.
// Usage: node test/bench-scatter.mjs [seed]
import * as THREE from 'three'
import { performance } from 'node:perf_hooks'
import { RoadSystem } from '../src/road.js'
import { vegBlendOf } from '../src/terrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { scatterChunk } from '../src/props/prop-scatter.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEED = Number(process.argv[2] || 6), RING = 2
const road = new RoadSystem(SEED, RANGER_PARAMS)
road.update(new THREE.Vector3(0, 0, 0))
const terr = makeTerrainHeadless(SEED, RANGER_PARAMS, road)
const p = RANGER_PARAMS
const sm = (e0, e1, x) => { if (x <= e0) return 0; if (x >= e1) return 1; const t = (x - e0) / (e1 - e0); return t * t * (3 - 2 * t) }
const groundAt = (wx, wz) => {
  const n = terr.analyticNormal(wx, wz), slope = 1 - Math.max(0, Math.min(1, n.y)), h = terr.analyticHeight(wx, wz)
  const treeLo = p.terrainTreelineLo ?? 60, treeHi = p.terrainTreelineHi ?? 105
  return { h, slope, green: vegBlendOf(slope, h, p.terrainGrassSlopeMax ?? 0.16, treeLo, treeHi),
           rock: Math.max(sm(p.roadCliffSlopeLo ?? 0.3, p.roadCliffSlopeHi ?? 0.6, slope), sm(treeLo, treeHi, h)) }
}
const counts = {}, times = {}
const wrap = (name, fn) => (...a) => { const t = performance.now(); const r = fn(...a); times[name] = (times[name] || 0) + performance.now() - t; counts[name] = (counts[name] || 0) + 1; return r }
const samplers = {
  heightAt: wrap('heightAt', (x, z) => terr.analyticHeight(x, z)),
  normalAt: wrap('normalAt', (x, z) => terr.analyticNormal(x, z)),
  roadBlocked: wrap('roadBlocked', (x, z) => !!road.queryNearest(x, z, FLORA_PARAMS.scatter.roadExclusion) || road.poiPadBlocked(x, z, FLORA_PARAMS.scatter.roadExclusion)),
  roadClear: wrap('roadClear', (x, z, k) => !road.queryNearest(x, z, k) && !road.poiPadBlocked(x, z, k)),
  roadDist: wrap('roadDist', (x, z) => { const nr = road.queryNearest(x, z, 25); return nr ? Math.hypot(x - nr.point.x, z - nr.point.z) : Infinity }),
  roadWalk: wrap('roadWalk', (cx, cz, s) => road.walkTileRoads(cx, cz, s)),
  groundAt: wrap('groundAt', groundAt),
  padBlocked: wrap('padBlocked', (x, z, k) => road.poiPadBlocked(x, z, k) || road.junctionPadBlocked(x, z, k)),
}
const clone = JSON.parse(JSON.stringify(FLORA_PARAMS))
const CONFIGS = {
  'main-equivalent': (P) => { P.scatter.cover.enabled = false; P.scatter.zoneRocks.attempts = 0; P.scatter.smallRocksPerChunk = [30, 60]; P.scatter.rocksPerChunk = [12, 26]; P.scatter.boulderChance = 0.04 },
  '+ small rocks ×2 + boulders': (P) => { P.scatter.cover.enabled = false; P.scatter.zoneRocks.attempts = 0 },
  '+ zone rocks': (P) => { P.scatter.cover.enabled = false },
  '+ cover (wall+backcountry)': (P) => { P.scatter.zoneRocks.attempts = 0 },
  'branch (everything)': () => {},
}
console.log(`seed ${SEED}, ${(2 * RING + 1) ** 2} chunks (ring ${RING}), no water system (stream passes inert in every row)\n`)
console.log('config'.padEnd(30) + ' mean ms | max ms | places/chunk | heightAt | normalAt | roadClear | groundAt | roadDist')
for (const [name, cfg] of Object.entries(CONFIGS)) {
  const P = JSON.parse(JSON.stringify(clone)); cfg(P)
  for (const k in counts) { counts[k] = 0; times[k] = 0 }
  const ms = [], n = []
  for (let cz = -RING; cz <= RING; cz++) for (let cx = -RING; cx <= RING; cx++) {
    const t = performance.now(); const out = scatterChunk(cx, cz, SEED, samplers, P); ms.push(performance.now() - t); n.push(out.length)
  }
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length, max = Math.max(...ms), cnt = (k) => Math.round((counts[k] || 0) / ms.length)
  console.log(name.padEnd(30) + ` ${mean.toFixed(1).padStart(7)} | ${max.toFixed(1).padStart(6)} | ${Math.round(n.reduce((a, b) => a + b, 0) / n.length).toString().padStart(12)} | ${cnt('heightAt').toString().padStart(8)} | ${cnt('normalAt').toString().padStart(8)} | ${cnt('roadClear').toString().padStart(9)} | ${cnt('groundAt').toString().padStart(8)} | ${cnt('roadDist').toString().padStart(8)}`)
}
console.log('\nsampler ms share, branch config (per chunk): ' + Object.keys(times).map(k => `${k} ${(times[k] / 25).toFixed(1)}`).join(' · '))
