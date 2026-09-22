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

/**
 * drum-closed's chime radius [m] — the widest ring, which is what a stacked drum actually rests
 * on. Same 0.290 the density note above derives the hull volume from; kept as a named export so
 * the headless gate lays out its cylinders on the SAME number rather than a copy that can drift.
 */
export const STACK_RADIUS = 0.29

/**
 * drum-closed's barrel length [m] — the flat-end-to-flat-end stacking pitch.
 */
export const STACK_HEIGHT = 0.85

/**
 * Drums stack UPRIGHT, and the model's axis is already +Y, so the stacking attitude is identity.
 *
 * Not a shrug — it is the finding. The first cut of this laid the barrels on their sides in a
 * hex-close-packed 3-2-1 pyramid, which is the picture everyone has of stacked barrels, and it
 * collapsed in the gate every time: a side-lying cylinder ROLLS, so the outer base barrels squirt
 * out sideways under the load from above and the pyramid flattens to two rows (measured 0.65 m of
 * base spread). That is honest physics — a real barrel pyramid needs chocks or a wall, which the
 * ground does not provide. Upright drums rest flat circular face on flat circular face, which is
 * how a real yard stacks them and the only arrangement that is stable unaided.
 */
export const STACK_QUAT = { x: 0, y: 0, z: 0, w: 1 }

/**
 * A stack of upright drums — ground-relative offsets, bottom layer first.
 *
 * PURE and DETERMINISTIC: no Math.random, no time, no engine, no THREE. Same arguments ⇒ same
 * array, every call, in any realm. That is the whole point — `test/debris-stack.mjs` asserts the
 * settled pile is reproducible, and it can only do that if the SETUP is reproducible first.
 *
 * Layers of three in a triangle, each drum resting squarely on the one below. Three mutually
 * touching circles of radius R have their centres 2R apart, which puts each on a circumradius of
 * 2R/√3 from the stack axis. Layers are one barrel height apart plus `gap`, which starts them a
 * hair clear so the stack SETTLES into contact under gravity rather than spawning interpenetrated
 * — an overlapping spawn kicks the solver on step one and is not what a pile at rest looks like.
 *
 * A remainder fills its layer partially; two drums lean, one stands alone, both of which are what
 * a half-finished stack actually looks like.
 *
 * @param {number} count - how many barrels.
 * @param {number} radius - barrel radius [m].
 * @param {number} height - barrel length [m].
 * @param {number} gap - initial clearance between layers [m].
 * @returns {Array<{x:number,y:number,z:number}>} centres, relative to the stack's ground origin.
 */
export function stackLayout (count = 6, radius = STACK_RADIUS, height = STACK_HEIGHT, gap = 0.01) {
  const out = []
  const ring = 2 * radius / Math.sqrt(3)     // circumradius of three mutually touching circles
  const pitch = height + gap
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / 3)
    const a = (i % 3) * (2 * Math.PI / 3) + Math.PI / 2
    out.push({
      x: ring * Math.cos(a),
      y: height / 2 + layer * pitch,
      z: ring * Math.sin(a),
    })
  }
  return out
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
  spawn (kind, position, velocity, opts = {}) {
    const spec = DEBRIS_TYPES[kind]
    const proto = this._proto.get(kind)
    if (!spec || !proto) return null   // model still loading (first seconds of a cold boot)

    // The random tumble sells a THROW and must not leak into a stack: `spin` and `quaternion` let
    // a deterministic caller (spawnStack) opt out of Math.random entirely. Default stays random.
    const spin = opts.spin ?? {
      x: (Math.random() * 2 - 1) * 3,
      y: (Math.random() * 2 - 1) * 3,
      z: (Math.random() * 2 - 1) * 3,
    }
    const body = this._eng.createBody({
      type: 'dynamic',
      position,
      quaternion: opts.quaternion,
      linearVelocity: velocity,
      angularVelocity: spin,
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

  /**
   * Spawn a settled-by-gravity barrel pyramid at a ground point (FEAT-36 gap 3: object↔object).
   *
   * Fully deterministic — zero velocity, zero spin, fixed attitude, `stackLayout` geometry. The
   * only pile the game has ever had: everything else here is player-thrown, which is why stacking
   * was the one acceptance line the throw slice could not exercise.
   *
   * `origin.y` is GROUND level, not a centre: the layout lifts each barrel by its own radius.
   * Respects DEBRIS_CAP through spawn(), so a stack bigger than the cap eats its own base — the
   * caller clamps rather than relying on that.
   *
   * @param {string} kind - DEBRIS_TYPES key.
   * @param {{x:number,y:number,z:number}} origin - ground point under the pyramid's apex.
   * @param {number} count - barrels in the stack.
   * @returns {Array<*>} the spawned body handles (empty if the model is still loading).
   */
  spawnStack (kind, origin, count = 6) {
    const zero = { x: 0, y: 0, z: 0 }
    const bodies = []
    for (const off of stackLayout(count)) {
      const body = this.spawn(kind,
        { x: origin.x + off.x, y: origin.y + off.y, z: origin.z + off.z },
        zero, { spin: zero, quaternion: STACK_QUAT })
      if (!body) break        // model not loaded yet — don't leave half a pyramid
      bodies.push(body)
    }
    return bodies
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
