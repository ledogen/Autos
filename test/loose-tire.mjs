// GATE: the stranded motorist's spare tire — ONE loose body in the bed (data/offers.js `loose`).
//
// The tire is the inventory spare's thumbnail model (assets/models/src/items.py export_glb), 2802
// tris of lathed carcass and tread lugs. Hulled whole it is far past Box3D's 255-half-edge limit, so
// debris.js thinHull keeps the 40 most spread-out vertices and hulls those — the path every detailed
// item model will take into the world. Checks:
//   (1) the thinned hull builds, spans the model's own 0.73 × 0.24 m, and lands the spec mass (18 kg, the truck's own wheelMass);
//   (2) dropped where main.js _loadLoose drops it (strapPose + 1 cm), the tire settles flat on the
//       ribs and stays in the bed — 60 mph straight, then a slalom at 60 mph.
//
// Run: node test/loose-tire.mjs

import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DebrisSystem, DEBRIS_TYPES, thinHull, strapPose } from '../src/debris.js'

const DT = 1 / 60
const BED = DEFAULT_VEHICLE_MODEL.bed
const TIRE = DEBRIS_TYPES.spareTire
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

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
const extent = (h) => { const e = [0, 0, 0]; for (let i = 0; i < h.length; i++) e[i % 3] = Math.max(e[i % 3], Math.abs(h[i])); return e }

const PTS = glbPoints('../assets/models/spare-tire.glb')
const HULL = thinHull(PTS)

console.log('collider — the thinned hull:')
{
  const engine = await createPhysicsEngine()
  const b = engine.createBody({ type: 'dynamic', position: { x: 0, y: 0, z: 0 } })
  engine.addHull(b, HULL, { density: 1, group: GROUP_DEBRIS })
  const vol = engine.getMass(b)
  const [ex, ey, ez] = extent(HULL), [mx, my, mz] = extent(PTS)
  ok(HULL.length === 120 && vol > 0, `${PTS.length / 3} vertices → 40, hull builds (${(vol * 1000).toFixed(1)} L)`)
  ok(Math.abs(ex - mx) < 0.03 && Math.abs(ey - my) < 0.03 && Math.abs(ez - mz) < 0.03,
    `spans the model: ${(2 * ex).toFixed(2)} × ${(2 * ey).toFixed(2)} × ${(2 * ez).toFixed(2)} m vs ${(2 * mx).toFixed(2)} × ${(2 * my).toFixed(2)} × ${(2 * mz).toFixed(2)}`)
  engine.dispose()
}

async function drive ({ speed, amp = 0, period = 1.2, seconds = 6 }) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING)
  const eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 1000)
  vs.strutComp = [...eq.strutComp]
  vs.velocity.set(0, 0, -speed)
  vs.wheelOmega = [0, 1, 2, 3].map(() => speed / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const flat = (cx, cy, cz, r) => {
    const d = r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
  }
  const [hx, hy, hz] = extent(HULL)
  const pose = strapPose(BED, { x: hx, y: hy, z: hz })
  const at = new THREE.Vector3(pose.x, pose.y + 0.01, pose.z).add(vs.position)
  const body = engine.createBody({ type: 'dynamic', position: at, linearVelocity: { x: 0, y: 0, z: -speed } })
  engine.addHull(body, HULL, { density: 1, friction: TIRE.friction, restitution: TIRE.restitution, group: GROUP_DEBRIS })
  const vol = engine.getMass(body)
  engine.destroyBody(body)
  const tire = engine.createBody({ type: 'dynamic', position: at, linearVelocity: { x: 0, y: 0, z: -speed } })
  engine.addHull(tire, HULL, { density: TIRE.massKg / vol, friction: TIRE.friction, restitution: TIRE.restitution, group: GROUP_DEBRIS })
  const mass = engine.getMass(tire)
  const ctx = { engine, chassis }
  const debris = { _eng: engine, _live: [{ body: tire, cargo: false, prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion() }] }

  const cp = new THREE.Vector3(), cq = new THREE.Quaternion(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  let escapedAt = null, y1 = 0
  for (let s = 0; s < seconds * 60 && escapedAt === null; s++) {
    const t = s * DT
    const steer = t > 1 ? amp * Math.sin(2 * Math.PI * (t - 1) / period) : 0
    vs.throttle = 0.45
    vs.steerAngle = steer
    if (vs.wheelSteerAngles) vs.wheelSteerAngles[0] = vs.wheelSteerAngles[1] = steer
    DebrisSystem.prototype.beforeStep.call(debris, chassis, BED)
    stepPhysics(vs, P, DT, flat, ctx)
    engine.getTransform(chassis, cp, cq)
    engine.getTransform(tire, p, q)
    p.sub(cp).applyQuaternion(cq.clone().invert())
    if (s === 60) y1 = p.y   // after 1 s, before any steering
    if (p.y < BED.floorY - 0.05 || Math.abs(p.x) > BED.innerHalfW + 0.02 || p.z < BED.frontZ - 0.02 || p.z > BED.tailZ + 0.02) escapedAt = t
  }
  engine.dispose()
  return { escapedAt, mass, settledY: y1 - BED.floorY, half: hy }
}

console.log('in the bed:')
{
  const r = await drive({ speed: 26.8 })
  ok(Math.abs(r.mass - TIRE.massKg) < 0.01, `mass ${r.mass.toFixed(2)} kg (spec ${TIRE.massKg})`)
  ok(Math.abs(r.settledY - r.half) < 0.03, `settles flat on the ribs: centre ${r.settledY.toFixed(3)} m over the floor, half-height ${r.half.toFixed(3)}`)
  ok(r.escapedAt === null, `60 mph straight for 6 s: ${r.escapedAt === null ? 'held' : 'ESCAPED at ' + r.escapedAt.toFixed(2) + ' s'}`)
}
{
  const r = await drive({ speed: 26.8, amp: 0.06, period: 1.2 })
  ok(r.escapedAt === null, `60 mph slalom ±0.06 rad: ${r.escapedAt === null ? 'held' : 'ESCAPED at ' + r.escapedAt.toFixed(2) + ' s'}`)
}

console.log(fail ? 'LOOSE-TIRE: FAIL' : 'LOOSE-TIRE: PASS')
process.exit(fail)
