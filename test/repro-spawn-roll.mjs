// RAINY-DAY (not in run-all): node test/repro-spawn-roll.mjs [seed]
// Repro for "car rubber-bands at spawn / won't roll downhill". Seats the truck exactly like the game
// (resolveSpawn road-probe → computeStaticEquilibrium → heading down the road), then runs the REAL
// fixed-step physics with ZERO input for ~8 s and prints the trajectory + per-wheel slip/Fn so we can
// see whether the car (a) sits still, (b) rolls/slides monotonically, or (c) oscillates ("rubber-band").

import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { stepPhysics } from '../src/physics.js'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { parseWorldSeed, seedFor } from '../src/seed.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const CHUNK_SIZE = 64   // matches main.js CHUNK_SIZE (road tile size)
const seedStr = process.argv[2] ?? 'lone-pine'
const worldSeed = parseWorldSeed(seedStr)

// ── scratch arrays the suspension substep expects on params (main.js:85-94) ──
P._tireFz = [0, 0, 0, 0]
P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]

// ── build the real road + headless terrain ──
const road = new RoadSystem(worldSeed, P)

// resolveSpawn (road-probe path, mirrors src/main.js) ───────────────────────
const spawnSeed = seedFor(worldSeed, 'spawn')
const baseX = ((spawnSeed & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseZ = (((spawnSeed >>> 16) & 0xFFFF) / 0xFFFF - 0.5) * 200
const baseTX = Math.floor(baseX / CHUNK_SIZE)
const baseTZ = Math.floor(baseZ / CHUNK_SIZE)
road.ensureTile(baseTX, baseTZ)
let nearest = road.queryNearest(baseX, baseZ, 200)
const terrain = makeTerrainHeadless(worldSeed, P, road)

let spawnX, spawnZ, heading
if (nearest) {
  // BUG-11 re-stream: re-center on the first nearest point and re-query (verbatim main.js:180-190).
  const spawnTX = Math.floor(nearest.point.x / CHUNK_SIZE)
  const spawnTZ = Math.floor(nearest.point.z / CHUNK_SIZE)
  road.ensureTile(spawnTX, spawnTZ)
  nearest = road.queryNearest(nearest.point.x, nearest.point.z, 100) || nearest
  spawnX = nearest.point.x
  spawnZ = nearest.point.z
  heading = Math.atan2(nearest.tangent.x, nearest.tangent.z)
  console.log(`spawn: ON ROAD at (${spawnX.toFixed(1)}, ${spawnZ.toFixed(1)}) heading ${(heading * 180 / Math.PI).toFixed(1)}°`)
} else {
  spawnX = baseX; spawnZ = baseZ; heading = 0
  console.log(`spawn: terrain-only fallback at (${spawnX.toFixed(1)}, ${spawnZ.toFixed(1)})`)
}
// The game streams around the truck each frame; mirror that so the spawn network == frame-0 network.
road.update(new THREE.Vector3(spawnX, 0, spawnZ))

// ── slope at the spawn point (drives the "should it roll?" expectation) ──
const n0 = terrain.analyticNormal(spawnX, spawnZ)
const slopeDeg = Math.acos(Math.max(-1, Math.min(1, n0.y))) * 180 / Math.PI
const gravAlong = 9.81 * Math.hypot(n0.x, n0.z)   // |g tangential| on this slope
console.log(`surface normal (${n0.x.toFixed(3)}, ${n0.y.toFixed(3)}, ${n0.z.toFixed(3)})  slope ${slopeDeg.toFixed(2)}°  g_tangential ${gravAlong.toFixed(3)} m/s²`)

// ── static equilibrium (verbatim from main.js computeStaticEquilibrium) ──
function computeStaticEquilibrium (p) {
  const g = 9.81
  const strutComp = [0, 0, 0, 0]
  const bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const isFront = i < 2
    const cornerMass = p.mass * (isFront ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const k_T = p.tireStiffness
    const k_S = isFront ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const L_S = isFront ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    const sprung = p.mass * (isFront ? p.weightFront : p.weightRear) / 2
    strutComp[i] = sprung * g / k_S
    const tireComp = cornerMass * g / k_T
    const hubY = p.wheelRadius - tireComp
    const bodyOffset = isFront ? (p.suspensionBodyOffsetFront || 0) : (p.suspensionBodyOffsetRear || 0)
    bodyYCorner[i] = hubY + (L_S - strutComp[i]) + (p.cgHeight - p.wheelRadius) - bodyOffset
  }
  const bodyY = (bodyYCorner[0] + bodyYCorner[1]) / 2
  return { bodyY, strutComp }
}
const eq = computeStaticEquilibrium(P)
const surfaceY = terrain.analyticHeight(spawnX, spawnZ)

// ── contact queries (Sierra-world branch, verbatim shape from physics-replay.mjs) ──
const queryContacts = (cx, cy, cz, r) => {
  const hits = []
  const terrainH = terrain.analyticHeight(cx, cz)
  const gd = terrainH + r - cy
  if (gd > 0) {
    const n = terrain.analyticNormal(cx, cz)
    hits.push({ normal: new THREE.Vector3(n.x, n.y, n.z), depth: gd, contactPoint: new THREE.Vector3(cx, terrainH, cz) })
  }
  return hits
}
const queryVertexContacts = (px, py, pz) => {
  const hits = []
  const terrainH = terrain.analyticHeight(px, pz)
  if (py < terrainH) {
    const n = terrain.analyticNormal(px, pz)
    hits.push({ normal: new THREE.Vector3(n.x, n.y, n.z), depth: terrainH - py })
  }
  return hits
}

// ── seat the vehicle ──
const vs = {
  position: new THREE.Vector3(spawnX, surfaceY + eq.bodyY, spawnZ),
  velocity: new THREE.Vector3(0, 0, 0),
  quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading),
  angularVelocity: new THREE.Vector3(0, 0, 0),
  steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
  wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
  wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
  wheelOmega: [0, 0, 0, 0],
  slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
  strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0],
  handbrake: false,
}

// ── run zero-input physics ──
const DT = 1 / 60
const STEPS = 480   // 8 s
const RESTREAM = process.argv.includes('--restream')   // call road.update() per frame like the game
const p0 = vs.position.clone()
// Probe surface height at the FIXED spawn point every frame — detects the carved surface "popping"
// when per-frame re-streaming re-routes the macro-cell under the (initially stationary) car.
let probeMin = Infinity, probeMax = -Infinity, prevProbe = null, probeJumps = 0
console.log(`\n   t     dispXZ   speed    vx      vz   |  slipLong(FL..RR)            Fn(FL..RR)`)
let maxDisp = 0, prevDisp = 0, reversals = 0, prevSign = 0
for (let s = 1; s <= STEPS; s++) {
  if (RESTREAM) road.update(vs.position)
  const probe = terrain.analyticHeight(spawnX, spawnZ)   // height at the FIXED spawn XZ
  if (prevProbe !== null && Math.abs(probe - prevProbe) > 0.05) probeJumps++
  prevProbe = probe
  probeMin = Math.min(probeMin, probe); probeMax = Math.max(probeMax, probe)
  stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
  const dx = vs.position.x - p0.x, dz = vs.position.z - p0.z
  const disp = Math.hypot(dx, dz)
  const speed = Math.hypot(vs.velocity.x, vs.velocity.z)
  maxDisp = Math.max(maxDisp, disp)
  // count direction reversals of displacement-rate (the "rubber-band" signature)
  const dd = disp - prevDisp
  const sign = Math.sign(dd)
  if (sign !== 0 && prevSign !== 0 && sign !== prevSign) reversals++
  if (sign !== 0) prevSign = sign
  prevDisp = disp
  if (s % 30 === 0) {
    const sl = vs.slipLong.map(v => v.toFixed(3).padStart(7)).join(' ')
    const fn = vs.wheelDebug.map(w => (w.fn || 0).toFixed(0).padStart(6)).join(' ')
    console.log(`${(s * DT).toFixed(2).padStart(5)}  ${disp.toFixed(3).padStart(7)}  ${speed.toFixed(3).padStart(6)}  ${vs.velocity.x.toFixed(2).padStart(6)}  ${vs.velocity.z.toFixed(2).padStart(6)}  | ${sl}   ${fn}`)
  }
}
console.log(`\nSUMMARY: maxDisp ${maxDisp.toFixed(3)} m,  finalDisp ${prevDisp.toFixed(3)} m,  displacement-rate reversals ${reversals}`)
console.log(`PROBE (fixed spawn-XZ surface height): range ${(probeMax - probeMin).toFixed(3)} m over run, ${probeJumps} frame-to-frame jumps >5cm  [restream=${RESTREAM}]`)
console.log(reversals > 6
  ? '  → OSCILLATING (rubber-band): displacement repeatedly reverses direction.'
  : (maxDisp < 0.05 ? '  → STUCK: car barely moved.' : '  → DRIFTS/ROLLS: roughly monotonic motion.'))
