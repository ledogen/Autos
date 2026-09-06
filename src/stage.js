/**
 * src/stage.js — MenuStage: the sim in a bottle (FEAT-41).
 *
 * The live 3D scene behind the main menu, and — the reason it earns its keep — the LOADING screen.
 * A void with a ground plane and one dirt mound; the hero truck is dropped 18 inches so its
 * front-left wheel lands on the mound, and once the suspension settles a few rocks fall into the
 * bed and squat the rear. No animation curves anywhere: the real Pacejka/strut stack does all of it.
 *
 * WHY IT IS A SECOND WORLD, NOT A CORNER OF THE REAL ONE
 * The scene has to keep moving while the real world is being reseeded, routed and carved — that is
 * exactly when the player is looking at it. So it owns its own THREE.Scene, its own camera, its own
 * PhysicsEngine world (initPhysicsEngine() is idempotent: the WASM loads once, we get two
 * independent worlds), its own vehicleState + chassis + truck model, and its own DebrisSystem. It
 * touches NOTHING the world sim owns, which is what makes it safe to run mid-rebuild.
 *
 * It calls stepPhysics ONLY — never updateVehicle, whose key state is a module-global in
 * vehicle.js. The menu truck must not answer to WASD.
 *
 * THE HANDOVER. main.js is one module full of top-level awaits, so at boot there is no frame loop
 * yet. begin() therefore runs its OWN requestAnimationFrame loop, which animates through the gaps
 * between those awaits (synchronous worldgen stretches still hitch it — accepted, owner 2026-09-06).
 * The moment main.js's loop() starts it calls stopStandalone() and drives update()/render() itself,
 * so there is only ever one rAF loop alive.
 *
 * Headless-safe by construction: only main.js constructs this (same rule as debris.js) — the
 * pure-node gates never touch it. The CDP harnesses that DO drive a real page pass `?nomenu=1`,
 * which builds the stage inactive so the world is on screen from the first frame.
 */

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { createPhysicsEngine, GROUP_TERRAIN } from './physics-engine.js'
import { stepPhysics, createVehicleChassis } from './physics.js'
import { createVehicleModel } from './vehicle-model.js'
import { makeVehicleState } from './vehicle-state.js'
import { computeStaticEquilibrium } from './suspension.js'
import { OFF as IGN_OFF } from './ignition.js'
import { DebrisSystem } from './debris.js'

const PHYSICS_DT = 1 / 60

// ── The beat sheet (FEAT-41, owner-specified) ────────────────────────────────────────────────────
const DROP_H      = 0.46    // m — 18 in, the specified drop height above flat ground
const TRUCK_YAW   = 0.26    // rad (~15°) — off-axis so the camera reads three-quarter, not side-on
const MOUND_R     = 0.80    // m — mound radius; comfortably wider than a 0.66 m tire footprint
const MOUND_H     = 0.30    // m — apex height. Over half the drop, so the FL corner lands FIRST
const ROCKS_AT    = 2.2     // s of sim time after release — "once the suspension settles (~2 s)"
const ROCK_N      = 3
const ROCK_GAP    = 0.20    // s between rocks: staggered so three 50 kg impulses cannot stack
const ROCK_DROP_H = 2.6     // m above the bed floor → ~7 m/s at contact: a firm thump, not a launch
const PARALLAX    = 5 * Math.PI / 180   // rad — cursor-follow orbit limit, both axes

// ── ranger.glb's ACTUAL bed, in body-local metres (forward = -Z, origin at the CG) ───────────────
// The shared CHASSIS_PROFILE models the bed as a solid deck to rail height (a tonneau), so a rock
// dropped on it lands on the lid and rolls off. The stage needs a container, and it has to line up
// with the bed the player can SEE, not with an approximation of it.
//
// Every number below is a named constant from assets/models/src/ranger.py mapped through the
// loader's transform (src/vehicle-model.js): the glTF export puts Blender's +Z on model +Y and
// Blender's -Y on model +Z, the ranger spec's auto-scale comes out at exactly 1.0 (the model was
// authored to the physics preset's 4.61 m), and the ground-plant lands the model root at body-local
// y = -0.651. So body y = <ranger.py Z> - 0.651 and body z = -<ranger.py Y>; x is unchanged.
// To re-derive after a re-export: read root.scale.x and root.position off the loaded GLB group.
const RANGER_BED = {
  floorY:          0.049,   // Z_BEDFLOOR 0.700 — the floor pan (rib crests sit RIB_H proud)
  railY:           0.490,   // Z_RAIL 1.141 — bed rail top
  wheelhouseY:     0.314,   // Z_WHEELHOUSE 0.965 — wheelhouse box top
  innerHalfW:      0.700,   // W_BED_IN — inner wall
  outerHalfW:      0.822,   // W_BED_OUT — bed side at the rail
  wheelhouseHalfW: 0.545,   // W_WHEELHOUSE — inner wall over the rear arch
  frontZ:          0.710,   // Y_BED_F -0.710 — front wall, 8 cm behind the cab
  tailZ:           2.4405,  // Y_BED_R -2.4405 — bed loft tail
  gateZ:           2.5405,  // Y_TAILGATE -2.5405 — outer face of the closed tailgate
  archZ0:          1.0975,  // AX_R 1.5675 ∓ ARCH_R 0.470 — the rear arch the wheelhouse covers
  archZ1:          2.0375,
}

// Catch-up policy. A loading frame can be hundreds of ms long; paying that debt in physics steps
// would spend the stall twice. Cap the steps and DROP the remainder — the scene briefly runs in
// slow motion, which looks like a heavy truck and not like a stutter.
const MAX_STEPS_PER_FRAME = 4

// ── Palette (ART-STYLE.md: flat colours, no textures, faceted, desaturated nature) ───────────────
const COL_VOID   = 0x161c24   // the empty stage around the plane
const COL_GROUND = 0x5c5344   // desaturated dry earth
const COL_MOUND  = 0x615748   // the mound — the SAME dirt, barely lifted. Any more contrast and it
                              // reads as a painted disc instead of a shape; its form comes from the
                              // key light raking across it, not from a colour change.

// The world runs ACES tone mapping at the sky look's exposure (~0.46 by day — sky.js). That is
// calibrated for a sunlit outdoor scene and crushes a small lamp-lit void to near black, so the
// stage renders at its own exposure and puts the renderer's back before returning. Save/restore
// rather than assignment: sky.js only writes exposure when the LOOK changes, so a stomped value
// would survive into the world for the rest of the session.
const STAGE_EXPOSURE = 1.25

export class MenuStage {
  /**
   * @param {object} [opts]
   * @param {Function} [opts.onFirstFrame] - fired once, after the very first painted frame. main.js
   *   hangs the boot-splash teardown off this: the splash must not lift before there is something
   *   behind it.
   * @param {boolean} [opts.active] - does the stage own the screen at boot? True normally; the
   *   `?nomenu` harness bypass builds it inactive so the world is on screen from the first frame.
   */
  constructor ({ onFirstFrame = null, active = true } = {}) {
    this._onFirstFrame = onFirstFrame
    this._ready = false
    this._active = active        // the stage owns the screen from boot until a mode is chosen
    this._standalone = false
    this._raf = 0
    this._acc = 0
    this._simT = 0               // sim seconds since the truck was released — the beat clock
    this._rocksDone = 0
    this._last = 0
    this._painted = false

    // Cursor parallax, smoothed. -1..1 across the viewport; EMA so a flick does not snap the camera.
    this._mx = 0; this._my = 0
    this._mxS = 0; this._myS = 0
    this._onMouse = (e) => {
      this._mx = (e.clientX / window.innerWidth) * 2 - 1
      this._my = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', this._onMouse)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(COL_VOID)
    // Thin exponential fog in the void colour: it dissolves the ground plane's rim into the
    // background so the "empty void" reads as endless rather than as a disc on a black card.
    this.scene.fog = new THREE.FogExp2(COL_VOID, 0.030)
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400)

    this._camTarget = new THREE.Vector3()
    this._camBase = new THREE.Vector3()
    this._camOff = new THREE.Vector3()
    this._qYaw = new THREE.Quaternion()
    this._qPitch = new THREE.Quaternion()
    this._axisY = new THREE.Vector3(0, 1, 0)
    this._axisRight = new THREE.Vector3()
    this._bedWorld = new THREE.Vector3()
  }

  // ── Build ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * Load the engine, build the world, and start animating on a private rAF loop.
   * Not awaited by main.js: the whole point is that it runs DURING main.js's own init.
   */
  async begin (renderer) {
    this._engine = await createPhysicsEngine()
    this._buildLights()
    this._buildGround()
    this._buildTruck()
    this._debris = new DebrisSystem(this._engine, this.scene)
    this._placeCameraRig()
    this.reset()
    this._ready = true
    window.__stage = this   // dev handle (mirrors window.__physicsEngine): poke the scene from the console

    // Nothing to animate through if the world already owns the screen (?nomenu): main.js's loop()
    // will drive this the moment anything raises it.
    if (!this._active) return
    this._standalone = true
    this._last = performance.now() / 1000
    const tick = () => {
      if (!this._standalone) return
      this._raf = requestAnimationFrame(tick)
      const now = performance.now() / 1000
      const dt = Math.min(0.25, now - this._last)
      this._last = now
      this.update(dt)
      this.render(renderer)
    }
    this._raf = requestAnimationFrame(tick)
  }

  /** main.js's loop() has started and is taking over the driving. */
  stopStandalone () {
    if (!this._standalone) return
    this._standalone = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
  }

  _buildLights () {
    // Not sky.js: the stage is a void, not a time of day. One key with a tight shadow frustum, one
    // hemisphere fill. The key sits front-right so the front-LEFT corner — the star of the shot —
    // is the shaded side with a rim, which is what makes the wheel-on-mound silhouette read.
    this.scene.add(new THREE.HemisphereLight(0x6d7f9c, 0x3b342b, 1.5))
    const key = new THREE.DirectionalLight(0xfff1dc, 3.2)
    key.position.set(6, 7, -5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    const c = key.shadow.camera
    // ±14 m, not ±6: QUAL-18's shadow-edge fade dissolves the map radially near the frustum edge,
    // and at ±6 that dissolve boundary lands ~6 m out — right across the foreground, where it reads
    // as a soft grey arc on the ground. At 1024² over 28 m a texel is 27 mm, which is still finer
    // than anything a truck at 6 m shows.
    c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 0.5; c.far = 45
    c.updateProjectionMatrix()
    key.shadow.bias = -0.0009
    this.scene.add(key)
    this.scene.add(key.target)
    this._key = key
    // Cool bounce from behind-left so the shaded side is not a silhouette.
    const fill = new THREE.DirectionalLight(0x8fa8c8, 0.9)
    fill.position.set(-7, 3, 6)
    this.scene.add(fill)
  }

  /**
   * Ground plane + the mound. The mound's analytic height field IS its mesh IS its collider:
   * `_moundH` generates the vertices, and those exact vertex/index arrays are handed to addMesh.
   * MESH == PHYSICS holds here the same way it does for the terrain.
   */
  _buildGround () {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: COL_GROUND, roughness: 1 }))
    plane.rotation.x = -Math.PI / 2
    plane.receiveShadow = true
    this.scene.add(plane)

    // Where the mound goes: under the front-left wheel's landing spot, so the drop is asymmetric.
    const p = RANGER_PARAMS
    const flLocal = new THREE.Vector3(-p.trackFront / 2, 0, -(p.wheelbase * p.weightRear))
    const q = new THREE.Quaternion().setFromAxisAngle(this._axisY, TRUCK_YAW)
    this._mound = flLocal.clone().applyQuaternion(q)   // truck sits at world XZ origin
    this._mound.y = 0

    const geo = this._moundGeometry()
    const mesh = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ color: COL_MOUND, roughness: 1, flatShading: true }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)

    // Colliders: a slab whose top face is y=0 (the plane), plus the mound's own triangles. These
    // exist for the ROCKS — the wheels never use them, they ride the analytic `_groundH` below.
    const ground = this._engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 }, userData: { kind: 'stage-ground' } })
    this._engine.addBox(ground, { x: 90, y: 5, z: 90 }, { friction: 0.9, group: GROUP_TERRAIN })
    const moundBody = this._engine.createBody({ type: 'static', position: { x: 0, y: 0, z: 0 }, userData: { kind: 'stage-mound' } })
    this._engine.addMesh(moundBody, geo.attributes.position.array, geo.index.array,
      { friction: 0.9, group: GROUP_TERRAIN })
  }

  /** Raised-cosine blob: smooth to its own rim, so it has no edge for a wheel to clip through. */
  _moundH (x, z) {
    const r = Math.hypot(x - this._mound.x, z - this._mound.z)
    if (r >= MOUND_R) return 0
    return MOUND_H * 0.5 * (1 + Math.cos(Math.PI * r / MOUND_R))
  }

  /** Exact analytic normal — the gradient of _moundH, not a finite difference. */
  _moundN (x, z, out) {
    const dx = x - this._mound.x, dz = z - this._mound.z
    const r = Math.hypot(dx, dz)
    if (r >= MOUND_R || r < 1e-6) return out.set(0, 1, 0)
    const dhdr = -MOUND_H * 0.5 * (Math.PI / MOUND_R) * Math.sin(Math.PI * r / MOUND_R)
    return out.set(-dhdr * dx / r, 1, -dhdr * dz / r).normalize()
  }

  _moundGeometry () {
    const RINGS = 10, SEGS = 28
    const pos = [], idx = []
    pos.push(this._mound.x, MOUND_H, this._mound.z)   // apex, vertex 0
    for (let i = 1; i <= RINGS; i++) {
      const r = MOUND_R * i / RINGS
      for (let s = 0; s < SEGS; s++) {
        const a = s * 2 * Math.PI / SEGS
        const x = this._mound.x + r * Math.cos(a), z = this._mound.z + r * Math.sin(a)
        pos.push(x, this._moundH(x, z), z)
      }
    }
    const ringStart = (i) => 1 + (i - 1) * SEGS
    for (let s = 0; s < SEGS; s++) idx.push(0, ringStart(1) + (s + 1) % SEGS, ringStart(1) + s)
    for (let i = 1; i < RINGS; i++) {
      const a = ringStart(i), b = ringStart(i + 1)
      for (let s = 0; s < SEGS; s++) {
        const s2 = (s + 1) % SEGS
        idx.push(a + s, b + s2, b + s, a + s, a + s2, b + s2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1))
    geo.computeVertexNormals()
    return geo
  }

  _buildTruck () {
    this._vs = makeVehicleState(RANGER_PARAMS, IGN_OFF)   // a parked truck: no idle, no lights
    this._chassis = createVehicleChassis(this._engine, this._vs, RANGER_PARAMS, { bed: RANGER_BED })
    this._ctx = { engine: this._engine, chassis: this._chassis }
    // keyBindings off: a second model would otherwise also answer the 'L' headlight key.
    this._model = createVehicleModel(this.scene, RANGER_PARAMS, undefined, { keyBindings: false })
    // A truck that has been sitting has its lamps off. Left on low (the default), the headlight
    // spots throw a large soft pool across the foreground — which is what that grey arc in front of
    // the truck was — and the tail running lights put a red patch under the rear wheel.
    this._model.setHeadlightMode(0)
    this._model.setNightFactor(0)   // the stage is a lit void, not a time of day — never night

    // Single-probe ground query. The world's version sweeps a 32-sample tire envelope because it
    // has road EDGES to climb; this surface is a plane plus one smooth blob, where the envelope
    // and the centre probe agree to within the blob's curvature over a tire radius. Nothing here
    // is worth 32 samples per wheel per substep on a frame that is already paying for worldgen.
    const n = new THREE.Vector3()
    this._queryContacts = (cx, cy, cz, r) => {
      const h = this._moundH(cx, cz)
      const depth = (h + r) - cy
      if (depth <= 0) return []
      return [{
        normal: this._moundN(cx, cz, n).clone(),
        depth,
        contactPoint: new THREE.Vector3(cx, h, cz),
      }]
    }
  }

  _placeCameraRig () {
    // In front of the truck looking back at the front-left corner — the wheel on the mound is the
    // star of the shot, so the rig is anchored on it and not on the truck's centre. The body then
    // runs away to the right and back, which leaves the frame's left third for the menu type.
    const p = RANGER_PARAMS
    const q = new THREE.Quaternion().setFromAxisAngle(this._axisY, TRUCK_YAW)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)    // model forward = -Z
    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(q)
    this._camTarget.set(this._mound.x, MOUND_H + p.wheelRadius * 1.1, this._mound.z)
    this._camBase.copy(this._camTarget)
      .addScaledVector(fwd, 5.9)
      .addScaledVector(left, 3.1)
      .add(new THREE.Vector3(0, 1.45, 0))
    this._camOff.copy(this._camBase).sub(this._camTarget)
    // Key light aimed at the shot, so the tight shadow frustum is spent where it is seen.
    this._key.target.position.copy(this._camTarget)
    this._key.position.copy(this._camTarget).add(new THREE.Vector3(6, 7, -5))
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────────────────────────

  isReady () { return this._ready }
  isActive () { return this._active }

  /**
   * Show or hide the stage. Showing it RE-RUNS the drop from the top — a load is exactly when the
   * player wants to watch it happen, not to find a truck already sitting there. Within one showing
   * it is one-shot: drop, rocks, then it settles and stays settled (owner, 2026-09-06).
   */
  setActive (on) {
    if (on === this._active) return
    this._active = on
    if (on) this.reset()
  }

  /** Re-seat the truck at drop height, empty the bed, restart the beat clock. */
  reset () {
    if (!this._vs) return   // reset() also runs during begin(), before _ready is set
    const eq = computeStaticEquilibrium(RANGER_PARAMS)
    const vs = this._vs
    // stepPhysics pushes vehicleState → body at the top of every step (physics.js), so rewriting
    // the state IS the teleport; there is no separate engine reseat to keep in sync.
    vs.position.set(0, eq.bodyY + DROP_H, 0)
    vs.quaternion.setFromAxisAngle(this._axisY, TRUCK_YAW)
    vs.velocity.set(0, 0, 0)
    vs.angularVelocity.set(0, 0, 0)
    vs.strutComp = [...eq.strutComp]
    vs.strutCompVel = [0, 0, 0, 0]
    vs.wheelOmega = [0, 0, 0, 0]
    vs.steerAngle = 0
    vs.throttle = 0
    vs.brake = 0
    // PARKED, not merely idle. Two things drift a truck nobody is driving, and both are only ever
    // set by updateVehicle — which the stage does not call:
    //   handbrake — without it the rears free-wheel and the landing walks the truck off the mound;
    //   engineRPM — makeVehicleState seeds a warm 750 rpm idle, and the ignition OFF spin-down takes
    //     engineOffRpmLag (~0.7 s), so a torque-converter creep pushes it forward for the whole drop.
    // A truck that has been sitting has a dead engine and its parking brake on.
    vs.handbrake = true
    vs.parked = true
    vs.drivetrain.engineRPM = 0
    this._debris?.clear()
    this._simT = 0
    this._acc = 0
    this._rocksDone = 0
  }

  // ── Per-frame ──────────────────────────────────────────────────────────────────────────────────

  update (dt) {
    if (!this._ready || !this._active) return
    this._acc += dt
    let n = 0
    while (this._acc >= PHYSICS_DT && n < MAX_STEPS_PER_FRAME) {
      stepPhysics(this._vs, RANGER_PARAMS, PHYSICS_DT, this._queryContacts, this._ctx)
      this._simT += PHYSICS_DT
      this._acc -= PHYSICS_DT
      n++
      this._maybeDropRock()
    }
    if (this._acc >= PHYSICS_DT) this._acc = 0   // see MAX_STEPS_PER_FRAME: drop the debt, don't pay it

    this._model.syncMeshesToState(this._vs)
    this._debris.update()
    this._updateCamera(dt)
  }

  /**
   * The second beat: rocks into the bed, restarting the truck's wobble. Retries every step while
   * spawn() returns null — on a cold boot the rock GLB may still be in flight, and a silently
   * skipped rock would leave the bed empty for the whole load.
   */
  _maybeDropRock () {
    if (this._rocksDone >= ROCK_N) return
    if (this._simT < ROCKS_AT + this._rocksDone * ROCK_GAP) return
    // Bed floor, in the truck's CURRENT pose (it has settled by now, possibly tilted on the mound).
    // Spread across the well: inside the wheelhouse walls (±0.545) and along the 1.73 m floor.
    this._bedWorld.set((this._rocksDone - 1) * 0.34, RANGER_BED.floorY,
      RANGER_BED.frontZ + 0.45 + this._rocksDone * 0.55)
      .applyQuaternion(this._vs.quaternion).add(this._vs.position)
    const ok = this._debris.spawn('rock',
      { x: this._bedWorld.x, y: this._bedWorld.y + ROCK_DROP_H, z: this._bedWorld.z },
      { x: 0, y: -1.2, z: 0 })
    if (ok) this._rocksDone++
  }

  /**
   * Cursor-follow parallax: ±5° of yaw and pitch about the front-left corner. Not an orbit — the
   * cursor is the only input, there is no drag, and the limits are hard.
   */
  _updateCamera (dt) {
    const k = Math.min(1, dt * 4)          // ~250 ms EMA: follows the cursor without snapping to it
    this._mxS += (this._mx - this._mxS) * k
    this._myS += (this._my - this._myS) * k

    this._camOff.copy(this._camBase).sub(this._camTarget)
    this._qYaw.setFromAxisAngle(this._axisY, -this._mxS * PARALLAX)
    this._camOff.applyQuaternion(this._qYaw)
    this._axisRight.copy(this._camOff).cross(this._axisY).normalize()
    this._qPitch.setFromAxisAngle(this._axisRight, this._myS * PARALLAX)
    this._camOff.applyQuaternion(this._qPitch)

    this.camera.position.copy(this._camTarget).add(this._camOff)
    this.camera.lookAt(this._camTarget)
  }

  render (renderer) {
    if (!this._ready || !this._active) return
    // PERF-16 left shadowMap.autoUpdate off globally and re-arms it on demand from the world loop's
    // shadow-follow block. The stage is not in that block, so it re-arms its own — and unlike the
    // world's, this map is 1024² over two casters, which is cheap enough to pay every frame.
    renderer.shadowMap.needsUpdate = true
    const prevExposure = renderer.toneMappingExposure
    renderer.toneMappingExposure = STAGE_EXPOSURE
    renderer.render(this.scene, this.camera)
    renderer.toneMappingExposure = prevExposure
    if (!this._painted) {
      this._painted = true
      this._onFirstFrame?.()
    }
  }

  resize () {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }
}
