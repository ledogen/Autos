// The FEAT-88 haul rig, shared by test/haul-load.mjs (the gate) and test/measure-haul-brim.mjs (the
// FEAT-138 S-count measurement): a stock Ranger parked on flat ground, firewood bundles dropped into
// its bed exactly as main.js's _haulStep drops them, and the settle count settle() pays on.
//
// The load is what the game spawns: bedDropPoints() lays the pieces out on the yard's bed-sized drop
// zone (seeded), each dropped DROP_Y above the pad on a DROP_GAP stagger — at FIXED points, so a
// truck parked off the zone catches less — and "aboard" is inBedWell(). Each bundle is the convex
// hull of its own shipped GLB (variants A/B/C, as debris.js builds it) at its real 11 kg.

import fs from 'node:fs'
import * as THREE from 'three'
import { PROP_MODELS } from '../../data/prop-models.js'
import { RANGER_PARAMS } from '../../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../../data/vehicle-models.js'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../../src/physics-engine.js'
import { stepPhysics, createVehicleChassis } from '../../src/physics.js'
import { makeVehicleState } from '../../src/vehicle-state.js'
import { computeStaticEquilibrium } from '../../src/suspension.js'
import { RUNNING } from '../../src/ignition.js'
import { DebrisSystem, DEBRIS_TYPES, bedDropPoints, inBedWell, bboxCorners } from '../../src/debris.js'

export const DT = 1 / 60
export const BED = DEFAULT_VEHICLE_MODEL.bed
const DROP_Y = 3.3, DROP_GAP = 0.3          // main.js HAUL_DROP_Y (above the pad) / HAUL_DROP_GAP

/** A GLB's vertices centred on their bbox — the hull debris.js builds (same reader as cargo-bed). */
function glbHull (url) {
  const buf = fs.readFileSync(new URL('../../' + url, import.meta.url))
  const jl = buf.readUInt32LE(12)
  const js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  const binOff = 20 + jl + 8
  const pts = []
  for (const n of js.nodes) {
    if (n.mesh == null) continue
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])))
    for (const pr of js.meshes[n.mesh].primitives) {
      const a = js.accessors[pr.attributes.POSITION], bv = js.bufferViews[a.bufferView]
      const off = buf.byteOffset + binOff + (bv.byteOffset || 0) + (a.byteOffset || 0)
      const f = new Float32Array(buf.buffer.slice(off, off + a.count * 12))
      for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3(f[3 * i], f[3 * i + 1], f[3 * i + 2]).applyMatrix4(m))
    }
  }
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3())
  return pts.flatMap(v => [v.x - c.x, v.y - c.y, v.z - c.z])
}
/** Each bundle variant's hull. Mutable: useGameHulls() swaps in the bbox fallback debris.js uses. */
export const HULLS = Object.fromEntries(Object.entries(DEBRIS_TYPES).filter(([k]) => k.startsWith('bundle'))
  .map(([k, spec]) => [k, glbHull(PROP_MODELS[spec.model].url)]))
const SPEC = DEBRIS_TYPES.bundleA

/** A body's hull volume by debris.js's own probe. */
export const hullVolume = (engine, hull) => DebrisSystem.prototype._hullVolume.call({ _eng: engine }, hull)

/** A truck parked on flat ground with its bed empty. */
export async function truck () {
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
  const chassis = createVehicleChassis(engine, vs, P, { bed: BED })
  const flat = (cx, cy, cz, r) => {
    const d = r - cy
    return d > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: d, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
  }
  const live = []
  const t = { P, engine, vs, chassis, live, ctx: { engine, chassis }, flat, debris: { _eng: engine, _live: live } }
  t.step = () => {
    DebrisSystem.prototype.beforeStep.call(t.debris, chassis, BED)
    stepPhysics(vs, P, DT, flat, t.ctx)
  }
  return t
}

/**
 * From here on a load uses what the GAME would build: debris.js falls back to a variant's bounding
 * box when the engine refuses its hull, so the rig tests the shipped behaviour even while an asset's
 * hull is red.
 */
export async function useGameHulls () {
  const t = await truck()
  for (const k of Object.keys(HULLS)) if (!(hullVolume(t.engine, HULLS[k]) > 0)) HULLS[k] = bboxCorners(HULLS[k])
  t.engine.dispose()
}

/**
 * Drop `n` bundles the way _haulStep does, then let them settle. The zone is laid where a squarely
 * parked bed would be (the truck's own frame); `off` slides the zone sideways by that many metres —
 * the same as parking that far off it.
 */
export function load (t, n, key, { noDamage = true, off = 0 } = {}) {
  const drops = bedDropPoints(n, BED, key)
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), qd = new THREE.Quaternion()
  t.vs.throttle = 0; t.vs.brake = 0; t.vs.handbrake = true   // parked: the latch holds the handbrake
  for (let s = 0, i = 0; s < Math.round(((n - 1) * DROP_GAP + 3) / DT); s++) {
    while (i < n && s * DT >= i * DROP_GAP) {
      const d = drops[i++]
      v.set(d.x + off, 0, d.z).applyQuaternion(t.vs.quaternion).add(t.vs.position)
      v.y = DROP_Y                                 // above the pad (the ground plane is y = 0)
      q.copy(t.vs.quaternion).multiply(qd.set(d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w))
      const body = t.engine.createBody({ type: 'dynamic', position: { x: v.x, y: v.y, z: v.z },
        quaternion: { x: q.x, y: q.y, z: q.z, w: q.w }, linearVelocity: { x: 0, y: -1.2, z: 0 },
        angularVelocity: d.spin, userData: { kind: 'debris', noDamage } })
      // Density by debris.js's own probe, so each variant weighs exactly its massKg on its own hull.
      const rho = DEBRIS_TYPES[d.kind].massKg / hullVolume(t.engine, HULLS[d.kind])
      t.engine.addHull(body, HULLS[d.kind], { density: rho, friction: SPEC.friction, restitution: SPEC.restitution, group: GROUP_DEBRIS })
      t.live.push({ body, cargo: false, prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion() })
    }
    t.step()
  }
}

/** Bundles inside the well right now — the settle count. */
export function aboard (t) {
  const cp = new THREE.Vector3(), cq = new THREE.Quaternion(), p = new THREE.Vector3(), q = new THREE.Quaternion()
  t.engine.getTransform(t.chassis, cp, cq)
  cq.invert()
  return t.live.filter(r => { t.engine.getTransform(r.body, p, q); return inBedWell(p.sub(cp).applyQuaternion(cq), BED) }).length
}
