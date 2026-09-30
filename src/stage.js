/**
 * src/stage.js — MenuStage: the sim in a bottle (FEAT-41).
 *
 * The live 3D scene behind the main menu, and — the reason it earns its keep — the LOADING screen.
 * A black void with a ground plane and one part-buried rock. The hero truck is dropped 18 inches so
 * its front-left wheel lands ON that rock, and once the suspension settles ten more fall into the
 * bed and squat the rear. No animation curves anywhere: the real Pacejka/strut stack does all of it,
 * and the truck stays cocked on the rock because the rock is static geometry, not a prop it can
 * shove aside.
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
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_STATIC } from './physics-engine.js'
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
// The rock the front-left wheel lands on. STATIC and part-buried, like every other rock in the
// world — a boulder set in the ground, not a cobble lying on it. Radii are the blob's unperturbed
// half-extents; PROUD is how much of it stands above the plane.
const ROCK_R      = 0.62    // m — horizontal radius; 1.24 m across, so a 0.74 m tire sits ON it
const ROCK_RY     = 0.45    // m — vertical radius before the cap below
const ROCK_FLAT   = 0.70    // fraction of ROCK_RY at which the top is sheared flat. A DOMED rock is
                            // a slope, and the stage truck's front wheels free-wheel (the handbrake
                            // is rear-only, correctly) — so on a dome the wheel rolls off over about
                            // twenty seconds and the truck settles flat. A flat cap ~0.87 m across
                            // is a real seat: the contact normal is vertical, so there is nothing
                            // pulling the truck anywhere. Clamping y is exact for the collider too —
                            // intersecting a convex solid with a half-space leaves it convex, so the
                            // hull of the clamped points is still the surface being drawn.
const ROCK_PROUD  = 0.26    // m — height of that cap above the plane; the rest is buried
const ROCKS_AT    = 2.2     // s of sim time after release — "once the suspension settles (~2 s)"
const ROCK_N      = 10    // ~50 kg each: half a tonne in the bed, so the rear squats hard (owner, 2026-09-29)
const ROCK_GAP    = 0.20    // s between rocks: staggered so the 50 kg impulses cannot stack
const ROCK_DROP_H = 2.6     // m above the bed floor → ~7 m/s at contact: a firm thump, not a launch
const PARALLAX    = 5 * Math.PI / 180   // rad — cursor-follow orbit limit, both axes
// Click-drag orbit, layered UNDER the parallax so the resting shot is unchanged until someone drags.
const DRAG_RAD_PER_PX = 0.006             // rad of orbit per pixel dragged
const DRAG_ELEV_MIN   = 2 * Math.PI / 180  // rad — lowest camera elevation; the parallax's extra -5°
                                           // still leaves the lens ~0.1 m above the plane
const DRAG_ELEV_MAX   = 80 * Math.PI / 180 // rad — near top-down, straight into the bed
const DRAG_PIVOT_FULL = 0.6               // rad of total drag at which the pivot has fully slid
                                           // from the front-left wheel to BED_PIVOT
const BED_PIVOT = new THREE.Vector3(0, 0.2, 1.0)   // body-local: between the cab and the bed, so an
                                                    // orbit keeps the whole truck and its load in frame

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
  wheelhouseY:     0.284,   // Z_WHEELHOUSE 0.935 — wheelhouse box top
  innerHalfW:      0.700,   // W_BED_IN — inner wall
  outerHalfW:      0.822,   // W_BED_OUT — bed side at the rail
  wheelhouseHalfW: 0.545,   // W_WHEELHOUSE — inner wall over the rear arch
  frontZ:          0.605,   // Y_BED_F -0.605 — front wall, 8 cm behind the cab (cab moved 105 mm
                            // forward in the 2026-09-25 proportions pass; the bed front came with it)
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
const COL_ROCK   = 0x6b6b6e   // cool grey stone — the one thing on the plane, so it carries the shot
const COL_GROUND = 0x000000   // black (owner, 2026-09-06) — the truck reads as lit object in a void,
                              // and its shadow simply stops existing, which is the point

// The world runs ACES tone mapping at the sky look's exposure (~0.46 by day — sky.js). That is
// calibrated for a sunlit outdoor scene and crushes a small lamp-lit void to near black, so the
// stage renders at its own exposure and puts the renderer's back before returning. Save/restore
// rather than assignment: sky.js only writes exposure when the LOOK changes, so a stomped value
// would survive into the world for the rest of the session.
const STAGE_EXPOSURE = 1.45   // lifted when the floor went black: a black plane returns no bounce,
                              // so the truck's lower half lost the fill it used to get for free

/** Collapse a non-indexed position array to its distinct points (1 µm buckets). */
function _uniquePoints (arr) {
  const seen = new Set(), out = []
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2]
    const k = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x, y, z)
  }
  return out
}

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

    // Click-drag orbit (owner, 2026-09-29: "so I can watch the rocks drop into the bed"). Yaw is
    // unbounded, elevation clamped. The drag is not smoothed — the camera should stay under the
    // pointer — only the parallax on top of it is. Double-click puts the shot back.
    this._dragYaw = 0; this._dragPitch = 0
    this._dragging = false
    this._dragX = 0; this._dragY = 0
    const onUi = e => e.target?.closest?.('button, input, select, textarea, a, label, #mm-settings-panel')
    this._onDown = (e) => {
      if (!this._active || e.button !== 0 || onUi(e)) return
      this._dragging = true
      this._dragX = e.clientX; this._dragY = e.clientY
      document.body.classList.add('stage-dragging')
    }
    this._onDrag = (e) => {
      if (!this._dragging) return
      this._dragYaw -= (e.clientX - this._dragX) * DRAG_RAD_PER_PX
      this._dragPitch += (e.clientY - this._dragY) * DRAG_RAD_PER_PX
      this._dragX = e.clientX; this._dragY = e.clientY
    }
    this._onUp = () => {
      this._dragging = false
      document.body.classList.remove('stage-dragging')
    }
    this._onDbl = (e) => {
      if (!this._active || onUi(e)) return
      this._dragYaw = 0; this._dragPitch = 0
    }
    window.addEventListener('pointerdown', this._onDown)
    window.addEventListener('pointermove', this._onDrag)
    window.addEventListener('pointerup', this._onUp)
    window.addEventListener('pointercancel', this._onUp)
    window.addEventListener('dblclick', this._onDbl)

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
    this._pivot = new THREE.Vector3()
    this._bedPivot = new THREE.Vector3()
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
   * wheel lands on is a static, part-buried rock body (see _buildRock), not a sculpted heightfield.
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
    // analytic _queryContacts below — it is here so the bed rocks have something to land on.
    const ground = this._engine.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 }, userData: { kind: 'stage-ground' } })
    this._engine.addBox(ground, { x: 90, y: 5, z: 90 }, { friction: 0.9, group: GROUP_TERRAIN })

    this._buildRock()
  }

  /**
   * The rock under the front-left tire: a one-off blob, STATIC, part-buried (owner, 2026-09-06).
   *
   * WHY IT IS A ONE-OFF AND NOT A DEBRIS PROP. It has to be immovable, and a debris rock cannot be:
   * stepPhysics's wheel query (qcPlus) unions only DYNAMIC engine bodies, so a static prop is
   * invisible to a tire. A dynamic one IS visible — and squirts straight out from under a
   * free-rolling front wheel, which is what the first attempt did. The stage owns its own
   * _queryContacts, so it can run the static contact test itself (see below) and have both: a rock
   * that cannot move and a tire that can climb it.
   *
   * The geometry IS the collider — the same vertex array feeds the mesh and addHull, so MESH ==
   * PHYSICS holds exactly. That is why the radial perturbation is kept gentle: at this amplitude a
   * smooth star-shaped blob is convex, so the hull of its vertices is the surface it is drawn as.
   */
  _buildRock () {
    // Icosahedron, one subdivision: 80 flat faces, the right density for a faceted low-poly rock
    // (ART-STYLE.md — detail as geometry, never smooth-shaded). Non-indexed, so vertices are
    // duplicated per face: the perturbation is a function of DIRECTION, not of vertex index, or the
    // copies of a shared corner would move apart and tear the surface open.
    const geo = new THREE.IcosahedronGeometry(1, 1)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const k = 1 + 0.15 * Math.sin(3.1 * x + 1.7) * Math.cos(2.3 * z - 0.9) + 0.09 * Math.sin(5.1 * y)
      pos.setXYZ(i, x * k * ROCK_R, Math.min(y * k * ROCK_RY, ROCK_RY * ROCK_FLAT), z * k * ROCK_R)
    }
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ color: COL_ROCK, roughness: 1, flatShading: true }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    // BURIED: the body sits low enough that only ROCK_PROUD of it stands above the plane. The
    // plane has no depth to hide the rest in, but it is opaque and the camera never goes below it.
    mesh.position.set(this._rockSpot.x, ROCK_PROUD - ROCK_RY * ROCK_FLAT, this._rockSpot.z)
    this.scene.add(mesh)

    this._rockBody = this._engine.createBody({
      type: 'static',
      position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      userData: { kind: 'stage-rock' },
    })
    // UNIQUE vertices only. The geometry is non-indexed, so pos.array carries every corner once per
    // face it belongs to — 240 points for 80 faces, where the shape has 42. Handing all 240 to
    // b3CreateHull produced a hull that only reported contacts once a query sphere was deep inside
    // it: shallow overlaps, which is every overlap a tire rolling onto a rock has, came back empty
    // and the truck settled straight through it. Deduped it is the same solid, described honestly.
    this._engine.addHull(this._rockBody, _uniquePoints(pos.array), { friction: 0.95, group: GROUP_STATIC })
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

    // Ground query: the flat plane, PLUS the static rock.
    //
    // The plane needs no tire envelope — the world's version sweeps 32 samples because it has road
    // EDGES to climb, and one plane has none. The rock is the opposite: it is exactly the kind of
    // shape an envelope exists for, so it is not approximated here at all. contactSphere runs the
    // ENGINE's own narrow-phase hull-vs-sphere test against the real collider, which is the same
    // machinery stepPhysics uses for debris — the only difference is that this call does not pass
    // dynamicOnly, which is precisely why a STATIC rock is reachable here and is not reachable from
    // qcPlus. Depth is continuous through the whole overlap and the normal never degenerates.
    //
    // `body` is stripped from the hits: carrying it would send them down physics.js's dynamic-support
    // path (relative velocity, depthRate) for a body that is bolted to the world. `sizeR` is kept —
    // it is the obstacle scale the tire envelope wants.
    this._queryContacts = (cx, cy, cz, r) => {
      const hits = []
      const depth = r - cy
      if (depth > 0) {
        hits.push({ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, 0, cz) })
      }
      const rock = this._engine.contactSphere({ x: cx, y: cy, z: cz }, r, { collidesWith: GROUP_STATIC })
      for (let i = 0; i < rock.length; i++) {
        const h = rock[i]
        hits.push({ normal: h.normal, depth: h.depth, contactPoint: h.contactPoint, sizeR: h.sizeR })
      }
      return hits
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
  }

  // ── Per-frame ──────────────────────────────────────────────────────────────────────────────────

  update (dt) {
    if (!this._ready || !this._active) return
    this._acc += dt
    let n = 0
    while (this._acc >= PHYSICS_DT && n < MAX_STEPS_PER_FRAME) {
      // No pre-roll any more: the rock is part of the ground, built once and already there, so the
      // truck can be released on the first step.
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
    // Spread across the well: a three-column zigzag inside the wheelhouse walls (±0.545), walking
    // evenly down the floor from 0.3 m behind the front wall to 0.3 m short of the tail. Same-column
    // neighbours land ~0.4 m apart — about one rock — so the pile spreads rather than towers.
    const i = this._rocksDone
    const span = RANGER_BED.tailZ - RANGER_BED.frontZ - 0.6
    this._bedWorld.set([-0.3, 0.3, 0][i % 3], RANGER_BED.floorY,
      RANGER_BED.frontZ + 0.3 + span * i / Math.max(1, ROCK_N - 1))
      .applyQuaternion(this._vs.quaternion).add(this._vs.position)
    const ok = this._debris.spawn('rock',
      { x: this._bedWorld.x, y: this._bedWorld.y + ROCK_DROP_H, z: this._bedWorld.z },
      { x: 0, y: -1.2, z: 0 })
    if (ok) this._rocksDone++
  }

  /**
   * Click-drag orbit, then cursor-follow parallax (±5° of yaw and pitch) on top of it.
   *
   * At zero drag this is exactly the composed shot: pivot on the front-left wheel. As the drag
   * grows the pivot slides to BED_PIVOT in the truck's CURRENT pose, so orbiting round shows the
   * bed instead of swinging it out of frame. The offset keeps the shot's length (~6.8 m).
   */
  _updateCamera (dt) {
    const k = Math.min(1, dt * 4)          // ~250 ms EMA: follows the cursor without snapping to it
    this._mxS += (this._mx - this._mxS) * k
    this._myS += (this._my - this._myS) * k

    this._camOff.copy(this._camBase).sub(this._camTarget)
    // Clamp the drag in elevation terms: the shot's own elevation plus the drag stays in range.
    const elev0 = Math.asin(this._camOff.y / this._camOff.length())
    this._dragPitch = Math.min(DRAG_ELEV_MAX - elev0, Math.max(DRAG_ELEV_MIN - elev0, this._dragPitch))
    const yaw = this._dragYaw + this._mxS * PARALLAX
    const pitch = this._dragPitch - this._myS * PARALLAX
    this._qYaw.setFromAxisAngle(this._axisY, yaw)
    this._camOff.applyQuaternion(this._qYaw)
    this._axisRight.copy(this._camOff).cross(this._axisY).normalize()
    this._qPitch.setFromAxisAngle(this._axisRight, pitch)
    this._camOff.applyQuaternion(this._qPitch)

    const w = Math.min(1, (Math.abs(this._dragYaw) + Math.abs(this._dragPitch)) / DRAG_PIVOT_FULL)
    this._bedPivot.copy(BED_PIVOT).applyQuaternion(this._vs.quaternion).add(this._vs.position)
    this._pivot.copy(this._camTarget).lerp(this._bedPivot, w)

    this.camera.position.copy(this._pivot).add(this._camOff)
    this.camera.lookAt(this._pivot)
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
