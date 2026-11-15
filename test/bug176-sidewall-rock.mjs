// test/bug176-sidewall-rock.mjs — BUG-176 repro: a tire SIDEWALL rubbing the debug rock.
//
// The owner: below 5 mph, rubbing the truck's tire sidewall against the small debug rock launches
// the rock "at pretty high speed" and can pop the tire. A sane result is a rock pushed aside at
// about the truck's speed. Rainy-day script (not a gate): the debug rock (test-rock.glb hull,
// ~50 kg, DEBRIS_TYPES.rock) rests on flat ground beside the front-left tire, its inboard face
// `δ` past the OUTBOARD sidewall plane, and the truck drives straight past at a held speed. Logs
// the soft-path contact the wheel query reports (normal, raw depth), the rock's peak and exit
// speed, and whether the damage model popped the tire.
//
// Fails on the pre-fix contact (the sphere's depth beside the tire): §1 4 mph read 17 cm and fired the
// 50 kg rock at 7.5 m/s; §2 read 11-16 cm for a 1-6 cm overlap.
//
// Run: node test/bug176-sidewall-rock.mjs [--log]   (--log prints every contact step of each run)

import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis, readRimStrikes } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DEBRIS_TYPES } from '../src/debris.js'
import { DamageModel } from '../src/damage.js'

const DT = 1 / 60
const LOG = process.argv.includes('--log')
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

/** The GLB's vertices, centred on their bbox — what debris.js _extractHull hands the engine. */
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
  return Float32Array.from(pts.flatMap(v => [v.x - c.x, v.y - c.y, v.z - c.z]))
}
const ROCK = DEBRIS_TYPES.rock
const HULL = glbPoints('../assets/models/test-rock.glb')
let halfY = 0, maxX = -Infinity
for (let i = 0; i < HULL.length; i += 3) { halfY = Math.max(halfY, Math.abs(HULL[i + 1])); maxX = Math.max(maxX, HULL[i]) }

/**
 * One run. The rock (hull scaled by `scale`) stands with its inboard face `delta` m past the FL
 * tire's outboard sidewall plane (negative = a gap), `z` m ahead of the hub (0 = beside it). The
 * truck holds `mph`, front wheels steered `steer` rad (positive turns the tire's nose outboard,
 * into the rock).
 */
async function run ({ mph, delta, z = -3, scale = 1, steer = 0, secs, slide = true }) {
  const speed = mph * 0.44704
  const P = structuredClone(RANGER_PARAMS)
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
  const fl = getWheelPosition(0, vs, P)
  const outboard = fl.x - P.wheelWidth / 2          // left wheels sit at −x; outboard is further −x
  const hull = HULL.map(c => c * scale)
  const rock = engine.createBody({ type: 'dynamic', position: { x: outboard + delta - maxX * scale, y: halfY * scale + 0.005, z: fl.z + z },
    userData: { kind: 'debris', debrisType: 'rock', hazard: true } })
  engine.addHull(rock, hull, { density: ROCK.density, friction: ROCK.friction, restitution: ROCK.restitution, group: GROUP_DEBRIS })
  // Let it settle on the ground alone (its hull is not flat-bottomed), at rest, before the truck exists.
  for (let k = 0; k < 120; k++) engine.step(DT)
  engine.setVelocity(rock, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
  // ...then slide it sideways (pose kept) so it reaches exactly δ past the sidewall plane — unless
  // `slide` is false: then it lies where it rolled to, as a thrown rock does.
  if (slide) {
    const q = new THREE.Quaternion(), pp = new THREE.Vector3(), t = new THREE.Vector3()
    engine.getTransform(rock, pp, q)
    let mx = -Infinity
    for (let i = 0; i < hull.length; i += 3) mx = Math.max(mx, t.set(hull[i], hull[i + 1], hull[i + 2]).applyQuaternion(q).x + pp.x)
    pp.x += outboard + delta - mx
    engine.setTransform(rock, pp, q)
  }
  const chassis = createVehicleChassis(engine, vs, P)

  // Record what the wheel query hands the tire model for this rock: the manifold depth less the
  // query's look-ahead growth (what physics.js measures the gap from).
  const hits = []
  const raw = engine.contactSphere.bind(engine)
  engine.contactSphere = (c, r, o) => {
    const out = raw(c, r, o)
    for (const h of out) if (h.body === rock) hits.push({ n: { ...h.normal }, d: h.depth - (r - P.wheelRadius) })
    return out
  }
  const flat = (cx, cy, cz, r) => { const d = r - cy; return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : [] }
  const ctx = { engine, chassis }
  const dmg = new DamageModel({ params: P })
  const v = { x: 0, y: 0, z: 0 }, w = { x: 0, y: 0, z: 0 }, fwd = new THREE.Vector3()
  let peak = 0, peakDepth = 0, lastContact = -1, exit = 0, steps = 0, pinch = 0
  const T = (secs ?? Math.max(3, 8 / speed)) * 60
  for (let s = 0; s < T; s++) {
    const vf = vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion))
    vs.throttle = Math.max(0, Math.min(1, (speed - vf) * 0.5)); vs.brake = Math.max(0, Math.min(1, (vf - speed) * 0.5))
    // Steer in at a hand's pace (0.3 rad/s), never a step change: the tire's nose swings outboard into the rock.
    const a = Math.min(steer, 0.3 * s * DT)
    vs.wheelSteerAngles = [a, a, 0, 0]
    hits.length = 0
    stepPhysics(vs, P, DT, flat, ctx)
    readRimStrikes(engine, chassis, vs.rimForce, DT, vs.rimHazard)
    pinch = Math.max(pinch, vs.rimHazardWork[0])
    dmg.step(vs, P, DT)
    engine.getVelocity(rock, v, w)
    const sp = Math.hypot(v.x, v.y, v.z)
    if (hits.length) {
      lastContact = s; steps++
      let deep = hits[0]; for (const h of hits) if (h.d > deep.d) deep = h
      peakDepth = Math.max(peakDepth, deep.d)
      if (LOG) console.log(`    s${s} n=(${deep.n.x.toFixed(2)},${deep.n.y.toFixed(2)},${deep.n.z.toFixed(2)}) depth=${(deep.d * 100).toFixed(1)}cm rock v=${sp.toFixed(2)} m/s (${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) pinch=${vs.rimHazardWork[0].toFixed(0)}J core=${(vs.rimHazard[0] / 1000).toFixed(1)}kN`)
    }
    if (sp > peak) peak = sp
    if (lastContact >= 0 && s === lastContact + 15) exit = sp   // a quarter second after the last touch
  }
  engine.dispose()
  return { peak, exit, peakDepth, steps, pinch, popped: dmg.flat[0], speed }
}

const rows = []
const show = (label, o) => run(o).then(r => {
  rows.push({ ...o, ...r })
  console.log(`  ${label.padEnd(34)} ${String(r.steps).padStart(6)} ${(r.peakDepth * 100).toFixed(1).padStart(10)} ${(r.peak.toFixed(2) + ' / ' + r.exit.toFixed(2)).padStart(16)} ${r.speed.toFixed(2).padStart(8)} ${r.pinch.toFixed(0).padStart(8)} ${String(r.popped).padStart(7)}`)
})
const head = () => console.log(`  ${'case'.padEnd(34)} ${'steps'.padStart(6)} ${'depth cm'.padStart(10)} ${'rock pk/exit m/s'.padStart(16)} ${'truck'.padStart(8)} ${'pinch J'.padStart(8)} ${'popped'.padStart(7)}`)

console.log('§0 the wheel query alone — the rock at rest, the tire (hub 0.33 m up) stepped sideways across it in 5 mm steps')
{
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 50, y: 5, z: 50 }, { friction: 0.9, group: GROUP_TERRAIN })
  const rock = engine.createBody({ type: 'dynamic', position: { x: 0, y: halfY + 0.005, z: 0 } })
  engine.addHull(rock, HULL, { density: ROCK.density, friction: ROCK.friction, restitution: ROCK.restitution, group: GROUP_DEBRIS })
  for (let k = 0; k < 120; k++) engine.step(DT)
  const q = new THREE.Quaternion(), pp = new THREE.Vector3(), t = new THREE.Vector3()
  engine.getTransform(rock, pp, q)
  let mn = Infinity
  for (let i = 0; i < HULL.length; i += 3) mn = Math.min(mn, t.set(HULL[i], HULL[i + 1], HULL[i + 2]).applyQuaternion(q).x + pp.x)
  const hw = RANGER_PARAMS.wheelWidth / 2
  const slab = { axis: { x: 1, y: 0, z: 0 }, halfWidth: hw }
  let worst = 0, jump = 0, prev = 0
  const line = []
  for (let k = -4; k <= 12; k++) {
    const into = k * 0.005                          // how far the rock reaches past the tire's +x sidewall
    const c = { x: mn + into - hw, y: 0.33, z: pp.z }
    const h = engine.contactSphere(c, RANGER_PARAMS.wheelRadius, { collidesWith: GROUP_DEBRIS, dynamicOnly: true, slab })
    const d = h.length ? h[0].depth : 0
    worst = Math.max(worst, d - Math.max(0, into)); jump = Math.max(jump, Math.abs(d - prev)); prev = d
    line.push(`${(into * 100).toFixed(1)}→${(d * 100).toFixed(1)}`)
  }
  engine.dispose()
  console.log('    reach past sidewall → depth [cm]: ' + line.join('  '))
  ok(worst <= 0.002, `§0 the depth never exceeds the reach past the sidewall (worst excess ${(worst * 100).toFixed(1)} cm)`)
  ok(jump <= 0.01, `§0 no 5 mm step changes the depth by more than 1 cm (worst ${(jump * 100).toFixed(1)} cm)`)
}

console.log('§1 the owner\'s case — the debug rock beside the FL hub, a gap off the sidewall; crawl, steering the nose into it')
head()
for (const mph of [2, 4]) for (const gap of [0.02, 0.06, 0.1]) for (const steer of [0.1, 0.25]) {
  await show(`${mph} mph, gap ${gap * 100} cm, steer ${steer} rad`, { mph, delta: -gap, z: 0, steer, secs: 3 })
}
// Spawned 2 cm off and left where it rolled (~10 cm off, turned): the pre-fix run that fired it at 7.5 m/s.
await show('4 mph, as it settled, steer 0.1 rad', { mph: 4, delta: -0.02, z: 0, steer: 0.1, secs: 3, slide: false })

console.log('\n§2 a half-size rock (fits under the body) δ past the outboard sidewall; straight past')
head()
for (const mph of [4, 30, 60]) for (const delta of [0.01, 0.03, 0.06]) await show(`${mph} mph, δ ${delta * 100} cm`, { mph, delta, scale: 0.5 })

// A sidewall rub can only press in as deep as the rock reaches past the sidewall, along the axle.
const s2 = rows.filter(r => r.scale === 0.5)
ok(s2.every(r => r.peakDepth <= r.delta + 0.01), '§2: the tire sees the rock no deeper than it reaches past the sidewall (+1 cm)')
const own = rows.filter(r => r.scale !== 0.5)
ok(own.every(r => r.peak <= 2 * r.speed + 0.3), '§1: the owner\'s crawl rub never moves the rock faster than twice the truck (+0.3 m/s)')
ok(rows.filter(r => r.mph <= 4).every(r => r.exit <= 2 * r.speed + 0.3), 'at a crawl no rock LEAVES faster than twice the truck (+0.3 m/s)')
ok(rows.every(r => !r.popped), 'a sidewall rub pops no tire')
console.log(fail ? '\nFAIL — the sidewall still fires the rock' : '\nPASS — a sidewall rub pushes the rock aside')
process.exit(fail)
