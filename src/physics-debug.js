/**
 * src/physics-debug.js — collider wireframes for the physics engine (debug overlay).
 *
 * Replaces the FEAT-48-era orange probe spheres (which visualised getBodyContactPoints — a
 * collision path that no longer exists). Draws the ACTUAL engine colliders, built from the
 * adapter's shape-spec registry (physics-engine.js debugBodies()) — honest to what was created,
 * with zero per-frame engine calls for statics and one transform read per dynamic body.
 *
 * Coverage (owner, 2026-08-15): dynamic bodies (chassis, debris) + prop colliders. Terrain
 * heightfields ARE the visible terrain mesh and road trimeshes ARE the visible ribbon, so both
 * are skipped as pure noise. Static prop wireframes are distance-capped (STATIC_DRAW_R) so a
 * forest doesn't become line soup.
 *
 * Look (owner, 2026-08-15): two-tone X-ray. Each collider is drawn twice from one shared line
 * geometry — a bright depth-tested pass (edges you can actually see) and a faint depth-ignoring
 * pass (the collider through everything, including its own model). Models are never hidden or
 * modified. Colours by body kind: vehicle cyan, debris orange, props green.
 *
 * Incremental: bodies are added/removed against the adapter's revision counter, so a debris
 * spawn while enabled builds ONE group, not the world.
 */

import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'

const STATIC_DRAW_R = 130          // m — static (prop) wireframes beyond this are hidden
const COLORS = { vehicle: 0x00ffcc, debris: 0xffa020, prop: 0x55ee44 }
const SHOWN_KINDS = new Set(['vehicle', 'debris', 'prop'])
const EDGE_ANGLE = 12              // ° — EdgesGeometry threshold (faceted colliders keep every edge)

export class PhysicsWireframes {
  constructor (engine, scene) {
    this._eng = engine
    this._scene = scene
    this._root = new THREE.Group()
    this._root.visible = false
    this._root.renderOrder = 10
    scene.add(this._root)
    this.enabled = false
    this._built = new Map()        // body handle → { group, dynamic, refPos }
    this._rev = -1
    // Shared materials per kind — [bright depth-tested, faint X-ray].
    this._mats = new Map()
    for (const [kind, color] of Object.entries(COLORS)) {
      this._mats.set(kind, [
        new THREE.LineBasicMaterial({ color }),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.14, depthTest: false }),
      ])
    }
  }

  setEnabled (on) {
    this.enabled = !!on
    this._root.visible = this.enabled
    if (!this.enabled) return
    this._sync(true)
  }

  /**
   * Frame-loop tick (only called while enabled): follow dynamics, cull statics, track churn.
   * @param {THREE.Vector3} [cameraPos] — static cull origin.
   * @param {{position: THREE.Vector3, quaternion: THREE.Quaternion}} [vehiclePose] — the SUBFRAME
   *   render pose of the chassis. Load-bearing for alignment, not decoration: the truck's meshes are
   *   drawn at lerp(prev step, this step, accumulator/dt) while the engine body sits at THIS step, so
   *   a wireframe read straight from getTransform() lands up to a full physics step (1/60 s) away
   *   from the model it exists to measure — invisible parked, ~0.5 m of offset at 30 m/s. main.js
   *   hands us the same interpolated pose syncMeshesToState() used. Substituting it is exact, not an
   *   approximation: vehicleState.position/quaternion IS the chassis body transform verbatim
   *   (physics.js's end-of-step getTransform).
   *   Debris deliberately does NOT get this — debris meshes are posed from the raw engine transform
   *   too (debris.js update()), so raw-vs-raw already agrees.
   */
  update (cameraPos, vehiclePose) {
    if (!this.enabled) return
    this._sync(false)
    for (const rec of this._built.values()) {
      if (rec.dynamic) {
        if (vehiclePose && rec.kind === 'vehicle') {
          rec.group.position.copy(vehiclePose.position)
          rec.group.quaternion.copy(vehiclePose.quaternion)
        } else {
          this._eng.getTransform(rec.handle, rec.group.position, rec.group.quaternion)
        }
        for (const t of rec.tracked) {   // live-seated spheres (rim cores) follow their spec
          t.faint.position.set(t.spec.offset.x, t.spec.offset.y, t.spec.offset.z)
          t.bright.position.copy(t.faint.position)
        }
      } else if (cameraPos) {
        rec.group.visible = rec.refPos.distanceToSquared(cameraPos) < STATIC_DRAW_R * STATIC_DRAW_R
      }
    }
  }

  /** Reconcile built groups with the engine's body set (revision-gated unless forced). */
  _sync (force) {
    if (!force && this._eng.revision === this._rev) return
    this._rev = this._eng.revision
    const live = new Set()
    for (const b of this._eng.debugBodies()) {
      if (!SHOWN_KINDS.has(b.userData?.kind)) continue
      live.add(b.handle)
      if (!this._built.has(b.handle)) this._add(b)
    }
    for (const [handle, rec] of this._built) {
      if (!live.has(handle)) {
        this._root.remove(rec.group)
        for (const c of rec.group.children) c.geometry.dispose()   // pairs share geometry; dispose is idempotent
        this._built.delete(handle)
      }
    }
  }

  _add (b) {
    const group = new THREE.Group()
    const mats = this._mats.get(b.userData.kind)
    const bounds = new THREE.Box3()
    const tracked = []   // sphere-spec line pairs that follow spec.offset live
    for (const spec of b.specs) {
      const edges = this._edgesFor(spec)
      if (!edges) continue
      edges.computeBoundingBox()
      bounds.union(edges.boundingBox)
      // Two-tone: faint X-ray first (renderOrder below the bright pass), bright depth-tested on top.
      const faint = new THREE.LineSegments(edges, mats[1]); faint.renderOrder = 10
      const bright = new THREE.LineSegments(edges, mats[0]); bright.renderOrder = 11
      if (spec.shape === 'sphere') {
        faint.position.set(spec.offset.x, spec.offset.y, spec.offset.z)
        bright.position.copy(faint.position)
        tracked.push({ spec, faint, bright })
      }
      group.add(faint, bright)
    }
    if (group.children.length === 0) return
    if (b.dynamic) this._eng.getTransform(b.handle, group.position, group.quaternion)
    this._root.add(group)
    this._built.set(b.handle, {
      handle: b.handle, group, dynamic: b.dynamic, tracked, kind: b.userData.kind,
      refPos: bounds.getCenter(new THREE.Vector3()),   // statics bake world coords — bbox centre is the cull point
    })
  }

  /** Line geometry for one adapter shape spec (body-local space). */
  _edgesFor (spec) {
    switch (spec.shape) {
      case 'box': {
        const g = new THREE.BoxGeometry(spec.halfExtents.x * 2, spec.halfExtents.y * 2, spec.halfExtents.z * 2)
        return this._edges(g)
      }
      case 'sphere': {
        // Built at the ORIGIN; the caller positions the line objects from spec.offset and
        // update() refreshes them each frame — sphere shapes can be re-seated live (the wheel
        // rim cores track strut travel via setSphereLocal, which mutates spec.offset).
        return this._edges(new THREE.SphereGeometry(spec.radius, 10, 6), 25)
      }
      case 'capsule': {
        const a = new THREE.Vector3(spec.p1.x, spec.p1.y, spec.p1.z)
        const bb = new THREE.Vector3(spec.p2.x, spec.p2.y, spec.p2.z)
        const axis = bb.clone().sub(a)
        const g = new THREE.CapsuleGeometry(spec.radius, axis.length(), 3, 8)
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()))
        const mid = a.clone().add(bb).multiplyScalar(0.5)
        g.translate(mid.x, mid.y, mid.z)
        return this._edges(g, 30)
      }
      case 'cylinder': {
        const g = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.height, spec.sides)
        g.translate(0, spec.yOffset, 0)
        return this._edges(g)
      }
      case 'hull': {
        const pts = []
        for (let i = 0; i < spec.positions.length; i += 3) {
          pts.push(new THREE.Vector3(spec.positions[i], spec.positions[i + 1], spec.positions[i + 2]))
        }
        return this._edges(new ConvexGeometry(pts))
      }
      case 'mesh': {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(spec.positions, 3))
        g.setIndex(new THREE.BufferAttribute(spec.indices, 1))
        return this._edges(g)
      }
      default:
        return null   // 'heightfield' — deliberately not drawn (it IS the terrain mesh)
    }
  }

  _edges (geometry, angle = EDGE_ANGLE) {
    const e = new THREE.EdgesGeometry(geometry, angle)
    geometry.dispose()
    return e
  }
}
