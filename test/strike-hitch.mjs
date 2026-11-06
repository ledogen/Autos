// GATE (BUG-108, owner 2026-11-03: "There was a brief lag upon hitting them … a momentary freeze or reduction in
// velocity upon contact"): a sleeping demolition target struck at 40 mph takes no more speed off the truck in ONE
// step than the momentum bound allows.
//
// The bound: an 1800 kg truck putting a target of mass m to about twice its own speed v loses 2·m·v / M over the
// strike. Delivered in one 16 ms step that is honest (a real strike lasts 10–20 ms); much more is the truck
// wedging on the target. The small crate (18 kg, 0.45 m) used to: the collider's nose was one 48° ramp from the
// bumper top to the undercarriage, the crate met it near its foot and was pressed into the road, and the truck
// lost 0.98 m/s in one step (2.1× the bound) and climbed it. physics.js now gives the nose the drawn bumper's
// vertical blade (CHASSIS_PROFILE.bumperLowY), and it is pushed: 0.42–0.46 m/s.
//
// The probe behind it (all five targets, 10–40 mph, census + trace) is wip/bug-108/census.mjs.
//
// Run: node test/strike-hitch.mjs
import fs from 'node:fs'
import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { computeStaticEquilibrium, getWheelPosition } from '../src/suspension.js'
import { RUNNING } from '../src/ignition.js'
import { DEBRIS_TYPES } from '../src/debris.js'
import { TARGET_TYPES } from '../src/demolition.js'

const DT = 1 / 60, MPH = 40, SPEED = MPH * 0.44704
const MARGIN = 1.25   // the old nose's crate wedge was 2.1× the bound; the honest strikes sit at 0.5–0.97×
let fails = 0
const check = (label, ok) => { console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}`); if (!ok) fails++ }

// The model's vertices, centred on its bounding box, thinned to 40 farthest-spread points (Box3D caps a hull
// at 255 half-edges) — the target's convex hull as the census stands it.
function hullOf (url) {
  const buf = fs.readFileSync(new URL('../' + url, import.meta.url))
  const jl = buf.readUInt32LE(12), js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8')), bin = 20 + jl + 8
  const pts = []
  const walk = (ni, M) => {
    const n = js.nodes[ni], L = new THREE.Matrix4()
    if (n.matrix) L.fromArray(n.matrix)
    else L.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])))
    const W = M.clone().multiply(L)
    if (n.mesh != null) for (const pr of js.meshes[n.mesh].primitives) {
      const a = js.accessors[pr.attributes.POSITION], bv = js.bufferViews[a.bufferView]
      const off = buf.byteOffset + bin + (bv.byteOffset || 0) + (a.byteOffset || 0)
      const f = new Float32Array(buf.buffer.slice(off, off + a.count * 12))
      for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3(f[3 * i], f[3 * i + 1], f[3 * i + 2]).applyMatrix4(W))
    }
    for (const c of n.children ?? []) walk(c, W)
  }
  for (const r of js.scenes[js.scene ?? 0].nodes) walk(r, new THREE.Matrix4())
  const box = new THREE.Box3().setFromPoints(pts), c = box.getCenter(new THREE.Vector3())
  const all = pts.map(v => v.sub(c)), out = [all[0]], d = all.map(p => p.distanceToSquared(all[0]))
  while (out.length < Math.min(40, all.length)) {
    let j = 0; for (let i = 1; i < all.length; i++) if (d[i] > d[j]) j = i
    out.push(all[j]); for (let i = 0; i < all.length; i++) d[i] = Math.min(d[i], all[i].distanceToSquared(all[j]))
  }
  return { hull: Float32Array.from(out.flatMap(v => [v.x, v.y, v.z])), halfY: box.max.y - c.y }
}

/** The truck held at 40 mph on flat ground into one SLEEPING target (as main.js stands it); forward speed per step. */
async function drive (kind, lat) {
  const P = structuredClone(RANGER_PARAMS)
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const engine = await createPhysicsEngine()
  const ground = engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
  engine.addBox(ground, { x: 3000, y: 5, z: 3000 }, { friction: 0.9, group: GROUP_TERRAIN })
  const vs = makeVehicleState(P, RUNNING), eq = computeStaticEquilibrium(P)
  vs.position.set(0, eq.bodyY, 0); vs.strutComp = [...eq.strutComp]
  vs.velocity.set(0, 0, -SPEED); vs.wheelOmega = [0, 1, 2, 3].map(() => SPEED / P.wheelRadius)
  const chassis = createVehicleChassis(engine, vs, P), M = engine.getMass(chassis)
  let body = null, m = 0
  if (kind) {
    const sp = TARGET_TYPES[kind].massKg ? TARGET_TYPES[kind] : DEBRIS_TYPES[kind], S = hullOf(PROP_MODELS[TARGET_TYPES[kind].model].url)
    body = engine.createBody({ type: 'dynamic', position: { x: lat === 'wheel' ? getWheelPosition(0, vs, P).x : 0, y: S.halfY + 0.01, z: -15 },
      userData: { kind: 'debris', debrisType: kind } })
    const probe = engine.createBody({ type: 'dynamic', position: { x: 0, y: -1e4, z: 0 } }); engine.addHull(probe, S.hull, { density: 1, group: GROUP_DEBRIS })
    const vol = engine.getMass(probe); engine.destroyBody(probe)
    engine.addHull(body, S.hull, { density: sp.massKg ? sp.massKg / vol : sp.density, friction: sp.friction, restitution: sp.restitution, group: GROUP_DEBRIS })
    m = engine.getMass(body)
    engine.sleep(body)
  }
  const flat = (cx, cy, cz, r) => cy < r ? [{ normal: new THREE.Vector3(0, 1, 0), depth: r - cy, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
  const fwd = new THREE.Vector3(), v = []
  let hit = -1
  for (let s = 0; s < Math.round(60 * (20 / SPEED + 1.5)); s++) {
    const vNow = vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion))
    vs.throttle = Math.max(0, Math.min(1, (SPEED - vNow) * 0.5)); vs.brake = Math.max(0, Math.min(1, (vNow - SPEED) * 0.5))
    stepPhysics(vs, P, DT, flat, { engine, chassis })
    v.push(vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion)))
    if (hit < 0 && body != null && engine.isAwake(body)) hit = s
  }
  engine.dispose()
  return { v, hit, M, m }
}

const base = await drive(null)
for (const kind of ['smallCrate', 'barrel']) for (const lat of [0, 'wheel']) {
  const r = await drive(kind, lat)
  if (r.hit < 0) { check(`${kind} at ${lat === 'wheel' ? 'the wheel line' : 'dead centre'}: the truck reached it`, false); continue }
  let worst = 0
  for (let s = Math.max(1, r.hit); s < Math.min(r.v.length, r.hit + 30); s++) worst = Math.max(worst, (r.v[s - 1] - r.v[s]) - (base.v[s - 1] - base.v[s]))
  const bound = 2 * r.m * SPEED / r.M
  check(`${kind} (${r.m.toFixed(1)} kg) at ${lat === 'wheel' ? 'the wheel line' : 'dead centre'}, ${MPH} mph: worst one-step speed loss `
    + `${worst.toFixed(3)} m/s ≤ ${MARGIN} × the momentum bound ${bound.toFixed(3)} (${(worst / bound).toFixed(2)}×)`, worst <= MARGIN * bound)
}
console.log(fails ? `\n${fails} FAILED` : '\nall strike-hitch checks passed')
process.exit(fails ? 1 : 0)
