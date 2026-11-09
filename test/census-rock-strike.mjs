// test/census-rock-strike.mjs — BUG-99 rock-strike census (rainy-day script, not a gate).
//
// Drives the real truck (engine, chassis, struts, damage model) on flat ground, at a HELD speed, into
// one resting hazard rock and reports, per run: did a tire pop, how much wheel (rim) damage, peak
// roll/pitch, whether the truck ended on its roof or side, the rock's peak speed and its exit speed
// (horizontal, 0.5 s after touch, ÷ truck speed), the rim measurements (core force, pinch), and the
// worst ONE-STEP drop in chassis forward speed (the "stutter"). Sweeps rock scale × lateral offset ×
// rock yaw × speed.
//
// `--nopop` runs the same hits with punctures disabled (rim peaks still recorded, for offline
//   thresholding), to tell an IMPACT flip from a FLAT-TIRE flip.
// `--big` the dense grid (≈3000 hits, ~45 s). `--damp=<N·s/m>` overrides params.tireDampingDebris,
//   `--stopzeta=<ζ>` params.tireStopDampingRatio (BUG-140's on-stop tire damping; 0 = off).
// `--rear` puts the rock just ahead of the rear-left tire — a DRIVEN wheel (the Ranger is RWD), so
//   climbing is tested where there is torque to climb with (FEAT-158).
// `on stop` counts the hits that ran a strut onto its bump stop (BUG-140). `--json=<path>` dumps every run. `--rows` prints them. `--trace=<mph>,<lat>,<scale>,<yaw>` prints
//   the per-step log of one run around the strike (TFROM=<step> to start elsewhere).
//
// Run: node test/census-rock-strike.mjs [--nopop] [--big] [--trace=40,0,1,0]

import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis, readRimStrikes } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DEBRIS_TYPES } from '../src/debris.js'
import { DamageModel, DAMAGE_PARAMS as D, WHEEL_IDS } from '../src/damage.js'

const DT = 1 / 60
const args = process.argv.slice(2)
const NOPOP = args.includes('--nopop')
const TRACE = args.find(a => a.startsWith('--trace='))?.slice(8).split(',').map(Number)
const DAMP = +(args.find(a => a.startsWith('--damp='))?.slice(7) ?? 0)   // N·s/m — params.tireDampingDebris override
const STOPZ = args.find(a => a.startsWith('--stopzeta='))?.slice(11)      // BUG-140: params.tireStopDampingRatio override (0 = off)
const JSON_OUT = args.find(a => a.startsWith('--json='))?.slice(7)        // dump every run's row
const BIG = args.includes('--big')                                         // the dense grid (≈3000 hits)
const SPEEDS_ARG = args.find(a => a.startsWith('--speeds='))?.slice(9).split(',').map(Number)   // override the speed list
const REAR = args.includes('--rear')   // FEAT-158: the rock lies 0.6 m ahead of the rear-left (DRIVEN) tire instead of 12 m ahead of the front-left
const W = REAR ? 2 : 0                  // the struck wheel
const SCALES_ARG = args.find(a => a.startsWith('--scales='))?.slice(9).split(',').map(Number)   // override the rock scales

function glbPoints (rel) {
  const buf = fs.readFileSync(new URL(rel, import.meta.url))
  const jl = buf.readUInt32LE(12)
  const js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  const binOff = 20 + jl + 8
  const pts = []
  for (const n of js.nodes) {
    if (n.mesh == null) continue
    for (const pr of js.meshes[n.mesh].primitives) {
      const a = js.accessors[pr.attributes.POSITION], bv = js.bufferViews[a.bufferView]
      const off = buf.byteOffset + binOff + (bv.byteOffset || 0) + (a.byteOffset || 0)
      const f = new Float32Array(buf.buffer.slice(off, off + a.count * 12))
      for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3(f[3 * i], f[3 * i + 1], f[3 * i + 2]))
    }
  }
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3())
  return pts.map(v => v.sub(c))
}
const ROCK = DEBRIS_TYPES.rock
const BASE = glbPoints('../assets/models/test-rock.glb')

function rockHull (scale, yawDeg) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeg * Math.PI / 180)
  const pts = BASE.map(v => v.clone().multiplyScalar(scale).applyQuaternion(q))
  let halfY = 0
  for (const v of pts) halfY = Math.max(halfY, Math.abs(v.y))
  return { flat: Float32Array.from(pts.flatMap(v => [v.x, v.y, v.z])), halfY }
}

async function drive (mph, lat, scale, yaw, trace = false) {
  const speed = mph * 0.44704
  const P = structuredClone(RANGER_PARAMS)
  if (DAMP) P.tireDampingDebris = DAMP
  if (STOPZ !== undefined) P.tireStopDampingRatio = +STOPZ
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING)
  const eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 0)
  vs.strutComp = [...eq.strutComp]
  vs.velocity.set(0, 0, -speed)
  vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P)
  if (trace) {
    const ai = engine.applyImpulse.bind(engine)
    engine.applyImpulse = (b, j, pt) => { console.log(`    impulse→${b === chassis ? 'chassis' : 'rock'} [${j.x.toFixed(0)},${j.y.toFixed(0)},${j.z.toFixed(0)}] N·s`); return ai(b, j, pt) }
    const af = engine.applyForce.bind(engine)
    engine.applyForce = (b, f, pt) => { if (b !== chassis) console.log(`    friction→rock [${(f.x * DT).toFixed(0)},${(f.y * DT).toFixed(0)},${(f.z * DT).toFixed(0)}] N·s`); return af(b, f, pt) }
  }
  const fl = getWheelPosition(W, vs, P)
  const { flat: hull, halfY } = rockHull(scale, yaw)
  const rock = engine.createBody({ type: 'dynamic', position: { x: fl.x + lat, y: halfY + 0.005, z: REAR ? fl.z - 0.6 : -12 },
    userData: { kind: 'debris', debrisType: 'rock', hazard: true } })
  engine.addHull(rock, hull, { density: ROCK.density, friction: ROCK.friction, restitution: ROCK.restitution, group: GROUP_DEBRIS })
  const rockKg = engine.getMass(rock)
  const flatQ = (cx, cy, cz, r) => { const d = r - cy; return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : [] }
  const ctx = { engine, chassis }
  const dmg = new DamageModel({ params: P })
  const fwd = new THREE.Vector3(), up = new THREE.Vector3()
  const rp = new THREE.Vector3(), rv = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion()
  const r = { peakRimRoad: 0, exitRatio: 0, popStep: -1, peakHz: 0, maxRoll: 0, maxPitch: 0, upMin: 1, rockV: 0, dvStep: 0, wheelDmg: 0, rockKg, peakE: 0, peakEevent: 0, peakBump: 0 }
  const evE = [0, 0, 0, 0]   // J — pinch work over the current squash event (consecutive steps with a pinch), per wheel
  const evN = [0, 0, 0, 0]   // steps the current squash event has run
  const rock0 = new THREE.Vector3(); engine.getTransform(rock, rock0, _q)
  const hub0Y = getWheelPosition(W, vs, P).y; r.hubRise = 0   // m — the struck hub's lift: did it climb?
  const leak = [0, 0, 0, 0]; r.peakLeak = 0; r.evSteps = 0   // J — damage.js's leaky pinch work, and the longest-energy event's length
  let vPrev = speed, firstTouch = -1
  const N = Math.round(60 * Math.max(6, 20 / speed))   // past the rock at any speed (it lies 12 m ahead)
  for (let s = 0; s < N; s++) {
    // Hold the labelled speed (a plain proportional throttle/brake), so the label IS the contact speed.
    const vNow = -vs.velocity.dot(fwd.set(0, 0, 1).applyQuaternion(vs.quaternion))
    vs.throttle = Math.max(0, Math.min(1, (speed - vNow) * 0.5)); vs.brake = Math.max(0, Math.min(1, (vNow - speed) * 0.5))
    stepPhysics(vs, P, DT, flatQ, ctx)
    readRimStrikes(engine, chassis, vs.rimForce, DT, vs.rimHazard)
    const hz = Math.max(...vs.rimHazard)   // read BEFORE --nopop clears it, so a sweep can threshold offline
    r.peakHz = Math.max(r.peakHz, hz)
    r.peakBump = Math.max(r.peakBump, ...vs.bumpForce)   // BUG-140: did the struck corner reach its bump stop
    r.peakRimRoad = Math.max(r.peakRimRoad, ...vs.rimHazardSoft)
    for (let i = 0; i < 4; i++) {
      evE[i] = vs.rimHazardSoft[i] > 0 ? evE[i] + vs.rimHazardWork[i] : 0
      evN[i] = vs.rimHazardSoft[i] > 0 ? evN[i] + 1 : 0
      if (evE[i] >= r.peakEevent) r.evSteps = evN[i]
      leak[i] = leak[i] * Math.exp(-DT / D.hazardPinchTauS) + vs.rimHazardWork[i]; r.peakLeak = Math.max(r.peakLeak, leak[i])
      r.peakEevent = Math.max(r.peakEevent, evE[i]); r.peakE = Math.max(r.peakE, vs.rimHazardWork[i])
    }
    if (NOPOP) { vs.rimHazard.fill(0); vs.rimHazardSoft.fill(0); vs.rimHazardWork.fill(0) }
    const wasFlat = dmg.flat.some(Boolean)
    dmg.step(vs, P, DT)
    if (!wasFlat && dmg.flat.some(Boolean)) r.popStep = s
    fwd.set(0, 0, -1).applyQuaternion(vs.quaternion)
    up.set(0, 1, 0).applyQuaternion(vs.quaternion)
    const v = vs.velocity.dot(fwd)
    engine.getTransform(rock, rp, _q)
    engine.getVelocity(rock, rv, _w)
    const rvMag = Math.hypot(rv.x, rv.y, rv.z)
    if (firstTouch < 0 && rvMag > 0.5) firstTouch = Math.max(0, s - 3)
    if (firstTouch >= 0 && s < firstTouch + 60) r.dvStep = Math.max(r.dvStep, vPrev - v)
    r.rockV = Math.max(r.rockV, rvMag)
    r.hubRise = Math.max(r.hubRise, getWheelPosition(W, vs, P).y - hub0Y)
    if (firstTouch >= 0 && s === firstTouch + 30) r.exitRatio = Math.hypot(rv.x, rv.z) / speed
    const roll = Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(1, 0, 0).applyQuaternion(vs.quaternion).y)))
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)))
    r.maxRoll = Math.max(r.maxRoll, Math.abs(roll) * 180 / Math.PI)
    r.maxPitch = Math.max(r.maxPitch, Math.abs(pitch) * 180 / Math.PI)
    r.upMin = Math.min(r.upMin, up.y)
    if (trace && (process.env.TFROM ? s >= +process.env.TFROM && s < +process.env.TFROM + 40 : firstTouch >= 0 && s < firstTouch + 40)) {
      console.log(`  s${String(s).padStart(4)} v=${v.toFixed(2)} vy=${vs.velocity.y.toFixed(2)} ` +
        `w=[${vs.angularVelocity.x.toFixed(2)},${vs.angularVelocity.y.toFixed(2)},${vs.angularVelocity.z.toFixed(2)}] ` +
        `hz=${(hz / 1000).toFixed(0)}k rim=${(Math.max(...vs.rimForce) / 1000).toFixed(0)}k ` +
        `fz=[${P._tireFz.map(f => (f / 1000).toFixed(1)).join(',')}] comp=[${vs.strutComp.map(c => c.toFixed(3)).join(',')}] ` +
        `xz=[${P._hubNormalXZ.map(o => (Math.hypot(o.x, o.z) / 1000).toFixed(1)).join(',')}] ` +
        `rock=${rvMag.toFixed(2)}[${rv.x.toFixed(1)},${rv.y.toFixed(1)},${rv.z.toFixed(1)}]${rp ? `@(${rp.x.toFixed(2)},${rp.y.toFixed(2)},${rp.z.toFixed(2)})` : ''} pinch=${(Math.max(...vs.rimHazardSoft) / 1000).toFixed(0)}k flat=${dmg.flat.map(Number).join('')}`)
    }
    vPrev = v
    vs.rimForce.fill(0)
  }
  for (const id of WHEEL_IDS) r.wheelDmg = Math.max(r.wheelDmg, 1 - dmg.get(id))
  r.endUp = up.y
  r.rockMove = Math.hypot(rp.x - rock0.x, rp.z - rock0.z)   // m — how far the rock ended from where it lay
  engine.dispose()
  return r
}

if (TRACE) {
  const [mph, lat, scale, yaw] = TRACE
  const r = await drive(mph, lat, scale ?? 1, yaw ?? 0, true)
  console.log(r)
  process.exit(0)
}

const SPEEDS = SPEEDS_ARG ?? (BIG ? [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] : [10, 20, 30, 40, 50])
const LATS = BIG ? [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2] : [-0.1, 0, 0.1]
const SCALES = SCALES_ARG ?? (BIG ? [0.6, 0.7, 0.8, 0.9, 1] : [0.7, 1, 1.3])
const YAWS = BIG ? [0, 30, 60, 90, 120, 150] : [0, 60]
const ALL = []
console.log(`BUG-99 census${NOPOP ? ' (punctures DISABLED)' : ''} — pop at ${(D.hazardPunctureMult * DamageModel.staticWheelLoad(RANGER_PARAMS) / 1000).toFixed(0)} kN`)
console.log('per speed over ' + LATS.length * SCALES.length * YAWS.length + ' hits: pops · wheel-dmg>0 · flips(up<0) · roll>30° · max roll° · max peak-hz kN · max rock m/s · max rock exit speed ÷ truck speed (0.5 s after touch) · max 1-step dv m/s')
for (const mph of SPEEDS) {
  const rs = []
  for (const sc of SCALES) for (const lat of LATS) for (const yaw of YAWS) rs.push({ mph, sc, lat, yaw, ...(await drive(mph, lat, sc, yaw)) })
  ALL.push(...rs)
  const n = (f) => rs.filter(f).length
  const mx = (k) => Math.max(...rs.map(x => x[k]))
  console.log(`${String(mph).padStart(3)} mph  pop ${n(x => x.popStep >= 0)}  wdmg ${n(x => x.wheelDmg > 0)}  flip ${n(x => x.upMin < 0)}  roll>30 ${n(x => x.maxRoll > 30)}  ` +
    `roll ${mx('maxRoll').toFixed(0)}°  hz ${(mx('peakHz') / 1000).toFixed(0)}k  softHz ${(mx('peakRimRoad') / 1000).toFixed(0)}k  E ${mx('peakEevent').toFixed(0)}J  rock ${mx('rockV').toFixed(1)}  exit× ${mx('exitRatio').toFixed(2)}  dv ${mx('dvStep').toFixed(2)}  ` +
    `climb>5cm ${n(x => x.hubRise > 0.05)}  rock moved>1m ${n(x => x.rockMove > 1)}  on stop ${n(x => x.peakBump > 0)} (max ${(mx('peakBump') / 1000).toFixed(0)}k)  pitch ${mx('maxPitch').toFixed(0)}°`)
  if (args.includes('--rows')) for (const x of rs) console.log(`      sc${x.sc} lat${x.lat} yaw${x.yaw}: pop${x.popStep} hz${(x.peakHz / 1000).toFixed(0)}k soft${(x.peakRimRoad / 1000).toFixed(0)}k wd${x.wheelDmg.toFixed(2)} roll${x.maxRoll.toFixed(0)} pitch${x.maxPitch.toFixed(0)} up${x.upMin.toFixed(2)} rock${x.rockV.toFixed(1)} exit${x.exitRatio.toFixed(2)} dv${x.dvStep.toFixed(2)} kg${x.rockKg?.toFixed?.(0)} climb${(x.hubRise * 100).toFixed(0)}cm moved${x.rockMove.toFixed(2)}m stop${(x.peakBump / 1000).toFixed(0)}k`)
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(ALL))
