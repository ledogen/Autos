/**
 * src/main.js — RangerSim Walking Skeleton
 *
 * Entry point for the browser app. Responsibilities:
 *  - Three.js scene setup (renderer, camera, lighting, ground, grid)
 *  - Vehicle mesh creation (body BoxGeometry + 4 wheel CylinderGeometry)
 *  - stats.js FPS panel init
 *  - Fixed-timestep accumulator game loop (Plan 02 inserts physics here)
 *  - terrain(x, z) stub (M1-13 — Phase 6 replaces body, signature locked)
 *  - syncMeshesToState() — meshes follow vehicleState each frame
 *  - Resize handler
 *
 * Conventions: see docs/GLOSSARY.md
 * Forbidden patterns: quaternion-only body rotation (Pitfall 3), no Euler body state,
 *                     no physics library import, no legacy GUI library.
 */

import * as THREE from 'three'
import Stats from 'three/addons/libs/stats.module.js'
import { RANGER_PARAMS } from '../data/ranger.js'

// Manual verification hook — console.log confirms importmap loaded r184 (FOUND-02)
console.log('THREE.REVISION', THREE.REVISION)

// ── Fixed-timestep loop constants (RESEARCH §Pattern 2) ─────────────────────
const FIXED_DT = 1 / 60          // physics step: 16.667ms
const MAX_FRAME_TIME = 0.25       // spiral-of-death clamp: 250ms (T-01-04 mitigation)

let accumulator = 0
let currentTime = performance.now() / 1000

// ── Vehicle state placeholder ────────────────────────────────────────────────
// Vehicle state shape — see GLOSSARY.md. Mutated each physics step by Plan 02's
// vehicle.js / physics.js. Wave 1 leaves it static.
// Wheel index convention (GLOSSARY.md §Wheel Index): 0=FL, 1=FR, 2=RL, 3=RR
const vehicleState = {
  position:        new THREE.Vector3(0, RANGER_PARAMS.cgHeight, 0),
  velocity:        new THREE.Vector3(),
  quaternion:      new THREE.Quaternion(),       // identity — car points down -Z
  angularVelocity: new THREE.Vector3(),
  steerAngle:      0,                             // rad scalar, see GLOSSARY.md §Sign Conventions
  throttle:        0,
  brake:           0,
  wheelAngles:     [0, 0, 0, 0],                 // per-wheel spin angle [rad], Plan 03 drives
}

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas')
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true

// ── Camera ───────────────────────────────────────────────────────────────────
// Static chase position for Wave 1; Plan 03 replaces with spring-follow camera.
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 4, 10)
camera.lookAt(0, 0.55, 0)

// ── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.3)
scene.add(ambient)

const sun = new THREE.DirectionalLight(0xffffff, 1.0)
sun.position.set(10, 20, 10)
sun.castShadow = true
scene.add(sun)

// Ground plane (y=0, 200m × 200m)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Grid overlay
const grid = new THREE.GridHelper(200, 100, 0x444444, 0x333333)
scene.add(grid)

// ── Vehicle meshes ───────────────────────────────────────────────────────────
// Body: BoxGeometry (width=1.8m, height=0.8m, length=4.6m)
const bodyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 0.8, 4.6),
  new THREE.MeshStandardMaterial({ color: 0x336699 })
)
bodyMesh.castShadow = true
scene.add(bodyMesh)

// Wheels: CylinderGeometry rotated 90° around Z (Pitfall 5 — must do this BEFORE
// instantiating meshes or the spin axis will be wrong).
// Cylinder default = height along Y. After rotateZ(PI/2), height is along X (lateral).
// Wheels then spin around their local X axis, which is the correct lateral roll axis.
const wheelGeom = new THREE.CylinderGeometry(
  RANGER_PARAMS.wheelRadius,  // radiusTop
  RANGER_PARAMS.wheelRadius,  // radiusBottom
  0.25,                       // height (tire width)
  16                          // radialSegments
)
wheelGeom.rotateZ(Math.PI / 2)  // align spin axis — MUST happen before mesh creation

const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

// Local-frame offsets for wheel center positions relative to vehicle CG.
// Car forward = -Z (GLOSSARY.md §Coordinate System).
// Front axle is forward (more negative Z); rear axle is behind (more positive Z).
//
// Longitudinal offset from CG:
//   front wheels: +wheelbase * weightRear in -Z direction = -(wheelbase * weightRear)
//   rear wheels:  +wheelbase * weightFront in +Z direction = +(wheelbase * weightFront)
//
// Lateral offset (X):
//   left wheels: -trackFront/2 or -trackRear/2
//   right wheels: +trackFront/2 or +trackRear/2
//
// Vertical: wheel center at y = wheelRadius (tire sits on ground)
const L = RANGER_PARAMS.wheelbase
const wF = RANGER_PARAMS.weightFront
const wR = RANGER_PARAMS.weightRear
const tF = RANGER_PARAMS.trackFront / 2
const tR = RANGER_PARAMS.trackRear / 2
const wr = RANGER_PARAMS.wheelRadius

// Wheel local offsets indexed 0=FL, 1=FR, 2=RL, 3=RR (GLOSSARY.md §Wheel Index)
const wheelLocalOffsets = [
  new THREE.Vector3(-tF,  0, -(L * wR)),  // 0: FL — left, front
  new THREE.Vector3( tF,  0, -(L * wR)),  // 1: FR — right, front
  new THREE.Vector3(-tR,  0,  (L * wF)),  // 2: RL — left, rear
  new THREE.Vector3( tR,  0,  (L * wF)),  // 3: RR — right, rear
]

const wheelMeshes = wheelLocalOffsets.map((offset, i) => {
  const mesh = new THREE.Mesh(wheelGeom, wheelMat)
  // Wave 1: set initial world position from vehicleState.position + local offset
  // (vehicleState.quaternion is identity here, so no rotation needed for Wave 1 init)
  mesh.position.set(
    vehicleState.position.x + offset.x,
    wr,                                    // wheel center at wheelRadius above ground
    vehicleState.position.z + offset.z
  )
  mesh.castShadow = true
  scene.add(mesh)
  return mesh
})

// ── Mesh sync ────────────────────────────────────────────────────────────────
// Called every render frame to update mesh transforms from vehicleState.
// Body rotation uses quaternion.copy — do NOT use Euler rotation on bodyMesh (Pitfall 3 / CLAUDE.md).
function syncMeshesToState (state) {
  // Body: position and quaternion from physics state
  bodyMesh.position.copy(state.position)
  bodyMesh.quaternion.copy(state.quaternion)  // quaternion-only rotation, never Euler (GLOSSARY.md)

  // Wheels: compute world position = body CG + (local offset rotated by body quaternion)
  // Wave 1 note: steer angle not yet applied to wheel meshes — that detail lands in Plan 03.
  for (let i = 0; i < 4; i++) {
    const worldOffset = wheelLocalOffsets[i].clone().applyQuaternion(state.quaternion)
    const cx = state.position.x + worldOffset.x
    const cz = state.position.z + worldOffset.z
    wheelMeshes[i].position.set(cx, wr, cz)
    // Wave 1: no wheel spin or steer mesh rotation; Plan 03 adds those.
  }
}

// ── Terrain stub ─────────────────────────────────────────────────────────────
// M1-13: terrain query. Phase 1 = flat ground; Phase 6 replaces body, signature unchanged.
// Exposed on window for manual console verification (FOUND-02, M1-13).
function terrain (x, z) {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0) }
}
window.terrain = terrain  // console: terrain(5, 5) → {height: 0, normal: {x:0, y:1, z:0}}

// ── Stats.js FPS panel (FOUND-03) ────────────────────────────────────────────
const stats = new Stats()
document.body.appendChild(stats.dom)

// ── Game loop ─────────────────────────────────────────────────────────────────
// Fixed-timestep accumulator (RESEARCH §Pattern 2, gafferongames.com/post/fix_your_timestep/)
// FIXED_DT = 1/60s; MAX_FRAME_TIME = 0.25s (T-01-04: spiral-of-death mitigation)
function loop () {
  requestAnimationFrame(loop)

  const newTime = performance.now() / 1000
  let frameTime = newTime - currentTime
  currentTime = newTime

  // Clamp: prevents catch-up loop when tab was hidden or frame spiked (T-01-04)
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME

  accumulator += frameTime

  while (accumulator >= FIXED_DT) {
    // Wave 1: no-op physics step.
    // Plan 02 inserts: updateVehicle(vehicleState, RANGER_PARAMS, FIXED_DT)
    //                  stepPhysics(vehicleState, RANGER_PARAMS, FIXED_DT)
    // The terrain stub is called here so the call site exists for Plan 02's physics.js
    const _surface = terrain(vehicleState.position.x, vehicleState.position.z)  // eslint-disable-line no-unused-vars

    accumulator -= FIXED_DT
  }

  syncMeshesToState(vehicleState)
  renderer.render(scene, camera)
  stats.update()
}

requestAnimationFrame(loop)

// ── Resize handler ───────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
