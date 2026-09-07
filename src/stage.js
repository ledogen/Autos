/**
 * src/stage.js — MenuStage: the sim in a bottle (FEAT-41).
 *
 * The live 3D scene behind the main menu, and — the reason it earns its keep — the LOADING screen.
 * A black void with a ground plane and one rock; the rock drops first, the hero truck is dropped 18
 * inches so its front-left wheel lands ON that rock, and once the suspension settles a few more fall
 * into the bed and squat the rear. No animation curves anywhere: the real Pacejka/strut stack does
 * all of it, and the rock under the tire is a real 50 kg body that takes the load.
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
const ZERO3 = { x: 0, y: 0, z: 0 }   // reused for the pre-roll velocity clamp; never mutated

// ── The beat sheet (FEAT-41, owner-specified) ────────────────────────────────────────────────────
const DROP_H      = 0.46    // m — 18 in, the specified drop height above flat ground
const TRUCK_YAW   = 0.26    // rad (~15°) — off-axis so the camera reads three-quarter, not side-on
const ROCK_SPAWN_H = 0.25   // m — the under-tire rock is DROPPED, not placed: settling it on the
                            // plane is one less made-up number than computing its rest height
const RELEASE_AT  = 0.60    // s — the truck hangs at drop height until the rock has landed and gone
                            // still, so the front-left wheel meets a rock that is already at rest
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
const COL_VOID   = 0x0a0d11   // the empty stage around the plane
const COL_GROUND = 0x000000   // black (owner, 2026-09-06) — the truck reads as lit object in a void,
                              // and its shadow simply stops existing, which is the point

// The world runs ACES tone mapping at the sky look's exposure (~0.46 by day — sky.js). That is
// calibrated for a sunlit outdoor scene and crushes a small lamp-lit void to near black, so the
// stage renders at its own exposure and puts the renderer's back before returning. Save/restore
// rather than assignment: sky.js only writes exposure when the LOOK changes, so a stomped value
// would survive into the world for the rest of the session.
const STAGE_EXPOSURE = 1.45   // lifted when the floor went black: a black plane returns no bounce,
                              // so the truck's lower half lost the fill it used to get for free

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
    this.scene.add(new THREE.HemisphereLight(0x6d7f9c, 0x2a2f38, 1.7))
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
   * The ground: one black plane and the static slab under it. Nothing else — the shape the front
   * wheel lands on is a real rock body now (see _placeUnderTireRock), not a sculpted heightfield.
   */
  _buildGround () {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: COL_GROUND, roughness: 1 }))
    plane.rotation.x = -Math.PI / 2
    plane.receiveShadow = true
    this.scene.add(plane)

    // Where the rock goes: under the front-left wheel's landing spot, so the drop is asymmetric.
    const p = RANGER_PARAMS
    const flLocal = new THREE.Vector3(-p.trackFront / 2, 0, -(p.wheelbase * p.weightRear))
    const q = new THREE.Quaternion().setFromAxisAngle(this._axisY, TRUCK_YAW)
    this._rockSpot = flLocal.clone().applyQuaternion(q)   // truck sits at world XZ origin
    this._rockSpot.y = 0

    // Collider: a slab whose top face is y=0 (the plane). The WHEELS never use it — they ride the
    // analytic _queryContacts below — it is here so the rocks have something to land on.
    const ground = this._engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 }, userData: { kind: 'stage-ground' } })
    this._engine.addBox(ground, { x: 90, y: 5, z: 90 }, { friction: 0.9, group: GROUP_TERRAIN })
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

    // Flat-plane ground query. The world's version sweeps a 32-sample tire envelope because it has
    // road EDGES to climb; this surface is one plane, where every sample agrees. The ROCK is not in
    // here and does not need to be: stepPhysics's qcPlus already unions this with the engine's
    // dynamic bodies (contactSphere, GROUP_DEBRIS), which is exactly the FEAT-36 coupling that lets
    // a wheel climb a rock. That is why the under-tire shape is a body and not a heightfield bump.
    this._queryContacts = (cx, cy, cz, r) => {
      const depth = r - cy
      if (depth <= 0) return []
      return [{
        normal: new THREE.Vector3(0, 1, 0),
        depth,
        contactPoint: new THREE.Vector3(cx, 0, cz),
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
    this._camTarget.set(this._rockSpot.x, p.wheelRadius * 1.25, this._rockSpot.z)
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
    this._rockBody = null
    this._rockPose = null
  }

  // ── Per-frame ──────────────────────────────────────────────────────────────────────────────────

  update (dt) {
    if (!this._ready || !this._active) return
    this._acc += dt
    let n = 0
    while (this._acc >= PHYSICS_DT && n < MAX_STEPS_PER_FRAME) {
      this._placeUnderTireRock()
      this._pinRock()
      if (this._simT < RELEASE_AT) {
        // PRE-ROLL. The truck is HELD at drop height — re-asserted into the engine each step, since
        // its body is dynamic and would otherwise fall while stepPhysics is not driving it — while
        // the world steps on its own so the under-tire rock lands and goes still. Without this the
        // truck and the rock arrive together and the wheel meets something still bouncing.
        this._engine.setTransform(this._chassis, this._vs.position, this._vs.quaternion)
        this._engine.setVelocity(this._chassis, ZERO3, ZERO3)
        this._engine.step(PHYSICS_DT, RANGER_PARAMS.engineSubsteps ?? 8)
      } else {
        stepPhysics(this._vs, RANGER_PARAMS, PHYSICS_DT, this._queryContacts, this._ctx)
      }
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
   * The first beat: the rock the front-left wheel is going to land on. Dropped from a few
   * centimetres rather than placed, so its rest height is the engine's answer and not a number I
   * made up; RELEASE_AT holds the truck until it has settled. Retried every step while spawn()
   * returns null — on a cold boot the rock GLB may still be in flight.
   */
  _placeUnderTireRock () {
    if (this._rockBody) return
    this._rockBody = this._debris.spawn('rock',
      { x: this._rockSpot.x, y: ROCK_SPAWN_H, z: this._rockSpot.z }, { x: 0, y: 0, z: 0 }) || null
    // spawn() hands every rock a random ±3 rad/s tumble — right for one thrown out of a truck bed,
    // wrong for this one, which has a spot to land on: it rolled clear of the wheel before settling
    // and the truck came down flat beside it. Zeroed here rather than made an option on spawn(),
    // because "the thrown ones tumble" is the correct default for the system that owns it.
    if (this._rockBody) this._engine.setVelocity(this._rockBody, ZERO3, ZERO3)
  }

  /**
   * PIN the under-tire rock where it settled. It has to stay a DYNAMIC body — stepPhysics only
   * unions the engine's dynamic bodies into the wheel query (qcPlus, `dynamicOnly: true`), and that
   * union is the entire reason a wheel can climb a rock at all — but a loose 50 kg cobble under a
   * FREE-ROLLING front wheel (the handbrake is rear-only, correctly) gets squirted straight out,
   * and the truck settles flat with the rock lying beside it.
   *
   * So it is held, not weighted. Inflating its density to make it immovable would be a lie about a
   * rock this size in a sim whose whole premise is that the numbers are honest; re-asserting the
   * pose each step says the true thing instead — this rock is SET IN THE GROUND, not lying on it.
   * The truck still takes its full reaction from the contact; only the rock's own response is
   * suppressed, which is what the ground under a buried rock does.
   */
  _pinRock () {
    if (!this._rockBody) return
    if (!this._rockPose) {
      if (this._simT < RELEASE_AT) return   // still settling; let the engine choose where it lands
      this._rockPose = { p: new THREE.Vector3(), q: new THREE.Quaternion() }
      this._engine.getTransform(this._rockBody, this._rockPose.p, this._rockPose.q)
    }
    this._engine.setTransform(this._rockBody, this._rockPose.p, this._rockPose.q)
    this._engine.setVelocity(this._rockBody, ZERO3, ZERO3)
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
