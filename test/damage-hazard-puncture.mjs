// test/damage-hazard-puncture.mjs — FEAT-93 gate: a hard rock hit pops a tire at ANY condition.
//
// Below 50% a tire pops on a bump-stop force (damage-filter-puncture.mjs); above it nothing on the
// road can pop it. This is the second, condition-independent path: the wheel's rigid core (QUAL-25,
// the rim) struck by HAZARD debris — a rock — hard enough. Same signal damage-rim-strike.mjs prices
// for rims, filtered by the engine to hazard bodies only (DEBRIS_TYPES `hazard`), so cargo, barrels,
// road and potholes can never reach it. A threshold on a force, not a roll (SM-INV-12).
//
// §1 is the damage model alone; §2 drives the real truck (engine, chassis, struts) into a resting
// rock and prints the measured core force the threshold was set against.
//
// Run: node test/damage-hazard-puncture.mjs

import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis, readRimStrikes } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DEBRIS_TYPES } from '../src/debris.js'
import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 1 / 60
const POP_N = D.hazardPunctureMult * DamageModel.staticWheelLoad(RANGER_PARAMS)

console.log(`§1 the threshold (${(POP_N / 1000).toFixed(1)} kN of hazard core force), on fresh rubber`)
{
  const hitWith = (field, n) => {
    const d = new DamageModel({ params: RANGER_PARAMS })
    const vs = { rimForce: [0, 0, 0, 0], rimHazard: [0, 0, 0, 0] }
    vs[field][1] = n
    d.step(vs, RANGER_PARAMS, DT)
    return d
  }
  const pop = hitWith('rimHazard', POP_N * 1.01)
  ok(pop.flat[1] && pop.get('tireFR') === 1, 'just over it pops a 100% tire — condition does not protect it')
  ok(!pop.flat[0] && !pop.flat[2] && !pop.flat[3], '...and only the corner that struck')
  ok(!hitWith('rimHazard', POP_N * 0.99).flat[1], 'just under it does nothing')
  ok(!hitWith('rimForce', POP_N * 3).flat[1], 'three times it from NON-hazard debris (cargo, barrels) does nothing')
}

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
let halfY = 0; for (let i = 1; i < HULL.length; i += 3) halfY = Math.max(halfY, Math.abs(HULL[i]))

/**
 * Drive the truck at `mph` into a rock resting 12 m ahead of the front-left wheel, offset `lat` m
 * sideways. Returns the peak hazard core force (any corner) and which tires the damage model popped.
 */
async function drive (mph, lat, hazard = true) {
  const speed = mph * 0.44704
  // A DEEP copy: a DamageModel publishes its _tireMuScale/_tireRateScale/_wheelRunout arrays onto the
  // params it was handed and mutates them in place, so a shallow copy carries one scenario's flat
  // tire into the next.
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
  const chassis = createVehicleChassis(engine, vs, P)
  const fl = getWheelPosition(0, vs, P)
  // The flag rides userData exactly as DebrisSystem.spawn puts it there.
  const rock = engine.createBody({ type: 'dynamic', position: { x: fl.x + lat, y: halfY + 0.005, z: -12 },
    userData: { kind: 'debris', debrisType: 'rock', hazard } })
  engine.addHull(rock, HULL, { density: ROCK.density, friction: ROCK.friction, restitution: ROCK.restitution, group: GROUP_DEBRIS })
  const flat = (cx, cy, cz, r) => { const d = r - cy; return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : [] }
  const ctx = { engine, chassis }
  const dmg = new DamageModel({ params: P })
  let peak = 0
  for (let s = 0; s < 4 * 60; s++) {
    vs.throttle = 0.3
    stepPhysics(vs, P, DT, flat, ctx)
    readRimStrikes(engine, chassis, vs.rimForce, DT, vs.rimHazard)
    for (let i = 0; i < 4; i++) peak = Math.max(peak, vs.rimHazard[i])
    dmg.step(vs, P, DT)
  }
  engine.dispose()
  return { peak, popped: dmg.flat.some(Boolean) }
}

console.log('\n§2 the real truck into a resting rock — peak hazard core force [kN] by lateral offset [m]')
{
  const lats = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]
  console.log('    mph' + lats.map(l => String(l).padStart(7)).join('') + '   popped')
  const rows = {}
  for (const mph of [5, 10, 15, 20, 25, 30, 40]) {
    const r = []
    for (const lat of lats) r.push(await drive(mph, lat))
    rows[mph] = r
    console.log(String(mph).padStart(7) + r.map(x => (x.peak / 1000).toFixed(0).padStart(7)).join('') +
      `   ${r.filter(x => x.popped).length}/${lats.length}`)
  }
  ok([5, 10, 15].every(m => rows[m].every(x => !x.popped)), 'up to 15 mph no line onto the rock pops a tire — clipping it is not an incident')
  ok(rows[25].filter(x => x.popped).length >= 3 && rows[30].filter(x => x.popped).length >= 3,
    'at 25-30 mph several lines onto it do — nailing a rock splits a fresh tire')
  const centre = rows[30][3]
  const again = await drive(30, 0)
  ok(centre.popped && again.peak === centre.peak && again.popped,
    `the same hit replays to the same force (${(centre.peak / 1000).toFixed(3)} kN) and the same puncture`)
  const plain = await drive(30, 0, false)
  ok(!plain.popped && plain.peak === 0, 'the same hit on the same rock WITHOUT the hazard flag pops nothing — the flag gates the path')
}

console.log(fail ? '\nFAIL — hazard punctures have drifted' : '\nPASS — a hard rock hit pops any tire; a crawl, or anything but a hazard, does not')
process.exit(fail)
