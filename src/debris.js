/**
 * src/debris.js — dynamic physics props (FEAT-36 first slice, FEAT-48 test surface).
 *
 * A handful of loose rigid bodies — barrels, rocks — thrown from the truck (the paper-throw
 * mechanic with a debug projectile selector) that tumble, get driven over, shove back, and
 * settle. Built ENTIRELY against the adapter seam (physics-engine.js): no engine types here.
 *
 * Collider = convex hull of the visual GLB's own vertices, re-centred on the mesh bbox centre
 * (MESH == PHYSICS for props, by construction — the props are 328 and 20 tris, well inside
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
  // density kg/m³ of the SOLID hull (the engine integrates ρ over the hull volume) — these are
  // NOT material densities, they are whatever lands the real mass of a HOLLOW object on its solid
  // hull volume:
  //   barrel — ASSET-30's drum-closed. The hull is the 10-gon lathe at its 0.290 m chime radius
  //     over 0.85 m: area ½·10·0.290²·sin36° = 0.247 m² → ≈ 0.209 m³. 18 kg (the ticket's empty
  //     mass) / 0.209 = ρ 86. The retired test cylinder was ρ 70 on a 0.254 m³ hull, same 18 kg —
  //     the drum is a smaller barrel, so the number had to move to keep the mass honest.
  //   rock — hull ≈ 0.02 m³ → 2500 ρ lands ~50 kg of granite cobble.
  barrel: { model: 'drumClosed', density: 86, friction: 0.5, restitution: 0.3 },
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

  /**
   * Hull positions (bbox-centred, model-local) + the centre used, from EVERY mesh in the GLB.
   *
   * All of them, not the first. GLTFLoader splits a multi-material mesh into one Mesh child per
   * primitive, so `drum-closed.glb` (DrumPaint + DrumSteel) arrives as two — and the first-mesh
   * version of this silently hulled whichever primitive the exporter happened to write first.
   * That is a coin flip between "the drum" and "its two bungs", and the bung case would have
   * spawned a 5 cm collider inside a 0.85 m visual with no error anywhere. Vertices are taken in
   * TEMPLATE space (applyMatrix4 on each mesh's world matrix relative to the template root), so a
   * GLB with transformed child nodes hulls correctly too.
   */
  _extractHull (template) {
    const meshes = []
    template.updateMatrixWorld(true)
    template.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o) })
    if (!meshes.length) return null

    const _inv = new THREE.Matrix4().copy(template.matrixWorld).invert()
    const _m = new THREE.Matrix4()
    const _v = new THREE.Vector3()
    let n = 0
    for (const mesh of meshes) n += mesh.geometry.attributes.position.count
    const pts = new Float32Array(n * 3)
    const box = new THREE.Box3()
    let w = 0
    for (const mesh of meshes) {
      _m.multiplyMatrices(_inv, mesh.matrixWorld)
      const pos = mesh.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(_m)
        pts[w++] = _v.x; pts[w++] = _v.y; pts[w++] = _v.z
        box.expandByPoint(_v)
      }
    }
    const center = box.getCenter(new THREE.Vector3())
    for (let i = 0; i < n; i++) {
      pts[i * 3] -= center.x
      pts[i * 3 + 1] -= center.y
      pts[i * 3 + 2] -= center.z
    }
    return { hull: pts, center }
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
