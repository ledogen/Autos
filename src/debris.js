/**
 * src/debris.js — dynamic physics props (FEAT-36 first slice, FEAT-48 test surface).
 *
 * A handful of loose rigid bodies — barrels, rocks — thrown from the truck (the paper-throw
 * mechanic with a debug projectile selector) that tumble, get driven over, shove back, and
 * settle. Built ENTIRELY against the adapter seam (physics-engine.js): no engine types here.
 *
 * Collider = convex hull of the visual GLB's own vertices, re-centred on the mesh bbox centre
 * (MESH == PHYSICS for props, by construction — the test props are 44 and 20 tris, well inside
 * hull-building comfort). Mass/inertia are density-derived from that hull, so a rock tumbles
 * with the inertia of its actual shape; densities are picked per type to land honest masses.
 *
 * Two-way coupling is free: debris lives in the same engine world the chassis steps in, and
 * the wheels see dynamic bodies through stepPhysics's qcPlus overlap (relative-velocity slip +
 * reaction impulses). Nothing here talks to the vehicle directly.
 *
 * Headless-safe by construction: only main.js constructs this, gates never do.
 */

import * as THREE from 'three'
import { GROUP_DEBRIS } from './physics-engine.js'
import { getModel } from './model-service.js'

export const DEBRIS_TYPES = {
  // density kg/m³ of the SOLID hull (the engine integrates ρ over the hull volume):
  // barrel ≈ 0.25 m³ solid → ~70 ρ lands the ~18 kg of an empty plastic drum;
  // rock hull ≈ 0.02 m³ → 2500 ρ lands ~50 kg of granite cobble.
  barrel: { model: 'testBarrel', density: 70, friction: 0.5, restitution: 0.3 },
  rock: { model: 'testRock', density: 2500, friction: 0.7, restitution: 0.15 },
}

// Hard cap (FEAT-36: "a couple at a time", with debug headroom). Oldest body is reclaimed —
// same discipline as the thrown-roll cap, so an evening of debug throwing cannot leak bodies.
const DEBRIS_CAP = 12

export class DebrisSystem {
  constructor (engine, scene) {
    this._eng = engine
    this._scene = scene
    this._live = []              // [{ body, mesh, kind }], oldest first
    this._proto = new Map()      // kind → { hull: Float32Array, center: THREE.Vector3 } | null while loading
    for (const [kind, spec] of Object.entries(DEBRIS_TYPES)) {
      getModel(spec.model).then(rec => {
        this._proto.set(kind, this._extractHull(rec.template))
      })
    }
  }

  /** Hull positions (bbox-centred, model-local) + the centre used, from the GLB's first mesh. */
  _extractHull (template) {
    let mesh = null
    template.traverse(o => { if (!mesh && o.isMesh) mesh = o })
    if (!mesh) return null
    const pos = mesh.geometry.attributes.position
    mesh.geometry.computeBoundingBox()
    const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3())
    const hull = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      hull[i * 3] = pos.getX(i) - center.x
      hull[i * 3 + 1] = pos.getY(i) - center.y
      hull[i * 3 + 2] = pos.getZ(i) - center.z
    }
    return { hull, center }
  }

  /**
   * Spawn one debris body with an initial velocity (the throw). Tumble comes free from the
   * off-centre first contact; a small random spin sells the launch.
   */
  spawn (kind, position, velocity) {
    const spec = DEBRIS_TYPES[kind]
    const proto = this._proto.get(kind)
    if (!spec || !proto) return null   // model still loading (first seconds of a cold boot)

    const body = this._eng.createBody({
      type: 'dynamic',
      position,
      linearVelocity: velocity,
      angularVelocity: {
        x: (Math.random() * 2 - 1) * 3,
        y: (Math.random() * 2 - 1) * 3,
        z: (Math.random() * 2 - 1) * 3,
      },
      userData: { kind: 'debris', debrisType: kind },
    })
    this._eng.addHull(body, proto.hull, {
      density: spec.density,
      friction: spec.friction,
      restitution: spec.restitution,
      group: GROUP_DEBRIS,
    })

    // Visual: the shared template cloned, child-offset so the mesh's bbox centre (= the hull's
    // origin = the body origin) coincides with the body transform.
    const spawned = new THREE.Group()
    const modelSpec = DEBRIS_TYPES[kind]
    getModel(modelSpec.model).then(rec => {
      const m = rec.template.clone(true)
      m.position.set(-proto.center.x, -proto.center.y, -proto.center.z)
      spawned.add(m)
    })
    this._scene.add(spawned)

    this._live.push({ body, mesh: spawned, kind })
    while (this._live.length > DEBRIS_CAP) this._reclaim(this._live.shift())
    return body
  }

  _reclaim (rec) {
    this._eng.destroyBody(rec.body)
    this._scene.remove(rec.mesh)
  }

  /** Frame-loop sync: engine transform → mesh. ≤ DEBRIS_CAP bodies — flat cost, no culling. */
  update () {
    for (const rec of this._live) {
      this._eng.getTransform(rec.body, rec.mesh.position, rec.mesh.quaternion)
    }
  }

  clear () {
    for (const rec of this._live) this._reclaim(rec)
    this._live.length = 0
  }

  get count () { return this._live.length }
  get awakeCount () { return this._live.reduce((n, r) => n + (this._eng.isAwake(r.body) ? 1 : 0), 0) }
}
