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

/** Category bits as a 32-bit number. Every real group is a single low bit and GROUP_ALL is all
 *  ones, so the low half is exact — and `&` on numbers is far cheaper than on BigInts, which
 *  matters in the per-shape filter test below. */
function _group32 (group) { return Number(BigInt.asUintN(32, group ?? GROUP_STATIC)) }

/** Obstacle size reported to the tire model as `sizeR`. NOT the same thing as _specReach: this is
 *  a feel parameter the tire envelope consumes, so a sphere reports its own radius and ignores any
 *  body-local offset, and shapes with no pair test wired report nothing (contactSphere falls back
 *  to 0.3). Changing these values changes how the tire climbs obstacles. */
function _specSizeR (spec) {
  if (!spec) return undefined
  switch (spec.shape) {
    case 'sphere': return spec.radius
    case 'cylinder': return Math.hypot(spec.radius, spec.height / 2 + Math.abs(spec.yOffset))
    case 'hull': {
      let m = 0
      const p = spec.positions
      for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.hypot(p[i], p[i + 1], p[i + 2]))
      return m
    }
    default: return undefined
  }
}

/** Bounding radius of a collider about its BODY origin — the cheap reject in contactSphere. */
function _specReach (spec) {
  if (!spec) return Infinity
  switch (spec.shape) {
    case 'box': return Math.hypot(spec.halfExtents.x, spec.halfExtents.y, spec.halfExtents.z)
    case 'sphere': return spec.radius + Math.hypot(spec.offset.x, spec.offset.y, spec.offset.z)
    case 'capsule': return spec.radius +
      Math.max(Math.hypot(spec.p1.x, spec.p1.y, spec.p1.z), Math.hypot(spec.p2.x, spec.p2.y, spec.p2.z))
    case 'cylinder': return Math.hypot(spec.radius, spec.height / 2 + Math.abs(spec.yOffset))
    case 'hull': {
      let m = 0
      const p = spec.positions
      for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.hypot(p[i], p[i + 1], p[i + 2]))
      return m
    }
    default: return Infinity   // mesh / heightfield — contactSphere skips those bodies outright
  }
}

let _b3 = null            // the loaded engine module — module-private, never exported

/**
 * Rotate a plain {x,y,z} by a quaternion given as [x,y,z,w]. Local to this module so the adapter
 * stays dependency-free (it imports nothing but the engine); the standard v' = q·v·q* expanded.
 */
function _rotateByQuat (v, q) {
  const [qx, qy, qz, qw] = q
  const ix =  qw * v.x + qy * v.z - qz * v.y
  const iy =  qw * v.y + qz * v.x - qx * v.z
  const iz =  qw * v.z + qx * v.y - qy * v.x
  const iw = -qx * v.x - qy * v.y - qz * v.z
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
}

// The IN-FLIGHT load, not just the finished one. `if (!_b3) _b3 = await Box3DFactory()` is idempotent
// for SEQUENTIAL callers and quietly broken for CONCURRENT ones: both see _b3 null, both instantiate
// the module, and the second assignment replaces the instance the first caller's world was created
// in. Every later _b3.* call then addresses the wrong module — bodies vanish from their world, ids
// resolve to garbage, and b3World_Step spins on it. FEAT-41's menu stage is the first thing to call
// this concurrently with main.js's own boot, which is how it surfaced. Cache the PROMISE so both
// callers await one load and end up on one module.
let _b3Loading = null

/** Load the engine WASM once. Idempotent, including under concurrent callers. */
export async function initPhysicsEngine () {
  if (!_b3) {
    _b3Loading ??= Box3DFactory()
    _b3 = await _b3Loading
  }
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
    this._dynamic = new Map()              // the isDynamic subset of _bodies, same records and order
    this._shapeToHandle = new Map()        // shapeId.index1<<21|generation-ish key → body handle
    this._nextHandle = 1
    this._heightfields = new Map()         // handle → b3HeightFieldData (owned, freed on destroy)
    this._meshDatas = new Map()            // handle → b3MeshData[] (owned, freed on destroy)
    // Hull data and the tire size hint live on the BODY RECORD, indexed by shape slot — they used
    // to be shapeKey-keyed Maps, which is precisely the surface BUG-60/61/62 all failed on: entries
    // outliving their shape, or colliding with a recycled slot's key. Per-slot storage dies with the
    // body and cannot alias. (_shapeToHandle has to stay a Map: engine contact callbacks hand us a
    // shape id and nothing else.)

    // Scratch out-params — the bindings write into caller-provided arrays; reuse
    // to keep the per-frame allocation at zero on the hot read paths.
    this._v = [0, 0, 0]; this._w = [0, 0, 0]
    this._rev = 0                          // bumped on body create/destroy — debug viz change detection
    this._xfStamp = 1                      // bumped per step — invalidates the per-body transform cache
  }

  /** Advance the world by dt with the given solver substep count. Synchronous. */
  step (dt, substeps = 4) {
    _b3.b3World_Step(this._world, dt, substeps)
    this._xfStamp++          // every cached body transform is now stale (see _bodyXf)
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
    // isStatic / isDynamic are fixed at creation (the adapter has no set-type call), so the
    // per-query filters read them here instead of asking the engine across the WASM boundary.
    const rec = { id, shapes: [], specs: [], userData,
      isStatic: type === 'static', isDynamic: type !== 'static' && type !== 'kinematic',
      groups: [], reach: [], hulls: [], sizeR: [],
      xfP: [0, 0, 0], xfQ: [0, 0, 0, 1], xfStamp: null }
    this._bodies.set(handle, rec)
    if (rec.isDynamic) this._dynamic.set(handle, rec)
    this._rev++
    return handle
  }

  /** Destroy a body and everything attached to it. */
  destroyBody (handle) {
    const rec = this._bodies.get(handle)
    if (!rec) return
    this._rev++
    // BUG-60: a stale _shapeToHandle entry is a live shape's slot waiting to be misattributed once
    // Box3D recycles it. BUG-62: the body owns its hull copies, so they go with it — this used to
    // be the only reclaim path and it was dispose(), i.e. never during play.
    for (let i = 0; i < rec.shapes.length; i++) {
      this._shapeToHandle.delete(this._shapeKey(rec.shapes[i]))
      this._freeHull(rec.hulls[i])
    }
    _b3.b3DestroyBody(rec.id)              // destroys attached shapes with it
    const hf = this._heightfields.get(handle)
    if (hf) { _b3.b3DestroyHeightField(hf); this._heightfields.delete(handle) }
    const mds = this._meshDatas.get(handle)
    if (mds) { for (const m of mds) _b3.b3DestroyMesh(m); this._meshDatas.delete(handle) }
    this._bodies.delete(handle)
    this._dynamic.delete(handle)
  }

  getUserData (handle) { return this._bodies.get(handle)?.userData ?? null }

  /** True if the handle refers to a dynamic body. */
  isDynamic (handle) { return !!this._bodies.get(handle)?.isDynamic }

  // ── Colliders ─────────────────────────────────────────────────────────────

  _shapeDef ({ friction = 0.6, restitution = 0, density = 1000, group = GROUP_STATIC, collidesWith = GROUP_ALL,
               rollingResistance = 0, hitEvents = false, updateBodyMass = true } = {}) {
    const sd = _b3.b3DefaultShapeDef()
    sd.baseMaterial.friction = friction
    sd.baseMaterial.restitution = restitution
    sd.baseMaterial.rollingResistance = rollingResistance
    sd.density = density
    sd.filter.categoryBits = group
    sd.filter.maskBits = collidesWith
    sd.enableHitEvents = hitEvents        // per-contact impact events (wear-model seam)
    // Adding a shape RE-DERIVES the body's mass from its shapes' densities by default. Bodies whose
    // mass was pinned with setMassData (the chassis) must opt out, or a shape swap silently throws
    // the pinned mass and inertia away — which reads as the truck no longer settling on flat ground.
    sd.updateBodyMass = updateBodyMass
    return sd
  }

  /** Shape identity for _shapeToHandle. The multiplier MUST exceed any reachable `generation`:
   *  Box3D recycles shape slots and bumps the generation each time, and updateWheelRims rebuilds
   *  four wheel-core hulls per step (~55/s per wheel while the suspension works), so a slot passed
   *  the old 0x10000 multiplier in ~20 minutes of driving and slot n aliased slot n+1 (BUG-61).
   *  2**32 keeps the product exact for index1 up to ~2M slots, well inside Number.MAX_SAFE_INTEGER. */
  _shapeKey (shapeId) { return shapeId.index1 * 4294967296 + shapeId.generation }

  /** spec: a plain descriptor of the shape as CREATED (body-local geometry) — the debug
   *  wireframe source of truth (physics-debug.js). Never read by the engine. */
  _register (handle, shapeId, spec, material = {}, hull = null) {
    const rec = this._bodies.get(handle)
    rec.shapes.push(shapeId)
    rec.specs.push(spec)
    rec.groups.push(_group32(material.group))
    rec.reach.push(_specReach(spec))
    rec.hulls.push(hull)                   // BUG-62: this body owns it; freed with the slot
    rec.sizeR.push(_specSizeR(spec))
    this._shapeToHandle.set(this._shapeKey(shapeId), handle)
    return shapeId
  }

  /**
   * Release one slot's hull (BUG-62). Safe because the world COPIES hull data into its own database
   * on shape creation — vendor/box3d README: "safe — world keeps its own copy" — so the copy we
   * hold exists only for OUR narrow-phase in contactSphere. Mesh and heightfield data are NOT
   * copied and are freed on their own paths; do not follow this pattern for those.
   *
   * b3DestroyHull and the handle's own .delete() are ALTERNATIVES, not a pair. Calling both is a
   * double free that corrupts the WASM allocator, and it does not fail where you would notice it:
   * 60 000 standalone hulls took both calls without complaint, but through this method the next
   * b3CreateHull went out of bounds on the FIFTH wheel-core rebuild. Destroy only.
   */
  _freeHull (hull) {
    if (!hull) return
    _b3.b3DestroyHull(hull)
  }

  /** Cached body transform. The bindings' GetTransform is a WASM call; contactSphere reads every
   *  body's pose and runs ~16x per step, so fetching per call cost more than the query itself.
   *  getTransform reads through the same cache (debris.js snapshots every body each step).
   *  Poses only change when the world steps (_xfStamp) or setTransform runs — statics not even
   *  then, so they are fetched once and held. */
  _bodyXf (rec) {
    if (rec.isStatic ? rec.xfStamp === -1 : rec.xfStamp === this._xfStamp) return
    _b3.b3Body_GetTransform(rec.xfP, rec.xfQ, rec.id)
    rec.xfStamp = rec.isStatic ? -1 : this._xfStamp
  }

  /** Box collider. halfExtents {x,y,z}; centered on the body origin. */
  addBox (handle, halfExtents, material = {}) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateBoxShape(rec.id, this._shapeDef(material),
      halfExtents.x, halfExtents.y, halfExtents.z), { shape: 'box', halfExtents: { ...halfExtents } }, material)
  }

  /** Sphere collider at local offset (default body origin). Returns the shape INDEX on the
   *  body (stable — shapes are only ever appended), and stays valid across replaceHullLocal. */
  addSphere (handle, radius, material = {}, offset = { x: 0, y: 0, z: 0 }) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateSphereShape(rec.id, this._shapeDef(material),
      { center: [offset.x, offset.y, offset.z], radius }), { shape: 'sphere', radius, offset: { ...offset } }, material)
    return rec.shapes.length - 1
  }

  /** How many collider shapes a body currently has — callers hold indices into this. */
  shapeCount (handle) { return this._bodies.get(handle).shapes.length }

  /**
   * Replace an existing hull shape in place, keeping its shape INDEX stable.
   *
   * Box3D can mutate a sphere (b3Shape_SetSphere) and a capsule, but a hull has no setter — its
   * points are baked at creation. A hull that has to MOVE within its body therefore has to be
   * rebuilt, and a destroy+add would append the replacement at the end. Callers hold shape indices
   * (the wheel cores do), so the new shape takes the old one's slot instead.
   *
   * Body mass is NOT recomputed on either half: this project sets chassis mass explicitly with
   * setMassData after construction, and letting a shape swap re-derive it from densities would
   * silently overwrite that.
   */
  replaceHullLocal (handle, shapeIndex, positions, material = {}) {
    const rec = this._bodies.get(handle)
    const oldId = rec.shapes[shapeIndex]
    const oldHull = rec.hulls[shapeIndex]
    this._shapeToHandle.delete(this._shapeKey(oldId))
    _b3.b3DestroyShape(oldId, false)
    const hull = _b3.b3CreateHull(positions)
    const shapeId = _b3.b3CreateHullShape(rec.id, this._shapeDef(material), hull)
    rec.shapes[shapeIndex] = shapeId
    rec.specs[shapeIndex] = { shape: 'hull', positions: Array.from(positions) }
    rec.groups[shapeIndex] = _group32(material.group)
    rec.reach[shapeIndex] = _specReach(rec.specs[shapeIndex])
    rec.hulls[shapeIndex] = hull
    rec.sizeR[shapeIndex] = _specSizeR(rec.specs[shapeIndex])
    this._shapeToHandle.set(this._shapeKey(shapeId), handle)
    // BUG-62: the shape this hull built is gone, so its copy goes too. This runs EVERY step per
    // wheel — retaining them leaked ~1.5 KB a rebuild for as long as the player kept driving.
    this._freeHull(oldHull)
    this._rev++
    return shapeId
  }

  /** Capsule collider between two local points. */
  addCapsule (handle, p1, p2, radius, material = {}) {
    const rec = this._bodies.get(handle)
    this._register(handle, _b3.b3CreateCapsuleShape(rec.id, this._shapeDef(material),
      { center1: [p1.x, p1.y, p1.z], center2: [p2.x, p2.y, p2.z], radius }),
    { shape: 'capsule', p1: { ...p1 }, p2: { ...p2 }, radius }, material)
  }

  /**
   * Upright cylinder collider (a convex hull under the hood — the engine has no
   * native cylinder shape). height along local Y, BASE at yOffset — the shape
   * spans yOffset … yOffset + height, it is not centred there.
   *
   * (Measured 2026-09-22: dropped with yOffset 0, a cylinder rests with its body
   * origin at ground level, not half a height up. The docstring said "centered"
   * and callers placing a cylinder by its centre were silently half a height out
   * — pass yOffset = −height/2 to centre it on the body origin.)
   */
  addCylinder (handle, height, radius, material = {}, yOffset = 0, sides = 12) {
    const rec = this._bodies.get(handle)
    const hull = _b3.b3CreateCylinder(height, radius, yOffset, sides)
    this._register(handle, _b3.b3CreateHullShape(rec.id, this._shapeDef(material), hull),
      { shape: 'cylinder', height, radius, yOffset, sides }, material, hull)
  }

  /** Convex hull collider from a flat [x0,y0,z0, x1,…] position array. */
  addHull (handle, positions, material = {}) {
    const rec = this._bodies.get(handle)
    const hull = _b3.b3CreateHull(positions)
    this._register(handle, _b3.b3CreateHullShape(rec.id, this._shapeDef(material), hull),
      { shape: 'hull', positions: Array.from(positions) }, material, hull)
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
      { shape: 'mesh', positions, indices }, material)   // references, not copies — same arrays the caller owns
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
      { shape: 'heightfield' }, { group: GROUP_TERRAIN, ...material })   // viz skips these — the terrain mesh IS the collider
  }

  // ── State access ──────────────────────────────────────────────────────────

  /** Read body transform into out objects (THREE.Vector3/Quaternion compatible). */
  getTransform (handle, outPos, outQuat) {
    const rec = this._bodies.get(handle)
    this._bodyXf(rec)        // shares contactSphere's per-step cache: one WASM fetch per body per step
    const p = rec.xfP, q = rec.xfQ
    outPos.x = p[0]; outPos.y = p[1]; outPos.z = p[2]
    outQuat.x = q[0]; outQuat.y = q[1]; outQuat.z = q[2]; outQuat.w = q[3]
  }

  setTransform (handle, position, quaternion) {
    const rec = this._bodies.get(handle)
    _b3.b3Body_SetTransform(rec.id, [position.x, position.y, position.z],
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w])
    rec.xfStamp = null       // a static body just moved: drop its cached transform
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

  /** Live-update friction/restitution on a body's shapes (debug sliders): every shape, or only
   *  the shape indices in `only` when a body mixes materials (the chassis does). */
  setMaterial (handle, { friction = null, restitution = null } = {}, only = null) {
    const shapes = this._bodies.get(handle).shapes
    for (let i = 0; i < shapes.length; i++) {
      if (only && !only.includes(i)) continue
      if (friction != null) _b3.b3Shape_SetFriction(shapes[i], friction)
      if (restitution != null) _b3.b3Shape_SetRestitution(shapes[i], restitution)
    }
  }

  isAwake (handle) { return _b3.b3Body_IsAwake(this._bodies.get(handle).id) }
  /** Toggle continuous (swept) collision against other dynamic bodies. A bullet never sweeps
   *  against another bullet — the lever debris.js flagCargo() pulls for cargo riding the truck. */
  setBullet (handle, flag) { _b3.b3Body_SetBullet(this._bodies.get(handle).id, flag) }
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
   * EXACT sphere-vs-debris contact query using the engine's own narrow-phase pair tests
   * (b3CollideSpheres / b3CollideHullAndSphere) — penetration depth is CONTINUOUS through
   * full containment and the normal never degenerates, unlike a closest-point probe (which
   * jumps to full radius and inverts once the query center enters a hull — the source of the
   * 2026-08-15 rock-contact defect family). Convention out: normal points OUT of the solid
   * toward the sphere center; depth > 0 is penetration.
   *
   * CANDIDATES ARE ENUMERATED HERE, NOT BY b3World_OverlapShape (BUG-60, 2026-09-07).
   * The engine's world query intermittently stops reporting a perfectly healthy shape while
   * shapes are being created and destroyed near it — and updateWheelRims does exactly that,
   * rebuilding four wheel-core hulls every step (a hull has no setter), ~1000 shape
   * create/destroys per second. On the FEAT-41 menu stage that dropped the static rock out of
   * this query for whole runs at a time and the wheel settled INSIDE it, at ground height, with
   * the rock still drawn around it. Measured at every failing sample: the rock's body transform,
   * shape id, hull data, a per-body b3Body_OverlapShape and the raw b3CollideHullAndSphere were
   * ALL correct — only the world broad phase disagreed, and only for wheel-sized query spheres
   * (a 2 m one still found it). So the geometry was never the casualty; the spatial index was.
   *
   * Walking our own bodies is not the downgrade it looks like. The reject is a sphere test about
   * the body origin against `rec.reach[]` (each shape's bounding radius, computed once at
   * registration), body poses are cached per step by _bodyXf, and heightfield/mesh bodies are
   * skipped before they cost anything. Measured 1.6 us/call at 14 bodies and 3.6 us at 126,
   * against a flat ~2.4 us for the engine query it replaces — i.e. faster in the small worlds
   * this runs in and ~0.23 ms per 60 Hz frame at 126 bodies. Group filtering matches the engine's
   * rule (shape.categoryBits & query.maskBits), on 32-bit numbers rather than BigInts.
   * Gate: test/collider-seam-churn.mjs.
   *
   * Manifold conventions (probed empirically 2026-08-15):
   *   b3CollideSpheres(A, B, xfB)        → normal A→B, separation = −penetration
   *   b3CollideHullAndSphere(hull, s, xf) → hull is at IDENTITY (its own frame); normal
   *                                         hull→sphere; results in hull-local coordinates.
   */
  contactSphere (center, radius, { collidesWith = GROUP_ALL, dynamicOnly = false } = {}) {
    const hits = []
    const mask = _group32(collidesWith)
    // dynamicOnly (every wheel query, 20×/step) walks only the dynamic bodies — not the terrain,
    // road, prop and POI statics, which outnumber them ~100:1. Same insertion order, same hits.
    for (const [handle, rec] of dynamicOnly ? this._dynamic : this._bodies) {
      // Heightfields and meshes have no sphere pair test wired (the analytic terrain query owns
      // those surfaces), so skip them before paying for a transform.
      if (this._heightfields.has(handle) || this._meshDatas.has(handle)) continue
      this._bodyXf(rec)
      const bp = rec.xfP, bq = rec.xfQ
      const dx = center.x - bp[0], dy = center.y - bp[1], dz = center.z - bp[2]
      const d2 = dx * dx + dy * dy + dz * dz
      for (let si = 0; si < rec.shapes.length; si++) {
        if ((rec.groups[si] & mask) === 0) continue
        const span = radius + rec.reach[si]
        if (d2 > span * span) continue          // cheap reject about the body origin
        // What kind of shape this slot holds is known from how it was registered: a sphere spec is
        // an engine sphere, and a slot that owns hull data (addHull / addCylinder / replaceHullLocal)
        // is an engine hull. Boxes and capsules own no hull data and fall through.
        const hull = rec.hulls[si]
        let manifold = null
        let hullLocal = false   // hull results come back hull-local — rotate/translate out
        if (rec.specs[si].shape === 'sphere') {
          const sph = _b3.b3Shape_GetSphere(rec.shapes[si])
          manifold = _b3.b3CollideSpheres({ center: [center.x, center.y, center.z], radius }, sph,
            { position: [bp[0], bp[1], bp[2]], quaternion: [bq[0], bq[1], bq[2], bq[3]] })
          // normal is A→B = wheel→solid; our convention wants solid→wheel
          if (manifold && manifold.points.length) {
            manifold = { normal: [-manifold.normal[0], -manifold.normal[1], -manifold.normal[2]], points: manifold.points }
          }
        } else if (hull) {
          // Express the sphere in the hull's (= body's) local frame: l = q⁻¹·(c − p)
          const l = _rotateByQuat({ x: dx, y: dy, z: dz }, [-bq[0], -bq[1], -bq[2], bq[3]])
          manifold = _b3.b3CollideHullAndSphere(hull, { center: [0, 0, 0], radius },
            { position: [l.x, l.y, l.z], quaternion: [0, 0, 0, 1] })
          hullLocal = true
        } else {
          continue   // debris is spheres and hulls today; other types have no pair test wired
        }
        if (!manifold || !manifold.points.length) continue
        // Deepest manifold point carries the contact
        let deep = manifold.points[0]
        for (const pt of manifold.points) if (pt.separation < deep.separation) deep = pt
        if (deep.separation >= 0) continue
        let n  = { x: manifold.normal[0], y: manifold.normal[1], z: manifold.normal[2] }
        let cp = { x: deep.point[0], y: deep.point[1], z: deep.point[2] }
        if (hullLocal) {
          n  = _rotateByQuat(n, bq)
          cp = _rotateByQuat(cp, bq)
          cp.x += bp[0]; cp.y += bp[1]; cp.z += bp[2]
        }
        hits.push({
          body: handle,
          normal: n,
          depth: -deep.separation,
          contactPoint: cp,
          sizeR: rec.sizeR[si] ?? 0.3,   // obstacle size for tire enveloping
        })
      }
    }
    return hits
  }

  /**
   * Per-body contact readout: the hardest normal impulse currently on the body's manifolds,
   * WITH where it landed — in the body's own frame, so callers never touch engine types.
   *
   * The SM-3 wear model subscribes here (FEAT-36's causesDamage flag gates the REPORT, not the
   * contact). It needs the location as well as the magnitude: front/left/right/rear armor can only
   * be told apart by where the hit is, and a ground contact under the truck is not an armor hit
   * at all. Both are returned for the SAME manifold point — the hardest one — so magnitude and
   * position always describe one event.
   *
   * Frame notes: `anchorA`/`anchorB` are world-space OFFSETS from their body's center of mass, and
   * this project seats the chassis body origin AT the CG, so rotating the anchor by the body's
   * inverse rotation lands directly in body-local coordinates. The manifold normal is world-space
   * and its SIGN depends on which shape the engine picked as A, so callers must use magnitudes
   * only — see classifyImpactRegion in physics.js.
   *
   * @param {*} handle - body handle.
   * @param {Float64Array|Array} [outByShape] - if given, filled with THIS STEP's peak normal impulse
   *   on EACH of the body's shapes (indexed as they were added); divide by dt for contact force.
   *   Lets a caller tell a wheel-core hit from a body hull hit without the engine knowing what
   *   either means. Allocation-free: reused by the caller.
   * @returns {{impulse: number, point: {x,y,z}|null, normal: {x,y,z}|null}}
   *   impulse = the hardest point's accumulated normal impulse (what point/normal describe);
   *   point/normal body-local.
   */
  maxContactImpulse (handle, outByShape = null) {
    const rec = this._bodies.get(handle)
    if (outByShape) outByShape.fill(0)
    if (!this._contactsBuf) this._contactsBuf = _b3.createContactsBuffer()
    const buf = _b3.getBodyContactData(this._contactsBuf, rec.id)
    const none = { impulse: 0, point: null, normal: null }
    const n = _b3.getNumContacts(buf)
    if (n === 0) return none
    // Reused across steps: this runs every physics step, and createContact/createManifold each
    // allocate a wasm-backed struct.
    const contact  = this._contactScratch  || (this._contactScratch  = _b3.createContact())
    const manifold = this._manifoldScratch || (this._manifoldScratch = _b3.createManifold())
    let max = 0, anchor = null, worldN = null
    for (let i = 0; i < n; i++) {
      _b3.getContactAt(contact, buf, i)
      // Which side of the pair is US: the anchor is measured from that body, so picking the wrong
      // one would offset every impact by the gap between the two bodies' centers.
      const aIsSelf = this._shapeToHandle.get(this._shapeKey(contact.shapeIdA)) === handle
      // A body flagged `noDamage` (haul cargo riding in the bed, FEAT-88) is invisible to this
      // readout: its contacts are real, but it is not something the truck collides WITH — a
      // bundle sliding into the bedside is not a side impact. The REPORT is gated, never the contact.
      const other = this._shapeToHandle.get(this._shapeKey(aIsSelf ? contact.shapeIdB : contact.shapeIdA))
      if (other !== undefined && this._bodies.get(other)?.userData?.noDamage) continue
      // Which of OUR shapes this contact is on — once per contact, not once per manifold point.
      let si = -1
      if (outByShape) {
        const selfKey = this._shapeKey(aIsSelf ? contact.shapeIdA : contact.shapeIdB)
        si = rec.shapes.findIndex(sh => this._shapeKey(sh) === selfKey)
      }
      for (let m = 0; m < contact.manifoldCount; m++) {
        _b3.getManifoldAt(manifold, contact, m)
        for (let k = 0; k < manifold.pointCount; k++) {
          const pt = manifold.points[k]
          // Per-SHAPE peak, when the caller wants attribution. The chassis is a QUAL-25 compound —
          // four body hulls plus four wheel hard cores — and which shape took a hit is the whole
          // difference between "the bumper hit a tree" and "the rim hit a rock".
          // THIS STEP's impulse, not the lifetime total: divided by dt it is the contact FORCE,
          // which is what a yield criterion needs. totalNormalImpulse keeps accumulating while a
          // contact persists, so it measures how long something was leaned on, not how hard it
          // was hit — a slow crawl onto a rock out-reads a fast strike.
          if (si >= 0 && pt.normalImpulse > outByShape[si]) outByShape[si] = pt.normalImpulse
          if (pt.totalNormalImpulse <= max) continue
          max = pt.totalNormalImpulse
          const a = aIsSelf ? pt.anchorA : pt.anchorB
          anchor = { x: a[0] ?? a.x, y: a[1] ?? a.y, z: a[2] ?? a.z }
          const nv = manifold.normal
          worldN = { x: nv[0] ?? nv.x, y: nv[1] ?? nv.y, z: nv[2] ?? nv.z }
        }
      }
    }
    if (max === 0 || !anchor) return none
    // World → body frame. b3Body_GetLocalPoint would add the body TRANSLATION, which the anchor
    // does not carry (it is already an offset), so rotate by the inverse rotation instead.
    const q = [0, 0, 0, 1]
    _b3.b3Body_GetRotation(q, rec.id)
    const inv = [-(q[0] ?? q.x), -(q[1] ?? q.y), -(q[2] ?? q.z), (q[3] ?? q.w)]
    return { impulse: max, point: _rotateByQuat(anchor, inv), normal: _rotateByQuat(worldN, inv) }
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

  /**
   * Rigid weld holding two bodies at their CURRENT relative pose (FEAT-96 strapped cargo). Hertz 0
   * on both axes = rigid. Joined bodies stop colliding with each other, so a load welded in the bed
   * never fights the bed floor. Destroying either body destroys the joint with it.
   */
  createWeldJoint (handleA, handleB, worldAnchor) {
    const frame = (id) => {
      const lp = [0, 0, 0], q = [0, 0, 0, 1]
      _b3.b3Body_GetLocalPoint(lp, id, [worldAnchor.x, worldAnchor.y, worldAnchor.z])
      _b3.b3Body_GetRotation(q, id)
      // Frame rotation = the body's inverse, so both frames line up with the world axes now.
      return { position: lp, quaternion: [-(q[0] ?? q.x), -(q[1] ?? q.y), -(q[2] ?? q.z), (q[3] ?? q.w)] }
    }
    const jd = _b3.b3DefaultWeldJointDef()
    jd.base.bodyIdA = this._bodies.get(handleA).id
    jd.base.bodyIdB = this._bodies.get(handleB).id
    jd.base.localFrameA = frame(jd.base.bodyIdA)
    jd.base.localFrameB = frame(jd.base.bodyIdB)
    jd.linearHertz = 0
    jd.angularHertz = 0
    return _b3.b3CreateWeldJoint(this._world, jd)
  }

  destroyJoint (joint) { _b3.b3DestroyJoint(joint, true) }

  /**
   * The force a joint applied over the last step [N], world frame (FEAT-97: the strap's pull on a
   * fragile load — ÷ its mass is the acceleration the load feels). Reuses _v as the out buffer.
   */
  jointForce (joint, out) {
    _b3.b3Joint_GetConstraintForce(this._v, joint)
    out.x = this._v[0]; out.y = this._v[1]; out.z = this._v[2]
    return out
  }

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
    return { bodies: c.bodyCount, shapes: c.shapeCount, joints: c.jointCount, contacts: c.contactCount, awakeContacts: c.awakeContactCount }
  }

  dispose () {
    if (this._contactsBuf) { _b3.destroyContactsBuffer(this._contactsBuf); this._contactsBuf = null }
    _b3.b3DestroyWorld(this._world)
    for (const hf of this._heightfields.values()) _b3.b3DestroyHeightField(hf)
    this._heightfields.clear()
    for (const list of this._meshDatas.values()) for (const m of list) _b3.b3DestroyMesh(m)
    this._meshDatas.clear()
    for (const rec of this._bodies.values()) for (const h of rec.hulls) this._freeHull(h)
    this._bodies.clear()
    this._dynamic.clear()
    this._shapeToHandle.clear()
  }
}

/** One-call convenience: load WASM (idempotent) and construct a world. */
export async function createPhysicsEngine (opts) {
  await initPhysicsEngine()
  return new PhysicsEngine(opts)
}
