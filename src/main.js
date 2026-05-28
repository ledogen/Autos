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
import { stepPhysics } from './physics.js'
import { updateVehicle, SPAWN_STATE } from './vehicle.js'
import { updateCamera } from './camera.js'
import { initDebug } from './debug.js'

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
  wheelSteerAngles: [0, 0, 0, 0],               // Per-wheel Ackermann steer angles [rad]; set by updateVehicle each step; read by stepPhysics for lateral force decomposition.
}

// ── Renderer ─────────────────────────────────────────────────────────────────
const canvas = document.querySelector('canvas')
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true

// ── Camera ───────────────────────────────────────────────────────────────────
// Spring-follow camera managed by src/camera.js (Plan 04). updateCamera() called each frame.
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)

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

// carGroup: parent Object3D for body + wheels — wheels inherit body pitch/roll (Bug 5 fix).
// syncMeshesToState drives carGroup.position and carGroup.quaternion; children follow automatically.
const carGroup = new THREE.Object3D()
scene.add(carGroup)

// ── Vehicle meshes ───────────────────────────────────────────────────────────
// Body: BoxGeometry (width=1.8m, height=0.8m, length=4.6m)
// Body is at carGroup local origin (0,0,0) — carGroup center IS the CG.
const bodyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 0.8, 4.6),
  new THREE.MeshStandardMaterial({ color: 0x336699 })
)
bodyMesh.castShadow = true
carGroup.add(bodyMesh)

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

// Wheel local offsets in carGroup local space (body-relative), indexed 0=FL, 1=FR, 2=RL, 3=RR.
// Y offset: wheel center is wheelRadius above ground; CG is cgHeight above ground.
// So wheel center Y relative to CG = wr - cgHeight (negative — wheels are below CG).
// wheelRadius=0.368, cgHeight=0.55 → Y offset = 0.368 - 0.55 = -0.182 m
const wheelLocalOffsets = [
  new THREE.Vector3(-tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 0: FL — left, front
  new THREE.Vector3( tF, wr - RANGER_PARAMS.cgHeight, -(L * wR)),  // 1: FR — right, front
  new THREE.Vector3(-tR, wr - RANGER_PARAMS.cgHeight,  (L * wF)),  // 2: RL — left, rear
  new THREE.Vector3( tR, wr - RANGER_PARAMS.cgHeight,  (L * wF)),  // 3: RR — right, rear
]

const wheelMeshes = wheelLocalOffsets.map((offset, i) => {
  const mesh = new THREE.Mesh(wheelGeom, wheelMat)
  // Wheels are children of carGroup — position is in carGroup local space (body-relative).
  // carGroup carries world position and orientation; wheels follow automatically (Bug 5 fix).
  mesh.position.set(offset.x, offset.y, offset.z)
  mesh.castShadow = true
  carGroup.add(mesh)
  return mesh
})

// ── Mesh sync ────────────────────────────────────────────────────────────────
// Called every render frame to update mesh transforms from vehicleState.
// carGroup carries world position and quaternion — body and wheels inherit it (Bug 5 fix).
// Do NOT use Euler rotation for body orientation (Pitfall 3 / CLAUDE.md).
function syncMeshesToState (state) {
  // Sync carGroup transform — body and wheels inherit this automatically (Bug 5 fix).
  carGroup.position.copy(state.position)
  carGroup.quaternion.copy(state.quaternion)  // quaternion-only rotation, never Euler (GLOSSARY.md)

  // Per-wheel: spin and steer in carGroup local space.
  // wheelLocalOffsets[i] is already set as local position — no re-apply needed.
  for (let i = 0; i < 4; i++) {
    // Visual spin: wheelAngles[i] accumulated by vehicle.js each step (M1-09).
    // rotation.x is the spin axis after the geometry was rotateZ(PI/2) in Plan 01 —
    // the X axis of the mesh is the rolling axis (RESEARCH §Pitfall 5).
    wheelMeshes[i].rotation.x = state.wheelAngles[i]

    // Steer: front wheels only, rotate around local Y (body up in carGroup space = Y).
    // carGroup already carries body orientation — no world-space up transform needed.
    if (i < 2) {
      const steer = state.wheelSteerAngles ? state.wheelSteerAngles[i] : state.steerAngle
      const steerQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),   // local Y — body up in carGroup space
        steer
      )
      // Set quaternion to steer only — do not accumulate body rotation (carGroup carries it).
      wheelMeshes[i].quaternion.copy(steerQ)
    } else {
      wheelMeshes[i].quaternion.identity()
    }
  }
}

// ── Terrain + ramp ────────────────────────────────────────────────────────────
// M1-13: terrain query. Phase 6 replaces body, signature unchanged.
// Freestanding ramp: 10°, 5m long, 4m wide, no plateau — drive up and off the edge.
// Normal derivation: for a ramp rising in -Z, n = (0, cos(θ), sin(θ)).
const RAMP_ANGLE    = Math.PI / 18   // 10 degrees
const RAMP_START_Z  = -15            // m — ramp toe (height=0) relative to spawn
const RAMP_LENGTH   = 5              // m along ground
const RAMP_WIDTH    = 4              // m — collision bounds match mesh width
const RAMP_MAX_H    = RAMP_LENGTH * Math.tan(RAMP_ANGLE)  // ≈ 0.88 m
const RAMP_END_Z    = RAMP_START_Z - RAMP_LENGTH          // -20 — ramp top z

const _rampNormal   = new THREE.Vector3(0, Math.cos(RAMP_ANGLE), Math.sin(RAMP_ANGLE))
const _flatNormal   = new THREE.Vector3(0, 1, 0)

// ── Ramp triangle mesh ────────────────────────────────────────────────────────
// Six triangles covering the ramp solid: top incline (2), back wall (2), left side (1), right side (1).
// Vertices defined from ramp constants — no hardcoded numbers.
const _hw = RAMP_WIDTH / 2
const _TL = [-_hw, 0,          RAMP_START_Z]
const _TR = [ _hw, 0,          RAMP_START_Z]
const _CL = [-_hw, RAMP_MAX_H, RAMP_END_Z  ]
const _CR = [ _hw, RAMP_MAX_H, RAMP_END_Z  ]
const _BL = [-_hw, 0,          RAMP_END_Z  ]
const _BR = [ _hw, 0,          RAMP_END_Z  ]
const RAMP_TRIS = [
  [_TL, _TR, _CR],  // top incline tri 1
  [_TL, _CR, _CL],  // top incline tri 2
  [_CL, _CR, _BR],  // back wall tri 1
  [_CL, _BR, _BL],  // back wall tri 2
  [_TL, _CL, _BL],  // left side
  [_TR, _BR, _CR],  // right side
]

// M1-13: terrain height-field query. Phase 6 replaces body, signature locked.
function terrain (x, z) {
  if (Math.abs(x) > RAMP_WIDTH / 2) return { height: 0, normal: _flatNormal }
  const distIntoRamp = RAMP_START_Z - z
  if (distIntoRamp > 0 && distIntoRamp <= RAMP_LENGTH) {
    return { height: distIntoRamp * Math.tan(RAMP_ANGLE), normal: _rampNormal }
  }
  return { height: 0, normal: _flatNormal }
}
window.terrain = terrain

/**
 * Closest point on a filled triangle ABC to query point P.
 * Algorithm: Ericson "Real-Time Collision Detection" §5.1.5 — barycentric-coordinate clamping.
 * All arithmetic on plain scalars; returns a new THREE.Vector3.
 */
function closestPointOnTriangle (px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  // Edge vectors
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az

  // P − A
  const apx = px - ax, apy = py - ay, apz = pz - az

  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return new THREE.Vector3(ax, ay, az)  // vertex A

  // P − B
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return new THREE.Vector3(bx, by, bz)  // vertex B

  // P − C
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return new THREE.Vector3(cx, cy, cz)  // vertex C

  // Edge AB
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return new THREE.Vector3(ax + v * abx, ay + v * aby, az + v * abz)
  }

  // Edge AC
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return new THREE.Vector3(ax + w * acx, ay + w * acy, az + w * acz)
  }

  // Edge BC
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    return new THREE.Vector3(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz))
  }

  // Interior
  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  return new THREE.Vector3(ax + v * abx + w * acx, ay + v * aby + w * acy, az + v * abz + w * acz)
}

/**
 * Sphere collision query against all solid geometry.
 * Returns every surface the sphere at (cx,cy,cz) with radius r overlaps.
 * Each contact: normal points away from solid toward sphere; depth is penetration depth.
 * Called by stepPhysics once per wheel and once per body contact point each physics step.
 * Phase 6: extend to query the terrain height-field for rough terrain surfaces.
 */
function queryContacts (cx, cy, cz, r) {
  const hits = []

  // Ground half-space (y = 0, normal +Y) — unchanged
  const gd = r - cy
  if (gd > 0) hits.push({
    normal: _flatNormal.clone(),
    depth: gd,
    contactPoint: new THREE.Vector3(cx, 0, cz)
  })

  // Triangle mesh contacts — sphere vs each ramp triangle
  for (const [[ax, ay, az], [bx, by, bz], [ex, ey, ez]] of RAMP_TRIS) {
    const cp = closestPointOnTriangle(cx, cy, cz, ax, ay, az, bx, by, bz, ex, ey, ez)
    const dx = cx - cp.x, dy = cy - cp.y, dz = cz - cp.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const depth = r - dist
    if (depth <= 0) continue
    const inv = dist < 1e-8 ? 0 : 1 / dist
    hits.push({
      normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),
      depth,
      contactPoint: cp
    })
  }

  return hits
}

// Ramp visual — inclined PlaneGeometry aligned to the terrain() geometry.
// rotation.x = -PI/2 + RAMP_ANGLE tilts near edge (toward spawn) down, far edge up.
// Center positioned at the midpoint height and Z of the ramp surface.
const rampMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(RAMP_WIDTH, RAMP_LENGTH),
  new THREE.MeshPhongMaterial({ color: 0x885522, side: THREE.DoubleSide })
)
rampMesh.rotation.x = -Math.PI / 2 + RAMP_ANGLE
rampMesh.position.set(0, (RAMP_LENGTH / 2) * Math.tan(RAMP_ANGLE), RAMP_START_Z - RAMP_LENGTH / 2)
rampMesh.receiveShadow = true
scene.add(rampMesh)

// ── Stats.js FPS panel (FOUND-03) ────────────────────────────────────────────
const stats = new Stats()
document.body.appendChild(stats.dom)

// ── Debug panel ──────────────────────────────────────────────────────────────
// D-10: passes mutable RANGER_PARAMS ref so sliders write directly to the object physics.js reads.
initDebug(RANGER_PARAMS)

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
    // Terrain stub call retained for M1-13 verification (Phase 6 replaces body, not call site).
    const _surface = terrain(vehicleState.position.x, vehicleState.position.z)  // eslint-disable-line no-unused-vars

    const resetRequested = updateVehicle(vehicleState, RANGER_PARAMS, FIXED_DT)
    if (resetRequested) {
      // M1-12: reset to spawn state — zero all motion, restore identity quaternion.
      vehicleState.position.set(SPAWN_STATE.positionX, RANGER_PARAMS.cgHeight, SPAWN_STATE.positionZ)
      vehicleState.velocity.set(0, 0, 0)
      vehicleState.quaternion.set(SPAWN_STATE.quatX, SPAWN_STATE.quatY, SPAWN_STATE.quatZ, SPAWN_STATE.quatW)
      vehicleState.angularVelocity.set(0, 0, 0)
      vehicleState.steerAngle = 0
      vehicleState.throttle = 0
      vehicleState.brake = 0
      vehicleState.wheelAngles = [0, 0, 0, 0]
      vehicleState.wheelSteerAngles = [0, 0, 0, 0]
    }

    stepPhysics(vehicleState, RANGER_PARAMS, FIXED_DT, queryContacts)
    accumulator -= FIXED_DT
  }

  syncMeshesToState(vehicleState)

  // Snap ground and grid to car position so they appear infinite.
  // Cell size = grid width (200m) / divisions (100) = 2m — snap prevents visible seam movement.
  const CELL = 2
  const snapX = Math.round(vehicleState.position.x / CELL) * CELL
  const snapZ = Math.round(vehicleState.position.z / CELL) * CELL
  ground.position.x = snapX
  ground.position.z = snapZ
  grid.position.x   = snapX
  grid.position.z   = snapZ

  // M1-11: live speed readout. velocity.length() = magnitude in m/s; * 3.6 converts to km/h.
  const speedKmh = vehicleState.velocity.length() * 3.6
  document.getElementById('speedVal').textContent = speedKmh.toFixed(1)

  updateCamera(camera, vehicleState)

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
