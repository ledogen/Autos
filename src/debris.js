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
import { hash32, mulberry32 } from './seed.js'

// Scratch for beforeStep()/update() — no per-body allocation on the per-step path.
const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cqi = new THREE.Quaternion()
const _p = new THREE.Vector3(), _q = new THREE.Quaternion()
// How far outside the bed well a body still counts as cargo: a rock bouncing on the floor or
// riding against a wall must not flicker in and out of the flag.
const CARGO_MARGIN = 0.1     // m, round the floor, walls and tailgate
const CARGO_ABOVE  = 0.6     // m above the rail — a rock on the way in, or heaped above it

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
  // FEAT-88 haul cargo: the shrink-wrapped firewood bundle (~0.75 ft³ — a real one is 10–12 kg),
  // three variants of one load (ASSET-36 kit, data/prop-models.js firewoodBundleA..C). `massKg`
  // instead of a density: a wrapped bundle's hull is mostly air between splits, and the mass the
  // owner picks is the number that matters, so the constructor derives ρ from the hull's own volume
  // (see _hullVolume) — exact on every variant's own hull. Friction is high on purpose: film on a steel bed ribs grips, and a bundle that skates
  // out under braking would be the physics lying, not the player.
  bundleA: { model: 'firewoodBundleA', massKg: 11, friction: 0.8, restitution: 0.05 },
  bundleB: { model: 'firewoodBundleB', massKg: 11, friction: 0.8, restitution: 0.05 },
  bundleC: { model: 'firewoodBundleC', massKg: 11, friction: 0.8, restitution: 0.05 },
  // The stranded motorist's tire, loose in the bed (data/offers.js `loose`). 18 kg = RANGER_PARAMS.wheelMass, the
  // truck's own wheel and tire, as are data/items.js and the offer row. Rubber on the bed ribs grips.
  spareTire: { model: 'spareTire', massKg: 18, friction: 0.9, restitution: 0.3 },
}

/** The three bundle variants, in a fixed order so a hash picks one deterministically. */
export const BUNDLE_KINDS = ['bundleA', 'bundleB', 'bundleC']

/**
 * Is a point, in the truck's BODY-LOCAL frame, inside the open-bed well? One test for every
 * caller — the cargo bullet flag (generous margins, so a body bouncing on the floor does not
 * flicker), the haul aboard count, and the gates — so "in the bed" means one thing.
 *
 * @param {{x:number,y:number,z:number}} p - body-local point (forward = −Z, origin at the CG).
 * @param {object} bed - the model's open-bed spec (data/vehicle-models.js).
 * @param {number} [margin=0] - slack round the walls, floor and tailgate [m].
 * @param {number} [above=CARGO_ABOVE] - how far above the rail still counts [m] — a heaped load.
 */
export function inBedWell (p, bed, margin = 0, above = CARGO_ABOVE) {
  return Math.abs(p.x) < bed.outerHalfW + margin &&
    p.z > bed.frontZ - margin && p.z < bed.gateZ + margin &&
    p.y > bed.floorY - margin && p.y < bed.railY + above
}

/**
 * Where a haul load drops from — body-local points above the bed floor, one per piece, plus each
 * piece's spin, attitude and variant. PURE and DETERMINISTIC (no Math.random, no engine, no THREE):
 * the same key gives the same load every time (SM-INV-12), which is what lets a gate pin it.
 *
 * Pieces fill two lanes inside the wheelhouse walls, front to back, then start the next layer over
 * the gaps — so a 12-piece load lands as a heap rather than as twelve pieces on one spot. Each gets
 * a little hash jitter so the heap does not look laid out by a robot.
 *
 * @param {number} n - pieces.
 * @param {object} bed - open-bed spec.
 * @param {string} key - e.g. `haul:${seed}:${offerId}`.
 * @returns {Array<{x,y,z, spin:{x,y,z}, quaternion:{x,y,z,w}, kind:string}>}
 */
export function bedDropPoints (n, bed, key) {
  const lanes = [-0.25, 0.25]
  const rows = 3
  const z0 = bed.frontZ + 0.35, z1 = bed.tailZ - 0.35
  const out = []
  for (let i = 0; i < n; i++) {
    const r = mulberry32(hash32(`${key}:${i}`))
    const layer = Math.floor(i / (lanes.length * rows))
    const k = i % (lanes.length * rows)
    const row = Math.floor(k / lanes.length)
    const zRow = z0 + (z1 - z0) * (row + (layer % 2) * 0.5) / rows
    const yaw = (r() - 0.5) * 0.6                    // ~±17° off square: lengthwise, roughly
    out.push({
      x: lanes[k % lanes.length] + (r() - 0.5) * 0.1,
      y: bed.floorY,
      z: Math.min(z1, zRow + (r() - 0.5) * 0.1),
      spin: { x: (r() - 0.5) * 2, y: (r() - 0.5) * 2, z: (r() - 0.5) * 2 },
      quaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      kind: BUNDLE_KINDS[Math.floor(r() * BUNDLE_KINDS.length)],
    })
  }
  return out
}

/**
 * Where a STRAPPED load sits (FEAT-96) — the body-local centre of its collider. PURE and
 * DETERMINISTIC (SM-INV-12): the same load in the same bed always lands in the same place.
 *
 * Centred, 2 cm off the front wall, flush on the rib crests (floorY) — the weld holds it there and
 * joined bodies never collide, so a settling gap would float it for the whole drive. A load wider
 * than the gap between the wheelhouses rests on their tops instead, as in a real Ranger. That width
 * is the STRAP-FREE one (the registry's collision size): every strapped model's straps run out to
 * the tie-downs at x = ±0.70, so its mesh reads 1.40 m wide.
 *
 * @param {object} bed - open-bed spec.
 * @param {{x,y,z}} half - the collider's half extents [m] (DebrisSystem.halfExtents).
 * @param {number} [loadHalfW=half.x] - the load's own half width, straps excluded [m].
 * @returns {{x:number, y:number, z:number}}
 */
export function strapPose (bed, half, loadHalfW = half.x) {
  const floor = loadHalfW > bed.wheelhouseHalfW ? bed.wheelhouseY : bed.floorY
  return { x: 0, y: floor + half.y, z: bed.frontZ + half.z + 0.02 }
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

/**
 * The testing lab's barrel cube (main.js _buildBarrelCube): BARREL_CUBE_SIDE × BARREL_CUBE_SIDE
 * drums per layer, BARREL_CUBE_LAYERS high — 7 × 7 × 5 = 245 (owner, 2026-10-14).
 *
 * Sized for the HIT, not for the 60 fps ceiling. test/bench-barrels.mjs (M4 Air, 60 Hz, every drum
 * awake after a full-throttle hit, pass = no 1-second window under 59 fps) put that ceiling near
 * 2000 drums: 1728 (12³) 5/5 pass · 2000 6/6 · 2197 (13³) 2/5 · 2744 (14³) ~35 fps, the crash
 * costing physics ~6 + render ~5 ms a frame at 13³. But a 12³ only held 60 fps at the 39 mph a
 * 150 ft run-up gives — come in faster and the truck wakes more of the pile at once, and it dropped
 * to ~30 fps. 245 drums leaves that ceiling ~8× of headroom for any speed the truck can reach.
 */
export const BARREL_CUBE_SIDE = 7
export const BARREL_CUBE_LAYERS = 5

/**
 * A barrel CUBE — `side` × `side` drums per layer on a square grid, layer on layer, upright, filled
 * bottom-first (a count short of side³ leaves the top layer partial). Ground-relative centres, the
 * grid centred on the origin in XZ. PURE and DETERMINISTIC like stackLayout.
 *
 * Every column stands alone: a `pitchGap` of clear air between neighbours, so no drum leans on the
 * next and a settled cube is `side²` freestanding towers, each its own sleep island. Touching
 * columns would make the whole cube one island (one barrel nudged wakes them all) and hand the
 * solver side-contacts between drums that are only resting face-on-face anyway. Upright drums on
 * flat ends hold a tall tower on their own — test/barrel-cube.mjs settles a full-height one.
 *
 * The layer `gap` is 2 mm, not stackLayout's 1 cm. Every drum free-falls together at spawn, so the
 * top of an N-layer tower falls N gaps before it lands: at 1 cm a 13-high tower closed 13 cm and
 * landed at 1.1 m/s, past the engine's 1 m/s restitution threshold, so it BOUNCED (top layer
 * settled 1.7 cm off its spawn, 0.13° tilt). At 2 mm it peaks at 0.18 m/s and settles 1.0 cm, 0.08°
 * (measured at 13 high).
 *
 * @param {number} count - drums.
 * @param {number} side - drums per row.
 * @param {number} [pitchGap=0.02] - clear air between neighbouring columns [m].
 * @param {number} [gap=0.002] - initial clearance between layers [m].
 * @returns {Array<{x:number,y:number,z:number}>}
 */
export function cubeLayout (count, side, pitchGap = 0.02, gap = 0.002, radius = STACK_RADIUS, height = STACK_HEIGHT) {
  const out = []
  const pitch = 2 * radius + pitchGap
  const c = (side - 1) / 2
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / (side * side))
    const k = i % (side * side)
    out.push({ x: (k % side - c) * pitch, y: height / 2 + layer * (height + gap), z: (Math.floor(k / side) - c) * pitch })
  }
  return out
}

/** The 8 corners of a flat [x,y,z,…] point list's bounding box — the crash-proof fallback hull. */
const HULL_THIN = 40   // points kept by thinHull — 3·40 − 6 = 114 edges, 228 half-edges < Box3D's 255

/**
 * The `n` most spread-out of a flat [x,y,z,…] point list (farthest-point sampling, seeded from the
 * point farthest from the first) — the convex hull of these is the engine-buildable stand-in for a
 * hull that is too complex. Deterministic: same points, same pick.
 */
export function thinHull (pts, n = HULL_THIN) {
  const m = pts.length / 3
  if (m <= n) return pts
  const d = new Float64Array(m).fill(Infinity)
  const out = new Float32Array(n * 3)
  const far = (i) => {   // shrink every point's distance-to-the-kept-set by point i; return the farthest
    let best = 0
    for (let k = 0; k < m; k++) {
      const dx = pts[k * 3] - pts[i * 3], dy = pts[k * 3 + 1] - pts[i * 3 + 1], dz = pts[k * 3 + 2] - pts[i * 3 + 2]
      d[k] = Math.min(d[k], dx * dx + dy * dy + dz * dz)
      if (d[k] > d[best]) best = k
    }
    return best
  }
  let i = far(0)
  d.fill(Infinity)
  for (let j = 0; j < n; j++) {
    out.set(pts.subarray(i * 3, i * 3 + 3), j * 3)
    i = far(i)
  }
  return out
}

export function bboxCorners (pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pts.length; i += 3) {
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pts[i + a]); hi[a] = Math.max(hi[a], pts[i + a]) }
  }
  const out = []
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push(x, y, z)
  return new Float32Array(out)
}

// Hard cap (FEAT-36: "a couple at a time", with debug headroom). Oldest body is reclaimed —
// same discipline as the thrown-roll cap, so an evening of debug throwing cannot leak bodies.
// PINNED bodies (a live haul load, FEAT-88) are outside the cap: they never count toward it and are
// never reclaimed by it, so a rock thrown mid-haul cannot delete a bundle. Their owner removes them.
export const DEBRIS_CAP = 12

export class DebrisSystem {
  constructor (engine, scene) {
    this._eng = engine
    this._scene = scene
    this._live = []              // [{ body, mesh, kind }], oldest first
    this._proto = new Map()      // kind → { hull: Float32Array, center: THREE.Vector3, volume, density } | null while loading
    this._types = {}             // kind → spec: DEBRIS_TYPES plus anything load() was handed
    this._loads = new Map()      // kind → load() promise (memo)
    for (const kind of Object.keys(DEBRIS_TYPES)) this.load(kind)
  }

  /**
   * Build a type's collider prototype, once. DEBRIS_TYPES load eagerly at construction; other
   * callers (the freight list, data/freight.js) hand their own `spec` and load on first use, so a
   * cargo list does not cost the cold boot a GLB fetch per row. `spec.box` = collide as the model's
   * bounding box (welded freight: the shape never touches the bed, and a 2600-tri tyre stack is
   * past the engine's hull limit anyway).
   * @returns {Promise<void>} resolves once spawn(kind) can succeed.
   */
  load (kind, spec = DEBRIS_TYPES[kind]) {
    if (this._loads.has(kind)) return this._loads.get(kind)
    this._types[kind] = spec
    const p = getModel(spec.model).then(rec => {
      const proto = this._extractHull(rec.template)
      if (proto && !spec.box && !(this._hullVolume(proto.hull) > 0)) {
        // The engine could not build this hull (Box3D caps a hull at 255 half-edges, and a
        // densely faceted round asset — a tire, any detailed item model — exceeds it). Left alone it
        // has NaN mass and takes the whole world unstable. Hull the HULL_THIN most spread-out
        // vertices instead: a hull of n points has at most 3n − 6 edges, so 40 always fits. Only if
        // that fails too does it fall back to the bounding box — wrong shape, right size, never a crash.
        proto.hull = thinHull(proto.hull)
        if (!(this._hullVolume(proto.hull) > 0)) {
          console.warn(`[debris] '${spec.model}' hull is too complex for the engine; using its bounding box`)
          proto.hull = bboxCorners(proto.hull)
        }
      }
      if (proto && spec.box) proto.hull = bboxCorners(proto.hull)
      if (proto) {
        proto.volume = this._hullVolume(proto.hull)
        proto.density = spec.massKg ? spec.massKg / proto.volume : spec.density
      }
      this._proto.set(kind, proto)
    })
    this._loads.set(kind, p)
    return p
  }

  /** Half extents of a loaded type's collider [m] (the hull is bbox-centred), or null while loading. */
  halfExtents (kind) {
    const h = this._proto.get(kind)?.hull
    if (!h) return null
    const e = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < h.length; i += 3) {
      e.x = Math.max(e.x, Math.abs(h[i])); e.y = Math.max(e.y, Math.abs(h[i + 1])); e.z = Math.max(e.z, Math.abs(h[i + 2]))
    }
    return e
  }

  /**
   * The hull's volume as the ENGINE builds it [m³] — NaN if the engine cannot build it at all. The
   * engine integrates ρ over the solid hull, so a throwaway body at ρ = 1 reports the volume as
   * its mass; `massKg / volume` is then the density that lands exactly that mass. One probe per
   * type, at load, never on the spawn path.
   */
  _hullVolume (hull) {
    const probe = this._eng.createBody({ type: 'dynamic', position: { x: 0, y: -1e4, z: 0 } })
    this._eng.addHull(probe, hull, { density: 1, group: GROUP_DEBRIS })
    const volume = this._eng.getMass(probe)
    this._eng.destroyBody(probe)
    return volume
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
    // opts: spin, quaternion (deterministic callers), pinned (outside the cap — see DEBRIS_CAP),
    // noDamage (the chassis wear model ignores this body's contacts — cargo in the bed, FEAT-88),
    // massKg (overrides the type's own mass — the freight debug slider), ownMaterials (FEAT-97: the
    // load can blink() without tinting other copies).
    const spec = this._types[kind]
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
      userData: { kind: 'debris', debrisType: kind, noDamage: !!opts.noDamage },
    })
    this._eng.addHull(body, proto.hull, {
      density: opts.massKg ? opts.massKg / proto.volume : proto.density,
      friction: spec.friction,
      restitution: spec.restitution,
      group: GROUP_DEBRIS,
    })

    // Visual: the shared template cloned, child-offset so the mesh's bbox centre (= the hull's
    // origin = the body origin) coincides with the body transform.
    const spawned = new THREE.Group()
    getModel(spec.model).then(rec => {
      const m = rec.template.clone(true)
      // FEAT-97: a load that blinks gets its OWN materials — the clone shares the template's, and
      // tinting those would tint every copy. Disposed in _reclaim.
      if (opts.ownMaterials) m.traverse(o => { if (o.isMesh) o.material = o.material.clone() })
      m.position.set(-proto.center.x, -proto.center.y, -proto.center.z)
      spawned.add(m)
    })
    this._scene.add(spawned)

    this._live.push({ body, mesh: spawned, kind, cargo: false, pinned: !!opts.pinned, ownMaterials: !!opts.ownMaterials,
      prevP: new THREE.Vector3(position.x, position.y, position.z),
      prevQ: opts.quaternion ? new THREE.Quaternion(opts.quaternion.x, opts.quaternion.y, opts.quaternion.z, opts.quaternion.w)
        : new THREE.Quaternion() })
    this._enforceCap()
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
   * Unpinned, it respects DEBRIS_CAP through spawn(), so a stack bigger than the cap eats its own
   * base — the caller clamps rather than relying on that. Pinned (the lab's barrel cube) it is
   * outside the cap entirely, and the caller removes it.
   *
   * @param {string} kind - DEBRIS_TYPES key.
   * @param {{x:number,y:number,z:number}} origin - ground point under the pyramid's apex.
   * @param {Array<{x,y,z}>} [layout] - ground-relative centres (stackLayout / cubeLayout).
   * @param {boolean} [pinned=false] - outside DEBRIS_CAP; the caller removes them (the barrel cube).
   * @returns {Array<*>} the spawned body handles (empty if the model is still loading).
   */
  spawnStack (kind, origin, layout = stackLayout(6), pinned = false) {
    const zero = { x: 0, y: 0, z: 0 }
    const bodies = []
    for (const off of layout) {
      const body = this.spawn(kind,
        { x: origin.x + off.x, y: origin.y + off.y, z: origin.z + off.z },
        zero, { spin: zero, quaternion: STACK_QUAT, pinned })
      if (!body) break        // model not loaded yet — don't leave half a pyramid
      bodies.push(body)
    }
    return bodies
  }

  /** Reclaim the oldest UNPINNED bodies until the unpinned count is within DEBRIS_CAP. */
  _enforceCap () {
    let free = this._live.reduce((n, r) => n + (r.pinned ? 0 : 1), 0)
    for (let i = 0; free > DEBRIS_CAP && i < this._live.length;) {
      if (this._live[i].pinned) { i++; continue }
      this._reclaim(this._live.splice(i, 1)[0])
      free--
    }
  }

  /** Remove specific bodies (a haul load on settle / cancel). Unknown handles are ignored. */
  remove (bodies) {
    for (const b of bodies) {
      const i = this._live.findIndex(r => r.body === b)
      if (i >= 0) this._reclaim(this._live.splice(i, 1)[0])
    }
  }

  _reclaim (rec) {
    this._eng.destroyBody(rec.body)
    this._scene.remove(rec.mesh)
    if (rec.ownMaterials) rec.mesh.traverse(o => { if (o.isMesh) o.material.dispose() })
  }

  /** FEAT-97: tint a load spawned with `ownMaterials` red — k 0..1, 0 is unlit. */
  blink (body, k) {
    this._live.find(r => r.body === body)?.mesh.traverse(o => { if (o.material?.emissive) o.material.emissive.setRGB(k, 0, 0) })
  }

  /**
   * Call once per physics step, BEFORE the engine steps. Two jobs, both about debris riding the
   * truck:
   *
   * 1. SNAPSHOT the pre-step pose, so update() can draw debris at the same sub-step time as the
   *    truck. The world truck is drawn interpolated between its last two steps; debris drawn at the
   *    latest step sits up to one step AHEAD of it — 0.45 m at 60 mph — and the lead changes every
   *    frame, which read as cargo stuttering forward and snapping back (owner, 2026-09-29).
   *
   * 2. FLAG CARGO as bullets. The chassis is a Box3D bullet (continuous collision, so it cannot
   *    tunnel through a barrel it hits at speed). A bullet's sweep stops at the first dynamic body it
   *    would touch, and a rock resting in the bed touches it at t = 0 — so above ~21 m/s (where the
   *    chassis counts as "fast") every step froze the truck at its start pose while the rocks flew
   *    on, and they left through the cab or the tailgate. Measured headless: escape at 22 m/s and
   *    up, none at 20. A bullet never sweeps against another bullet, so a body inside the bed well
   *    is flagged one and the truck ignores it in the sweep; ordinary contact still carries it.
   *    Anything outside the bed stays a plain body, so the truck still sweeps against debris ahead.
   *
   * @param {*} chassis - the truck's engine body handle.
   * @param {object|null} bed - the model's open-bed spec (data/vehicle-models.js); null = no cargo.
   */
  beforeStep (chassis, bed) {
    if (bed) {
      this._eng.getTransform(chassis, _cp, _cq)
      _cqi.copy(_cq).invert()
    }
    for (const rec of this._live) {
      this._eng.getTransform(rec.body, rec.prevP, rec.prevQ)
      if (!bed) continue
      _p.copy(rec.prevP).sub(_cp).applyQuaternion(_cqi)
      const inBed = inBedWell(_p, bed, CARGO_MARGIN)
      if (inBed !== rec.cargo) { rec.cargo = inBed; this._eng.setBullet(rec.body, inBed) }
    }
  }

  /**
   * Frame-loop sync: engine transform → mesh. Every live body, no culling: ≤ DEBRIS_CAP loose
   * debris plus the pinned bodies the cap does not count (the barrel-cube lab, haul and freight loads).
   * @param {number} [alpha=1] - render interpolation between the beforeStep() snapshot (0) and the
   *   current pose (1). Pass the truck's own render alpha so cargo and truck are drawn at the same
   *   instant; a caller that draws its truck un-interpolated (the menu stage) leaves it at 1.
   */
  update (alpha = 1) {
    for (const rec of this._live) {
      this._eng.getTransform(rec.body, _p, _q)
      if (alpha >= 1) { rec.mesh.position.copy(_p); rec.mesh.quaternion.copy(_q); continue }
      rec.mesh.position.copy(rec.prevP).lerp(_p, alpha)
      rec.mesh.quaternion.copy(rec.prevQ).slerp(_q, alpha)
    }
  }

  clear () {
    for (const rec of this._live) this._reclaim(rec)
    this._live.length = 0
  }

  get count () { return this._live.length }
  get awakeCount () { return this._live.reduce((n, r) => n + (this._eng.isAwake(r.body) ? 1 : 0), 0) }
}
