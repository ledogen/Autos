/**
 * src/physics-engine.js — the FEAT-48 physics engine ADAPTER SEAM.
 *
 * The one module allowed to import the vendored Box3D bindings (vendor/box3d/).
 * Everything else — physics.js, terrain colliders, debris, gates — talks to the
 * PhysicsEngine class below. NO engine type may leak past this file: bodies are
 * opaque integer handles, vectors are plain {x,y,z} objects, quaternions plain
 * {x,y,z,w}. That containment is the whole point (the chosen backend is v0.1.x —
 * being wrong about it must cost a week of adapter work, not a rewrite; swapping
 * to Rapier touches only this file). Verifiable by grep: `b3` appears nowhere
 * outside this module and its vendored import.
 *
 * The adapter is also the documentation: there is no LLM training data for
 * Box3D, so every method states its engine-call mapping inline.
 *
 * Lifecycle: `await createPhysicsEngine()` once (async — WASM init, ~15 ms);
 * every call after that is synchronous, which is what keeps the pure-node gates'
 * synchronous stepPhysics loops working.
 *
 * Units: SI (m, kg, s). Y-up, same world frame as the rest of the game.
 * Determinism: worker count is pinned to 0 (single-threaded stepping) — the
 * Phase 0 hash (test/box3d-determinism.expected) was recorded that way.
 */

import Box3DFactory from '../vendor/box3d/dist/box3d.mjs'

/** Collision groups (categoryBits). Filters are plain bigints at the seam. */
export const GROUP_TERRAIN = 1n << 0n   // streamed heightfield tiles + lab ground
export const GROUP_CHASSIS = 1n << 1n   // the vehicle body
export const GROUP_DEBRIS  = 1n << 2n   // dynamic props (barrels, rocks)
export const GROUP_STATIC  = 1n << 3n   // static props / POI solids
export const GROUP_ALL     = 0xffffffffffffffffn

let _b3 = null            // the loaded engine module — module-private, never exported

/** Load the engine WASM once. Idempotent. Call at boot (and at gate setup). */
export async function initPhysicsEngine () {
  if (!_b3) _b3 = await Box3DFactory()
  return true
}

/**
 * A physics world. Construct via `createPhysicsEngine()` (async) — the class
 * itself is synchronous and assumes the WASM module is loaded.
 */
export class PhysicsEngine {
  constructor ({ gravity = { x: 0, y: -9.81, z: 0 } } = {}) {
    if (!_b3) throw new Error('physics-engine: call initPhysicsEngine() first')
    const wd = _b3.b3DefaultWorldDef()
    wd.gravity = [gravity.x, gravity.y, gravity.z]
    wd.workerCount = 0                     // determinism: single-threaded solver
    // Below this approach speed contacts are fully plastic (no bounce) — carries the tuned
    // BUG-27-era REST_VEL_THRESHOLD (physics.js) into the engine so resting contact can't jitter.
    wd.restitutionThreshold = 1.0
    this._world = _b3.b3CreateWorld(wd)

    this._bodies = new Map()               // handle → { id (b3BodyId), shapes: b3ShapeId[], userData }
    this._shapeToHandle = new Map()        // shapeId.index1<<21|generation-ish key → body handle
    this._nextHandle = 1
    this._heightfields = new Map()         // handle → b3HeightFieldData (owned, freed on destroy)
    this._meshDatas = new Map()            // handle → b3MeshData[] (owned, freed on destroy)
    this._hulls = []                       // shared hull data to free on dispose

    // Scratch out-params — the bindings write into caller-provided arrays; reuse
    // to keep the per-frame allocation at zero on the hot read paths.
    this._p = [0, 0, 0]; this._q = [0, 0, 0, 0]
    this._v = [0, 0, 0]; this._w = [0, 0, 0]
    this._rev = 0                          // bumped on body create/destroy — debug viz change detection
  }

  /** Advance the world by dt with the given solver substep count. Synchronous. */
  step (dt, substeps = 4) {
    _b3.b3World_Step(this._world, dt, substeps)
  }

  // ── Bodies ────────────────────────────────────────────────────────────────

  /**
   * Create a body. type: 'static' | 'kinematic' | 'dynamic'.
   * Returns an opaque integer handle. `userData` is any JS value (never sent
   * to the engine) — retrieve with getUserData(handle).
   */
  createBody ({ type = 'dynamic', position = { x: 0, y: 0, z: 0 }, quaternion = { x: 0, y: 0, z: 0, w: 1 },
                linearVelocity = null, angularVelocity = null, linearDamping = 0, angularDamping = 0,
                canSleep = true, bullet = false, userData = null } = {}) {
    const bd = _b3.b3DefaultBodyDef()
    bd.type = type === 'static' ? _b3.b3BodyType.b3_staticBody
      : type === 'kinematic' ? _b3.b3BodyType.b3_kinematicBody
        : _b3.b3BodyType.b3_dynamicBody
    bd.position = [position.x, position.y, position.z]
    bd.rotation = [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
    if (linearVelocity) bd.linearVelocity = [linearVelocity.x, linearVelocity.y, linearVelocity.z]
    if (angularVelocity) bd.angularVelocity = [angularVelocity.x, angularVelocity.y, angularVelocity.z]
    bd.linearDamping = linearDamping
    bd.angularDamping = angularDamping
    bd.enableSleep = canSleep
    bd.isBullet = bullet
    const id = _b3.b3CreateBody(this._world, bd)
    const handle = this._nextHandle++
    this._bodies.set(handle, { id, shapes: [], specs: [], userData })
    this._rev++
    return handle
  }

  /** Destroy a body and everything attached to it. */
  destroyBody (handle) {
    const rec = this._bodies.get(handle)
    if (!rec) return
    this._rev++
    for (const s of rec.shapes) this._shapeToHandle.delete(this._shapeKey(s))
    _b3.b3DestroyBody(rec.id)              // destroys attached shapes with it
    const hf = this._heightfields.get(handle)
    if (hf) { _b3.b3DestroyHeightField(hf); this._heightfields.delete(handle) }
    const mds = this._meshDatas.get(handle)
    if (mds) { for (const m of mds) _b3.b3DestroyMesh(m); this._meshDatas.delete(handle) }
    this._bodies.delete(handle)
  }

  getUserData (handle) { return this._bodies.get(handle)?.userData ?? null }

  /** True if the handle refers to a dynamic body. */
  isDynamic (handle) {
    const rec = this._bodies.get(handle)
    return !!rec && _b3.b3Body_GetType(rec.id).value === _b3.b3BodyType.b3_dynamicBody.value
  }

  // ── Colliders ─────────────────────────────────────────────────────────────

  _shapeDef ({ friction = 0.6, restitution = 0, density = 1000, group = GROUP_STATIC, collidesWith = GROUP_ALL,
               rollingResistance = 0, hitEvents = false } = {}) {
    const sd = _b3.b3DefaultShapeDef()
    sd.baseMaterial.friction = friction
    sd.baseMaterial.restitution = restitution
    sd.baseMaterial.rollingResistance = rollingResistance
    sd.density = density
    sd.filter.categoryBits = group
    sd.filter.maskBits = collidesWith
    sd.enableHitEvents = hitEvents        // per-contact impact events (wear-model seam)
    return sd
  }

  _shapeKey (shapeId) { return shapeId.index1 * 0x10000 + shapeId.generation }

  /** spec: a plain descriptor of the shape as CREATED (body-local geometry) — the debug
   *  wireframe source of truth (physics-debug.js). Never read by the engine. */
  _register (handle, shapeId, spec = null) {
    const rec = this._bodies.get(handle)
    rec.shapes.push(shapeId)
    if (spec) rec.specs.push(spec)
    this._shapeToHandle.set(this._shapeKey(shapeId), handle)
    return shapeId
  }

  /** Box collider. halfExtents {x,y,z}; centered on the body origin. */
  addBox (handle, halfExtents, material = {}) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateBoxShape(rec.id, this._shapeDef(material),
      halfExtents.x, halfExtents.y, halfExtents.z), { shape: 'box', halfExtents: { ...halfExtents } })
  }

  /** Sphere collider at local offset (default body origin). */
  addSphere (handle, radius, material = {}, offset = { x: 0, y: 0, z: 0 }) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateSphereShape(rec.id, this._shapeDef(material),
      { center: [offset.x, offset.y, offset.z], radius }), { shape: 'sphere', radius, offset: { ...offset } })
  }

  /** Capsule collider between two local points. */
  addCapsule (handle, p1, p2, radius, material = {}) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateCapsuleShape(rec.id, this._shapeDef(material),
      { center1: [p1.x, p1.y, p1.z], center2: [p2.x, p2.y, p2.z], radius }),
    { shape: 'capsule', p1: { ...p1 }, p2: { ...p2 }, radius })
  }

  /**
   * Upright cylinder collider (a convex hull under the hood — the engine has no
   * native cylinder shape). height along local Y, centered at yOffset.
   */
  addCylinder (handle, height, radius, material = {}, yOffset = 0, sides = 12) {
    const rec = this._bodies.get(handle)
    const hull = _b3.b3CreateCylinder(height, radius, yOffset, sides)
    this._hulls.push(hull)                // hull data is shared/copied by the shape; free on dispose
    this._register(handle, _b3.b3CreateHullShape(rec.id, this._shapeDef(material), hull),
      { shape: 'cylinder', height, radius, yOffset, sides })
  }

  /** Convex hull collider from a flat [x0,y0,z0, x1,…] position array. */
  addHull (handle, positions, material = {}) {
    const rec = this._bodies.get(handle)
    const hull = _b3.b3CreateHull(positions)
    this._hulls.push(hull)
    this._register(handle, _b3.b3CreateHullShape(rec.id, this._shapeDef(material), hull),
      { shape: 'hull', positions: Array.from(positions) })
  }

  /**
   * Static triangle-mesh collider from world/local-space geometry (positions
   * Float32Array [x,y,z,…], indices Uint32Array). For streamed static surfaces
   * whose exact shape matters — the road ribbon, tunnel bores, junction pads.
   * Mesh data is owned by the body and freed with it. Best kept on STATIC
   * bodies (trimesh-vs-trimesh dynamics is not a thing engines do well).
   */
  addMesh (handle, positions, indices, material = {}) {
    const rec = this._bodies.get(handle)
    const mesh = _b3.b3CreateMesh(positions, indices)
    if (!mesh) return false
    let list = this._meshDatas.get(handle)
    if (!list) this._meshDatas.set(handle, list = [])
    list.push(mesh)
    this._register(handle, _b3.b3CreateMeshShape(rec.id, this._shapeDef(material), mesh, [1, 1, 1]),
      { shape: 'mesh', positions, indices })   // references, not copies — same arrays the caller owns
    return true
  }

  /**
   * Heightfield collider. `heights` is a Float32Array of countX·countZ metres,
   * row-major over Z then X, sampled on a grid of `cellSize` metres. The field's
   * LOCAL origin is its (x0, z0) corner — position the owning static body there.
   * One heightfield per body (the field data is freed with the body).
   */
  addHeightfield (handle, heights, countX, countZ, cellSize, material = {}) {
    const rec = this._bodies.get(handle)
    const hf = _b3.b3CreateHeightField(heights, countX, countZ, [cellSize, 1, cellSize])
    this._heightfields.set(handle, hf)
    this._register(handle, _b3.b3CreateHeightFieldShape(rec.id, this._shapeDef({ group: GROUP_TERRAIN, ...material }), hf),
      { shape: 'heightfield' })   // viz skips these — the terrain mesh IS the collider
  }

  // ── State access ──────────────────────────────────────────────────────────

  /** Read body transform into out objects (THREE.Vector3/Quaternion compatible). */
  getTransform (handle, outPos, outQuat) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_GetTransform(this._p, this._q, rec.id)
    outPos.x = this._p[0]; outPos.y = this._p[1]; outPos.z = this._p[2]
    outQuat.x = this._q[0]; outQuat.y = this._q[1]; outQuat.z = this._q[2]; outQuat.w = this._q[3]
  }

  setTransform (handle, position, quaternion) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_SetTransform(rec.id, [position.x, position.y, position.z],
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w])
  }

  getVelocity (handle, outLin, outAng) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_GetLinearVelocity(this._v, rec.id)
    _b3.b3Body_GetAngularVelocity(this._w, rec.id)
    outLin.x = this._v[0]; outLin.y = this._v[1]; outLin.z = this._v[2]
    outAng.x = this._w[0]; outAng.y = this._w[1]; outAng.z = this._w[2]
  }

  setVelocity (handle, linear, angular) {
    const rec = this._bodies.get(handle)
    if (linear) _b3.b3Body_SetLinearVelocity(rec.id, [linear.x, linear.y, linear.z])
    if (angular) _b3.b3Body_SetAngularVelocity(rec.id, [angular.x, angular.y, angular.z])
  }

  /** Velocity of the body-attached point at a WORLD position (for groundVel). */
  getPointVelocity (handle, worldPoint, out) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_GetWorldPointVelocity(this._v, rec.id, [worldPoint.x, worldPoint.y, worldPoint.z])
    out.x = this._v[0]; out.y = this._v[1]; out.z = this._v[2]
    return out
  }

  applyForce (handle, force, worldPoint = null) {
    const rec = this._bodies.get(handle)
    if (worldPoint) _b3.b3Body_ApplyForce(rec.id, [force.x, force.y, force.z], [worldPoint.x, worldPoint.y, worldPoint.z], true)
    else _b3.b3Body_ApplyForceToCenter(rec.id, [force.x, force.y, force.z], true)
  }

  applyTorque (handle, torque) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_ApplyTorque(rec.id, [torque.x, torque.y, torque.z], true)
  }

  applyImpulse (handle, impulse, worldPoint = null) {
    const rec = this._bodies.get(handle)
    if (worldPoint) _b3.b3Body_ApplyLinearImpulse(rec.id, [impulse.x, impulse.y, impulse.z], [worldPoint.x, worldPoint.y, worldPoint.z], true)
    else _b3.b3Body_ApplyLinearImpulseToCenter(rec.id, [impulse.x, impulse.y, impulse.z], true)
  }

  /**
   * Override mass + diagonal rotational inertia (about the local center given).
   * This is how the chassis keeps the TUNED params.inertiaRoll/Yaw/Pitch instead
   * of the shape-derived tensor — the driving feel is calibration, not geometry.
   */
  setMassData (handle, mass, inertiaDiag, localCenter = { x: 0, y: 0, z: 0 }) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_SetMassData(rec.id, {
      mass,
      center: [localCenter.x, localCenter.y, localCenter.z],
      inertia: {
        cx: [inertiaDiag.x, 0, 0],
        cy: [0, inertiaDiag.y, 0],
        cz: [0, 0, inertiaDiag.z],
      },
    })
  }

  getMass (handle) { return _b3.b3Body_GetMass(this._bodies.get(handle).id) }

  /** Live-update friction/restitution on every shape of a body (debug sliders). */
  setMaterial (handle, { friction = null, restitution = null } = {}) {
    for (const s of this._bodies.get(handle).shapes) {
      if (friction != null) _b3.b3Shape_SetFriction(s, friction)
      if (restitution != null) _b3.b3Shape_SetRestitution(s, restitution)
    }
  }

  isAwake (handle) { return _b3.b3Body_IsAwake(this._bodies.get(handle).id) }
  wake (handle) { _b3.b3Body_SetAwake(this._bodies.get(handle).id, true) }
  sleep (handle) { _b3.b3Body_SetAwake(this._bodies.get(handle).id, false) }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Closest ray hit. origin/dir plain {x,y,z}; dir need not be normalized —
   * the ray spans origin → origin + dir·maxDist.
   * Returns null or { body, point:{x,y,z}, normal:{x,y,z}, fraction, distance }.
   */
  castRay (origin, dir, maxDist, { collidesWith = GROUP_ALL } = {}) {
    const f = _b3.b3DefaultQueryFilter()
    f.maskBits = collidesWith
    const r = _b3.b3World_CastRayClosest(this._world,
      [origin.x, origin.y, origin.z],
      [dir.x * maxDist, dir.y * maxDist, dir.z * maxDist], f)
    if (!r.hit) return null
    return {
      body: this._shapeToHandle.get(this._shapeKey(r.shapeId)) ?? null,
      point: { x: r.point[0], y: r.point[1], z: r.point[2] },
      normal: { x: r.normal[0], y: r.normal[1], z: r.normal[2] },
      fraction: r.fraction,
      distance: r.fraction * maxDist,
    }
  }

  /**
   * Sphere overlap → contact list in the game's {normal, depth, contactPoint}
   * convention (normal away from the solid, toward the sphere center), plus the
   * body handle so the caller can do relative-velocity / reaction-impulse work.
   * `dynamicOnly` filters to dynamic bodies (the wheel-vs-debris path).
   */
  overlapSphere (center, radius, { collidesWith = GROUP_ALL, dynamicOnly = false } = {}) {
    const f = _b3.b3DefaultQueryFilter()
    f.maskBits = collidesWith
    const hits = []
    const cp = this._p
    _b3.b3World_OverlapShape(this._world, [center.x, center.y, center.z], [[0, 0, 0]], radius, f, (shapeId) => {
      const handle = this._shapeToHandle.get(this._shapeKey(shapeId))
      if (handle == null) return true
      if (dynamicOnly && !this.isDynamic(handle)) return true
      _b3.b3Shape_GetClosestPoint(cp, shapeId, [center.x, center.y, center.z])
      let dx = center.x - cp[0], dy = center.y - cp[1], dz = center.z - cp[2]
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      let depth
      if (dist < 1e-4) {
        // Query center is INSIDE the shape — closest surface point degenerates to
        // the center itself. Fall back to pushing out along body-center → query
        // direction at full-radius depth (deep contact; exact depth unknowable
        // from a closest-point query, and the resolver only needs "very deep").
        const rec = this._bodies.get(handle)
        _b3.b3Body_GetWorldCenterOfMass(cp, rec.id)
        dx = center.x - cp[0]; dy = center.y - cp[1]; dz = center.z - cp[2]
        dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < 1e-8) return true                   // dead-centered: give up
        depth = radius
      } else {
        if (dist >= radius) return true                // grazing — no overlap
        depth = radius - dist
      }
      const inv = 1 / dist
      hits.push({
        body: handle,
        normal: { x: dx * inv, y: dy * inv, z: dz * inv },
        depth,
        contactPoint: { x: cp[0], y: cp[1], z: cp[2] },
      })
      return true   // keep enumerating
    })
    return hits
  }

  /**
   * Per-body contact readout: max normal-impulse magnitude currently on the
   * body's manifolds. The SM-3 wear model subscribes here later (FEAT-36's
   * causesDamage flag gates the REPORT, not the contact).
   */
  maxContactImpulse (handle) {
    const rec = this._bodies.get(handle)
    if (!this._contactsBuf) this._contactsBuf = _b3.createContactsBuffer()
    const buf = _b3.getBodyContactData(this._contactsBuf, rec.id)
    let max = 0
    const n = _b3.getNumContacts(buf)
    if (n === 0) return 0
    const contact = _b3.createContact()
    const manifold = _b3.createManifold()
    for (let i = 0; i < n; i++) {
      _b3.getContactAt(contact, buf, i)
      for (let m = 0; m < contact.manifoldCount; m++) {
        _b3.getManifoldAt(manifold, contact, m)
        for (let k = 0; k < manifold.pointCount; k++) {
          const imp = manifold.points[k].totalNormalImpulse
          if (imp > max) max = imp
        }
      }
    }
    return max
  }

  // ── Joints (log-drag etc.) ────────────────────────────────────────────────

  /** Rope/distance joint between two bodies at world anchor points. */
  createDistanceJoint (handleA, handleB, worldAnchorA, worldAnchorB, { maxLength = null } = {}) {
    const a = this._bodies.get(handleA), b = this._bodies.get(handleB)
    const la = [0, 0, 0], lb = [0, 0, 0]
    _b3.b3Body_GetLocalPoint(la, a.id, [worldAnchorA.x, worldAnchorA.y, worldAnchorA.z])
    _b3.b3Body_GetLocalPoint(lb, b.id, [worldAnchorB.x, worldAnchorB.y, worldAnchorB.z])
    const jd = _b3.b3DefaultDistanceJointDef()
    jd.base.bodyIdA = a.id
    jd.base.bodyIdB = b.id
    jd.base.localFrameA = { position: la, quaternion: [0, 0, 0, 1] }
    jd.base.localFrameB = { position: lb, quaternion: [0, 0, 0, 1] }
    const dx = worldAnchorB.x - worldAnchorA.x, dy = worldAnchorB.y - worldAnchorA.y, dz = worldAnchorB.z - worldAnchorA.z
    jd.length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (maxLength != null) { jd.enableLimit = true; jd.minLength = 0; jd.maxLength = maxLength }
    return _b3.b3CreateDistanceJoint(this._world, jd)   // opaque to callers; only destroyJoint consumes it
  }

  destroyJoint (joint) { _b3.b3DestroyJoint(joint, true) }

  /** Monotonic revision — bumps on body create/destroy (debug-viz change detection). */
  get revision () { return this._rev }

  /** Snapshot of every body for the debug wireframes: opaque handle + what was created. */
  debugBodies () {
    const out = []
    for (const [handle, rec] of this._bodies) {
      out.push({ handle, userData: rec.userData, dynamic: this.isDynamic(handle), specs: rec.specs })
    }
    return out
  }

  /** Counters for the debug HUD / perf harness. */
  counters () {
    const c = _b3.b3World_GetCounters(this._world)
    return { bodies: c.bodyCount, shapes: c.shapeCount, contacts: c.contactCount, awakeContacts: c.awakeContactCount }
  }

  dispose () {
    if (this._contactsBuf) { _b3.destroyContactsBuffer(this._contactsBuf); this._contactsBuf = null }
    _b3.b3DestroyWorld(this._world)
    for (const hf of this._heightfields.values()) _b3.b3DestroyHeightField(hf)
    this._heightfields.clear()
    for (const list of this._meshDatas.values()) for (const m of list) _b3.b3DestroyMesh(m)
    this._meshDatas.clear()
    for (const h of this._hulls) _b3.b3DestroyHull(h)
    this._hulls.length = 0
    this._bodies.clear()
    this._shapeToHandle.clear()
  }
}

/** One-call convenience: load WASM (idempotent) and construct a world. */
export async function createPhysicsEngine (opts) {
  await initPhysicsEngine()
  return new PhysicsEngine(opts)
}
