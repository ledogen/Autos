// RAINY-DAY probe: node test/probe-spawn-section.mjs [seed]
// Resolves spawn like the game, then prints the LATERAL cross-section (perpendicular to the road
// tangent) and a short LONGITUDINAL section, reporting analyticHeight / rawHeight / carve blendW.
// Goal: characterize the bench-cut — bed width, longitudinal grade, uphill cut bank, downhill fill —
// to see what could wedge the truck (uphill wheels riding the cut bank).

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const CHUNK_SIZE = 64
const seedStr = process.argv[2] ?? 'lone-pine'
const worldSeed = parseWorldSeed(seedStr)

const road = new RoadSystem(worldSeed, P)
const spawnSeed = seedFor(worldSeed, 'spawn')
const baseX = ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseZ = (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
road.ensureTile(Math.floor(baseX / CHUNK_SIZE), Math.floor(baseZ / CHUNK_SIZE))
let nearest = road.queryNearest(baseX, baseZ, 200)
const terrain = makeTerrainHeadless(worldSeed, P, road)
if (!nearest) { console.log('no road near spawn'); process.exit(0) }
const spawnTX = Math.floor(nearest.point.x / CHUNK_SIZE)
const spawnTZ = Math.floor(nearest.point.z / CHUNK_SIZE)
road.ensureTile(spawnTX, spawnTZ)
nearest = road.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
road.update(new THREE.Vector3(nearest.point.x, 0, nearest.point.z))

const sx = nearest.point.x, sz = nearest.point.z
const tx = nearest.tangent.x, tz = nearest.tangent.z   // road heading (unit)
const rx = tz, rz = -tx                                 // right = (tz,-tx)
console.log(`seed=${seedStr}  spawn (${sx.toFixed(1)}, ${sz.toFixed(1)})  heading ${(Math.atan2(tx,tz)*180/Math.PI).toFixed(1)}°`)
console.log(`halfWidth=${P.roadHalfWidth} shoulderWidth=${P.roadShoulderWidth}  track≈${(P.trackWidth??1.5).toFixed(2)}m`)

const sample = (x, z) => {
  const raw = terrain.rawHeightWorld(x, z)
  const a = terrain.analyticHeight(x, z)
  const c = road._sampleCarveWorld(x, z, raw)
  return { raw, a, blendW: c ? c.blendW : 0, gradeY: c ? c.gradeY : null }
}

console.log('\n── LATERAL cross-section (perp to road, − = left, + = right of travel) ──')
console.log(' lat     rawH    carvedH   blendW   raw-carved   note')
let prevA = null
for (let lat = -10; lat <= 10.0001; lat += 0.5) {
  const x = sx + rx * lat, z = sz + rz * lat
  const s = sample(x, z)
  const onBed = Math.abs(lat) < P.roadHalfWidth
  const step = prevA === null ? 0 : (s.a - prevA)
  prevA = s.a
  const note = Math.abs(lat) < 1e-6 ? '← centerline' : (onBed ? 'bed' : (s.blendW > 0 ? 'shoulder' : 'raw terrain'))
  console.log(`${lat.toFixed(1).padStart(5)}  ${s.raw.toFixed(2).padStart(7)}  ${s.a.toFixed(2).padStart(7)}  ${s.blendW.toFixed(2).padStart(6)}  ${(s.raw - s.a).toFixed(2).padStart(8)}    Δ=${step.toFixed(2).padStart(6)} ${note}`)
}

console.log('\n── LONGITUDINAL section (along road, − = behind, + = ahead) ──')
console.log('  s      carvedH    grade(deg over 1m)')
let prev = null
for (let d = -8; d <= 8.0001; d += 1) {
  const x = sx + tx * d, z = sz + tz * d
  const s = sample(x, z)
  let g = ''
  if (prev !== null) g = (Math.atan2(s.a - prev, 1) * 180 / Math.PI).toFixed(1)
  prev = s.a
  console.log(`${d.toFixed(0).padStart(4)}   ${s.a.toFixed(2).padStart(7)}    ${g.padStart(6)}`)
}

// Wheel footprint check: place the truck centered, heading down road, sample 4 wheel XZ.
const halfTrack = (P.trackWidth ?? 1.5) / 2
const wb = (P.wheelbase ?? 3.0)
console.log('\n── 4-wheel footprint (centered on road, facing down-road) ──')
const corners = [['FL',-halfTrack, wb/2],['FR',halfTrack, wb/2],['RL',-halfTrack,-wb/2],['RR',halfTrack,-wb/2]]
for (const [name, lat, lon] of corners) {
  const x = sx + rx*lat + tx*lon, z = sz + rz*lat + tz*lon
  const s = sample(x, z)
  console.log(`  ${name}: carvedH ${s.a.toFixed(3)}  blendW ${s.blendW.toFixed(2)}  (lat ${lat.toFixed(2)}, lon ${lon.toFixed(2)})`)
}
